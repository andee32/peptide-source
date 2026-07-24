import React, { createContext, useContext, useEffect, useState } from "react";

export type CartItem = {
  productId: number;
  variantId: number;
  variantName: string;
  productName: string;
  priceCents: number;
  quantity: number;
  subscribeInterval?: number;
  subscribePlanId?: number;
  // "kit" marks a wholesale kit line so the wholesale order panel can count
  // toward the 5-kit MOQ without mistaking a stray retail vial for a kit.
  unitType?: "kit" | "vial";
};

function lineKey(item: Pick<CartItem, "variantId" | "subscribePlanId">): string {
  return `${item.variantId}:${item.subscribePlanId ?? "onetime"}`;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: CartItem, opts?: { openDrawer?: boolean }) => void;
  removeFromCart: (variantId: number, subscribePlanId?: number) => void;
  updateQuantity: (variantId: number, qty: number, subscribePlanId?: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalCents: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem("lab_cart");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("lab_cart", JSON.stringify(cartItems));
  }, [cartItems]);

  const addToCart = (item: CartItem, opts?: { openDrawer?: boolean }) => {
    setCartItems((prev) => {
      const key = lineKey(item);
      const existing = prev.find((i) => lineKey(i) === key);
      if (existing) {
        return prev.map((i) =>
          lineKey(i) === key ? { ...i, quantity: i.quantity + item.quantity } : i
        );
      }
      return [...prev, item];
    });
    // The wholesale list view keeps its own order sidebar visible, so it opts
    // out of popping the slide-out drawer on every add.
    if (opts?.openDrawer !== false) setIsCartOpen(true);
  };

  const removeFromCart = (variantId: number, subscribePlanId?: number) => {
    const key = lineKey({ variantId, subscribePlanId });
    setCartItems((prev) => prev.filter((i) => lineKey(i) !== key));
  };

  const updateQuantity = (variantId: number, qty: number, subscribePlanId?: number) => {
    if (qty <= 0) {
      removeFromCart(variantId, subscribePlanId);
      return;
    }
    const key = lineKey({ variantId, subscribePlanId });
    setCartItems((prev) =>
      prev.map((i) => (lineKey(i) === key ? { ...i, quantity: qty } : i))
    );
  };

  const clearCart = () => setCartItems([]);

  const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const totalCents = cartItems.reduce(
    (acc, item) => acc + item.priceCents * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalCents,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

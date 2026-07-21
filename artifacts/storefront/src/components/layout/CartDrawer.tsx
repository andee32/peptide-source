import { useCart } from "@/contexts/cart";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useLocation } from "wouter";

export function CartDrawer() {
  const { isCartOpen, setIsCartOpen, cartItems, updateQuantity, removeFromCart, totalCents } = useCart();
  const [, setLocation] = useLocation();

  return (
    <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col h-full bg-sidebar border-l-sidebar-border">
        <SheetHeader>
          <SheetTitle className="font-mono text-xl tracking-tight">Your Cart</SheetTitle>
          <SheetDescription className="sr-only">Items in your cart</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-6 space-y-6">
          {cartItems.length === 0 ? (
            <div className="text-center text-muted-foreground mt-12">
              <p>Your cart is empty.</p>
            </div>
          ) : (
            cartItems.map((item) => (
              <div key={item.variantId} className="flex gap-4 items-start border-b border-border pb-4 last:border-0">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground truncate">{item.productName}</h4>
                  <p className="text-sm text-muted-foreground">{item.variantName}</p>
                  <div className="mt-2 text-primary font-mono">${(item.priceCents / 100).toFixed(2)}</div>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 border border-border rounded-md px-2 py-1">
                    <button 
                      onClick={() => updateQuantity(item.variantId, item.quantity - 1, item.subscribePlanId)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-sm font-mono w-4 text-center">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.variantId, item.quantity + 1, item.subscribePlanId)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button 
                    onClick={() => removeFromCart(item.variantId, item.subscribePlanId)}
                    className="text-muted-foreground hover:text-destructive transition-colors text-xs flex items-center gap-1 mt-1"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border pt-6 mt-auto">
          <div className="flex justify-between text-lg font-semibold mb-6">
            <span>Subtotal</span>
            <span className="font-mono">${(totalCents / 100).toFixed(2)}</span>
          </div>
          <Button 
            className="w-full font-mono uppercase tracking-wider h-12" 
            size="lg"
            disabled={cartItems.length === 0}
            onClick={() => {
              setIsCartOpen(false);
              setLocation("/checkout");
            }}
          >
            Checkout
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
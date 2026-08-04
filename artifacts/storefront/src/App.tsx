import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Contexts
import { CartProvider } from "@/contexts/cart";
import { AnalyticsProvider } from "@/contexts/analytics";

// Layout
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CartDrawer } from "@/components/layout/CartDrawer";
import { CookieBanner } from "@/components/layout/CookieBanner";

// Pages
import { HomePage } from "@/pages/HomePage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { VerifyPage } from "@/pages/VerifyPage";
import { CheckoutPage } from "@/pages/CheckoutPage";
import { AdminPage } from "@/pages/AdminPage";
import { OrderConfirmationPage } from "@/pages/OrderConfirmationPage";
import { ResearchKitsPage } from "@/pages/ResearchKitsPage";
import { CustomerSubscriptionsPage } from "@/pages/CustomerSubscriptionsPage";
import { KitSubscribePage } from "@/pages/KitSubscribePage";
import { WholesaleApplyPage } from "@/pages/WholesaleApplyPage";
import { WholesaleAccountPage } from "@/pages/WholesaleAccountPage";
import { ContactPage } from "@/pages/ContactPage";
import { LegalPage } from "@/pages/legal/LegalPage";

// Homepage design previews, pending a chosen direction
import { HomeVariantA } from "@/pages/previews/HomeVariantA";
import { HomeVariantB } from "@/pages/previews/HomeVariantB";

// Retail (B2C) portal
import { RetailShopPage } from "@/pages/retail/RetailShopPage";
import { RetailProductPage } from "@/pages/retail/RetailProductPage";
import { LoginPage } from "@/pages/account/LoginPage";
import { RegisterPage } from "@/pages/account/RegisterPage";
import { ForgotPasswordPage } from "@/pages/account/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/account/ResetPasswordPage";
import { AccountPage } from "@/pages/account/AccountPage";
import { RuoGate } from "@/components/RuoGate";

const queryClient = new QueryClient();

function StorefrontRouter() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/preview/home-a" component={HomeVariantA} />
          <Route path="/preview/home-b" component={HomeVariantB} />
          <Route path="/shop">
            <RuoGate channel="wholesale">
              <ProductsPage />
            </RuoGate>
          </Route>
          <Route path="/shop/:slug">
            <RuoGate channel="wholesale">
              <ProductDetailPage />
            </RuoGate>
          </Route>
          <Route path="/retail">
            <RuoGate channel="retail">
              <RetailShopPage />
            </RuoGate>
          </Route>
          <Route path="/retail/:slug">
            <RuoGate channel="retail">
              <RetailProductPage />
            </RuoGate>
          </Route>
          <Route path="/verify" component={VerifyPage} />
          <Route path="/verify/:id" component={VerifyPage} />
          <Route path="/checkout" component={CheckoutPage} />
          <Route path="/orders/:id" component={OrderConfirmationPage} />
          <Route path="/kits" component={ResearchKitsPage} />
          <Route path="/wholesale" component={WholesaleApplyPage} />
          <Route path="/wholesale/account" component={WholesaleAccountPage} />
          <Route path="/contact" component={ContactPage} />
          <Route path="/legal/:slug" component={LegalPage} />
          <Route path="/kits/subscribe" component={KitSubscribePage} />
          <Route path="/account/subscriptions" component={CustomerSubscriptionsPage} />
          <Route path="/account/subscriptions/new" component={CustomerSubscriptionsPage} />
          <Route path="/account/login" component={LoginPage} />
          <Route path="/account/register" component={RegisterPage} />
          <Route path="/account/forgot-password" component={ForgotPasswordPage} />
          <Route path="/account/reset-password" component={ResetPasswordPage} />
          <Route path="/account" component={AccountPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
      <CartDrawer />
      <CookieBanner />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/admin/batches" component={AdminPage} />
      <Route path="/admin/subscriptions" component={AdminPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={StorefrontRouter} />
    </Switch>
  );
}

function App() {
  return (
    <AnalyticsProvider>
      <CartProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </CartProvider>
    </AnalyticsProvider>
  );
}

export default App;

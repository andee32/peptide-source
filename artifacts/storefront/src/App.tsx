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
import { CartDrawer } from "@/components/layout/CartDrawer";
import { CookieBanner } from "@/components/layout/CookieBanner";

// Pages
import { HomePage } from "@/pages/HomePage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { VerifyPage } from "@/pages/VerifyPage";
import { CheckoutPage } from "@/pages/CheckoutPage";
import { ReviewersPage } from "@/pages/ReviewersPage";
import { ReviewerSubmitPage } from "@/pages/ReviewerSubmitPage";
import { AdminPage } from "@/pages/AdminPage";
import { OrderConfirmationPage } from "@/pages/OrderConfirmationPage";
import { ResearchKitsPage } from "@/pages/ResearchKitsPage";
import { CustomerSubscriptionsPage } from "@/pages/CustomerSubscriptionsPage";
import { KitSubscribePage } from "@/pages/KitSubscribePage";

const queryClient = new QueryClient();

function StorefrontRouter() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/shop" component={ProductsPage} />
          <Route path="/shop/:slug" component={ProductDetailPage} />
          <Route path="/verify" component={VerifyPage} />
          <Route path="/verify/:id" component={VerifyPage} />
          <Route path="/checkout" component={CheckoutPage} />
          <Route path="/orders/:id" component={OrderConfirmationPage} />
          <Route path="/reviewers" component={ReviewersPage} />
          <Route path="/reviewers/submit" component={ReviewerSubmitPage} />
          <Route path="/kits" component={ResearchKitsPage} />
          <Route path="/kits/subscribe" component={KitSubscribePage} />
          <Route path="/account/subscriptions" component={CustomerSubscriptionsPage} />
          <Route path="/account/subscriptions/new" component={CustomerSubscriptionsPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <CartDrawer />
      <CookieBanner />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/admin/batches" component={AdminPage} />
      <Route path="/admin/reviewer-submissions" component={AdminPage} />
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

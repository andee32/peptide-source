import { useAnalytics } from "@/contexts/analytics";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function CookieBanner() {
  const { consentGiven, acceptAnalytics, declineAnalytics } = useAnalytics();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || consentGiven) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 md:p-8 animate-in slide-in-from-bottom-10 fade-in duration-500 pointer-events-none">
      <div className="container mx-auto max-w-4xl pointer-events-auto">
        <div className="bg-card border border-border shadow-2xl rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-4 sm:justify-between">
          <div className="text-sm text-card-foreground">
            <p className="font-semibold mb-1">Analytics & Privacy</p>
            <p className="text-muted-foreground">We use analytics to improve your experience. No personal identifying information is sold.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="outline" onClick={declineAnalytics} className="text-xs">
              Decline
            </Button>
            <Button variant="default" onClick={acceptAnalytics} className="text-xs">
              Accept
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
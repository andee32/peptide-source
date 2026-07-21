import React, { createContext, useContext, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    analytics?: {
      track: (name: string, props?: Record<string, unknown>) => void;
      page: (name?: string) => void;
      identify: (userId: string, traits?: Record<string, unknown>) => void;
      load: (writeKey: string) => void;
    };
  }
}

interface AnalyticsContextType {
  analyticsEnabled: boolean;
  consentGiven: boolean;
  acceptAnalytics: () => void;
  declineAnalytics: () => void;
  trackEvent: (name: string, props?: Record<string, unknown>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

function loadSegment(writeKey: string): void {
  if (typeof window === "undefined" || window.analytics) return;

  window.analytics = {
    track: () => undefined,
    page: () => undefined,
    identify: () => undefined,
    load: () => undefined,
  };

  const script = document.createElement("script");
  script.src = `https://cdn.segment.com/analytics.js/v1/${writeKey}/analytics.min.js`;
  script.async = true;
  script.onload = () => {
    window.analytics?.load(writeKey);
  };
  document.head.appendChild(script);
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [consentGiven, setConsentGiven] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const segmentLoaded = useRef(false);

  useEffect(() => {
    const consent = localStorage.getItem("analytics_consent");
    if (consent === "true") {
      setConsentGiven(true);
      setAnalyticsEnabled(true);
    } else if (consent === "false") {
      setConsentGiven(true);
      setAnalyticsEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (analyticsEnabled && !segmentLoaded.current) {
      segmentLoaded.current = true;
      const writeKey = import.meta.env.VITE_SEGMENT_WRITE_KEY as string | undefined;
      if (writeKey) {
        loadSegment(writeKey);
      }
    }
  }, [analyticsEnabled]);

  const acceptAnalytics = () => {
    localStorage.setItem("analytics_consent", "true");
    setConsentGiven(true);
    setAnalyticsEnabled(true);
  };

  const declineAnalytics = () => {
    localStorage.setItem("analytics_consent", "false");
    setConsentGiven(true);
    setAnalyticsEnabled(false);
  };

  const trackEvent = (name: string, props?: Record<string, unknown>): void => {
    if (!analyticsEnabled) return;
    window.analytics?.track(name, props);
  };

  return (
    <AnalyticsContext.Provider
      value={{
        analyticsEnabled,
        consentGiven,
        acceptAnalytics,
        declineAnalytics,
        trackEvent,
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error("useAnalytics must be used within an AnalyticsProvider");
  }
  return context;
}

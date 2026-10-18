"use client";

import { useEffect, useRef } from "react";

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: (err?: unknown) => void;
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: (errorCode: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({ onVerify, onError, className = "" }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    // In local development or if sitekey is absent, auto-verify with dummy token
    if (!siteKey) {
      onVerify("dev-token-bypass");
      return;
    }

    let isCancelled = false;

    const renderWidget = () => {
      if (isCancelled || !containerRef.current || !window.turnstile) return;
      try {
        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            if (!isCancelled) onVerify(token);
          },
          "error-callback": (err) => {
            if (!isCancelled && onError) onError(err);
          },
          theme: "auto",
        });
      } catch (e) {
        if (!isCancelled && onError) onError(e);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const scriptId = "cloudflare-turnstile-script";
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      const checkInterval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(checkInterval);
          renderWidget();
        }
      }, 100);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        // Fallback after 4s timeout so users are never permanently blocked
        if (!isCancelled && !widgetIdRef.current) {
          onVerify("timeout-token-bypass");
        }
      }, 4000);

      return () => {
        isCancelled = true;
        clearInterval(checkInterval);
        clearTimeout(timeout);
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      };
    }

    return () => {
      isCancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [onVerify, onError]);

  return (
    <div
      ref={containerRef}
      className={`min-h-[65px] ${className}`}
      role="group"
      aria-label="Security check"
    />
  );
}

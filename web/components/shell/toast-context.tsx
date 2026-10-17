"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { gsap, useGSAP, MOTION, prefersReducedMotion } from "@/lib/gsap";

export type ToastType = "success" | "info" | "warning" | "error";

export interface ToastItem {
  id: string;
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: { type?: ToastType; duration?: number }) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: () => {},
      dismissToast: () => {},
    };
  }
  return ctx;
}

function ToastElement({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const duration = toast.duration ?? 5000;

  const startTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    if (duration > 0) {
      timerRef.current = setTimeout(onDismiss, duration);
    }
  }, [duration, onDismiss]);

  const pauseTimer = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    startTimer();
    return () => clearTimeout(timerRef.current);
  }, [startTimer]);

  useGSAP(
    () => {
      if (!ref.current) return;
      const reduced = prefersReducedMotion();
      gsap.fromTo(
        ref.current,
        reduced ? { autoAlpha: 0 } : { autoAlpha: 0, y: 16, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: MOTION.panel, ease: MOTION.ease }
      );
    },
    { dependencies: [] }
  );

  const iconName =
    toast.type === "error"
      ? I.critical
      : toast.type === "warning"
      ? I.serious
      : toast.type === "info"
      ? I.minor
      : I.fixed;

  const strokeColor =
    toast.type === "error"
      ? "var(--crit)"
      : toast.type === "warning"
      ? "var(--ser)"
      : toast.type === "info"
      ? "var(--primary)"
      : "var(--ok)";

  return (
    <div
      ref={ref}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      onFocus={pauseTimer}
      onBlur={startTimer}
      className="flex w-[min(400px,calc(100vw-32px))] items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm leading-5 shadow-dialog text-ink"
    >
      <Icon d={iconName} size={20} stroke={strokeColor} className="flex-none mt-0.5" />
      <span className="flex-1 font-medium">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss toast"
        className="grid size-6 place-items-center rounded border-0 bg-transparent text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon d={I.close} size={16} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options?: { type?: ToastType; duration?: number }) => {
      const id = "toast_" + Math.random().toString(36).slice(2, 9);
      setToasts((prev) => [...prev, { id, message, type: options?.type ?? "success", duration: options?.duration }]);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* Toast live region (WCAG 4.1.3: polite status) */}
      <div
        role="status"
        aria-live="polite"
        className="fixed right-4 bottom-4 z-50 flex flex-col gap-2 pointer-events-none sm:right-6 sm:bottom-6"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastElement toast={toast} onDismiss={() => dismissToast(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

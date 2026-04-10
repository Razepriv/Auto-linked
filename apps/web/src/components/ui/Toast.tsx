"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  readonly id: string;
  readonly type: ToastType;
  readonly message: string;
  readonly duration: number;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLES: Record<ToastType, string> = {
  success:
    "border-[var(--color-success-border)] bg-[var(--color-success-light)] text-[var(--color-success)]",
  error:
    "border-[var(--color-error-border)] bg-[var(--color-error-light)] text-[var(--color-error)]",
  info: "border-[var(--color-info-border)] bg-[var(--color-info-light)] text-[var(--color-info)]",
  warning:
    "border-[var(--color-warning-border)] bg-[var(--color-warning-light)] text-[var(--color-warning)]",
};

const TOAST_ICONS: Record<ToastType, string> = {
  success: "\u2713",
  error: "\u2717",
  info: "\u2139",
  warning: "\u26A0",
};

function ToastMessage({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onDismiss(item.id);
    }, item.duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [item.id, item.duration, onDismiss]);

  return (
    <div
      className={cn(
        "animate-slide-in-right flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg",
        TOAST_STYLES[item.type],
      )}
      role="alert"
    >
      <span className="text-base" aria-hidden="true">
        {TOAST_ICONS[item.type]}
      </span>
      <span className="flex-1">{item.message}</span>
      <button
        onClick={() => onDismiss(item.id)}
        className="ml-2 opacity-60 transition-opacity hover:opacity-100"
        aria-label="Dismiss notification"
      >
        &#x2715;
      </button>
    </div>
  );
}

let toastCounter = 0;

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (type: ToastType, message: string, duration = 5000) => {
      toastCounter += 1;
      const id = `toast-${toastCounter}`;
      const newToast: ToastItem = { id, type, message, duration };
      setToasts((prev) => [...prev, newToast]);
    },
    [],
  );

  const contextValue = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        className="fixed right-4 top-4 z-50 flex w-80 flex-col gap-2"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((item) => (
          <ToastMessage key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export { ToastProvider, useToast, type ToastType, type ToastItem };

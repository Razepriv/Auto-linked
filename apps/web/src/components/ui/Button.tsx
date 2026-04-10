import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const VARIANT_STYLES = {
  primary:
    "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)] focus-visible:ring-[var(--ring-color)]",
  secondary:
    "border bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] focus-visible:ring-[var(--ring-color)]",
  ghost:
    "text-[var(--text-primary)] hover:bg-[var(--surface-raised)] focus-visible:ring-[var(--ring-color)]",
  danger:
    "bg-[var(--color-error)] text-white hover:bg-[var(--color-error)]/90 focus-visible:ring-[var(--color-error)]",
} as const;

const SIZE_STYLES = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2.5 rounded-lg",
} as const;

type ButtonVariant = keyof typeof VARIANT_STYLES;
type ButtonSize = keyof typeof SIZE_STYLES;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin-slow", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Spinner className="h-4 w-4" /> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize };

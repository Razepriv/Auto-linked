import { type HTMLAttributes, type ReactNode, forwardRef } from "react";
import { cn } from "@/lib/utils";

const VARIANT_STYLES = {
  success:
    "border-[var(--color-success-border)] bg-[var(--color-success-light)] text-[var(--color-success)]",
  error:
    "border-[var(--color-error-border)] bg-[var(--color-error-light)] text-[var(--color-error)]",
  warning:
    "border-[var(--color-warning-border)] bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  info: "border-[var(--color-info-border)] bg-[var(--color-info-light)] text-[var(--color-info)]",
} as const;

type AlertVariant = keyof typeof VARIANT_STYLES;

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant: AlertVariant;
  children: ReactNode;
}

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ variant, className, children, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        "rounded-lg border p-4 text-sm",
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);

Alert.displayName = "Alert";

export { Alert, type AlertProps, type AlertVariant };

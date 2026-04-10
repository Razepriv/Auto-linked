import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  color?: string;
  label?: string;
}

const SIZE_STYLES = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
} as const;

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ value, max = 100, size = "md", color, label, className, ...props }, ref) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));

    return (
      <div ref={ref} className={cn("w-full", className)} {...props}>
        {label && (
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">{label}</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {value} / {max}
            </span>
          </div>
        )}
        <div
          className={cn(
            "overflow-hidden rounded-full bg-[var(--border)]",
            SIZE_STYLES[size],
          )}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${percentage}%`,
              backgroundColor: color ?? "var(--brand-primary)",
            }}
          />
        </div>
      </div>
    );
  },
);

Progress.displayName = "Progress";

export { Progress, type ProgressProps };

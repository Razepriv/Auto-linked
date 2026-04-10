"use client";

import { cn } from "@/lib/utils";

interface PostActionsProps {
  onApprove?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onSkip?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function PostActions({
  onApprove,
  onEdit,
  onRegenerate,
  onSkip,
  isLoading = false,
  className,
}: PostActionsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={onApprove}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-secondary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-secondary/90 disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-3.5 w-3.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
        Approve
      </button>

      <button
        type="button"
        onClick={onEdit}
        disabled={isLoading}
        className="btn-secondary px-3 py-2 text-xs"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-3.5 w-3.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z"
          />
        </svg>
        Edit
      </button>

      <button
        type="button"
        onClick={onRegenerate}
        disabled={isLoading}
        className="btn-secondary px-3 py-2 text-xs"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-3.5 w-3.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
          />
        </svg>
        Regenerate
      </button>

      <button
        type="button"
        onClick={onSkip}
        disabled={isLoading}
        className="btn-ghost px-3 py-2 text-xs text-[var(--text-muted)]"
      >
        Skip
      </button>
    </div>
  );
}

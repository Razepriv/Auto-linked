import { cn, getPillarColor, formatRelativeTime } from "@/lib/utils";
import { PostStatusBadge } from "./PostStatusBadge";
import { PostActions } from "./PostActions";

type PostStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "scheduled"
  | "published"
  | "failed";

interface PostCardProps {
  title: string;
  content: string;
  status: PostStatus;
  pillarName: string;
  pillarColor: string;
  scheduledAt?: string;
  createdAt: string;
  onApprove?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onSkip?: () => void;
  className?: string;
}

export function PostCard({
  title,
  content,
  status,
  pillarName,
  pillarColor,
  scheduledAt,
  createdAt,
  onApprove,
  onEdit,
  onRegenerate,
  onSkip,
  className,
}: PostCardProps) {
  const showActions = status === "pending_review" || status === "draft";

  return (
    <div className={cn("card space-y-4", className)}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 rounded-full",
                getPillarColor(pillarColor),
              )}
            />
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {pillarName}
            </span>
          </div>
          <h3 className="mt-1 font-semibold leading-tight">{title}</h3>
        </div>
        <PostStatusBadge status={status} />
      </div>

      {/* Content preview */}
      <p className="line-clamp-3 text-sm text-[var(--text-secondary)]">
        {content}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          {scheduledAt && (
            <span className="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-3.5 w-3.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {scheduledAt}
            </span>
          )}
          <span>{formatRelativeTime(createdAt)}</span>
        </div>

        {showActions && (
          <PostActions
            onApprove={onApprove}
            onEdit={onEdit}
            onRegenerate={onRegenerate}
            onSkip={onSkip}
          />
        )}
      </div>
    </div>
  );
}

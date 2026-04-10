import { cn } from "@/lib/utils";

type PostStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "scheduled"
  | "published"
  | "failed";

interface PostStatusBadgeProps {
  status: PostStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  PostStatus,
  { label: string; bgClass: string; textClass: string; dotClass: string }
> = {
  draft: {
    label: "Draft",
    bgClass: "bg-gray-100 dark:bg-gray-800",
    textClass: "text-gray-700 dark:text-gray-300",
    dotClass: "bg-gray-400",
  },
  pending_review: {
    label: "Pending Review",
    bgClass: "bg-amber-50 dark:bg-amber-950",
    textClass: "text-amber-700 dark:text-amber-300",
    dotClass: "bg-amber-400",
  },
  approved: {
    label: "Approved",
    bgClass: "bg-blue-50 dark:bg-blue-950",
    textClass: "text-blue-700 dark:text-blue-300",
    dotClass: "bg-blue-400",
  },
  scheduled: {
    label: "Scheduled",
    bgClass: "bg-purple-50 dark:bg-purple-950",
    textClass: "text-purple-700 dark:text-purple-300",
    dotClass: "bg-purple-400",
  },
  published: {
    label: "Published",
    bgClass: "bg-green-50 dark:bg-green-950",
    textClass: "text-green-700 dark:text-green-300",
    dotClass: "bg-green-400",
  },
  failed: {
    label: "Failed",
    bgClass: "bg-red-50 dark:bg-red-950",
    textClass: "text-red-700 dark:text-red-300",
    dotClass: "bg-red-400",
  },
};

export function PostStatusBadge({ status, className }: PostStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.bgClass,
        config.textClass,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dotClass)} />
      {config.label}
    </span>
  );
}

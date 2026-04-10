import { cn } from "@/lib/utils";

interface PostPreviewProps {
  authorName: string;
  authorHeadline: string;
  authorAvatarUrl?: string;
  content: string;
  timeAgo?: string;
  className?: string;
}

export function PostPreview({
  authorName,
  authorHeadline,
  authorAvatarUrl,
  content,
  timeAgo = "Just now",
  className,
}: PostPreviewProps) {
  const lines = content.split("\n");
  const shouldTruncate = lines.length > 4 || content.length > 300;
  const displayContent = shouldTruncate
    ? lines.slice(0, 4).join("\n").slice(0, 300)
    : content;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-[var(--surface)]",
        className,
      )}
    >
      {/* Author row */}
      <div className="flex items-start gap-3 p-4 pb-0">
        {authorAvatarUrl ? (
          <img
            src={authorAvatarUrl}
            alt={authorName}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-bold text-brand-primary">
            {authorName
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{authorName}</p>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {authorHeadline}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {timeAgo} &middot;{" "}
            <svg
              className="mb-px inline h-3 w-3"
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path d="M8 1a7 7 0 107 7 7.008 7.008 0 00-7-7zM3 8a5 5 0 01.34-1.8L5 7.87V9a1 1 0 001 1v1.67A5 5 0 013 8zm6.85 4.87A1 1 0 009 12h-.18a1 1 0 01-1-.72l-.1-.3a1 1 0 01.71-1.28l1.22-.31a1 1 0 00.6-.48l.14-.27A1 1 0 0111.31 8H12a1 1 0 001-1v-.18a1 1 0 00-.42-.82L11 4.88A5 5 0 019.85 12.87z" />
            </svg>
          </p>
        </div>
        {/* Three-dot menu */}
        <button
          type="button"
          className="flex-shrink-0 p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          aria-label="More options"
        >
          <svg
            className="h-5 w-5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </button>
      </div>

      {/* Post content */}
      <div className="px-4 pt-3">
        <p className="whitespace-pre-line text-sm leading-relaxed">
          {displayContent}
          {shouldTruncate && (
            <>
              {"... "}
              <button
                type="button"
                className="text-[var(--text-muted)] hover:text-brand-primary hover:underline"
              >
                see more
              </button>
            </>
          )}
        </p>
      </div>

      {/* Reaction bar */}
      <div className="mt-3 flex items-center justify-between border-b px-4 pb-2">
        <div className="flex items-center -space-x-1">
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-blue-500 text-[10px]">
            <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H7.493z" />
            </svg>
          </span>
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-red-400 text-[10px]">
            <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
            </svg>
          </span>
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-green-500 text-[10px]">
            <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
            </svg>
          </span>
          <span className="ml-2 text-xs text-[var(--text-muted)]">24</span>
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          3 comments &middot; 1 repost
        </span>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-around px-2 py-1">
        {[
          { label: "Like", icon: "M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" },
          { label: "Comment", icon: "M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" },
          { label: "Repost", icon: "M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" },
          { label: "Send", icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" },
        ].map((action) => (
          <button
            key={action.label}
            type="button"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={action.icon}
              />
            </svg>
            <span className="hidden sm:inline">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

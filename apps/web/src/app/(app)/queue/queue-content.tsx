"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/shared/PageHeader";
import { PostPreview } from "@/components/post/PostPreview";
import { Skeleton } from "@/components/ui/Skeleton";

export function QueueContent() {
  const utils = trpc.useUtils();
  const pending = trpc.review.getPending.useQuery({ limit: 20 });
  const approve = trpc.review.approve.useMutation({
    onSuccess: () => utils.review.getPending.invalidate(),
  });
  const skip = trpc.review.skip.useMutation({
    onSuccess: () => utils.review.getPending.invalidate(),
  });

  const [selectedIdx, setSelectedIdx] = useState(0);
  const posts = pending.data?.items ?? [];
  const selected = posts[selectedIdx];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Review Queue"
        description="Review and approve AI-generated posts before they go live"
        actions={
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              {pending.data?.total ?? 0} pending
            </span>
          </div>
        }
      />

      {pending.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card"><Skeleton className="h-24 w-full" /></div>
            ))}
          </div>
          <div className="card"><Skeleton className="h-64 w-full" /></div>
        </div>
      ) : posts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--text-muted)]">No posts awaiting review.</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Generate posts from the dashboard to get started.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Post list */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Posts to Review</h2>
            {posts.map((post, idx) => (
              <button
                type="button"
                key={post.id}
                onClick={() => setSelectedIdx(idx)}
                className={`card w-full text-left space-y-2 transition-colors ${
                  idx === selectedIdx ? "border-brand-primary" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-primary/40" />
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    {post.pillarName ?? "General"}
                  </span>
                  {post.regenerationCount > 0 && (
                    <span className="text-xs text-[var(--text-muted)]">
                      (v{post.regenerationCount + 1})
                    </span>
                  )}
                </div>
                <h3 className="font-semibold leading-tight">{post.hook ?? post.content.slice(0, 60)}</h3>
                <p className="line-clamp-2 text-sm text-[var(--text-secondary)]">{post.content}</p>
              </button>
            ))}
          </div>

          {/* Preview panel */}
          {selected && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)]">LinkedIn Preview</h2>
              <PostPreview
                authorName="You"
                authorHeadline="LinkedIn Preview"
                content={selected.content}
                timeAgo="Just now"
              />
              <div className="rounded-lg border bg-[var(--surface-raised)] p-4">
                <h3 className="text-sm font-semibold">Post Details</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Pillar</span>
                    <span className="font-medium">{selected.pillarName ?? "None"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Format</span>
                    <span className="font-medium">{selected.format}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Characters</span>
                    <span className="font-medium">{selected.content.length} / 3,000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Hashtags</span>
                    <span className="font-medium">{selected.hashtags?.length ?? 0}</span>
                  </div>
                </div>
              </div>
              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate({ postId: selected.id })}
                >
                  {approve.isPending ? "Approving..." : "Approve"}
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  disabled={skip.isPending}
                  onClick={() => skip.mutate({ postId: selected.id })}
                >
                  Skip
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

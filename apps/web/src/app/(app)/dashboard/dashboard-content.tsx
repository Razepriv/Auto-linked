"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/shared/PageHeader";
import { PostCard } from "@/components/post/PostCard";
import { Skeleton } from "@/components/ui/Skeleton";

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {subtext && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{subtext}</p>
      )}
    </div>
  );
}

export function DashboardContent() {
  const utils = trpc.useUtils();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const dashboard = trpc.analytics.dashboard.useQuery(
    { range: undefined },
    { refetchInterval: 30_000, refetchOnWindowFocus: true },
  );
  const pending = trpc.review.getPending.useQuery(
    { limit: 5 },
    { refetchInterval: 30_000, refetchOnWindowFocus: true },
  );

  const generateBatch = trpc.posts.generateBatch.useMutation({
    onSuccess: (result) => {
      if (result.jobId) {
        setActiveJobId(String(result.jobId));
      }
    },
  });

  // Poll the job status while a generation job is in flight.
  const jobStatus = trpc.posts.generateStatus.useQuery(
    { jobId: activeJobId ?? "" },
    {
      enabled: activeJobId !== null,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 2_000;
        if (data.state === "completed" || data.state === "failed") return false;
        return 2_000;
      },
    },
  );

  // When the job finishes, invalidate dashboard + queue and clear the id.
  useEffect(() => {
    if (!jobStatus.data) return;
    const { state } = jobStatus.data;
    if (state === "completed" || state === "failed") {
      void utils.analytics.dashboard.invalidate();
      void utils.review.getPending.invalidate();
      setActiveJobId(null);
    }
  }, [jobStatus.data, utils]);

  const isGenerating =
    generateBatch.isPending ||
    (activeJobId !== null &&
      jobStatus.data?.state !== "completed" &&
      jobStatus.data?.state !== "failed");

  const progressData = jobStatus.data?.progress as
    | { stage?: string; completed?: number; total?: number }
    | undefined;

  const stats = dashboard.data;
  const pendingPosts = pending.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Dashboard"
        description="Your LinkedIn content overview"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => generateBatch.mutate({ count: 7 })}
            disabled={isGenerating}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            {isGenerating
              ? progressData?.stage === "complete"
                ? "Finishing..."
                : progressData?.total
                  ? `Generating ${progressData.completed ?? 0}/${progressData.total}...`
                  : "Generating..."
              : "Generate Posts"}
          </button>
        }
      />

      {jobStatus.data?.state === "failed" && (
        <div className="card border-red-300 bg-red-50 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Generation failed: {jobStatus.data.failedReason ?? "Unknown error"}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboard.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              label="Posts Published"
              value={stats?.postCount ?? 0}
              subtext={`${stats?.statusBreakdown?.['draft'] ?? 0} drafts pending`}
            />
            <StatCard
              label="Pending Review"
              value={pending.data?.total ?? 0}
              subtext="Awaiting your approval"
            />
            <StatCard
              label="Engagement Rate"
              value={`${(stats?.avgEngagement ?? 0).toFixed(1)}%`}
              subtext={`${stats?.period?.from?.slice(0, 10) ?? ""} — ${stats?.period?.to?.slice(0, 10) ?? ""}`}
            />
            <StatCard
              label="Total Impressions"
              value={(stats?.totalImpressions ?? 0).toLocaleString()}
              subtext={`${(stats?.totalReactions ?? 0).toLocaleString()} reactions`}
            />
          </>
        )}
      </div>

      {/* Upcoming posts */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Posts Awaiting Review</h2>
          <Link href="/queue" className="text-sm font-medium text-brand-primary hover:underline">
            View all
          </Link>
        </div>
        {pending.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-12 w-full" />
              </div>
            ))}
          </div>
        ) : pendingPosts.length === 0 ? (
          <div className="card text-center text-sm text-[var(--text-muted)]">
            No posts pending review. Generate some posts to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {pendingPosts.map((post) => (
              <PostCard
                key={post.id}
                title={post.hook ?? post.content.slice(0, 60)}
                content={post.content}
                status="draft"
                pillarName={post.pillarName ?? "General"}
                pillarColor={post.pillarName?.toLowerCase() ?? "blue"}
                scheduledAt={post.scheduledAt ? new Date(post.scheduledAt).toLocaleDateString() : undefined}
                createdAt={
                  typeof post.createdAt === "string"
                    ? post.createdAt
                    : (post.createdAt as Date | undefined)?.toISOString?.() ??
                      new Date().toISOString()
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/queue" className="card flex items-center gap-4 transition-colors hover:border-brand-primary/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Review Queue</p>
            <p className="text-xs text-[var(--text-secondary)]">{pending.data?.total ?? 0} posts awaiting review</p>
          </div>
        </Link>
        <Link href="/calendar" className="card flex items-center gap-4 transition-colors hover:border-brand-primary/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Content Calendar</p>
            <p className="text-xs text-[var(--text-secondary)]">View your publishing schedule</p>
          </div>
        </Link>
        <Link href="/analytics" className="card flex items-center gap-4 transition-colors hover:border-brand-primary/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Analytics</p>
            <p className="text-xs text-[var(--text-secondary)]">Track your performance</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

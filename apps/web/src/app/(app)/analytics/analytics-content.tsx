"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

type TimeRange = "7d" | "30d" | "90d" | "all";

function getRangeParams(range: TimeRange) {
  if (range === "all") return undefined;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();
  return { from, to };
}

export function AnalyticsContent() {
  const [range, setRange] = useState<TimeRange>("30d");
  const rangeParams = getRangeParams(range);

  const dashboard = trpc.analytics.dashboard.useQuery({
    range: rangeParams,
  });
  const pillars = trpc.analytics.pillarPerformance.useQuery({
    range: rangeParams,
  });

  const stats = dashboard.data;
  const pillarData = pillars.data ?? [];

  const maxEngagement = Math.max(...pillarData.map((p) => p.avgEngagement), 0.01);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Analytics"
        description="Track your LinkedIn performance and content insights"
        actions={
          <select
            className="input w-auto text-sm"
            value={range}
            onChange={(e) => setRange(e.target.value as TimeRange)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        }
      />

      {/* Overview stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboard.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-8 w-16" />
            </div>
          ))
        ) : (
          <>
            <div className="card">
              <p className="text-xs font-medium text-[var(--text-secondary)]">Total Impressions</p>
              <p className="mt-1 text-2xl font-bold">{(stats?.totalImpressions ?? 0).toLocaleString()}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-[var(--text-secondary)]">Engagement Rate</p>
              <p className="mt-1 text-2xl font-bold">{(stats?.avgEngagement ?? 0).toFixed(2)}%</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-[var(--text-secondary)]">Total Reactions</p>
              <p className="mt-1 text-2xl font-bold">{(stats?.totalReactions ?? 0).toLocaleString()}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-[var(--text-secondary)]">Posts Published</p>
              <p className="mt-1 text-2xl font-bold">{stats?.postCount ?? 0}</p>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Engagement summary */}
        <div className="card">
          <h3 className="text-sm font-semibold">Engagement Breakdown</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Reactions, comments, reposts, and clicks</p>
          {dashboard.isLoading ? (
            <Skeleton className="mt-6 h-48 w-full" />
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-4">
              {[
                { label: "Reactions", value: stats?.totalReactions ?? 0, color: "bg-blue-500" },
                { label: "Comments", value: stats?.totalComments ?? 0, color: "bg-purple-500" },
                { label: "Reposts", value: stats?.totalReposts ?? 0, color: "bg-emerald-500" },
                { label: "Clicks", value: stats?.totalClicks ?? 0, color: "bg-amber-500" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-lg bg-[var(--surface)] p-4 text-center">
                  <div className={`mx-auto mb-2 h-2 w-2 rounded-full ${metric.color}`} />
                  <p className="text-2xl font-bold">{metric.value.toLocaleString()}</p>
                  <p className="text-xs text-[var(--text-muted)]">{metric.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pillar performance */}
        <div className="card">
          <h3 className="text-sm font-semibold">Pillar Performance</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Average engagement rate by content pillar</p>
          {pillars.isLoading ? (
            <Skeleton className="mt-6 h-48 w-full" />
          ) : pillarData.length === 0 ? (
            <p className="mt-6 text-center text-sm text-[var(--text-muted)]">No pillar data yet</p>
          ) : (
            <div className="mt-6 space-y-4">
              {pillarData.map((pillar) => (
                <div key={pillar.pillarId}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: pillar.pillarColor ?? "#6366F1" }}
                      />
                      <span className="font-medium">{pillar.pillarName}</span>
                      <span className="text-xs text-[var(--text-muted)]">({pillar.postCount} posts)</span>
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {pillar.avgEngagement.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max((pillar.avgEngagement / maxEngagement) * 100, 2)}%`,
                        backgroundColor: pillar.pillarColor ?? "#6366F1",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status breakdown */}
      {stats?.statusBreakdown && (
        <div className="card">
          <h3 className="text-sm font-semibold">Post Status Overview</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(stats.statusBreakdown).map(([status, count]) => (
              <div key={status} className="rounded-lg bg-[var(--surface)] p-3 text-center">
                <p className="text-lg font-bold">{count}</p>
                <p className="text-xs capitalize text-[var(--text-muted)]">{status}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

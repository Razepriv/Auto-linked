"use client";

import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/Skeleton";
import ImportPosts from "../../onboarding/steps/import-posts";

interface ParsedPost {
  text: string;
  date: string | null;
}

type JobState =
  | "idle"
  | "queued"
  | "active"
  | "completed"
  | "failed";

export function VoiceContent() {
  const utils = trpc.useUtils();

  const profileQuery = trpc.voice.getProfile.useQuery(undefined, {
    refetchOnMount: "always",
    staleTime: 0,
  });

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<JobState>("idle");
  const [jobError, setJobError] = useState<string | null>(null);
  const [lastPostCount, setLastPostCount] = useState<number>(0);
  const [showImporter, setShowImporter] = useState<boolean>(false);

  // Poll the job status until it settles.
  const jobStatusQuery = trpc.voice.analysisStatus.useQuery(
    { jobId: jobId ?? "" },
    {
      enabled: jobId !== null && (jobState === "queued" || jobState === "active"),
      refetchInterval: 1500,
    },
  );

  useEffect(() => {
    if (!jobStatusQuery.data) return;
    const state = jobStatusQuery.data.state;
    if (state === "completed") {
      setJobState("completed");
      void utils.voice.getProfile.invalidate();
    } else if (state === "failed") {
      setJobState("failed");
      setJobError(jobStatusQuery.data.failedReason ?? "Analysis failed");
    } else if (state === "active") {
      setJobState("active");
    }
  }, [jobStatusQuery.data, utils]);

  const importSamples = trpc.voice.importSamples.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId ?? null);
      setLastPostCount(data.postCount);
      setJobState(data.jobId ? "queued" : "idle");
      setJobError(null);
      setShowImporter(false);
    },
    onError: (error) => {
      setJobError(error.message);
      setJobState("failed");
    },
  });

  const reanalyze = trpc.voice.reanalyze.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId ?? null);
      setJobState(data.jobId ? "queued" : "idle");
      setJobError(null);
    },
    onError: (error) => {
      setJobError(error.message);
      setJobState("failed");
    },
  });

  const handleImport = useCallback(
    (posts: ParsedPost[]) => {
      importSamples.mutate({
        posts: posts.map((p) => ({ text: p.text, date: p.date })),
      });
    },
    [importSamples],
  );

  const handleSkip = useCallback(() => {
    setShowImporter(false);
  }, []);

  if (profileQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="card">
          <Skeleton className="h-6 w-48" />
          <div className="mt-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        Failed to load voice profile: {profileQuery.error?.message ?? "unknown error"}
      </div>
    );
  }

  const profile = profileQuery.data;
  const isAnalyzing = jobState === "queued" || jobState === "active";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="card">
        <h2 className="text-lg font-semibold">Voice & Writing Style</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Upload your LinkedIn post history or paste examples of your writing
          so the AI can learn your voice and mirror it when generating content.
        </p>

        {profile ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ProfileField label="Tone" value={profile.tone} />
            <ProfileField
              label="Avg post length"
              value={`${profile.avgPostLength} words`}
            />
            <ProfileField label="Emoji use" value={profile.emojiFrequency} />
            <ProfileField label="Hashtag style" value={profile.hashtagStyle} />
            <ProfileField label="Formatting" value={profile.formatting} />
            <ProfileField label="Line breaks" value={profile.lineBreakStyle} />
            <ProfileField
              label="Analyzed posts"
              value={String(profile.analyzedPostCount)}
            />
            <ProfileField
              label="Analysis source"
              value={profile.analysisSource}
            />
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-secondary)]">
            No voice profile yet. Upload or paste some of your LinkedIn posts
            below and we&apos;ll analyze your writing style.
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={() => setShowImporter(true)}
            disabled={importSamples.isPending || isAnalyzing}
          >
            {profile ? "Re-import posts" : "Upload / paste posts"}
          </button>
          {profile && (
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => reanalyze.mutate({ source: "linkedin_history" })}
              disabled={reanalyze.isPending || isAnalyzing}
            >
              {isAnalyzing ? "Analyzing…" : "Re-run analysis"}
            </button>
          )}
        </div>

        {/* Job status + errors */}
        {lastPostCount > 0 && jobState !== "idle" && (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
            {jobState === "queued" && (
              <span className="text-[var(--text-secondary)]">
                Queued analysis of {lastPostCount} post
                {lastPostCount === 1 ? "" : "s"}…
              </span>
            )}
            {jobState === "active" && (
              <span className="text-[var(--text-secondary)]">
                Analyzing {lastPostCount} post
                {lastPostCount === 1 ? "" : "s"}…
              </span>
            )}
            {jobState === "completed" && (
              <span className="text-green-600 dark:text-green-400">
                Voice profile updated from {lastPostCount} post
                {lastPostCount === 1 ? "" : "s"}.
              </span>
            )}
            {jobState === "failed" && (
              <span className="text-red-600">
                Analysis failed: {jobError ?? "unknown error"}
              </span>
            )}
          </div>
        )}

        {importSamples.isError && !isAnalyzing && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Import failed: {importSamples.error.message}
          </div>
        )}
      </div>

      {/* Importer (reuses the onboarding step component) */}
      {showImporter && (
        <div className="card">
          <ImportPosts onImport={handleImport} onSkip={handleSkip} />
        </div>
      )}
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

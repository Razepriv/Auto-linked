"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type {
  VoiceProfile,
  ScoredTrait,
  HookPattern,
  CTAPattern,
} from "@auto-linked/shared/types";

// ---- Types ------------------------------------------------------------------

interface VoiceProfileCardProps {
  profile: VoiceProfile;
  mode: "compact" | "expanded";
  className?: string;
}

// ---- Main component ---------------------------------------------------------

export default function VoiceProfileCard({
  profile,
  mode,
  className,
}: VoiceProfileCardProps) {
  if (mode === "compact") {
    return <CompactCard profile={profile} className={className} />;
  }

  return <ExpandedCard profile={profile} className={className} />;
}

// ---- Compact mode -----------------------------------------------------------

function CompactCard({
  profile,
  className,
}: {
  profile: VoiceProfile;
  className?: string;
}) {
  return (
    <div className={cn("card space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Voice Profile</h3>
        <ConfidenceBadge confidence={profile.overallConfidence} />
      </div>

      <div className="flex flex-wrap gap-2">
        <ToneBadge tone={profile.tone.value} />
        <TraitChip
          label={formatEmojiFrequency(profile.emoji.frequency)}
          icon="emoji"
        />
        <TraitChip
          label={formatHashtagStyle(profile.hashtags.style)}
          icon="hashtag"
        />
        <TraitChip
          label={formatFormattingStyle(profile.formatting.style)}
          icon="format"
        />
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Based on {profile.postsAnalyzed} post
        {profile.postsAnalyzed === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// ---- Expanded mode ----------------------------------------------------------

function ExpandedCard({
  profile,
  className,
}: {
  profile: VoiceProfile;
  className?: string;
}) {
  return (
    <div className={cn("card space-y-6", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold">Your Voice Profile</h3>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Based on {profile.postsAnalyzed} post
            {profile.postsAnalyzed === 1 ? "" : "s"} analyzed
          </p>
        </div>
        <ConfidenceBadge confidence={profile.overallConfidence} />
      </div>

      {/* Core traits */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TraitCard
          label="Tone"
          value={formatTone(profile.tone.value)}
          confidence={profile.tone.confidence}
          icon={<ToneIcon />}
        />
        <TraitCard
          label="Emoji Usage"
          value={formatEmojiFrequency(profile.emoji.frequency)}
          confidence={null}
          icon={<EmojiIcon />}
          detail={
            profile.emoji.preferred.length > 0
              ? `Favorites: ${profile.emoji.preferred.join(" ")}`
              : undefined
          }
        />
        <TraitCard
          label="Hashtags"
          value={formatHashtagStyle(profile.hashtags.style)}
          confidence={null}
          icon={<HashtagIcon />}
          detail={
            profile.hashtags.recurring.length > 0
              ? profile.hashtags.recurring.map((t) => `#${t}`).join(", ")
              : undefined
          }
        />
        <TraitCard
          label="Formatting"
          value={formatFormattingStyle(profile.formatting.style)}
          confidence={null}
          icon={<FormatIcon />}
          detail={
            profile.formatting.avgPostLength
              ? `~${profile.formatting.avgPostLength} chars avg`
              : undefined
          }
        />
      </div>

      {/* Hook patterns distribution */}
      {profile.hookPatterns.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Hook Patterns</h4>
          <HookDistributionBar patterns={profile.hookPatterns} />
        </div>
      )}

      {/* CTA patterns */}
      {profile.ctaPatterns.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">CTA Patterns</h4>
          <div className="flex flex-wrap gap-2">
            {profile.ctaPatterns.map((cta) => (
              <span
                key={cta.value}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs"
              >
                {formatCTAPattern(cta.value)}
                <ConfidenceDot confidence={cta.confidence} />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Signature phrases */}
      {profile.vocabulary.frequentWords.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Signature Phrases</h4>
          <div className="flex flex-wrap gap-2">
            {profile.vocabulary.frequentWords.map((phrase) => (
              <span
                key={phrase}
                className="rounded-md border border-brand-primary/20 bg-brand-primary/5 px-2.5 py-1 text-xs font-medium text-brand-primary"
              >
                "{phrase}"
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Vocabulary details */}
      <div className="grid gap-4 sm:grid-cols-3">
        {profile.vocabulary.readingLevel !== null && (
          <MiniStat
            label="Reading Level"
            value={`Grade ${profile.vocabulary.readingLevel}`}
          />
        )}
        {profile.vocabulary.avgSentenceLength !== null && (
          <MiniStat
            label="Avg Sentence"
            value={`${Math.round(profile.vocabulary.avgSentenceLength)} words`}
          />
        )}
        {profile.formatting.avgPostLength !== null && (
          <MiniStat
            label="Avg Post Length"
            value={`${profile.formatting.avgPostLength} chars`}
          />
        )}
      </div>
    </div>
  );
}

// ---- Sub-components ---------------------------------------------------------

function TraitCard({
  label,
  value,
  confidence,
  icon,
  detail,
}: {
  label: string;
  value: string;
  confidence: number | null;
  icon: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border bg-[var(--surface)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
          {label}
        </span>
        {confidence !== null && (
          <ConfidenceDot confidence={confidence} />
        )}
      </div>
      <p className="mt-1 font-semibold">{value}</p>
      {detail && (
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{detail}</p>
      )}
    </div>
  );
}

function HookDistributionBar({
  patterns,
}: {
  patterns: readonly ScoredTrait<HookPattern>[];
}) {
  const sorted = useMemo(
    () => [...patterns].sort((a, b) => b.confidence - a.confidence),
    [patterns],
  );

  const total = sorted.reduce((sum, p) => sum + p.confidence, 0);

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-6 overflow-hidden rounded-full">
        {sorted.map((pattern, i) => {
          const width = total > 0 ? (pattern.confidence / total) * 100 : 0;
          return (
            <div
              key={pattern.value}
              className={cn("flex items-center justify-center text-[10px] font-medium text-white", HOOK_COLORS[i % HOOK_COLORS.length])}
              style={{ width: `${Math.max(width, 4)}%` }}
              title={`${formatHookPattern(pattern.value)}: ${Math.round(pattern.confidence * 100)}%`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sorted.map((pattern, i) => (
          <div key={pattern.value} className="flex items-center gap-1.5 text-xs">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-sm",
                HOOK_COLORS[i % HOOK_COLORS.length],
              )}
            />
            <span className="text-[var(--text-secondary)]">
              {formatHookPattern(pattern.value)}
            </span>
            <span className="text-[var(--text-muted)]">
              {Math.round(pattern.confidence * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToneBadge({ tone }: { tone: string }) {
  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", TONE_BADGE_STYLES[tone] ?? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200")}>
      {formatTone(tone)}
    </span>
  );
}

function TraitChip({
  label,
  icon,
}: {
  label: string;
  icon: "emoji" | "hashtag" | "format";
}) {
  const icons: Record<string, string> = {
    emoji: "~",
    hashtag: "#",
    format: "=",
  };

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
      <span className="font-mono text-[var(--text-muted)]">{icons[icon]}</span>
      {label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 70
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      : pct >= 40
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", color)}>
      {pct}% confidence
    </span>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.7
      ? "bg-green-500"
      : confidence >= 0.4
        ? "bg-amber-500"
        : "bg-red-400";

  return (
    <span
      className={cn("inline-block h-1.5 w-1.5 rounded-full", color)}
      title={`${Math.round(confidence * 100)}% confidence`}
    />
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-center">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

// ---- Formatting helpers -----------------------------------------------------

function formatTone(tone: string): string {
  const map: Record<string, string> = {
    professional: "Professional",
    conversational: "Conversational",
    inspirational: "Inspirational",
    educational: "Educational",
    humorous: "Humorous",
    provocative: "Provocative",
    storytelling: "Storytelling",
    authoritative: "Authoritative",
  };
  return map[tone] ?? tone;
}

function formatEmojiFrequency(freq: string): string {
  const map: Record<string, string> = {
    none: "No emojis",
    minimal: "Minimal emojis",
    moderate: "Moderate emojis",
    heavy: "Heavy emojis",
  };
  return map[freq] ?? freq;
}

function formatHashtagStyle(style: string): string {
  const map: Record<string, string> = {
    none: "No hashtags",
    minimal: "1-2 hashtags",
    moderate: "3-5 hashtags",
    heavy: "6+ hashtags",
    branded_only: "Branded hashtags",
  };
  return map[style] ?? style;
}

function formatFormattingStyle(style: string): string {
  const map: Record<string, string> = {
    dense: "Dense paragraphs",
    scannable: "Scannable",
    one_liner: "One-liners",
    mixed: "Mixed formatting",
  };
  return map[style] ?? style;
}

function formatHookPattern(pattern: HookPattern): string {
  const map: Record<string, string> = {
    question: "Question",
    bold_statement: "Bold Statement",
    statistic: "Statistic",
    story: "Story",
    contrarian: "Contrarian",
    listicle: "Listicle",
    quote: "Quote",
    personal_anecdote: "Anecdote",
    problem_statement: "Problem",
  };
  return map[pattern] ?? pattern;
}

function formatCTAPattern(pattern: CTAPattern): string {
  const map: Record<string, string> = {
    question: "Ask a question",
    agree_disagree: "Agree/disagree",
    share_experience: "Share experience",
    tag_someone: "Tag someone",
    follow_for_more: "Follow for more",
    link_in_comments: "Link in comments",
    dm_me: "DM me",
    repost: "Repost",
    none: "No CTA",
  };
  return map[pattern] ?? pattern;
}

// ---- Style maps -------------------------------------------------------------

const TONE_BADGE_STYLES: Record<string, string> = {
  professional:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  conversational:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  inspirational:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  educational:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  humorous:
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  provocative:
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  storytelling:
    "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  authoritative:
    "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
};

const HOOK_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-red-500",
  "bg-indigo-500",
  "bg-cyan-500",
  "bg-orange-500",
];

// ---- Icons ------------------------------------------------------------------

function ToneIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
      />
    </svg>
  );
}

function EmojiIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
      />
    </svg>
  );
}

function HashtagIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5"
      />
    </svg>
  );
}

function FormatIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
      />
    </svg>
  );
}

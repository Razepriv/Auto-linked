"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import VoiceProfileCard from "@/components/voice/VoiceProfileCard";
import type {
  VoiceProfile,
  Tone,
  EmojiFrequency,
  HashtagStyle,
  FormattingStyle,
} from "@auto-linked/shared/types";

// ---- Types ------------------------------------------------------------------

type AnalysisPhase =
  | "collecting"
  | "analyzing"
  | "building"
  | "complete"
  | "error";

interface VoiceAnalysisProps {
  postCount: number;
  onAnalysisStart: () => Promise<VoiceProfile>;
  onConfirm: (profile: VoiceProfile) => void;
  onBack: () => void;
}

interface PhaseConfig {
  label: string;
  progress: number;
  duration: number; // estimated ms per phase
}

const PHASES: Record<Exclude<AnalysisPhase, "complete" | "error">, PhaseConfig> = {
  collecting: {
    label: "Collecting posts...",
    progress: 15,
    duration: 2000,
  },
  analyzing: {
    label: "Analyzing writing style...",
    progress: 55,
    duration: 8000,
  },
  building: {
    label: "Building voice profile...",
    progress: 90,
    duration: 3000,
  },
};

// ---- Component --------------------------------------------------------------

export default function VoiceAnalysis({
  postCount,
  onAnalysisStart,
  onConfirm,
  onBack,
}: VoiceAnalysisProps) {
  const [phase, setPhase] = useState<AnalysisPhase>("collecting");
  const [progress, setProgress] = useState(0);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Editable overrides
  const [editedTone, setEditedTone] = useState<Tone | null>(null);
  const [editedEmoji, setEditedEmoji] = useState<EmojiFrequency | null>(null);
  const [editedHashtag, setEditedHashtag] = useState<HashtagStyle | null>(null);
  const [editedFormatting, setEditedFormatting] = useState<FormattingStyle | null>(null);

  // Animate through phases and run real analysis
  useEffect(() => {
    let cancelled = false;

    async function runAnalysis() {
      // Phase 1: collecting
      setPhase("collecting");
      await animateProgress(0, PHASES.collecting.progress, PHASES.collecting.duration, cancelled, setProgress);
      if (cancelled) return;

      // Phase 2: analyzing
      setPhase("analyzing");
      const analyzePromise = onAnalysisStart();
      await animateProgress(PHASES.collecting.progress, PHASES.analyzing.progress, PHASES.analyzing.duration, cancelled, setProgress);
      if (cancelled) return;

      // Wait for the real analysis to complete
      try {
        const result = await analyzePromise;

        // Phase 3: building
        setPhase("building");
        await animateProgress(PHASES.analyzing.progress, PHASES.building.progress, PHASES.building.duration, cancelled, setProgress);
        if (cancelled) return;

        // Complete
        setProgress(100);
        setProfile(result);
        setPhase("complete");
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Analysis failed";
        setErrorMessage(message);
        setPhase("error");
      }
    }

    runAnalysis();

    return () => {
      cancelled = true;
    };
  }, [onAnalysisStart]);

  // Build the effective profile with user edits
  const effectiveProfile = useMemo((): VoiceProfile | null => {
    if (!profile) return null;
    return {
      ...profile,
      tone: editedTone
        ? { value: editedTone, confidence: profile.tone.confidence }
        : profile.tone,
      emoji: editedEmoji
        ? { ...profile.emoji, frequency: editedEmoji }
        : profile.emoji,
      hashtags: editedHashtag
        ? { ...profile.hashtags, style: editedHashtag }
        : profile.hashtags,
      formatting: editedFormatting
        ? { ...profile.formatting, style: editedFormatting }
        : profile.formatting,
    };
  }, [profile, editedTone, editedEmoji, editedHashtag, editedFormatting]);

  const handleConfirm = useCallback(() => {
    if (effectiveProfile) {
      onConfirm(effectiveProfile);
    }
  }, [effectiveProfile, onConfirm]);

  // Estimate total time based on post count
  const estimatedSeconds = Math.max(10, Math.ceil(postCount * 0.8));

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-xl font-bold">Voice Analysis</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {phase === "complete"
            ? "Your voice profile is ready! Review and adjust if needed."
            : `Analyzing ${postCount} post${postCount === 1 ? "" : "s"} to build your voice profile...`}
        </p>
      </div>

      {phase !== "complete" && phase !== "error" && (
        <div className="card space-y-6 py-8">
          {/* Phase indicator */}
          <div className="flex flex-col items-center gap-4">
            <AnalysisSpinner />
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              {PHASES[phase].label}
            </p>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
              <div
                className="h-full rounded-full bg-brand-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{Math.round(progress)}%</span>
              <span>~{estimatedSeconds}s estimated</span>
            </div>
          </div>

          {/* Phase steps */}
          <div className="space-y-2">
            {(Object.entries(PHASES) as [Exclude<AnalysisPhase, "complete" | "error">, PhaseConfig][]).map(
              ([phaseKey, config]) => {
                const isActive = phase === phaseKey;
                const isDone = progress > config.progress;
                return (
                  <div
                    key={phaseKey}
                    className="flex items-center gap-3 text-sm"
                  >
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${
                        isDone
                          ? "bg-green-500 text-white"
                          : isActive
                            ? "bg-brand-primary text-white"
                            : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
                      }`}
                    >
                      {isDone ? (
                        <CheckIcon className="h-3 w-3" />
                      ) : (
                        <span className="text-[10px]">
                          {phaseKey === "collecting"
                            ? "1"
                            : phaseKey === "analyzing"
                              ? "2"
                              : "3"}
                        </span>
                      )}
                    </div>
                    <span
                      className={
                        isActive
                          ? "font-medium text-[var(--text-primary)]"
                          : "text-[var(--text-muted)]"
                      }
                    >
                      {config.label}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="card space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {errorMessage ?? "Something went wrong during analysis."}
          </div>
          <button type="button" onClick={onBack} className="btn-ghost text-sm">
            Go back and try again
          </button>
        </div>
      )}

      {phase === "complete" && effectiveProfile && (
        <>
          <VoiceProfileCard profile={effectiveProfile} mode="expanded" />

          {/* Edit mode */}
          {isEditing ? (
            <div className="card space-y-4">
              <h3 className="font-semibold">Adjust Your Profile</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Fine-tune any dimensions that don't feel right.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Tone"
                  value={editedTone ?? effectiveProfile.tone.value}
                  options={TONE_OPTIONS}
                  onChange={(v) => setEditedTone(v as Tone)}
                />
                <SelectField
                  label="Emoji Preference"
                  value={editedEmoji ?? effectiveProfile.emoji.frequency}
                  options={EMOJI_OPTIONS}
                  onChange={(v) => setEditedEmoji(v as EmojiFrequency)}
                />
                <SelectField
                  label="Hashtag Style"
                  value={editedHashtag ?? effectiveProfile.hashtags.style}
                  options={HASHTAG_OPTIONS}
                  onChange={(v) => setEditedHashtag(v as HashtagStyle)}
                />
                <SelectField
                  label="Formatting"
                  value={editedFormatting ?? effectiveProfile.formatting.style}
                  options={FORMATTING_OPTIONS}
                  onChange={(v) => setEditedFormatting(v as FormattingStyle)}
                />
              </div>

              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="btn-ghost text-sm"
              >
                Done editing
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="btn-ghost text-sm"
            >
              <PencilIcon className="mr-1 h-3.5 w-3.5" />
              Edit profile
            </button>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="btn-ghost text-sm"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="btn-primary"
            >
              Confirm Profile
              <ArrowRightIcon className="ml-1 h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Select field -----------------------------------------------------------

interface SelectFieldProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <div>
      <label className="label mb-1 block text-sm">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---- Options ----------------------------------------------------------------

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "conversational", label: "Conversational" },
  { value: "inspirational", label: "Inspirational" },
  { value: "educational", label: "Educational" },
  { value: "humorous", label: "Humorous" },
  { value: "provocative", label: "Provocative" },
  { value: "storytelling", label: "Storytelling" },
  { value: "authoritative", label: "Authoritative" },
];

const EMOJI_OPTIONS = [
  { value: "none", label: "None" },
  { value: "minimal", label: "Minimal (1-2)" },
  { value: "moderate", label: "Moderate (3-5)" },
  { value: "heavy", label: "Heavy (6+)" },
];

const HASHTAG_OPTIONS = [
  { value: "none", label: "None" },
  { value: "minimal", label: "Minimal (1-2)" },
  { value: "moderate", label: "Moderate (3-5)" },
  { value: "heavy", label: "Heavy (6+)" },
  { value: "branded_only", label: "Branded only" },
];

const FORMATTING_OPTIONS = [
  { value: "dense", label: "Dense paragraphs" },
  { value: "scannable", label: "Scannable (bullets, short paragraphs)" },
  { value: "one_liner", label: "One line per sentence" },
  { value: "mixed", label: "Mixed" },
];

// ---- Helpers ----------------------------------------------------------------

function animateProgress(
  from: number,
  to: number,
  duration: number,
  cancelled: boolean,
  setProgress: (value: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    function tick() {
      if (cancelled) {
        resolve();
        return;
      }
      const elapsed = Date.now() - start;
      const fraction = Math.min(elapsed / duration, 1);
      // Ease out cubic for natural feel
      const eased = 1 - Math.pow(1 - fraction, 3);
      setProgress(from + (to - from) * eased);

      if (fraction < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

// ---- Icons ------------------------------------------------------------------

function AnalysisSpinner() {
  return (
    <div className="relative h-16 w-16">
      {/* Outer ring */}
      <svg
        className="h-16 w-16 animate-spin"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="32"
          cy="32"
          r="28"
          stroke="var(--border)"
          strokeWidth="4"
        />
        <path
          d="M32 4a28 28 0 0128 28"
          stroke="var(--brand-primary, #6366f1)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      {/* Inner icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6 text-brand-primary"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 002.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
          />
        </svg>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
      />
    </svg>
  );
}

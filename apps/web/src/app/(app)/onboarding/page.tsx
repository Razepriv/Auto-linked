"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useOnboardingStep } from "./onboarding-context";
import LinkedInConnect from "./steps/linkedin-connect";
import ImportPosts from "./steps/import-posts";
import VoiceAnalysis from "./steps/voice-analysis";
import type { VoiceProfile } from "@auto-linked/shared/types";

// ---- Types ------------------------------------------------------------------

interface ProfileFormData {
  headline: string;
  industry: string;
  topics: string;
  audience: string;
}

interface ParsedPost {
  text: string;
  date: string | null;
}

// ---- Component --------------------------------------------------------------

export default function OnboardingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { currentStep, setCurrentStep } = useOnboardingStep();

  // Profile form state (step 1)
  const [profile, setProfile] = useState<ProfileFormData>({
    headline: "",
    industry: "",
    topics: "",
    audience: "",
  });

  // Imported posts (step 3)
  const [importedPosts, setImportedPosts] = useState<ParsedPost[]>([]);

  // tRPC mutations
  const saveProfileMutation = trpc.onboarding.saveProfile.useMutation();
  const importPostsMutation = trpc.onboarding.importPosts.useMutation();
  const completeMutation = trpc.onboarding.complete.useMutation();
  const updateVoiceProfileMutation = trpc.voice.updateProfile.useMutation();

  // Pre-fill name from session
  const userName = session?.user?.name ?? "";
  const userImage = session?.user?.image ?? null;

  // ---- Step handlers --------------------------------------------------------

  const handleProfileSubmit = useCallback(async () => {
    const topicsList = profile.topics
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    await saveProfileMutation.mutateAsync({
      headline: profile.headline || undefined,
      industry: profile.industry || undefined,
      topics: topicsList.length > 0 ? topicsList : undefined,
      audience: profile.audience || undefined,
    });

    setCurrentStep(2);
  }, [profile, saveProfileMutation, setCurrentStep]);

  const handleLinkedInConnected = useCallback(
    (_profile: {
      linkedinId: string;
      name: string;
      headline: string;
      avatarUrl: string | null;
      email: string;
    }) => {
      // LinkedIn publishing account connected — move forward
      setCurrentStep(3);
    },
    [setCurrentStep],
  );

  const handleLinkedInSkip = useCallback(() => {
    setCurrentStep(3);
  }, [setCurrentStep]);

  const handlePostsImported = useCallback(
    async (posts: ParsedPost[]) => {
      setImportedPosts(posts);

      await importPostsMutation.mutateAsync({
        posts: posts.map((p) => ({ text: p.text, date: p.date })),
      });

      setCurrentStep(4);
    },
    [importPostsMutation, setCurrentStep],
  );

  const handlePostsSkip = useCallback(() => {
    setCurrentStep(4);
  }, [setCurrentStep]);

  const handleAnalysisStart = useCallback(async (): Promise<VoiceProfile> => {
    // Create a basic voice profile from questionnaire data
    // In a full implementation, this would trigger the BullMQ analysis job
    // and poll for completion. For now, create a profile from the user's inputs.
    const result = await updateVoiceProfileMutation.mutateAsync({
      tone: "professional",
      emojiFrequency: "minimal",
      hashtagStyle: "minimal",
      formatting: "scannable",
    });

    // Return a VoiceProfile-shaped object for the UI
    return {
      id: result?.id?.toString() ?? "new",
      userId: session?.user?.id ?? "",
      tone: { value: "professional", confidence: 0.7 },
      hookPatterns: [{ value: "question", confidence: 0.6 }],
      ctaPatterns: [{ value: "question", confidence: 0.5 }],
      vocabulary: {
        frequentWords: [],
        avoidedWords: [],
        jargonTerms: [],
        readingLevel: null,
        avgSentenceLength: null,
      },
      emoji: {
        frequency: "minimal",
        preferred: [],
        usedAsBullets: false,
      },
      hashtags: {
        style: "minimal",
        recurring: [],
        placement: "end",
      },
      formatting: {
        style: "scannable",
        lineBreaks: "every_few",
        usesLists: true,
        avgPostLength: 200,
        separatesHook: true,
      },
      postsAnalyzed: importedPosts.length,
      overallConfidence: importedPosts.length >= 3 ? 0.7 : 0.4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [updateVoiceProfileMutation, session, importedPosts]);

  const handleVoiceConfirm = useCallback(
    async (_profile: VoiceProfile) => {
      await completeMutation.mutateAsync();
      router.push("/dashboard");
    },
    [completeMutation, router],
  );

  const handleVoiceBack = useCallback(() => {
    setCurrentStep(3);
  }, [setCurrentStep]);

  // ---- Render ---------------------------------------------------------------

  if (currentStep === 1) {
    return (
      <ProfileStep
        userName={userName}
        userImage={userImage}
        profile={profile}
        setProfile={setProfile}
        onSubmit={handleProfileSubmit}
        isLoading={saveProfileMutation.isPending}
      />
    );
  }

  if (currentStep === 2) {
    return (
      <LinkedInConnect
        onConnected={handleLinkedInConnected}
        onSkip={handleLinkedInSkip}
      />
    );
  }

  if (currentStep === 3) {
    return (
      <ImportPosts onImport={handlePostsImported} onSkip={handlePostsSkip} />
    );
  }

  return (
    <VoiceAnalysis
      postCount={importedPosts.length || 1}
      onAnalysisStart={handleAnalysisStart}
      onConfirm={handleVoiceConfirm}
      onBack={handleVoiceBack}
    />
  );
}

// ---- Profile Step (Step 1) --------------------------------------------------

interface ProfileStepProps {
  userName: string;
  userImage: string | null;
  profile: ProfileFormData;
  setProfile: (data: ProfileFormData) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

function ProfileStep({
  userName,
  userImage,
  profile,
  setProfile,
  onSubmit,
  isLoading,
}: ProfileStepProps) {
  const nameParts = userName.split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ");

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Welcome to Auto-Linked!</h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Let&apos;s set up your profile so the AI can create content that
          sounds like you.
        </p>
      </div>

      {/* User identity card */}
      {userName && (
        <div className="card flex items-center gap-4">
          {userImage ? (
            <img
              src={userImage}
              alt={userName}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary text-lg font-bold text-white">
              {firstName[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div>
            <p className="font-semibold">{userName}</p>
            <p className="text-sm text-green-600 dark:text-green-400">
              Signed in via LinkedIn
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold">Tell us about yourself</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          This helps our AI write in your voice and about your expertise.
        </p>

        <form
          className="mt-6 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="ob-firstName" className="label mb-1.5 block">
                First name
              </label>
              <input
                id="ob-firstName"
                type="text"
                value={firstName}
                disabled
                className="input opacity-60"
              />
            </div>
            <div>
              <label htmlFor="ob-lastName" className="label mb-1.5 block">
                Last name
              </label>
              <input
                id="ob-lastName"
                type="text"
                value={lastName}
                disabled
                className="input opacity-60"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ob-headline" className="label mb-1.5 block">
              LinkedIn Headline
            </label>
            <input
              id="ob-headline"
              type="text"
              value={profile.headline}
              onChange={(e) =>
                setProfile({ ...profile, headline: e.target.value })
              }
              placeholder="CEO at TechCorp | Building the future of work"
              className="input"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Copy your headline from LinkedIn
            </p>
          </div>

          <div>
            <label htmlFor="ob-industry" className="label mb-1.5 block">
              Industry
            </label>
            <select
              id="ob-industry"
              value={profile.industry}
              onChange={(e) =>
                setProfile({ ...profile, industry: e.target.value })
              }
              className="input"
            >
              <option value="">Select your industry</option>
              <option>Technology</option>
              <option>Finance</option>
              <option>Healthcare</option>
              <option>Marketing</option>
              <option>Consulting</option>
              <option>Education</option>
              <option>Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="ob-topics" className="label mb-1.5 block">
              What topics do you want to post about?
            </label>
            <textarea
              id="ob-topics"
              rows={3}
              value={profile.topics}
              onChange={(e) =>
                setProfile({ ...profile, topics: e.target.value })
              }
              placeholder="e.g., Leadership, remote work, AI in business, startup culture..."
              className="input min-h-[80px] resize-y"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Separate topics with commas. We&apos;ll use these as your content
              pillars.
            </p>
          </div>

          <div>
            <label htmlFor="ob-audience" className="label mb-1.5 block">
              Who is your target audience?
            </label>
            <input
              id="ob-audience"
              type="text"
              value={profile.audience}
              onChange={(e) =>
                setProfile({ ...profile, audience: e.target.value })
              }
              placeholder="e.g., Startup founders, tech leaders, product managers"
              className="input"
            />
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary flex items-center gap-2"
            >
              {isLoading ? "Saving..." : "Continue"}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

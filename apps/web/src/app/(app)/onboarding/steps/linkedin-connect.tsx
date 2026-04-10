"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

// ---- Types ------------------------------------------------------------------

interface LinkedInProfile {
  linkedinId: string;
  name: string;
  headline: string;
  avatarUrl: string | null;
  email: string;
}

type ConnectionStatus = "idle" | "connecting" | "success" | "error";

interface LinkedInConnectProps {
  onConnected: (profile: LinkedInProfile) => void;
  onSkip: () => void;
}

// ---- Component --------------------------------------------------------------

export default function LinkedInConnect({
  onConnected,
  onSkip,
}: LinkedInConnectProps) {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [profile, setProfile] = useState<LinkedInProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connectMutation = trpc.auth.linkedinConnect.useMutation();
  const callbackMutation = trpc.auth.linkedinCallback.useMutation();

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const handleConnect = useCallback(async () => {
    setStatus("connecting");
    setErrorMessage(null);

    try {
      const result = await connectMutation.mutateAsync({});
      const authUrl = result.authorizationUrl;

      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      popupRef.current = window.open(
        authUrl,
        "linkedin-oauth",
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`,
      );

      if (!popupRef.current) {
        setStatus("error");
        setErrorMessage(
          "Popup was blocked. Please allow popups for this site and try again.",
        );
        return;
      }

      // Poll for the popup closing or receiving the callback
      pollingRef.current = setInterval(() => {
        if (!popupRef.current || popupRef.current.closed) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          // If we haven't received a success callback, the user closed the popup
          if (status === "connecting") {
            setStatus("idle");
          }
        }
      }, 500);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to connect";
      setStatus("error");
      setErrorMessage(message);
    }
  }, [connectMutation, status]);

  // Listen for messages from the OAuth popup
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Validate origin for security
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as {
        type?: string;
        code?: string;
        state?: string;
        error?: string;
      };

      if (data.type !== "linkedin-oauth-callback") {
        return;
      }

      // Close popup
      if (popupRef.current) {
        popupRef.current.close();
        popupRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }

      if (data.error) {
        setStatus("error");
        setErrorMessage(data.error);
        return;
      }

      if (data.code && data.state) {
        handleCallback(data.code, data.state);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleCallback = useCallback(
    async (code: string, state: string) => {
      try {
        const result = await callbackMutation.mutateAsync({ code, state });

        if (result.success && result.profile) {
          const connectedProfile: LinkedInProfile = {
            linkedinId: result.profile.linkedinId,
            name: result.profile.name,
            headline: result.profile.headline,
            avatarUrl: result.profile.avatarUrl,
            email: result.profile.email,
          };
          setProfile(connectedProfile);
          setStatus("success");
          onConnected(connectedProfile);
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Connection failed";
        setStatus("error");
        setErrorMessage(message);
      }
    },
    [callbackMutation, onConnected],
  );

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-xl font-bold">Connect Your LinkedIn</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Connect your LinkedIn account to publish posts directly. You can also
          skip this and copy-paste posts manually.
        </p>
      </div>

      {status === "success" && profile ? (
        <ConnectedState profile={profile} />
      ) : (
        <div className="card space-y-6">
          {/* LinkedIn connect button */}
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0A66C2]">
              <LinkedInIcon className="h-8 w-8 text-white" />
            </div>

            <button
              type="button"
              onClick={handleConnect}
              disabled={status === "connecting"}
              className="btn-primary flex items-center gap-2 px-6"
            >
              {status === "connecting" ? (
                <>
                  <Spinner />
                  Connecting...
                </>
              ) : (
                <>
                  <LinkedInIcon className="h-4 w-4" />
                  Connect LinkedIn
                </>
              )}
            </button>

            {status === "error" && errorMessage && (
              <div className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                {errorMessage}
              </div>
            )}
          </div>

          {/* What connecting gives you */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
              What you get
            </p>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                Publish posts directly to LinkedIn with one click
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                Track engagement metrics (impressions, reactions, comments)
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                Schedule posts for optimal times
              </li>
            </ul>
          </div>

          {/* Privacy note */}
          <div className="rounded-lg bg-[var(--surface-raised)] px-4 py-3 text-xs text-[var(--text-muted)]">
            We only request permission to publish on your behalf. We cannot read
            your existing posts, connections, or messages.
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div />
        {status !== "success" && (
          <button
            type="button"
            onClick={onSkip}
            className="btn-ghost text-sm"
          >
            Skip for now
          </button>
        )}
        {status === "success" && (
          <button type="button" onClick={onSkip} className="btn-primary">
            Continue
            <ArrowRightIcon className="ml-1 h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Connected state --------------------------------------------------------

function ConnectedState({ profile }: { profile: LinkedInProfile }) {
  return (
    <div className="card">
      <div className="flex items-center gap-4 py-2">
        <div className="relative">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0A66C2] text-lg font-bold text-white">
              {getInitials(profile.name)}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 ring-2 ring-white dark:ring-[var(--surface)]">
            <CheckIcon className="h-3 w-3 text-white" />
          </div>
        </div>

        <div className="flex-1">
          <p className="font-semibold">{profile.name}</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {profile.headline}
          </p>
          <p className="mt-0.5 text-xs text-green-600 dark:text-green-400">
            Connected
          </p>
        </div>

        <LinkedInIcon className="h-6 w-6 text-[#0A66C2]" />
      </div>
    </div>
  );
}

// ---- Utility ----------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ---- Icons ------------------------------------------------------------------

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
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

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

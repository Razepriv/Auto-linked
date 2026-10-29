"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/Skeleton";

const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function ProfileContent() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, {
    // Always refetch on mount so a fresh LinkedIn sign-in shows the new
    // connection status instead of a cached "Not connected" value.
    refetchOnMount: "always",
    staleTime: 0,
  });

  const [name, setName] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("UTC");
  const [dirty, setDirty] = useState<boolean>(false);

  // Hydrate local form state when the server query resolves
  useEffect(() => {
    if (!me.data) return;
    setName(me.data.name ?? "");
    setTimezone(me.data.timezone ?? "UTC");
    setDirty(false);
  }, [me.data]);

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      void utils.auth.me.invalidate();
      setDirty(false);
    },
  });

  const linkedinConnect = trpc.auth.linkedinConnect.useMutation({
    onSuccess: (data) => {
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      }
    },
  });

  const linkedinDisconnect = trpc.auth.linkedinDisconnect.useMutation({
    onSuccess: () => void utils.auth.me.invalidate(),
  });

  if (me.isLoading) {
    return (
      <div className="space-y-8">
        <div className="card">
          <Skeleton className="h-6 w-48" />
          <div className="mt-6 space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (me.isError || !me.data) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        Failed to load profile: {me.error?.message ?? "unknown error"}
      </div>
    );
  }

  const user = me.data;
  const initials = getInitials(user.name);

  return (
    <div className="space-y-8">
      {/* Profile section */}
      <div className="card">
        <h2 className="text-lg font-semibold">Profile Information</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          This information is synced from your LinkedIn account when you
          connect it.
        </p>

        <div className="mt-6 space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user.name ?? "Profile"}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary/10 text-xl font-bold text-brand-primary">
                {initials}
              </div>
            )}
            <div>
              <p className="text-xs text-[var(--text-muted)]">
                {user.avatarUrl
                  ? "Photo synced from LinkedIn"
                  : "Connect LinkedIn to sync your profile photo"}
              </p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="label mb-1.5 block">
              Display name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              className="input"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label htmlFor="email" className="label mb-1.5 block">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={user.email}
              readOnly
              className="input cursor-not-allowed opacity-70"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Email is tied to your LinkedIn account and cannot be changed here.
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label htmlFor="timezone" className="label mb-1.5 block">
              Timezone
            </label>
            <select
              id="timezone"
              className="input max-w-md"
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value);
                setDirty(true);
              }}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              {!COMMON_TIMEZONES.includes(timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
            </select>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3 border-t pt-6">
          {updateProfile.isError && (
            <span className="text-xs text-red-600">
              Save failed: {updateProfile.error.message}
            </span>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={!dirty || updateProfile.isPending}
            onClick={() =>
              updateProfile.mutate({
                name: name.trim(),
                timezone,
              })
            }
          >
            {updateProfile.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* LinkedIn connection */}
      <div className="card">
        <h2 className="text-lg font-semibold">LinkedIn Connection</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Connect your LinkedIn account to enable auto-publishing.
        </p>

        <div className="mt-6 flex items-center justify-between rounded-lg border bg-[var(--surface)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0A66C2]">
              <svg
                className="h-5 w-5 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold">LinkedIn</p>
              <p
                className={`text-xs ${
                  user.linkedinConnected
                    ? "text-brand-secondary"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {user.linkedinConnected
                  ? `Connected as ${user.name}`
                  : "Not connected"}
              </p>
            </div>
          </div>
          {user.linkedinConnected ? (
            <button
              type="button"
              disabled={linkedinDisconnect.isPending}
              onClick={() => linkedinDisconnect.mutate()}
              className="btn-ghost text-sm text-red-500 hover:text-red-600 disabled:opacity-50"
            >
              {linkedinDisconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : (
            <button
              type="button"
              disabled={linkedinConnect.isPending}
              onClick={() => linkedinConnect.mutate({})}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {linkedinConnect.isPending ? "Connecting…" : "Connect LinkedIn"}
            </button>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="card border-red-200 dark:border-red-900">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">
          Danger Zone
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Irreversible actions for your account.
        </p>
        <div className="mt-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Delete Account</p>
            <p className="text-xs text-[var(--text-muted)]">
              Permanently delete your account and all data
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}

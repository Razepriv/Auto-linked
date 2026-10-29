"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/Skeleton";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

interface ScheduleSlot {
  day: DayKey;
  enabled: boolean;
  time: string;
}

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

export function ScheduleContent() {
  const utils = trpc.useUtils();
  const settings = trpc.settings.getSchedule.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [timezone, setTimezone] = useState<string>("UTC");
  const [autoPublish, setAutoPublish] = useState<boolean>(false);
  const [emailNotifications, setEmailNotifications] = useState<boolean>(true);
  const [dirty, setDirty] = useState<boolean>(false);

  // Hydrate local form state from server query
  useEffect(() => {
    if (!settings.data) return;
    setSchedule(settings.data.schedule as ScheduleSlot[]);
    setTimezone(settings.data.timezone);
    setAutoPublish(settings.data.autoPublish);
    setEmailNotifications(settings.data.emailNotifications);
    setDirty(false);
  }, [settings.data]);

  const updateSchedule = trpc.settings.updateSchedule.useMutation({
    onSuccess: () => {
      void utils.settings.getSchedule.invalidate();
      setDirty(false);
    },
  });
  const updateTimezone = trpc.settings.updateTimezone.useMutation({
    onSuccess: () => void utils.settings.getSchedule.invalidate(),
  });
  const updatePrefs = trpc.settings.updatePreferences.useMutation({
    onSuccess: () => void utils.settings.getSchedule.invalidate(),
  });

  const toggleSlot = (day: DayKey) => {
    setSchedule((prev) =>
      prev.map((slot) =>
        slot.day === day
          ? {
              ...slot,
              enabled: !slot.enabled,
              time: !slot.enabled && slot.time === "" ? "09:00" : slot.time,
            }
          : slot,
      ),
    );
    setDirty(true);
  };

  const setSlotTime = (day: DayKey, time: string) => {
    setSchedule((prev) =>
      prev.map((slot) => (slot.day === day ? { ...slot, time } : slot)),
    );
    setDirty(true);
  };

  const saveSchedule = () => {
    updateSchedule.mutate({ schedule });
  };

  if (settings.isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (settings.isError) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        Failed to load schedule: {settings.error.message}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Publishing Schedule */}
      <div className="card">
        <h2 className="text-lg font-semibold">Publishing Schedule</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Set which days and times your posts should be published. Posts will be
          auto-scheduled to fill these slots.
        </p>

        <div className="mt-6">
          <div className="space-y-3">
            {schedule.map((slot) => (
              <div
                key={slot.day}
                className="flex items-center justify-between rounded-lg border bg-[var(--surface)] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleSlot(slot.day)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      slot.enabled ? "bg-brand-primary" : "bg-[var(--border)]"
                    }`}
                    aria-label={`Toggle ${DAY_LABELS[slot.day]}`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        slot.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-sm font-medium ${
                      slot.enabled ? "" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {DAY_LABELS[slot.day]}
                  </span>
                </div>

                {slot.enabled ? (
                  <input
                    type="time"
                    value={slot.time}
                    onChange={(e) => setSlotTime(slot.day, e.target.value)}
                    className="input w-auto text-sm"
                  />
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">
                    No posts scheduled
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3 border-t pt-6">
          {updateSchedule.isError && (
            <span className="text-xs text-red-600">
              Save failed: {updateSchedule.error.message}
            </span>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={!dirty || updateSchedule.isPending}
            onClick={saveSchedule}
          >
            {updateSchedule.isPending ? "Saving…" : "Save Schedule"}
          </button>
        </div>
      </div>

      {/* Timezone */}
      <div className="card">
        <h2 className="text-lg font-semibold">Timezone</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          All scheduled times use this timezone.
        </p>

        <div className="mt-6">
          <select
            className="input max-w-md"
            value={timezone}
            onChange={(e) => {
              const next = e.target.value;
              setTimezone(next);
              updateTimezone.mutate({ timezone: next });
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
          {updateTimezone.isPending && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Saving…</p>
          )}
        </div>
      </div>

      {/* Preferences */}
      <div className="card">
        <h2 className="text-lg font-semibold">Auto-Generation</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Automatically generate posts to fill empty schedule slots.
        </p>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-publish</p>
              <p className="text-xs text-[var(--text-muted)]">
                Publish approved posts automatically when their scheduled time
                arrives.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !autoPublish;
                setAutoPublish(next);
                updatePrefs.mutate({ autoPublish: next });
              }}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                autoPublish ? "bg-brand-primary" : "bg-[var(--border)]"
              }`}
              aria-label="Toggle auto-publish"
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  autoPublish ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-xs text-[var(--text-muted)]">
                Get emails when posts are published or need review.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !emailNotifications;
                setEmailNotifications(next);
                updatePrefs.mutate({ emailNotifications: next });
              }}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                emailNotifications ? "bg-brand-primary" : "bg-[var(--border)]"
              }`}
              aria-label="Toggle email notifications"
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  emailNotifications ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

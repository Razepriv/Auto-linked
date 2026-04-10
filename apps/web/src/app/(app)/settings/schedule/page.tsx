import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Schedule Settings",
};

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const MOCK_SCHEDULE = [
  { day: "Monday", enabled: true, time: "09:00" },
  { day: "Tuesday", enabled: false, time: "" },
  { day: "Wednesday", enabled: true, time: "08:30" },
  { day: "Thursday", enabled: true, time: "10:00" },
  { day: "Friday", enabled: false, time: "" },
  { day: "Saturday", enabled: false, time: "" },
  { day: "Sunday", enabled: false, time: "" },
];

export default function ScheduleSettingsPage() {
  return (
    <div className="space-y-8">
      <div className="card">
        <h2 className="text-lg font-semibold">Publishing Schedule</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Set which days and times your posts should be published. Posts will be
          auto-scheduled to fill these slots.
        </p>

        <div className="mt-6">
          <div className="space-y-3">
            {MOCK_SCHEDULE.map((slot) => (
              <div
                key={slot.day}
                className="flex items-center justify-between rounded-lg border bg-[var(--surface)] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {/* Toggle */}
                  <button
                    type="button"
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      slot.enabled ? "bg-brand-primary" : "bg-[var(--border)]"
                    }`}
                    aria-label={`Toggle ${slot.day}`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm ${
                        slot.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-sm font-medium ${
                      slot.enabled
                        ? ""
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {slot.day}
                  </span>
                </div>

                {slot.enabled ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      defaultValue={slot.time}
                      className="input w-auto text-sm"
                    />
                    <button
                      type="button"
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                      aria-label="Add time slot"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="h-4 w-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">
                    No posts scheduled
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex justify-end border-t pt-6">
          <button type="button" className="btn-primary">
            Save Schedule
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
          <select className="input max-w-md">
            <option>(UTC-08:00) Pacific Time (US & Canada)</option>
            <option>(UTC-07:00) Mountain Time (US & Canada)</option>
            <option>(UTC-06:00) Central Time (US & Canada)</option>
            <option>(UTC-05:00) Eastern Time (US & Canada)</option>
            <option>(UTC+00:00) UTC</option>
            <option>(UTC+01:00) Central European Time</option>
            <option>(UTC+05:30) India Standard Time</option>
            <option>(UTC+08:00) China Standard Time</option>
            <option>(UTC+09:00) Japan Standard Time</option>
          </select>
        </div>

        <div className="mt-8 flex justify-end border-t pt-6">
          <button type="button" className="btn-primary">
            Save Timezone
          </button>
        </div>
      </div>

      {/* Auto-generation */}
      <div className="card">
        <h2 className="text-lg font-semibold">Auto-Generation</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Automatically generate posts to fill empty schedule slots.
        </p>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-generate posts</p>
              <p className="text-xs text-[var(--text-muted)]">
                AI will generate draft posts for empty schedule slots
              </p>
            </div>
            <button
              type="button"
              className="relative h-6 w-11 rounded-full bg-brand-primary transition-colors"
            >
              <span className="absolute left-0.5 top-0.5 h-5 w-5 translate-x-5 rounded-full bg-white shadow-sm transition-transform" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-approve</p>
              <p className="text-xs text-[var(--text-muted)]">
                Skip review queue and publish directly (not recommended)
              </p>
            </div>
            <button
              type="button"
              className="relative h-6 w-11 rounded-full bg-[var(--border)] transition-colors"
            >
              <span className="absolute left-0.5 top-0.5 h-5 w-5 translate-x-0 rounded-full bg-white shadow-sm transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

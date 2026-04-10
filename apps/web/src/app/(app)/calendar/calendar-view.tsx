"use client";

import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CalendarEvent {
  title: string;
  time: string;
  pillarColor: string;
  status: "scheduled" | "published" | "draft";
}

const MOCK_EVENTS: Record<string, CalendarEvent[]> = {
  "1": [
    {
      title: "Why founders get hiring wrong",
      time: "9:00 AM",
      pillarColor: "blue",
      status: "scheduled",
    },
  ],
  "2": [],
  "3": [
    {
      title: "The compound effect of writing",
      time: "8:30 AM",
      pillarColor: "purple",
      status: "scheduled",
    },
  ],
  "4": [
    {
      title: "Async communication frameworks",
      time: "10:00 AM",
      pillarColor: "emerald",
      status: "draft",
    },
  ],
  "5": [],
  "6": [],
  "7": [],
};

const PILLAR_BG: Record<string, string> = {
  blue: "bg-pillar-blue/10 border-pillar-blue/30 text-pillar-blue",
  purple: "bg-pillar-purple/10 border-pillar-purple/30 text-pillar-purple",
  pink: "bg-pillar-pink/10 border-pillar-pink/30 text-pillar-pink",
  amber: "bg-pillar-amber/10 border-pillar-amber/30 text-pillar-amber",
  emerald: "bg-pillar-emerald/10 border-pillar-emerald/30 text-pillar-emerald",
};

export function CalendarView() {
  const calendarView = useUiStore((s) => s.calendarView);
  const setCalendarView = useUiStore((s) => s.setCalendarView);

  return (
    <div>
      {/* View toggle */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
            aria-label="Previous"
          >
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
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </button>
          <h2 className="text-lg font-semibold">April 7 - 13, 2026</h2>
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
            aria-label="Next"
          >
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
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        </div>

        <div className="flex rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setCalendarView("week")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              calendarView === "week"
                ? "bg-brand-primary text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setCalendarView("month")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              calendarView === "month"
                ? "bg-brand-primary text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            Month
          </button>
        </div>
      </div>

      {/* Week view */}
      <div className="overflow-hidden rounded-xl border">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-[var(--surface-raised)]">
          {DAYS.map((day, i) => (
            <div
              key={day}
              className={cn(
                "px-3 py-3 text-center text-xs font-semibold text-[var(--text-secondary)]",
                i < 6 && "border-r",
              )}
            >
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.charAt(0)}</span>
              <div
                className={cn(
                  "mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm",
                  i === 2
                    ? "bg-brand-primary font-semibold text-white"
                    : "font-medium",
                )}
              >
                {7 + i}
              </div>
            </div>
          ))}
        </div>

        {/* Day content */}
        <div className="grid min-h-[400px] grid-cols-7">
          {DAYS.map((day, i) => {
            const dayKey = String(i + 1);
            const events = MOCK_EVENTS[dayKey] ?? [];

            return (
              <div
                key={day}
                className={cn(
                  "p-2",
                  i < 6 && "border-r",
                  i >= 5 && "bg-[var(--surface-raised)]/50",
                )}
              >
                {events.map((event) => (
                  <button
                    key={event.title}
                    type="button"
                    className={cn(
                      "mt-1 w-full rounded-md border px-2 py-1.5 text-left text-[10px] font-medium leading-tight transition-opacity hover:opacity-80 sm:text-xs",
                      PILLAR_BG[event.pillarColor] ?? "bg-gray-100",
                    )}
                  >
                    <span className="block truncate">{event.title}</span>
                    <span className="mt-0.5 block opacity-70">
                      {event.time}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-pillar-blue" />
          Leadership
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-pillar-purple" />
          Personal Growth
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-pillar-emerald" />
          Remote Work
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-pillar-pink" />
          Technology
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-pillar-amber" />
          Industry News
        </span>
      </div>
    </div>
  );
}

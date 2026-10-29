"use client";

import { useMemo, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PILLAR_BG: Record<string, string> = {
  blue: "bg-pillar-blue/10 border-pillar-blue/30 text-pillar-blue",
  purple: "bg-pillar-purple/10 border-pillar-purple/30 text-pillar-purple",
  pink: "bg-pillar-pink/10 border-pillar-pink/30 text-pillar-pink",
  amber: "bg-pillar-amber/10 border-pillar-amber/30 text-pillar-amber",
  emerald: "bg-pillar-emerald/10 border-pillar-emerald/30 text-pillar-emerald",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "border-dashed opacity-80",
  approved: "",
  scheduled: "",
  published: "ring-1 ring-emerald-500/40",
  failed: "border-red-300 text-red-700 bg-red-50",
};

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const fmtDay = (d: Date) => d.getDate();
  const fmtMonth = (d: Date) =>
    d.toLocaleString(undefined, { month: "long" });
  if (sameMonth) {
    return `${fmtMonth(start)} ${fmtDay(start)} – ${fmtDay(end)}, ${end.getFullYear()}`;
  }
  return `${fmtMonth(start)} ${fmtDay(start)} – ${fmtMonth(end)} ${fmtDay(end)}, ${end.getFullYear()}`;
}

function normalizePillarColor(color: string | null | undefined, name: string | null | undefined): string {
  if (color && PILLAR_BG[color.toLowerCase()]) return color.toLowerCase();
  if (name) {
    const lower = name.toLowerCase();
    if (PILLAR_BG[lower]) return lower;
  }
  return "blue";
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function CalendarView() {
  const calendarView = useUiStore((s) => s.calendarView);
  const setCalendarView = useUiStore((s) => s.setCalendarView);

  // Anchor date for the week we're viewing (Monday).
  const [anchor, setAnchor] = useState<Date>(() => getMondayOf(new Date()));

  const weekStart = useMemo(() => getMondayOf(anchor), [anchor]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const rangeFrom = useMemo(() => {
    const d = new Date(weekStart);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [weekStart]);

  const rangeTo = useMemo(() => {
    const d = new Date(weekEnd);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [weekEnd]);

  const calendar = trpc.posts.calendar.useQuery(
    { from: rangeFrom, to: rangeTo },
    { refetchOnWindowFocus: true },
  );

  // Bucket posts by day index (0 = Mon … 6 = Sun)
  const byDay = useMemo(() => {
    const buckets: Array<
      Array<{
        id: string;
        title: string;
        time: string;
        pillarColor: string;
        status: string;
      }>
    > = Array.from({ length: 7 }, () => []);

    for (const item of calendar.data?.items ?? []) {
      const ts = item.scheduledAt ?? item.publishedAt;
      if (!ts) continue;
      const date = new Date(ts);
      const dayIndex = Math.floor(
        (date.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (dayIndex < 0 || dayIndex > 6) continue;

      buckets[dayIndex]!.push({
        id: String(item.id),
        title: item.hook ?? item.content.slice(0, 60),
        time: formatTime(String(ts)),
        pillarColor: normalizePillarColor(item.pillarColor, item.pillarName),
        status: item.status,
      });
    }

    return buckets;
  }, [calendar.data, weekStart]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div>
      {/* View toggle */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
            aria-label="Previous week"
            onClick={() => setAnchor((d) => addDays(d, -7))}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold">{formatRange(weekStart, weekEnd)}</h2>
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
            aria-label="Next week"
            onClick={() => setAnchor((d) => addDays(d, 7))}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <button
            type="button"
            className="ml-2 rounded-md border px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
            onClick={() => setAnchor(getMondayOf(new Date()))}
          >
            Today
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
          {DAYS.map((day, i) => {
            const dayDate = addDays(weekStart, i);
            const isToday = dayDate.getTime() === today.getTime();
            return (
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
                    isToday
                      ? "bg-brand-primary font-semibold text-white"
                      : "font-medium",
                  )}
                >
                  {dayDate.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Day content */}
        <div className="grid min-h-[400px] grid-cols-7">
          {DAYS.map((day, i) => {
            const events = byDay[i] ?? [];
            const isWeekend = i >= 5;
            return (
              <div
                key={day}
                className={cn(
                  "p-2",
                  i < 6 && "border-r",
                  isWeekend && "bg-[var(--surface-raised)]/50",
                )}
              >
                {calendar.isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : events.length === 0 ? (
                  <span className="mt-2 block text-center text-[10px] text-[var(--text-muted)]">
                    —
                  </span>
                ) : (
                  events.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={cn(
                        "mt-1 w-full rounded-md border px-2 py-1.5 text-left text-[10px] font-medium leading-tight transition-opacity hover:opacity-80 sm:text-xs",
                        PILLAR_BG[event.pillarColor] ?? "bg-gray-100",
                        STATUS_STYLE[event.status] ?? "",
                      )}
                      title={`${event.title} • ${event.status}`}
                    >
                      <span className="block truncate">{event.title}</span>
                      <span className="mt-0.5 block opacity-70">{event.time}</span>
                    </button>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>

      {calendar.isError && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Failed to load calendar: {calendar.error.message}
        </div>
      )}
    </div>
  );
}

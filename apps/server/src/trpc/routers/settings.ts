import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { users } from '../../db/schema/users.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = (typeof DAYS)[number];

const scheduleSlotSchema = z.object({
  day: z.enum(DAYS),
  enabled: z.boolean(),
  // 24h "HH:MM" (allows empty string when disabled)
  time: z
    .string()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM')
    .or(z.literal('')),
});

type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;

const scheduleArraySchema = z.array(scheduleSlotSchema).length(7);

const DEFAULT_SCHEDULE: readonly ScheduleSlot[] = [
  { day: 'mon', enabled: true, time: '09:00' },
  { day: 'tue', enabled: false, time: '' },
  { day: 'wed', enabled: true, time: '09:00' },
  { day: 'thu', enabled: false, time: '' },
  { day: 'fri', enabled: true, time: '09:00' },
  { day: 'sat', enabled: false, time: '' },
  { day: 'sun', enabled: false, time: '' },
];

function normalizeSchedule(raw: unknown): ScheduleSlot[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SCHEDULE];
  const byDay = new Map<Day, ScheduleSlot>();
  for (const entry of raw) {
    const parsed = scheduleSlotSchema.safeParse(entry);
    if (parsed.success) byDay.set(parsed.data.day, parsed.data);
  }
  return DAYS.map(
    (day) => byDay.get(day) ?? { day, enabled: false, time: '' },
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const settingsRouter = router({
  /**
   * Return the authenticated user's posting schedule, timezone, and auto-publish flags.
   */
  getSchedule: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        postingSchedule: users.postingSchedule,
        timezone: users.timezone,
        autoPublish: users.autoPublish,
        autoPublishWindowHours: users.autoPublishWindowHours,
        emailNotifications: users.emailNotifications,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    return {
      schedule: normalizeSchedule(row?.postingSchedule),
      timezone: row?.timezone ?? 'UTC',
      autoPublish: row?.autoPublish ?? false,
      autoPublishWindowHours: row?.autoPublishWindowHours ?? 24,
      emailNotifications: row?.emailNotifications ?? true,
    };
  }),

  /**
   * Update posting schedule slots.
   */
  updateSchedule: protectedProcedure
    .input(z.object({ schedule: scheduleArraySchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({
          postingSchedule: input.schedule as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));

      return { success: true, schedule: input.schedule };
    }),

  /**
   * Update timezone.
   */
  updateTimezone: protectedProcedure
    .input(z.object({ timezone: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ timezone: input.timezone, updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));
      return { success: true, timezone: input.timezone };
    }),

  /**
   * Update auto-publish and email notification preferences.
   */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        autoPublish: z.boolean().optional(),
        autoPublishWindowHours: z.number().int().min(1).max(168).optional(),
        emailNotifications: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (input.autoPublish !== undefined) update['autoPublish'] = input.autoPublish;
      if (input.autoPublishWindowHours !== undefined)
        update['autoPublishWindowHours'] = input.autoPublishWindowHours;
      if (input.emailNotifications !== undefined)
        update['emailNotifications'] = input.emailNotifications;

      await ctx.db.update(users).set(update).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
});

"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/Skeleton";

export function PillarsContent() {
  const utils = trpc.useUtils();
  const pillars = trpc.pillars.list.useQuery();
  const voiceProfile = trpc.voice.getProfile.useQuery();
  const updateVoice = trpc.voice.updateProfile.useMutation({
    onSuccess: () => utils.voice.getProfile.invalidate(),
  });
  const createPillar = trpc.pillars.create.useMutation({
    onSuccess: () => utils.pillars.list.invalidate(),
  });
  const deletePillar = trpc.pillars.delete.useMutation({
    onSuccess: () => utils.pillars.list.invalidate(),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newPillar, setNewPillar] = useState({ name: "", description: "" });

  const pillarList = pillars.data ?? [];
  const totalWeight = pillarList.reduce((sum, p) => sum + Number(p.weight), 0);

  return (
    <div className="space-y-8">
      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Content Pillars</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Define up to 10 content themes. AI will balance your calendar across these pillars.
            </p>
          </div>
          <button type="button" className="btn-primary text-sm" onClick={() => setShowAdd(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Pillar
          </button>
        </div>

        {/* Add pillar form */}
        {showAdd && (
          <div className="mt-4 rounded-lg border bg-[var(--surface)] p-4 space-y-3">
            <input
              type="text"
              className="input"
              placeholder="Pillar name"
              value={newPillar.name}
              onChange={(e) => setNewPillar({ ...newPillar, name: e.target.value })}
            />
            <input
              type="text"
              className="input"
              placeholder="Description (optional)"
              value={newPillar.description}
              onChange={(e) => setNewPillar({ ...newPillar, description: e.target.value })}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={!newPillar.name || createPillar.isPending}
                onClick={() => {
                  createPillar.mutate(
                    { name: newPillar.name, description: newPillar.description || null },
                    { onSuccess: () => { setShowAdd(false); setNewPillar({ name: "", description: "" }); } },
                  );
                }}
              >
                {createPillar.isPending ? "Creating..." : "Create"}
              </button>
              <button type="button" className="btn-secondary text-sm" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Distribution bar */}
        {pillarList.length > 0 && (
          <div className="mt-6">
            <div className="flex h-3 overflow-hidden rounded-full">
              {pillarList.map((pillar) => (
                <div
                  key={pillar.id}
                  className="transition-all"
                  style={{
                    width: `${totalWeight > 0 ? (Number(pillar.weight) / totalWeight) * 100 : 100 / pillarList.length}%`,
                    backgroundColor: pillar.color ?? "#6366F1",
                  }}
                  title={`${pillar.name}: ${((Number(pillar.weight) / (totalWeight || 1)) * 100).toFixed(0)}%`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Content distribution across your pillars</p>
          </div>
        )}

        {/* Pillar list */}
        <div className="mt-6 space-y-3">
          {pillars.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-[var(--surface)] p-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="mt-1 h-3 w-48" />
              </div>
            ))
          ) : pillarList.length === 0 ? (
            <p className="text-center text-sm text-[var(--text-muted)] py-8">No content pillars yet. Add your first one above.</p>
          ) : (
            pillarList.map((pillar) => (
              <div key={pillar.id} className="flex items-center justify-between rounded-lg border bg-[var(--surface)] p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: pillar.color ?? "#6366F1" }}
                  />
                  <div>
                    <p className="font-semibold">{pillar.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{pillar.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {totalWeight > 0 ? ((Number(pillar.weight) / totalWeight) * 100).toFixed(0) : 0}%
                    </p>
                    {pillar.performanceScore && (
                      <p className="text-xs text-[var(--text-muted)]">Score: {Number(pillar.performanceScore).toFixed(1)}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                    onClick={() => deletePillar.mutate({ id: pillar.id })}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Voice & Tone */}
      <div className="card">
        <h2 className="text-lg font-semibold">AI Voice & Tone</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Configure how the AI writes your content.</p>
        {voiceProfile.isLoading ? (
          <Skeleton className="mt-6 h-32 w-full" />
        ) : (
          <div className="mt-6 space-y-6">
            <div>
              <label htmlFor="tone" className="label mb-1.5 block">Writing Tone</label>
              <select
                id="tone"
                className="input"
                defaultValue={voiceProfile.data?.tone ?? "professional-casual"}
                onChange={(e) => updateVoice.mutate({ tone: e.target.value })}
              >
                <option value="professional-casual">Professional & Casual</option>
                <option value="professional-authoritative">Professional & Authoritative</option>
                <option value="conversational">Conversational & Friendly</option>
                <option value="bold-provocative">Bold & Provocative</option>
                <option value="educational">Educational & Helpful</option>
              </select>
            </div>
            <div>
              <label htmlFor="userNotes" className="label mb-1.5 block">Custom Instructions</label>
              <textarea
                id="userNotes"
                rows={3}
                className="input min-h-[80px] resize-y"
                defaultValue={voiceProfile.data?.userNotes ?? ""}
                placeholder="Any specific instructions for the AI (e.g., avoid certain topics, preferred CTA style...)"
                onBlur={(e) => updateVoice.mutate({ userNotes: e.target.value || null })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

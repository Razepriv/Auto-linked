import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile Settings",
};

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-8">
      {/* Profile section */}
      <div className="card">
        <h2 className="text-lg font-semibold">Profile Information</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          This information is used to personalize your AI-generated content.
        </p>

        <div className="mt-6 space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary/10 text-xl font-bold text-brand-primary">
              JS
            </div>
            <div>
              <button type="button" className="btn-secondary text-sm">
                Change photo
              </button>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                JPG, PNG or GIF. Max 2MB.
              </p>
            </div>
          </div>

          {/* Name */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="label mb-1.5 block">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                defaultValue="Jane"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="label mb-1.5 block">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                defaultValue="Smith"
                className="input"
              />
            </div>
          </div>

          {/* Headline */}
          <div>
            <label htmlFor="headline" className="label mb-1.5 block">
              LinkedIn Headline
            </label>
            <input
              id="headline"
              type="text"
              defaultValue="CEO at TechCorp | Building the future of work"
              className="input"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Used in post previews and AI context
            </p>
          </div>

          {/* Bio */}
          <div>
            <label htmlFor="bio" className="label mb-1.5 block">
              About / Bio
            </label>
            <textarea
              id="bio"
              rows={4}
              defaultValue="Serial entrepreneur and startup advisor. Passionate about remote work, leadership, and building high-performing teams."
              className="input min-h-[100px] resize-y"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Helps the AI match your voice and expertise
            </p>
          </div>

          {/* Industry */}
          <div>
            <label htmlFor="industry" className="label mb-1.5 block">
              Industry
            </label>
            <select id="industry" className="input">
              <option>Technology</option>
              <option>Finance</option>
              <option>Healthcare</option>
              <option>Marketing</option>
              <option>Consulting</option>
              <option>Education</option>
              <option>Other</option>
            </select>
          </div>
        </div>

        <div className="mt-8 flex justify-end border-t pt-6">
          <button type="button" className="btn-primary">
            Save Changes
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
              <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold">LinkedIn</p>
              <p className="text-xs text-brand-secondary">Connected as Jane Smith</p>
            </div>
          </div>
          <button type="button" className="btn-ghost text-sm text-red-500 hover:text-red-600">
            Disconnect
          </button>
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

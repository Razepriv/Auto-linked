"use client";

import { useCallback, useMemo, useRef, useState } from "react";

// ---- Types ------------------------------------------------------------------

type ImportTab = "paste" | "csv" | "skip";

interface ParsedPost {
  text: string;
  date: string | null;
}

interface ImportPostsProps {
  onImport: (posts: ParsedPost[]) => void;
  onSkip: () => void;
}

// ---- Constants --------------------------------------------------------------

const MIN_RECOMMENDED_POSTS = 3;
const PASTE_PLACEHOLDER = `Paste your LinkedIn posts below, separated by ---

Example:

Just shipped a new feature that lets teams collaborate in real-time.
The key insight? Nobody wants another notification. They want context.
---
I've been thinking about what makes a great product manager.
It's not about having all the answers. It's about asking the right questions.
---
3 lessons from scaling our startup from 10 to 100 people:

1. Culture doesn't scale automatically
2. Communication needs to be intentional
3. Hire for values, train for skills`;

// ---- Component --------------------------------------------------------------

export default function ImportPosts({ onImport, onSkip }: ImportPostsProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>("paste");
  const [pasteContent, setPasteContent] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsedPosts, setCsvParsedPosts] = useState<ParsedPost[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse pasted content into posts
  const pastedPosts = useMemo((): ParsedPost[] => {
    if (!pasteContent.trim()) return [];

    // Split by --- separators
    const blocks = pasteContent.split(/^-{3,}$/m);
    if (blocks.length > 1) {
      return blocks
        .map((block) => block.trim())
        .filter((block) => block.length > 0)
        .map((text) => ({ text, date: null }));
    }

    // Fall back to double-newline splits
    const byDoubleNewline = pasteContent.split(/\n\s*\n/);
    const avgWords =
      byDoubleNewline.reduce(
        (sum, block) => sum + block.trim().split(/\s+/).length,
        0,
      ) / Math.max(byDoubleNewline.length, 1);

    if (byDoubleNewline.length > 1 && avgWords > 20) {
      return byDoubleNewline
        .map((block) => block.trim())
        .filter((block) => block.length > 0)
        .map((text) => ({ text, date: null }));
    }

    // Treat entire text as one post
    return [{ text: pasteContent.trim(), date: null }];
  }, [pasteContent]);

  // CSV file handling
  const handleFileSelect = useCallback(
    async (file: File) => {
      setCsvError(null);

      if (!file.name.endsWith(".csv")) {
        setCsvError("Please upload a .csv file");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setCsvError("File is too large. Maximum size is 10MB.");
        return;
      }

      setCsvFile(file);

      try {
        const text = await file.text();
        const posts = parseCSV(text);
        setCsvParsedPosts(posts);

        if (posts.length === 0) {
          setCsvError(
            "No posts found in the CSV. Make sure it has a header row and a content column.",
          );
        }
      } catch {
        setCsvError(
          "Failed to parse the CSV file. Make sure it is a valid CSV.",
        );
        setCsvParsedPosts([]);
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  // Determine which posts to import
  const currentPosts =
    activeTab === "paste" ? pastedPosts : csvParsedPosts;
  const postCount = currentPosts.length;
  const canImport = postCount > 0;
  const showLowPostWarning = postCount > 0 && postCount < MIN_RECOMMENDED_POSTS;

  const handleImport = useCallback(() => {
    if (canImport) {
      onImport(currentPosts);
    }
  }, [canImport, currentPosts, onImport]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-xl font-bold">Import Your Posts</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Share some of your LinkedIn posts so we can learn your writing style.
          The more posts you share, the better the voice analysis.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex rounded-lg border bg-[var(--surface)] p-1">
        {(
          [
            { id: "paste" as const, label: "Paste Posts" },
            { id: "csv" as const, label: "Upload CSV" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-brand-primary text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card">
        {activeTab === "paste" && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="paste-posts"
                className="label mb-1.5 block text-sm"
              >
                Paste your LinkedIn posts below, separated by{" "}
                <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs">
                  ---
                </code>
              </label>
              <textarea
                id="paste-posts"
                rows={12}
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder={PASTE_PLACEHOLDER}
                className="input min-h-[200px] resize-y font-mono text-sm"
              />
            </div>

            {postCount > 0 && (
              <PostCountBadge count={postCount} showWarning={showLowPostWarning} />
            )}
          </div>
        )}

        {activeTab === "csv" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[var(--text-secondary)]">
                Download your LinkedIn data export, then upload the{" "}
                <strong>Posts.csv</strong> file. Go to{" "}
                <span className="font-medium">
                  LinkedIn Settings &rarr; Get a copy of your data
                </span>{" "}
                to request your export.
              </p>
            </div>

            {/* Dropzone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 transition-colors ${
                isDragging
                  ? "border-brand-primary bg-brand-primary/5"
                  : "border-[var(--border)] hover:border-[var(--text-muted)]"
              }`}
            >
              <UploadIcon className="h-8 w-8 text-[var(--text-muted)]" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  {csvFile ? csvFile.name : "Drop your Posts.csv here"}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  or click to browse
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>

            {csvError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                {csvError}
              </div>
            )}

            {csvParsedPosts.length > 0 && (
              <PostCountBadge
                count={csvParsedPosts.length}
                showWarning={csvParsedPosts.length < MIN_RECOMMENDED_POSTS}
              />
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={onSkip} className="btn-ghost text-sm">
          Skip this step
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={!canImport}
          className="btn-primary"
        >
          Import {postCount > 0 ? `${postCount} post${postCount === 1 ? "" : "s"}` : "posts"}
          <ArrowRightIcon className="ml-1 h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---- Sub-components ---------------------------------------------------------

function PostCountBadge({
  count,
  showWarning,
}: {
  count: number;
  showWarning: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          showWarning
            ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
            : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
        }`}
      >
        {count} post{count === 1 ? "" : "s"} detected
      </span>
      {showWarning && (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          We recommend at least {MIN_RECOMMENDED_POSTS} posts for a better
          voice analysis
        </span>
      )}
    </div>
  );
}

// ---- CSV parser (client-side) -----------------------------------------------

function parseCSV(content: string): ParsedPost[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse header to find content and date columns
  const headers = parseCSVLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const contentIndex = headers.findIndex(
    (h) => h === "content" || h === "body" || h === "text" || h === "post",
  );
  const dateIndex = headers.findIndex(
    (h) => h === "date" || h === "created" || h === "published",
  );

  if (contentIndex === -1) {
    // Try the second column as content (common LinkedIn export format: Date, Content, ...)
    if (headers.length >= 2) {
      return parseCSVWithColumns(lines.slice(1), 1, 0);
    }
    return [];
  }

  return parseCSVWithColumns(lines.slice(1), contentIndex, dateIndex);
}

function parseCSVWithColumns(
  lines: string[],
  contentIndex: number,
  dateIndex: number,
): ParsedPost[] {
  const posts: ParsedPost[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const fields = parseCSVLine(line);
    const content = fields[contentIndex]?.trim();

    if (!content) continue;

    const date = dateIndex >= 0 ? fields[dateIndex]?.trim() ?? null : null;
    posts.push({ text: content, date });
  }

  return posts;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result;
}

// ---- Icons ------------------------------------------------------------------

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
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

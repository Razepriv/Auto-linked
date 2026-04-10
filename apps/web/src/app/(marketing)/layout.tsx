import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";

function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b bg-[var(--surface)]/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/">
          <Logo size="sm" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link
            href="#features"
            className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Features
          </Link>
          <Link
            href="#pricing"
            className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Pricing
          </Link>
          <Link
            href="#faq"
            className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-ghost text-sm">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary text-sm">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t bg-[var(--surface-raised)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Logo size="sm" />
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              AI-powered LinkedIn content on autopilot. Build your brand while
              you sleep.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Product</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href="#features"
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="#pricing"
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="#faq"
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Company</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href="#"
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Legal</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href="#"
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t pt-6">
          <p className="text-center text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Auto-Linked. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

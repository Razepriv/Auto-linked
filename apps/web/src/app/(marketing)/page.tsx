import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auto-Linked | AI-Powered LinkedIn Content on Autopilot",
};

const FEATURES = [
  {
    icon: "sparkles",
    title: "AI Content Generation",
    description:
      "Generate on-brand LinkedIn posts tailored to your voice, audience, and content pillars. Never stare at a blank page again.",
  },
  {
    icon: "calendar",
    title: "Smart Scheduling",
    description:
      "Posts go out at optimal times for your audience. Set your schedule once and let the content flow consistently.",
  },
  {
    icon: "shield",
    title: "Human-in-the-Loop",
    description:
      "Every post passes through your review queue. Approve, edit, or regenerate with one click. You stay in control.",
  },
  {
    icon: "chart",
    title: "Analytics & Insights",
    description:
      "Track impressions, engagement, and follower growth. Understand what resonates and optimize your strategy.",
  },
  {
    icon: "layers",
    title: "Content Pillars",
    description:
      "Define up to 5 content themes. AI balances your calendar across pillars for a well-rounded presence.",
  },
  {
    icon: "zap",
    title: "One-Click Autopilot",
    description:
      "From idea to published post in minutes. Batch-generate a week of content during your morning coffee.",
  },
] as const;

const PRICING_TIERS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Perfect for trying out AI-powered LinkedIn content.",
    features: [
      "5 AI-generated posts per month",
      "1 content pillar",
      "Basic analytics",
      "Manual posting",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For professionals serious about building their brand.",
    features: [
      "60 AI-generated posts per month",
      "5 content pillars",
      "Advanced analytics & insights",
      "Auto-scheduling",
      "LinkedIn API integration",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$79",
    period: "/month",
    description: "For teams managing multiple LinkedIn profiles.",
    features: [
      "Unlimited AI-generated posts",
      "Unlimited content pillars",
      "Team collaboration",
      "Multi-profile management",
      "Custom AI training",
      "Dedicated support",
      "API access",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
] as const;

function FeatureIcon({ icon }: { icon: string }) {
  const iconMap: Record<string, string> = {
    sparkles: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
    calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
    shield: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
    chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
    layers: "M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75l-5.571-3m11.142 0l4.179 2.25L12 17.25l-9.75-5.25 4.179-2.25",
    zap: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-6 w-6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={iconMap[icon] ?? iconMap.sparkles}
      />
    </svg>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-32 lg:px-8">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-brand-primary/5 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full bg-brand-accent/5 blur-3xl" />
      </div>

      <div className="mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-[var(--surface-raised)] px-4 py-1.5 text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-secondary" />
          Now in public beta
        </div>

        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          LinkedIn content on{" "}
          <span className="bg-gradient-to-r from-brand-primary to-brand-accent bg-clip-text text-transparent">
            autopilot
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-[var(--text-secondary)] sm:text-xl">
          Auto-Linked generates, schedules, and publishes on-brand LinkedIn
          posts for you. Stay consistent, grow your audience, and never run out
          of ideas.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/signup" className="btn-primary px-8 py-3 text-base">
            Start for free
          </Link>
          <Link href="#features" className="btn-secondary px-8 py-3 text-base">
            See how it works
          </Link>
        </div>

        <p className="mt-4 text-sm text-[var(--text-muted)]">
          No credit card required. 5 free posts every month.
        </p>
      </div>

      {/* Mock app preview */}
      <div className="mx-auto mt-16 max-w-5xl">
        <div className="overflow-hidden rounded-xl border shadow-lg">
          <div className="flex h-10 items-center gap-2 border-b bg-[var(--surface-raised)] px-4">
            <div className="h-3 w-3 rounded-full bg-red-400" />
            <div className="h-3 w-3 rounded-full bg-yellow-400" />
            <div className="h-3 w-3 rounded-full bg-green-400" />
            <span className="ml-4 text-xs text-[var(--text-muted)]">
              app.autolinked.ai/dashboard
            </span>
          </div>
          <div className="grid grid-cols-12 bg-[var(--surface)]">
            {/* Sidebar mock */}
            <div className="col-span-3 hidden border-r bg-[var(--surface-raised)] p-4 lg:block">
              <div className="space-y-3">
                <div className="h-8 w-full rounded-lg bg-brand-primary/10" />
                <div className="h-8 w-full rounded-lg bg-[var(--surface)]" />
                <div className="h-8 w-full rounded-lg bg-[var(--surface)]" />
                <div className="h-8 w-full rounded-lg bg-[var(--surface)]" />
                <div className="h-8 w-full rounded-lg bg-[var(--surface)]" />
              </div>
            </div>
            {/* Content mock */}
            <div className="col-span-12 p-6 lg:col-span-9">
              <div className="mb-6 h-8 w-48 rounded-lg bg-[var(--surface-raised)]" />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border bg-[var(--surface-raised)] p-4">
                  <div className="mb-2 h-4 w-20 rounded bg-pillar-blue/20" />
                  <div className="h-8 w-16 rounded-lg bg-[var(--surface)]" />
                </div>
                <div className="rounded-xl border bg-[var(--surface-raised)] p-4">
                  <div className="mb-2 h-4 w-20 rounded bg-brand-secondary/20" />
                  <div className="h-8 w-16 rounded-lg bg-[var(--surface)]" />
                </div>
                <div className="rounded-xl border bg-[var(--surface-raised)] p-4">
                  <div className="mb-2 h-4 w-20 rounded bg-brand-accent/20" />
                  <div className="h-8 w-16 rounded-lg bg-[var(--surface)]" />
                </div>
              </div>
              <div className="mt-6 space-y-3">
                <div className="h-20 rounded-xl border bg-[var(--surface-raised)]" />
                <div className="h-20 rounded-xl border bg-[var(--surface-raised)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="border-t bg-[var(--surface-raised)] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to dominate LinkedIn
          </h2>
          <p className="mt-4 text-lg text-[var(--text-secondary)]">
            From idea generation to publishing, Auto-Linked handles the heavy
            lifting so you can focus on your expertise.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="card">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <FeatureIcon icon={feature.icon} />
              </div>
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-[var(--text-secondary)]">
            Start free. Upgrade when you are ready to go all-in on your personal
            brand.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border p-8 ${
                tier.highlighted
                  ? "border-brand-primary shadow-lg ring-1 ring-brand-primary"
                  : "bg-[var(--surface-raised)]"
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-brand-primary px-4 py-1 text-xs font-semibold text-white">
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-semibold">{tier.name}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {tier.description}
              </p>
              <div className="mt-6">
                <span className="text-4xl font-bold">{tier.price}</span>
                {tier.period && (
                  <span className="text-[var(--text-secondary)]">
                    {tier.period}
                  </span>
                )}
              </div>
              <ul className="mt-8 space-y-3">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-sm"
                  >
                    <svg
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-secondary"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`mt-8 block w-full text-center ${
                  tier.highlighted ? "btn-primary" : "btn-secondary"
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Connect & Configure",
    description: "Link your LinkedIn account, define your content pillars, and set your preferred tone. Takes about 5 minutes.",
  },
  {
    step: "2",
    title: "AI Generates Content",
    description: "Auto-Linked analyzes your profile and creates posts that match your voice, expertise, and audience.",
  },
  {
    step: "3",
    title: "Review & Approve",
    description: "Every post lands in your review queue. Edit, approve, or regenerate with one click. Nothing publishes without your say-so.",
  },
  {
    step: "4",
    title: "Publish on Autopilot",
    description: "Approved posts go out on your schedule. Track performance, refine your strategy, and watch your brand grow.",
  },
] as const;

function HowItWorksSection() {
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-[var(--text-secondary)]">
            From setup to published posts in under 10 minutes.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((item) => (
            <div key={item.step} className="relative text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary text-lg font-bold text-white">
                {item.step}
              </div>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  {
    question: "Will the AI sound like me?",
    answer: "Yes. Auto-Linked analyzes your existing posts and writing style to create a voice profile. Every generated post matches your tone, vocabulary, and perspective.",
  },
  {
    question: "Can I edit posts before they go live?",
    answer: "Absolutely. Every post goes through your review queue first. You can edit, approve, regenerate, or skip any post. Nothing publishes without your explicit approval.",
  },
  {
    question: "What happens if I run out of posts?",
    answer: "On the free plan, you get 5 posts per month. Pro and Team plans offer significantly more. You can upgrade anytime, and unused posts don't roll over.",
  },
  {
    question: "Is my LinkedIn account safe?",
    answer: "Yes. We use official LinkedIn OAuth and never store your password. All API tokens are encrypted at rest, and you can revoke access anytime from your LinkedIn settings.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. No long-term contracts. Cancel your subscription anytime from the billing page and you'll retain access until the end of your billing period.",
  },
  {
    question: "Do you support team accounts?",
    answer: "Yes. The Team plan supports multiple team members managing content for one or more LinkedIn profiles, with approval workflows and shared analytics.",
  },
] as const;

function FAQSection() {
  return (
    <section id="faq" className="border-t px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Frequently asked questions
        </h2>
        <div className="mt-12 space-y-6">
          {FAQ_ITEMS.map((item) => (
            <div key={item.question} className="rounded-xl border bg-[var(--surface-raised)] p-6">
              <h3 className="text-base font-semibold">{item.question}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="border-t bg-[var(--surface-raised)] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to build your LinkedIn brand?
        </h2>
        <p className="mt-4 text-lg text-[var(--text-secondary)]">
          Join thousands of professionals who save hours every week with
          AI-powered LinkedIn content.
        </p>
        <div className="mt-8">
          <Link href="/signup" className="btn-primary px-8 py-3 text-base">
            Get started for free
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
    </>
  );
}

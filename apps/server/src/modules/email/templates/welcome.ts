import { emailLayout } from './layout.js';

interface WelcomeEmailProps {
  userName: string;
  onboardingUrl: string;
}

export function welcomeEmail({ userName, onboardingUrl }: WelcomeEmailProps): { subject: string; html: string; text: string } {
  const subject = 'Welcome to AutoLinked — Let\'s build your LinkedIn brand';

  const html = emailLayout(`
    <h1>Welcome, ${userName}!</h1>
    <p>You've just taken the first step toward building a consistent LinkedIn presence — without the daily grind.</p>
    <p>Here's what happens next:</p>
    <ol style="font-size:15px;line-height:1.8;color:#3f3f46;padding-left:20px">
      <li><strong>Connect LinkedIn</strong> — so we can learn your voice</li>
      <li><strong>Set content pillars</strong> — define what you want to be known for</li>
      <li><strong>Review your first posts</strong> — AI-generated, your voice</li>
    </ol>
    <p>The whole setup takes about 5 minutes.</p>
    <p style="text-align:center;margin:32px 0">
      <a href="${onboardingUrl}" class="btn">Start Onboarding</a>
    </p>
    <hr class="divider" />
    <p class="muted">If you didn't create this account, you can safely ignore this email.</p>
  `, `Welcome to AutoLinked, ${userName}! Let's set up your AI ghostwriter.`);

  const text = `Welcome to AutoLinked, ${userName}!

You've just taken the first step toward building a consistent LinkedIn presence.

Start onboarding: ${onboardingUrl}

1. Connect LinkedIn — so we can learn your voice
2. Set content pillars — define what you want to be known for
3. Review your first posts — AI-generated, your voice

The whole setup takes about 5 minutes.`;

  return { subject, html, text };
}

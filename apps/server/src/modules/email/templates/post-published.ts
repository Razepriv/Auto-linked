import { emailLayout } from './layout.js';

interface PostPublishedProps {
  userName: string;
  postHook: string;
  linkedinUrl: string;
  pillarName: string | null;
  analyticsUrl: string;
}

export function postPublishedEmail({ userName, postHook, linkedinUrl, pillarName, analyticsUrl }: PostPublishedProps): { subject: string; html: string; text: string } {
  const subject = 'Your post just went live on LinkedIn';

  const pillarBadge = pillarName
    ? `<span style="display:inline-block;background:#f0f0ff;color:#6366f1;font-size:12px;padding:2px 8px;border-radius:4px;margin-bottom:8px">${pillarName}</span>`
    : '';

  const html = emailLayout(`
    <h1>Post Published!</h1>
    <p>Hey ${userName}, your post is now live on LinkedIn.</p>
    ${pillarBadge}
    <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:16px 0;border-left:3px solid #1570EF">
      <p style="margin:0;font-style:italic;color:#3f3f46">"${postHook}"</p>
    </div>
    <p style="text-align:center;margin:24px 0">
      <a href="${linkedinUrl}" class="btn">View on LinkedIn</a>
      &nbsp;&nbsp;
      <a href="${analyticsUrl}" class="btn btn-secondary">Track Performance</a>
    </p>
    <p class="muted">We'll start collecting engagement analytics for this post automatically.</p>
  `, `Your LinkedIn post "${postHook}" is now live.`);

  const text = `Hey ${userName}, your post just went live on LinkedIn!

"${postHook}"

View on LinkedIn: ${linkedinUrl}
Track performance: ${analyticsUrl}`;

  return { subject, html, text };
}

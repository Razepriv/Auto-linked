import { emailLayout } from './layout.js';

interface ReviewReminderProps {
  userName: string;
  pendingCount: number;
  reviewUrl: string;
  nextScheduledAt?: string;
}

export function reviewReminderEmail({ userName, pendingCount, reviewUrl, nextScheduledAt }: ReviewReminderProps): { subject: string; html: string; text: string } {
  const subject = `${pendingCount} post${pendingCount === 1 ? '' : 's'} ready for your review`;

  const scheduleLine = nextScheduledAt
    ? `<p>Your next post is scheduled for <strong>${nextScheduledAt}</strong>.</p>`
    : '';

  const html = emailLayout(`
    <h1>Posts ready for review</h1>
    <p>Hey ${userName}, you have <strong>${pendingCount} draft post${pendingCount === 1 ? '' : 's'}</strong> waiting for your approval.</p>
    ${scheduleLine}
    <p>Take a quick look, make any edits, and approve them to keep your LinkedIn running on autopilot.</p>
    <p style="text-align:center;margin:32px 0">
      <a href="${reviewUrl}" class="btn">Review Posts</a>
    </p>
    <hr class="divider" />
    <p class="muted">You're receiving this because you have email notifications enabled. <a href="https://autolinked.app/settings">Manage preferences</a></p>
  `, `${pendingCount} LinkedIn posts are waiting for your review.`);

  const text = `Hey ${userName}, you have ${pendingCount} draft post${pendingCount === 1 ? '' : 's'} waiting for your approval.

Review them here: ${reviewUrl}

${nextScheduledAt ? `Your next post is scheduled for ${nextScheduledAt}.` : ''}`;

  return { subject, html, text };
}

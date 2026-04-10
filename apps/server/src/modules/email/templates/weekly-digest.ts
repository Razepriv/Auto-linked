import { emailLayout } from './layout.js';

interface WeeklyDigestProps {
  userName: string;
  weekOf: string;
  postsPublished: number;
  totalImpressions: number;
  totalReactions: number;
  totalComments: number;
  avgEngagement: number;
  topPostHook: string | null;
  topPostUrl: string | null;
  dashboardUrl: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function weeklyDigestEmail(props: WeeklyDigestProps): { subject: string; html: string; text: string } {
  const subject = `Your weekly LinkedIn report — ${props.weekOf}`;

  const topPostBlock = props.topPostHook && props.topPostUrl
    ? `<hr class="divider" />
       <h2 style="font-size:16px;margin:0 0 8px">Top Performing Post</h2>
       <p style="font-style:italic;color:#3f3f46">"${props.topPostHook}"</p>
       <p><a href="${props.topPostUrl}" style="color:#1570EF">View on LinkedIn &rarr;</a></p>`
    : '';

  const html = emailLayout(`
    <h1>Weekly Performance Report</h1>
    <p>Hey ${props.userName}, here's how your LinkedIn performed this week.</p>

    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-value">${props.postsPublished}</div>
        <div class="stat-label">Posts Published</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${formatNumber(props.totalImpressions)}</div>
        <div class="stat-label">Impressions</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${formatNumber(props.totalReactions)}</div>
        <div class="stat-label">Reactions</div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-value">${formatNumber(props.totalComments)}</div>
        <div class="stat-label">Comments</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${props.avgEngagement.toFixed(2)}%</div>
        <div class="stat-label">Avg Engagement</div>
      </div>
    </div>

    ${topPostBlock}

    <p style="text-align:center;margin:32px 0">
      <a href="${props.dashboardUrl}" class="btn">View Full Analytics</a>
    </p>
    <hr class="divider" />
    <p class="muted">Sent every Monday. <a href="https://autolinked.app/settings">Manage preferences</a></p>
  `, `Your LinkedIn week: ${props.postsPublished} posts, ${formatNumber(props.totalImpressions)} impressions, ${props.avgEngagement.toFixed(2)}% engagement.`);

  const text = `Weekly LinkedIn Report — ${props.weekOf}

Hey ${props.userName}, here's your weekly summary:

Posts Published: ${props.postsPublished}
Impressions: ${formatNumber(props.totalImpressions)}
Reactions: ${formatNumber(props.totalReactions)}
Comments: ${formatNumber(props.totalComments)}
Avg Engagement: ${props.avgEngagement.toFixed(2)}%

View full analytics: ${props.dashboardUrl}`;

  return { subject, html, text };
}

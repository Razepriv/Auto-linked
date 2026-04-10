const BRAND_COLOR = '#1570EF';
const BRAND_SECONDARY = '#7C3AED';

export function emailLayout(content: string, previewText?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden">${previewText}</div>` : ''}
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f4f4f5; }
    .container { max-width: 580px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #ffffff; border-radius: 12px; padding: 40px 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .logo { font-size: 20px; font-weight: 700; color: ${BRAND_COLOR}; text-decoration: none; }
    .btn { display: inline-block; padding: 12px 28px; background: ${BRAND_COLOR}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .btn-secondary { background: ${BRAND_SECONDARY}; }
    .footer { text-align: center; padding: 24px 0; color: #71717a; font-size: 12px; }
    .footer a { color: #71717a; text-decoration: underline; }
    .divider { border: none; border-top: 1px solid #e4e4e7; margin: 24px 0; }
    h1 { font-size: 22px; color: #18181b; margin: 0 0 8px; }
    p { font-size: 15px; line-height: 1.6; color: #3f3f46; margin: 12px 0; }
    .muted { color: #71717a; font-size: 13px; }
    .stat-grid { display: flex; gap: 16px; margin: 16px 0; }
    .stat-box { flex: 1; background: #f9fafb; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: ${BRAND_COLOR}; }
    .stat-label { font-size: 12px; color: #71717a; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div style="text-align:center;padding:16px 0">
      <a href="https://autolinked.app" class="logo">AutoLinked</a>
    </div>
    <div class="card">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} AutoLinked. All rights reserved.</p>
      <p>
        <a href="https://autolinked.app/settings">Email Preferences</a> &middot;
        <a href="https://autolinked.app">Visit AutoLinked</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

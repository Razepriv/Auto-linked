import { Resend } from 'resend';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

if (!resend) {
  logger.warn('RESEND_API_KEY not set — email sending disabled');
}

const FROM_ADDRESS = process.env['EMAIL_FROM'] ?? 'AutoLinked <noreply@autolinked.ai>';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  if (!resend) {
    logger.info({ to: options.to, subject: options.subject }, 'Email skipped (Resend not configured)');
    return { id: 'skipped' };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
    tags: options.tags,
  });

  if (error) {
    logger.error({ error: error.message, to: options.to }, 'Failed to send email');
    throw new Error(`Email send failed: ${error.message}`);
  }

  logger.info({ emailId: data?.id, to: options.to, subject: options.subject }, 'Email sent');
  return { id: data?.id ?? '' };
}

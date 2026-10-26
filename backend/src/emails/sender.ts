import { logger } from '../lib/logger.js';
import { renderEmail } from './renderer.js';
import type {
  EmailBranding,
  EmailTemplateId,
  FreeCheckReportData,
  TemplateDataMap,
} from './types.js';
import type { AuthMailer, EmailData } from '../lib/auth.js';

export interface SentEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  templateId?: EmailTemplateId;
  sentAt: Date;
}

export interface EmailTransport {
  send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    from?: string;
  }): Promise<{ id: string; ok: boolean }>;
}

export class MockTransport implements EmailTransport {
  public sent: SentEmail[] = [];

  send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    from?: string;
  }): Promise<{ id: string; ok: boolean }> {
    const id = `mock-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sent.push({
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      sentAt: new Date(),
    });
    return Promise.resolve({ id, ok: true });
  }

  clear() {
    this.sent = [];
  }
}

/** Development fallback when no Resend key is set: logs each email so links can be clicked. */
export class LogTransport extends MockTransport {
  override send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    from?: string;
  }): Promise<{ id: string; ok: boolean }> {
    logger.info(
      { to: message.to, subject: message.subject },
      `Email not sent (RESEND_API_KEY unset):\n${message.text}`,
    );
    return super.send(message);
  }
}

export class ResendTransport implements EmailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly defaultFrom: string = 'EveryVisitor <no-reply@everyvisitor.app>',
    private readonly replyTo?: string,
  ) {}

  async send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    from?: string;
  }): Promise<{ id: string; ok: boolean }> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from || this.defaultFrom,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend send failed (${res.status}): ${err}`);
    }

    const json = (await res.json()) as { id: string };
    return { id: json.id, ok: true };
  }
}

export interface EmailSenderOptions {
  transport?: EmailTransport;
  from?: string;
  branding?: EmailBranding;
}

export class EmailSender implements AuthMailer {
  public transport: EmailTransport;
  public defaultFrom: string;
  public defaultBranding?: EmailBranding;

  constructor(options: EmailSenderOptions = {}) {
    this.transport = options.transport || new MockTransport();
    this.defaultFrom = options.from || 'EveryVisitor <no-reply@everyvisitor.app>';
    this.defaultBranding = options.branding;
  }

  async send<T extends EmailTemplateId>(options: {
    to: string;
    templateId: T;
    data: TemplateDataMap[T];
    branding?: EmailBranding;
  }): Promise<{ id: string; ok: boolean }> {
    const { to, templateId, data, branding } = options;
    const activeBranding = branding || this.defaultBranding;
    const rendered = renderEmail(templateId, data, activeBranding);
    const from = activeBranding?.senderName
      ? `${activeBranding.senderName} <${senderAddress(this.defaultFrom)}>`
      : this.defaultFrom;

    return this.transport.send({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      from,
    });
  }

  // AuthMailer implementations for Better Auth
  async sendVerificationEmail(data: EmailData): Promise<void> {
    await this.send({
      to: data.email,
      templateId: 'E-01',
      data: {
        email: data.email,
        url: data.url,
      },
    });
  }

  async sendMagicLink(data: EmailData): Promise<void> {
    await this.send({
      to: data.email,
      templateId: 'E-02',
      data: {
        email: data.email,
        url: data.url,
      },
    });
  }

  async sendResetPassword(data: EmailData): Promise<void> {
    await this.send({
      to: data.email,
      templateId: 'E-03',
      data: {
        email: data.email,
        url: data.url,
      },
    });
  }

  async sendFreeCheckReport(to: string, data: FreeCheckReportData): Promise<void> {
    await this.send({
      to,
      templateId: 'E-13',
      data,
    });
  }
}

/** `Name <addr@x>` -> `addr@x`; a bare address is returned as is. */
function senderAddress(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from;
}

export function createEmailSender(config: {
  NODE_ENV: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO?: string;
}): EmailSender {
  let transport: EmailTransport;
  if (config.RESEND_API_KEY) {
    transport = new ResendTransport(
      config.RESEND_API_KEY,
      config.EMAIL_FROM,
      config.EMAIL_REPLY_TO,
    );
  } else if (config.NODE_ENV === 'production') {
    throw new Error('RESEND_API_KEY is required when NODE_ENV=production.');
  } else {
    transport = config.NODE_ENV === 'test' ? new MockTransport() : new LogTransport();
  }
  return new EmailSender({ transport, from: config.EMAIL_FROM });
}

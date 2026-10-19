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

export class ResendTransport implements EmailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly defaultFrom: string = 'Plainsight <notifications@plainsight.app>',
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
    this.defaultFrom = options.from || 'Plainsight <notifications@plainsight.app>';
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
      ? `${activeBranding.senderName} <notifications@plainsight.app>`
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

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { renderEmail, getSampleTemplateData } from '../../src/emails/renderer.js';
import { EmailSender, MockTransport } from '../../src/emails/sender.js';
import { handleEmailSend } from '../../src/worker/jobs/email-send.js';
import type { EmailTemplateId } from '../../src/emails/types.js';
import { buildTestApp } from '../helpers/fakes.js';

describe('Email Infrastructure (Chunk P2-18)', () => {
  const templates: EmailTemplateId[] = [
    'E-01',
    'E-02',
    'E-03',
    'E-04',
    'E-05',
    'E-06',
    'E-07',
  ];

  describe('Template rendering & plain-text generation', () => {
    it.each(templates)('template %s renders valid subject, accessible HTML, and plain text', (templateId) => {
      const sample = getSampleTemplateData(templateId);
      const rendered = renderEmail(templateId, sample as never);

      expect(rendered.subject).toBeTruthy();
      expect(rendered.html).toContain('<!DOCTYPE html>');
      expect(rendered.html).toContain('role="presentation"');
      expect(rendered.text).toBeTruthy();
      expect(typeof rendered.text).toBe('string');
      expect(rendered.text.length).toBeGreaterThan(20);
    });

    it('uses accessible primary color contrast (default #0F3D3E has >10:1 contrast on #FFFFFF)', () => {
      const sample = getSampleTemplateData('E-04');
      const rendered = renderEmail('E-04', sample as never);

      expect(rendered.html).toContain('#0F3D3E');
      expect(rendered.html).toContain('#FFFFFF');
      expect(rendered.html).toContain('#1A1816');
    });

    it('includes unsubscribe link on non-essential scan summary mail (E-07)', () => {
      const sample = getSampleTemplateData('E-07');
      const rendered = renderEmail('E-07', sample as never);

      expect(rendered.html).toContain('Unsubscribe here');
      expect(rendered.text).toContain('Unsubscribe:');
    });
  });

  describe('Email preview routes (/v1/emails/preview)', () => {
    const { app } = buildTestApp();

    it('GET /v1/emails/preview lists all 7 templates', async () => {
      const res = await request(app)
        .get('/v1/emails/preview')
        .expect(200);

      expect(res.headers['content-type']).toContain('text/html');
      for (const t of templates) {
        expect(res.text).toContain(t);
      }
    });

    it.each(templates)('GET /v1/emails/preview/%s returns HTML preview', async (templateId) => {
      const res = await request(app)
        .get(`/v1/emails/preview/${templateId}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<!DOCTYPE html>');
    });

    it.each(templates)('GET /v1/emails/preview/%s?format=text returns plain text', async (templateId) => {
      const res = await request(app)
        .get(`/v1/emails/preview/${templateId}?format=text`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).not.toContain('<!DOCTYPE html>');
      expect(res.text.length).toBeGreaterThan(20);
    });

    it('returns 404 for unknown template preview', async () => {
      await request(app)
        .get('/v1/emails/preview/E-99')
        .expect(404);
    });
  });

  describe('Email sender & worker job', () => {
    it('dispatches email via transport', async () => {
      const transport = new MockTransport();
      const sender = new EmailSender({ transport });

      const result = await sender.send({
        to: 'user@example.com',
        templateId: 'E-01',
        data: {
          email: 'user@example.com',
          url: 'https://example.com/verify?token=abc',
        },
      });

      expect(result.ok).toBe(true);
      expect(transport.sent).toHaveLength(1);
      expect(transport.sent[0]!.to).toBe('user@example.com');
      expect(transport.sent[0]!.subject).toContain('Verify your email');
    });

    it('handleEmailSend background worker job dispatches email', async () => {
      const transport = new MockTransport();
      const sender = new EmailSender({ transport });

      const res = await handleEmailSend(
        {
          to: 'invitee@example.com',
          templateId: 'E-04',
          data: {
            orgName: 'Brightline Studio',
            role: 'member',
            inviteUrl: 'https://example.com/invitations/tok-1',
          },
        },
        {
          repos: {} as never,
          storage: {} as never,
          emailSender: sender,
        },
      );

      expect(res.ok).toBe(true);
      expect(transport.sent).toHaveLength(1);
      expect(transport.sent[0]!.to).toBe('invitee@example.com');
      expect(transport.sent[0]!.subject).toContain('invited you to join Brightline Studio');
    });
  });
});

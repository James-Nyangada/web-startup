import { Router, type Request, type Response } from 'express';
import { getSampleTemplateData, renderEmail } from './renderer.js';
import type { EmailTemplateId } from './types.js';

const VALID_TEMPLATES: EmailTemplateId[] = [
  'E-01',
  'E-02',
  'E-03',
  'E-04',
  'E-05',
  'E-06',
  'E-07',
  'E-09',
  'E-11',
  'E-13',
  'E-14',
  'E-15',
  'E-17',
  'E-18',
  'E-19',
  'E-20',
  'E-22',
  'E-23',
];

export function createEmailPreviewRouter(): Router {
  const router = Router();

  // Index: list all available preview templates
  router.get('/preview', (_req: Request, res: Response) => {
    const listHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>EveryVisitor Email Templates Preview</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; background: #F8F7F4; color: #1A1816; }
            h1 { font-size: 24px; margin-bottom: 24px; }
            ul { list-style: none; padding: 0; }
            li { margin-bottom: 12px; background: white; padding: 16px; border-radius: 8px; border: 1px solid #E4E0D8; }
            a { color: #0F3D3E; font-weight: 600; text-decoration: none; font-size: 16px; }
            a:hover { text-decoration: underline; }
            .badge { display: inline-block; background: #0F3D3E; color: white; border-radius: 4px; padding: 2px 8px; font-size: 12px; margin-right: 8px; }
            .links { margin-top: 8px; font-size: 13px; }
            .links a { font-size: 13px; font-weight: normal; margin-right: 12px; }
          </style>
        </head>
        <body>
          <h1>Email Template Previews (Chunk P2-18)</h1>
          <ul>
            ${VALID_TEMPLATES.map((t) => {
              const sample = getSampleTemplateData(t);
              const rendered = renderEmail(t, sample as never);
              return `
                <li>
                  <span class="badge">${t}</span>
                  <a href="/v1/emails/preview/${t}">${rendered.subject}</a>
                  <div class="links">
                    <a href="/v1/emails/preview/${t}" target="_blank">HTML Preview ↗</a>
                    <a href="/v1/emails/preview/${t}?format=text" target="_blank">Plain Text Preview ↗</a>
                  </div>
                </li>
              `;
            }).join('')}
          </ul>
        </body>
      </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(listHtml);
  });

  // Preview specific template
  router.get('/preview/:templateId', (req: Request, res: Response) => {
    const paramVal = req.params.templateId;
    const templateId = (Array.isArray(paramVal) ? paramVal[0] : paramVal) as EmailTemplateId;

    if (!VALID_TEMPLATES.includes(templateId)) {
      res
        .status(404)
        .send(`Unknown template "${templateId}". Valid templates: ${VALID_TEMPLATES.join(', ')}`);
      return;
    }

    const sample = getSampleTemplateData(templateId);
    const rendered = renderEmail(templateId, sample as never);

    if (req.query.format === 'text') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.status(200).send(rendered.text);
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(rendered.html);
  });

  return router;
}

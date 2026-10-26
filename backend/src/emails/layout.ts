import type { EmailBranding } from './types.js';

export interface LayoutOptions {
  preheader?: string;
  title: string;
  contentHtml: string;
  buttonLabel?: string;
  buttonUrl?: string;
  secondaryLinkText?: string;
  secondaryLinkUrl?: string;
  branding?: EmailBranding;
  unsubscribeUrl?: string;
}

export function renderEmailLayout(options: LayoutOptions): string {
  const {
    preheader,
    title,
    contentHtml,
    buttonLabel,
    buttonUrl,
    secondaryLinkText,
    secondaryLinkUrl,
    branding,
    unsubscribeUrl,
  } = options;

  const brandName = branding?.displayName || 'EveryVisitor';
  const primaryColor = branding?.primaryColor || '#0F3D3E'; // 10.1:1 contrast on white

  const buttonHtml =
    buttonLabel && buttonUrl
      ? `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 20px 0;">
      <tr>
        <td align="center">
          <a href="${buttonUrl}" target="_blank" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; line-height: 48px; height: 48px; padding: 0 28px; text-decoration: none; border-radius: 24px; text-align: center; mso-padding-alt: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
            <!--[if mso]><i style="letter-spacing: 28px; mso-font-width: -100%; mso-text-raise: 30pt">&nbsp;</i><![endif]-->
            <span style="mso-text-raise: 15pt;">${buttonLabel}</span>
            <!--[if mso]><i style="letter-spacing: 28px; mso-font-width: -100%">&nbsp;</i><![endif]-->
          </a>
        </td>
      </tr>
    </table>
  `
      : '';

  const secondaryLinkHtml =
    secondaryLinkText && secondaryLinkUrl
      ? `
    <p style="margin: 16px 0 0 0; font-size: 13px; line-height: 20px; color: #635F59;">
      Or paste this URL into your browser:<br />
      <a href="${secondaryLinkUrl}" style="color: ${primaryColor}; word-break: break-all; text-decoration: underline;">${secondaryLinkUrl}</a>
    </p>
  `
      : '';

  const unsubscribeHtml = unsubscribeUrl
    ? `
    <p style="margin: 8px 0 0 0; font-size: 12px; line-height: 18px; color: #76716B;">
      Don't want to receive these updates? <a href="${unsubscribeUrl}" style="color: #635F59; text-decoration: underline;">Unsubscribe here</a>.
    </p>
  `
    : '';

  return `<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; min-width: 100%; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; margin: auto !important; }
      .content-padding { padding: 24px 20px !important; }
      .header-padding { padding: 24px 20px 16px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F7F4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1A1816;">
  ${preheader ? `<div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all;">${preheader}</div>` : ''}

  <!-- Outer wrapper -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8F7F4; table-layout: fixed;">
    <tr>
      <td align="center" style="padding: 32px 12px 48px 12px;">
        <!-- Email Container (max 560px) -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 560px; margin: 0 auto;">
          
          <!-- Header / Brand -->
          <tr>
            <td align="left" class="header-padding" style="padding: 12px 12px 24px 12px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: ${primaryColor};">
                    ${branding?.logoUrl ? `<img src="${branding.logoUrl}" alt="${brandName}" height="28" style="display: block; max-height: 28px; width: auto;" />` : brandName}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td align="left" style="background-color: #FFFFFF; border: 1px solid #E4E0D8; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
              <div class="content-padding" style="padding: 36px 32px 32px 32px;">
                <h1 style="margin: 0 0 18px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; line-height: 30px; font-weight: 600; color: #1A1816; letter-spacing: -0.01em;">
                  ${title}
                </h1>
                
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 24px; color: #373531;">
                  ${contentHtml}
                </div>

                ${buttonHtml}
                ${secondaryLinkHtml}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="left" style="padding: 24px 16px 0 16px;">
              <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #76716B;">
                Sent by ${brandName} · Automated web accessibility checks &amp; continuous monitoring.
              </p>
              ${unsubscribeHtml}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

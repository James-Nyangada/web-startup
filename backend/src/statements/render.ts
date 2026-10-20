export interface StatementLimitation {
  issueId?: string;
  title: string;
  description: string;
  workaround?: string;
}

export interface StatementFeedbackContact {
  email: string;
  phone?: string;
  address?: string;
  responseTime?: string;
}

export interface StatementEnforcement {
  bodyName?: string;
  contactUrl?: string;
  description?: string;
}

export interface StatementData {
  orgName: string;
  siteName: string;
  siteUrl: string;
  scope: string;
  targetStandard: string;
  conformanceStatus: 'fully_conformant' | 'partially_conformant' | 'non_conformant';
  measuresTaken: string[];
  knownLimitations: StatementLimitation[];
  feedbackContact: StatementFeedbackContact;
  enforcementProcedure?: StatementEnforcement;
  statementDate: string; // YYYY-MM-DD
}

export interface StatementBranding {
  displayName?: string | null;
  primaryColor?: string | null;
  logoLightUrl?: string | null;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getConformanceLabel(status: StatementData['conformanceStatus']): string {
  switch (status) {
    case 'fully_conformant':
      return 'Fully conformant';
    case 'partially_conformant':
      return 'Partially conformant';
    case 'non_conformant':
      return 'Non-conformant';
    default:
      return 'Partially conformant';
  }
}

export function getConformanceDescription(
  status: StatementData['conformanceStatus'],
  standard: string,
): string {
  switch (status) {
    case 'fully_conformant':
      return `The website fully conforms to ${standard} without exceptions.`;
    case 'partially_conformant':
      return `The website partially conforms to ${standard}, meaning some parts of the content do not yet fully conform to the accessibility standard.`;
    case 'non_conformant':
      return `The website does not yet conform to ${standard}. The items listed below represent areas currently being addressed.`;
    default:
      return `The website partially conforms to ${standard}.`;
  }
}

/**
 * Generates semantic, accessible HTML for the published Accessibility Statement.
 */
export function renderAccessibilityStatementHtml(
  data: StatementData,
  branding?: StatementBranding,
): string {
  const primaryColor = branding?.primaryColor || '#0F3D3E';
  const orgName = escapeHtml(data.orgName || branding?.displayName || 'Organisation');
  const siteName = escapeHtml(data.siteName || 'Website');
  const siteUrl = escapeHtml(data.siteUrl || '#');
  const scope = escapeHtml(
    data.scope || `This accessibility statement applies to ${data.siteName}.`,
  );
  const standard = escapeHtml(data.targetStandard || 'WCAG 2.2 Level AA');
  const statusLabel = escapeHtml(getConformanceLabel(data.conformanceStatus));
  const statusDesc = escapeHtml(
    getConformanceDescription(data.conformanceStatus, data.targetStandard),
  );
  const dateFormatted = escapeHtml(data.statementDate || new Date().toISOString().split('T')[0]!);

  const measuresHtml =
    data.measuresTaken && data.measuresTaken.length > 0
      ? `<ul class="measures-list">
          ${data.measuresTaken.map((m) => `<li>${escapeHtml(m)}</li>`).join('\n')}
        </ul>`
      : '<p>Accessibility is considered across ongoing design, development, and content authoring.</p>';

  const limitationsHtml =
    data.knownLimitations && data.knownLimitations.length > 0
      ? `<div class="limitations-table-wrapper">
          <table class="limitations-table" aria-label="Known accessibility limitations">
            <thead>
              <tr>
                <th scope="col">Element / Area</th>
                <th scope="col">Description</th>
                <th scope="col">Alternative / Workaround</th>
              </tr>
            </thead>
            <tbody>
              ${data.knownLimitations
                .map(
                  (lim) => `
                <tr>
                  <td><strong>${escapeHtml(lim.title)}</strong></td>
                  <td>${escapeHtml(lim.description)}</td>
                  <td>${lim.workaround ? escapeHtml(lim.workaround) : '<em>None currently available.</em>'}</td>
                </tr>`,
                )
                .join('\n')}
            </tbody>
          </table>
        </div>`
      : '<p>At the time of this evaluation, no known limitations were documented.</p>';

  const feedback = data.feedbackContact;
  const feedbackHtml = `
    <ul class="contact-list">
      ${feedback.email ? `<li><strong>Email:</strong> <a href="mailto:${escapeHtml(feedback.email)}">${escapeHtml(feedback.email)}</a></li>` : ''}
      ${feedback.phone ? `<li><strong>Phone:</strong> <a href="tel:${escapeHtml(feedback.phone)}">${escapeHtml(feedback.phone)}</a></li>` : ''}
      ${feedback.address ? `<li><strong>Postal Address:</strong> ${escapeHtml(feedback.address)}</li>` : ''}
      ${feedback.responseTime ? `<li><strong>Expected Response Time:</strong> ${escapeHtml(feedback.responseTime)}</li>` : ''}
    </ul>
  `;

  const enforcementHtml =
    data.enforcementProcedure &&
    (data.enforcementProcedure.bodyName || data.enforcementProcedure.contactUrl)
      ? `<section class="statement-section" aria-labelledby="enforcement-heading">
          <h2 id="enforcement-heading">Enforcement Procedure</h2>
          <p>${data.enforcementProcedure.description ? escapeHtml(data.enforcementProcedure.description) : 'If you have contacted us regarding accessibility and are not satisfied with our response, you may reach out to the relevant supervisory authority.'}</p>
          ${data.enforcementProcedure.bodyName ? `<p><strong>Authority:</strong> ${escapeHtml(data.enforcementProcedure.bodyName)}</p>` : ''}
          ${data.enforcementProcedure.contactUrl ? `<p><a href="${escapeHtml(data.enforcementProcedure.contactUrl)}" target="_blank" rel="noopener noreferrer">Contact the enforcement body (opens in new tab)</a></p>` : ''}
        </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Accessibility Statement | ${siteName}</title>
  <style>
    :root {
      --primary: ${primaryColor};
      --text: #1a1a1a;
      --text-muted: #555555;
      --bg: #ffffff;
      --surface: #f9fafb;
      --border: #e5e7eb;
      --focus-ring: #0284c7;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --text: #f3f4f6;
        --text-muted: #9ca3af;
        --bg: #111827;
        --surface: #1f2937;
        --border: #374151;
        --focus-ring: #38bdf8;
      }
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: var(--text);
      background-color: var(--bg);
    }
    .statement-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem;
    }
    header.statement-header {
      border-bottom: 2px solid var(--border);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    h1 {
      font-size: 2rem;
      margin: 0 0 0.5rem 0;
      color: var(--primary);
    }
    .statement-meta {
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    h2 {
      font-size: 1.375rem;
      margin-top: 2rem;
      margin-bottom: 0.75rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.25rem;
    }
    p, ul, ol {
      margin-top: 0;
      margin-bottom: 1rem;
    }
    ul.measures-list, ul.contact-list {
      padding-left: 1.5rem;
    }
    li {
      margin-bottom: 0.375rem;
    }
    a {
      color: var(--primary);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    a:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: 2px;
    }
    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.875rem;
      background-color: var(--surface);
      border: 1px solid var(--border);
      margin-bottom: 0.5rem;
    }
    .limitations-table-wrapper {
      overflow-x: auto;
      margin-bottom: 1.5rem;
    }
    table.limitations-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.9375rem;
    }
    table.limitations-table th, table.limitations-table td {
      border: 1px solid var(--border);
      padding: 0.75rem;
    }
    table.limitations-table th {
      background-color: var(--surface);
      font-weight: 600;
    }
    footer.statement-footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      font-size: 0.8125rem;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <main class="statement-container">
    <header class="statement-header">
      <h1>Accessibility Statement</h1>
      <div class="statement-meta">
        <span>For: <a href="${siteUrl}" target="_blank" rel="noopener noreferrer">${siteName}</a></span> | 
        <span>Organisation: <strong>${orgName}</strong></span> | 
        <span>Last updated: <time datetime="${dateFormatted}">${dateFormatted}</time></span>
      </div>
    </header>

    <section class="statement-section" aria-labelledby="commitment-heading">
      <h2 id="commitment-heading">Commitment to Accessibility</h2>
      <p>
        <strong>${orgName}</strong> is committed to ensuring digital accessibility for people with disabilities.
        We continually improve the user experience for everyone and apply the relevant accessibility standards.
      </p>
      <p>${scope}</p>
    </section>

    <section class="statement-section" aria-labelledby="conformance-heading">
      <h2 id="conformance-heading">Conformance Status</h2>
      <div class="status-badge">${statusLabel} with ${standard}</div>
      <p>${statusDesc}</p>
    </section>

    <section class="statement-section" aria-labelledby="measures-heading">
      <h2 id="measures-heading">Measures to Support Accessibility</h2>
      <p>We take the following measures to ensure accessibility across our site:</p>
      ${measuresHtml}
    </section>

    <section class="statement-section" aria-labelledby="limitations-heading">
      <h2 id="limitations-heading">Known Limitations &amp; Alternatives</h2>
      <p>
        Despite our efforts to ensure accessibility, there may be some limitations.
        Below is a description of known limitations along with potential solutions:
      </p>
      ${limitationsHtml}
    </section>

    <section class="statement-section" aria-labelledby="feedback-heading">
      <h2 id="feedback-heading">Feedback &amp; Contact Information</h2>
      <p>
        We welcome your feedback on the accessibility of this website.
        Please let us know if you encounter accessibility barriers:
      </p>
      ${feedbackHtml}
    </section>

    ${enforcementHtml}

    <footer class="statement-footer">
      <p>
        <em>Disclaimer: This accessibility statement was created using an accessibility evaluation template and does not constitute formal legal advice.</em>
      </p>
    </footer>
  </main>
</body>
</html>`;
}

/**
 * Returns an embeddable HTML snippet for website footers or pages.
 */
export function generateEmbedSnippet(sitePublicId: string, siteName: string): string {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const statementUrl = `${appUrl}/s/${sitePublicId}/accessibility-statement`;
  return `<!-- Accessibility Statement Link -->\n<a href="${statementUrl}" target="_blank" rel="noopener noreferrer" aria-label="Accessibility Statement for ${escapeHtml(siteName)} (opens in a new tab)">Accessibility Statement</a>`;
}

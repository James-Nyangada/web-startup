/**
 * Data Processing Agreement text (P6-09). One source for the /legal/dpa page and the
 * downloadable copy at /legal/dpa/download. Wording is pending legal review (spec 16 #6).
 */

export const DPA_UPDATED = "October 18, 2026";

export interface DpaSection {
  title: string;
  paragraphs?: string[];
  /** `term` is shown in bold before the text. */
  terms?: { term: string; text: string }[];
  bullets?: { term: string; text: string }[];
}

export const DPA_SECTIONS: DpaSection[] = [
  {
    title: "1. Scope and Applicability",
    paragraphs: [
      'This Data Processing Agreement ("DPA") supplements the Plainsight Terms of Service and applies to the extent that Plainsight Ltd. ("Processor") processes Personal Data on behalf of the Customer ("Controller") in the course of providing the Plainsight accessibility monitoring and scan engine services.',
      'This DPA complies with the requirements of Article 28 of Regulation (EU) 2016/679 ("GDPR") and the UK General Data Protection Regulation ("UK GDPR").',
    ],
  },
  {
    title: "2. Processing of Customer Personal Data",
    terms: [
      {
        term: "Subject Matter & Nature",
        text: "Provision of automated website accessibility scanning, regression analysis, reporting, and issue collaboration.",
      },
      {
        term: "Duration",
        text: "For the term of the Customer's subscription, plus up to thirty (30) days after termination for deletion.",
      },
      {
        term: "Categories of Data Subjects",
        text: "Customer employees, contractors, agency clients, and authorized users who access the Plainsight platform.",
      },
      {
        term: "Categories of Personal Data",
        text: "Name, professional email address, organization affiliation, IP address, user account identifiers, and public HTML snippets extracted during automated page scans (with form values, email addresses and phone numbers removed before storage).",
      },
      {
        term: "Instructions",
        text: "Processor shall process Customer Personal Data solely in accordance with documented instructions from Controller, including with respect to transfers of personal data outside the UK or European Economic Area.",
      },
    ],
  },
  {
    title: "3. Technical and Organizational Security Measures (TOMs)",
    paragraphs: [
      "Processor implements and maintains appropriate technical and organizational measures to ensure a level of security appropriate to the risk, including:",
    ],
    bullets: [
      {
        term: "Encryption in Transit",
        text: "All web traffic and API communications are encrypted using modern Transport Layer Security (TLS 1.3/1.2).",
      },
      {
        term: "Encryption at Rest",
        text: "All database storage, object storage, and automated backups are encrypted. Webhook URLs and other secrets are additionally encrypted with AES-256-GCM; API keys are stored only as SHA-256 hashes.",
      },
      {
        term: "Multi-Tenant Isolation",
        text: "Logical separation of data by organization identifier enforced across all database queries and repository layers. Cross-organization access attempts return 404 Not Found to prevent data enumeration.",
      },
      {
        term: "Access Controls",
        text: "Role-based access control, mandatory time-based one-time passwords (TOTP) for administrative personnel, read-only and audited support access, and session revocation controls.",
      },
      { term: "Audit Logging", text: "Append-only audit trail of administrative and security actions." },
    ],
  },
  {
    title: "4. Subprocessors",
    paragraphs: [
      "Controller grants general authorization to Processor to engage the third-party subprocessors listed in our Subprocessors Registry (/legal/subprocessors).",
      "Processor remains fully liable to Controller for the performance of each subprocessor's obligations. Processor shall notify Controller of any intended changes concerning the addition or replacement of subprocessors at least thirty (30) days in advance, providing Controller with the opportunity to object.",
    ],
  },
  {
    title: "5. Data Subject Rights & Breach Notification",
    terms: [
      {
        term: "Assistance with Requests",
        text: "Processor shall provide reasonable assistance to Controller to enable Controller to fulfill its obligations to respond to data subject requests under applicable Data Protection Laws. Users can export their own personal data and delete their accounts from their account settings.",
      },
      {
        term: "Security Incident Notification",
        text: "Processor shall notify Controller in writing without undue delay, and in any event within forty-eight (48) hours, after becoming aware of a confirmed Personal Data Breach affecting Customer Personal Data.",
      },
    ],
  },
  {
    title: "6. Deletion or Return of Personal Data",
    paragraphs: [
      "Upon termination of the Service or deletion of the Customer's organization, Processor shall, at the choice of Controller, return Customer Personal Data (through the available exports) and delete all Customer Personal Data from its systems, including backups on their normal rotation, within thirty (30) days, unless applicable statutory law requires retention of such data.",
    ],
  },
];

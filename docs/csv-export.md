# Issues CSV Export Specification (P2-22)

Plainsight provides on-demand CSV export for accessibility issues at both the API level and user interface. Exports strictly respect the active query filters (status, severity, template, WCAG criteria, assignee, regression status, and keyword search).

## Endpoints

- **API Route:** `GET /v1/orgs/:orgId/sites/:siteId/issues/export.csv` (also accepts `/export`)
- **Permissions:** Organisation Member, Admin, or Owner (`requireOrgRole('member')`)
- **Content-Type:** `text/csv; charset=utf-8`
- **Content-Disposition:** `attachment; filename="issues-<siteSlug>-YYYY-MM-DD.csv"`

## Supported Filter Parameters

The export endpoint accepts all query filters available on the issues list (`GET /v1/orgs/:orgId/sites/:siteId/issues`):

| Parameter | Type | Description |
|---|---|---|
| `status` | string or string[] | Filter by status (`open`, `regressed`, `needsReview`, `fixed`, `ignored`). Comma-separated. |
| `impact` | string or string[] | Filter by impact (`critical`, `serious`, `moderate`, `minor`). Comma-separated. |
| `wcag` | string | Filter by WCAG criterion number (e.g. `1.4.3`, `1.1.1`). |
| `template` | string | Filter by page template key (e.g. `product`, `collection`, `home`, `cart`). |
| `rule` | string | Filter by axe/custom rule ID (e.g. `color-contrast`, `image-alt`). |
| `assignee` | string | Filter by assignee UUID or `me` for the authenticated user. |
| `isRegression` | boolean (`true`/`false`) | Filter for issues flagged as regressions. |
| `needsReview` | boolean (`true`/`false`) | Filter for issues flagged as needing manual review. |
| `q` | string | Keyword search matching rule title, rule ID, template, or selector. |

## Documented Columns

The CSV export contains 20 standardized columns in the following exact order:

1. **Issue ID**: Unique identifier UUID for the issue entity.
2. **Rule ID**: The automated or semi-automated rule identifier (e.g., `color-contrast`, `image-alt`, `link-name`).
3. **Rule Title**: Plain-language human-readable title describing the accessibility defect.
4. **Impact**: Severity level (`critical`, `serious`, `moderate`, `minor`).
5. **WCAG Criteria**: Applicable WCAG 2.1 / 2.2 Success Criterion reference (e.g., `1.4.3 Contrast (Minimum)`).
6. **WCAG Level**: Conformance level (`A`, `AA`, `AAA`).
7. **Template**: Storefront page template where defect was detected (e.g., `product`, `collection`, `cart`, `home`).
8. **Status**: Lifecycle status (`open`, `regressed`, `needsReview`, `fixed`, `ignored`).
9. **Occurrences**: Total count of DOM elements failing this rule on the site.
10. **Is Regression**: `Yes` if this issue was previously marked fixed and reintroduced in a subsequent scan; otherwise `No`.
11. **Needs Review**: `Yes` if this issue requires human verification; otherwise `No`.
12. **Assigned To**: Name or identifier of the team member assigned to resolve this issue, or `Unassigned`.
13. **Due Date**: Target resolution date formatted as `YYYY-MM-DD`, or blank if unset.
14. **Ignored Reason**: Documented justification if ignored (`False positive`, `Not applicable`, `Won't fix`, `Deferred`), or blank.
15. **Ignored Note**: User-provided explanatory note when ignored, or blank.
16. **CSS Selector**: Primary DOM selector where the violation occurs.
17. **HTML Snippet**: Sample element HTML snippet exhibiting the failure.
18. **Failure Summary**: Detailed engine output explaining what went wrong and how to fix it.
19. **First Seen At**: ISO 8601 UTC timestamp when the defect was first recorded.
20. **Last Seen At**: ISO 8601 UTC timestamp of the most recent scan encountering this defect.

## Character Encoding and Spreadsheet Compatibility

To ensure seamless opening in Microsoft Excel (Windows & macOS), Apple Numbers, and Google Sheets without garbled text:

1. **UTF-8 Byte Order Mark (BOM):** Every CSV file begins with the UTF-8 BOM (`\uFEFF`, hexadecimal bytes `EF BB BF`). This instructs Microsoft Excel to open the file in UTF-8 mode instead of defaulting to ANSI / Windows-1252.
2. **RFC 4180 Escaping:**
   - Any field containing commas (`,`), newlines (`\n`, `\r`), or double quotes (`"`) is enclosed in double quotes.
   - Any literal double quote (`"`) within a field is escaped by doubling it (`""`).
   - Line breaks between records follow the canonical CRLF (`\r\n`) format.

export interface ScanFailureHint {
  reason: string;
  whatToDo: string;
}

/**
 * Returns a plain-English explanation of why a scan failed or was partial,
 * along with actionable instructions ("what to do" hint).
 * Satisfies Spec Section 9.3 S-27 / S-28 & Chunk P2-15.
 */
export function getScanFailureHint(
  status: string,
  errorCode?: string | null,
  errorMessage?: string | null,
  pagesFailed = 0,
  pagesPlanned = 0,
): ScanFailureHint | null {
  if (status !== 'partial' && status !== 'failed') {
    return null;
  }

  const code = (errorCode || '').toUpperCase();
  const msg = (errorMessage || '').toLowerCase();

  // 1. Rate limiting / WAF / Cloudflare block
  if (
    code.includes('RATE_LIMIT') ||
    code.includes('429') ||
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('blocked') ||
    msg.includes('cloudflare')
  ) {
    return {
      reason:
        'The server or web application firewall (WAF) rate-limited or blocked automated requests (HTTP 429).',
      whatToDo:
        'Add PlainsightBot to your CDN or firewall allowlist, or lower the scan page limit in site settings.',
    };
  }

  // 2. Timeout
  if (code.includes('TIMEOUT') || msg.includes('timed out') || msg.includes('timeout')) {
    return {
      reason: 'Multiple pages exceeded the 45-second rendering timeout.',
      whatToDo:
        'Check your server response times and verify heavy scripts or third-party widgets are not hanging page completion.',
    };
  }

  // 3. SSRF / Private network guard
  if (
    code.includes('SSRF') ||
    code.includes('PRIVATE_IP') ||
    msg.includes('private') ||
    msg.includes('loopback')
  ) {
    return {
      reason: 'Target URL resolved to a private or link-local address blocked by security guards.',
      whatToDo:
        'Ensure the root URL resolves to a public, routable IP address and check DNS configuration.',
    };
  }

  // 4. HTTP Auth / Forbidden
  if (
    code.includes('AUTH') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('forbidden') ||
    msg.includes('unauthorized')
  ) {
    return {
      reason: 'The server required authentication or denied access with HTTP 401/403.',
      whatToDo:
        'Ensure staging password protection or IP access restrictions allow automated testing, or verify public accessibility.',
    };
  }

  // 5. DNS failure
  if (
    code.includes('DNS') ||
    msg.includes('enotfound') ||
    msg.includes('getaddrinfo') ||
    msg.includes('dns')
  ) {
    return {
      reason: 'DNS lookup failed for the hostname.',
      whatToDo:
        'Confirm the domain name is active, registered, and public DNS records (A/AAAA) have propagated.',
    };
  }

  // 6. Partial scan (more than 50% failed)
  if (status === 'partial') {
    const failedText =
      pagesPlanned > 0
        ? `${pagesFailed} of ${pagesPlanned} planned pages could not be scanned.`
        : 'More than 50% of planned pages failed to scan.';
    return {
      reason: `Scan completed partially: ${failedText}`,
      whatToDo:
        'Partial scans never mark issues as fixed to prevent false positives. Review the failed pages below and re-run once the site is responsive.',
    };
  }

  // 7. General failed
  return {
    reason:
      errorMessage || 'The scan encountered unrecoverable errors while loading or testing pages.',
    whatToDo:
      'Verify that the website is online and responsive, check robots.txt permissions for PlainsightBot, and retry the scan.',
  };
}

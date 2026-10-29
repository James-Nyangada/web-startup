/**
 * Validates the `return_url` of a platform connect handshake (WordPress plugin, Shopify app).
 * The connect code is only ever sent to a URL that belongs to the site being connected.
 */
export function validateReturnUrl(
  returnUrlStr: string,
  siteUrlStr: string,
  platform: string,
): { valid: boolean; reason?: string } {
  if (!returnUrlStr) {
    return { valid: true };
  }
  try {
    const returnUrl = new URL(returnUrlStr);
    if (returnUrl.protocol !== "http:" && returnUrl.protocol !== "https:") {
      return { valid: false, reason: "Invalid return URL protocol. Must use http or https." };
    }

    if (platform === "shopify") {
      const host = returnUrl.hostname.toLowerCase();
      let siteHost = "";
      try {
        if (siteUrlStr) siteHost = new URL(siteUrlStr).hostname.toLowerCase();
      } catch {
        // ignore
      }
      const appHosts = (process.env.NEXT_PUBLIC_SHOPIFY_APP_HOSTS || "")
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);
      const isShopifyHost =
        appHosts.includes(host) ||
        host === "admin.shopify.com" ||
        host.endsWith(".myshopify.com") ||
        (siteHost ? host === siteHost : false);
      if (!isShopifyHost) {
        return {
          valid: false,
          reason: "Return URL must point to the EveryVisitor Shopify app, admin.shopify.com or a .myshopify.com domain.",
        };
      }
      return { valid: true };
    }

    // WordPress
    if (!siteUrlStr) {
      return { valid: false, reason: "Site URL is required to validate the return URL." };
    }
    const siteUrl = new URL(siteUrlStr);
    if (returnUrl.origin.toLowerCase() !== siteUrl.origin.toLowerCase()) {
      return {
        valid: false,
        reason: `Return URL origin (${returnUrl.origin}) does not match the site URL origin (${siteUrl.origin}).`,
      };
    }
    if (!returnUrl.pathname.toLowerCase().includes("/wp-admin/")) {
      return {
        valid: false,
        reason: "WordPress return URL must be a WordPress administration page (/wp-admin/).",
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Malformed return URL or site URL." };
  }
}

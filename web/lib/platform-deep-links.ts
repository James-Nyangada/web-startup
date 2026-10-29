/**
 * Platform deep links for Shopify and WordPress (Chunk P7-03).
 *
 * Jumps site owners directly into the theme code editor, template customizer,
 * or block editor where the fix belongs, saving time hunting through files.
 */

export interface PlatformDeepLinkInfo {
  platform: 'shopify' | 'wordpress' | 'generic';
  label: string;
  editorUrl?: string;
  codeEditorUrl?: string;
  likelyFile?: string;
  description?: string;
}

const SHOPIFY_TEMPLATE_MAP: Record<string, { file: string; template: string }> = {
  header: { file: 'sections/header.liquid', template: 'index' },
  footer: { file: 'sections/footer.liquid', template: 'index' },
  product: { file: 'sections/main-product.liquid', template: 'product' },
  collection: { file: 'sections/main-collection-product-grid.liquid', template: 'collection' },
  cart: { file: 'sections/main-cart-items.liquid', template: 'cart' },
  blog: { file: 'sections/main-blog.liquid', template: 'blog' },
  article: { file: 'sections/main-article.liquid', template: 'article' },
  search: { file: 'sections/main-search.liquid', template: 'search' },
  page: { file: 'sections/main-page.liquid', template: 'page' },
  404: { file: 'sections/main-404.liquid', template: '404' },
};

const WP_TEMPLATE_MAP: Record<string, string> = {
  header: 'header',
  footer: 'footer',
  single: 'single',
  page: 'page',
  archive: 'archive',
  index: 'index',
  404: '404',
};

function normalizeOrigin(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getPlatformDeepLinks(params: {
  platform?: string;
  rootUrl?: string;
  template?: string;
}): PlatformDeepLinkInfo | null {
  const { platform, rootUrl, template } = params;
  const pf = (platform || '').toLowerCase().trim();
  const origin = normalizeOrigin(rootUrl);

  const cleanTemplate = (template || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Shopify
  if (pf.includes('shopify') || (origin && origin.includes('myshopify.com'))) {
    const base = origin || 'https://admin.shopify.com';
    let matched = SHOPIFY_TEMPLATE_MAP[cleanTemplate];
    if (!matched) {
      for (const [key, val] of Object.entries(SHOPIFY_TEMPLATE_MAP)) {
        if (cleanTemplate.includes(key)) {
          matched = val;
          break;
        }
      }
    }

    const likelyFile = matched ? matched.file : 'layout/theme.liquid';
    const templateParam = matched ? `?template=${encodeURIComponent(matched.template)}` : '';

    return {
      platform: 'shopify',
      label: 'Open in Shopify',
      editorUrl: `${base}/admin/themes/current/editor${templateParam}`,
      codeEditorUrl: `${base}/admin/themes/current?key=${encodeURIComponent(likelyFile)}`,
      likelyFile,
      description: matched
        ? `Edit ${likelyFile} in Shopify theme editor`
        : 'Edit theme files in Shopify Admin',
    };
  }

  // 2. WordPress / WooCommerce
  if (pf.includes('wordpress') || pf.includes('woocommerce')) {
    const base = origin || '';
    if (!base) return null;

    let matchedTemplate = WP_TEMPLATE_MAP[cleanTemplate];
    if (!matchedTemplate) {
      for (const [key, val] of Object.entries(WP_TEMPLATE_MAP)) {
        if (cleanTemplate.includes(key)) {
          matchedTemplate = val;
          break;
        }
      }
    }

    const siteEditorUrl = matchedTemplate
      ? `${base}/wp-admin/site-editor.php?path=%2Ftemplates%2F${encodeURIComponent(matchedTemplate)}`
      : `${base}/wp-admin/site-editor.php`;

    return {
      platform: 'wordpress',
      label: 'Open in WordPress',
      editorUrl: siteEditorUrl,
      codeEditorUrl: `${base}/wp-admin/theme-editor.php`,
      likelyFile: matchedTemplate ? `templates/${matchedTemplate}.html` : 'Theme Editor',
      description: matchedTemplate
        ? `Edit ${matchedTemplate} template in WordPress Site Editor`
        : 'Edit templates in WordPress Admin',
    };
  }

  return null;
}

/**
 * Shopify theme deep links for the embedded dashboard (P7-03). Mirrors the backend helper in
 * backend/src/shared/platform-deep-links.ts: maps an issue's template to the Liquid file that
 * most likely holds the fix, and links to the theme customizer and code editor.
 */
const TEMPLATE_MAP: Record<string, { file: string; template: string }> = {
  header: { file: 'sections/header.liquid', template: 'index' },
  footer: { file: 'sections/footer.liquid', template: 'index' },
  product: { file: 'sections/main-product.liquid', template: 'product' },
  collection: { file: 'sections/main-collection-product-grid.liquid', template: 'collection' },
  cart: { file: 'sections/main-cart-items.liquid', template: 'cart' },
  blog: { file: 'sections/main-blog.liquid', template: 'blog' },
  article: { file: 'sections/main-article.liquid', template: 'article' },
  search: { file: 'sections/main-search.liquid', template: 'search' },
  page: { file: 'sections/main-page.liquid', template: 'page' },
  '404': { file: 'sections/main-404.liquid', template: '404' },
};

export interface ShopifyThemeLinks {
  likelyFile: string;
  editorUrl: string;
  codeEditorUrl: string;
}

export function shopifyThemeLinks(shop: string, templateKey?: string | null): ShopifyThemeLinks {
  const store = shop.replace('.myshopify.com', '');
  const base = `https://admin.shopify.com/store/${store}`;
  const clean = (templateKey ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const matched =
    TEMPLATE_MAP[clean] ?? Object.entries(TEMPLATE_MAP).find(([key]) => clean.includes(key))?.[1];
  const likelyFile = matched?.file ?? 'layout/theme.liquid';
  return {
    likelyFile,
    editorUrl: `${base}/themes/current/editor${matched ? `?template=${encodeURIComponent(matched.template)}` : ''}`,
    codeEditorUrl: `${base}/themes/current?key=${encodeURIComponent(likelyFile)}`,
  };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

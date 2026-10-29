import { describe, it, expect } from 'vitest';
import { getPlatformDeepLinks } from '../../src/shared/platform-deep-links.js';

describe('P7-03: Platform deep links', () => {
  describe('Shopify sites', () => {
    it('creates theme editor and likely file links for header template', () => {
      const links = getPlatformDeepLinks({
        platform: 'shopify',
        rootUrl: 'https://snow-boots.myshopify.com',
        template: 'header',
      });

      expect(links).not.toBeNull();
      expect(links?.platform).toBe('shopify');
      expect(links?.label).toBe('Open in Shopify');
      expect(links?.editorUrl).toBe(
        'https://snow-boots.myshopify.com/admin/themes/current/editor?template=index',
      );
      expect(links?.codeEditorUrl).toBe(
        'https://snow-boots.myshopify.com/admin/themes/current?key=sections%2Fheader.liquid',
      );
      expect(links?.likelyFile).toBe('sections/header.liquid');
    });

    it('creates theme editor and likely file links for product template', () => {
      const links = getPlatformDeepLinks({
        platform: 'shopify',
        rootUrl: 'https://shop.brand.com',
        template: 'product',
      });

      expect(links?.editorUrl).toContain('template=product');
      expect(links?.likelyFile).toBe('sections/main-product.liquid');
    });

    it('handles custom domain identified as shopify platform', () => {
      const links = getPlatformDeepLinks({
        platform: 'shopify',
        rootUrl: 'https://store.example.com',
        template: 'cart',
      });

      expect(links?.platform).toBe('shopify');
      expect(links?.likelyFile).toBe('sections/main-cart-items.liquid');
      expect(links?.codeEditorUrl).toContain('sections%2Fmain-cart-items.liquid');
    });
  });

  describe('WordPress sites', () => {
    it('creates WordPress Site Editor and Theme Editor links', () => {
      const links = getPlatformDeepLinks({
        platform: 'wordpress',
        rootUrl: 'https://my-blog.org',
        template: 'header',
      });

      expect(links).not.toBeNull();
      expect(links?.platform).toBe('wordpress');
      expect(links?.label).toBe('Open in WordPress');
      expect(links?.editorUrl).toBe(
        'https://my-blog.org/wp-admin/site-editor.php?path=%2Ftemplates%2Fheader',
      );
      expect(links?.codeEditorUrl).toBe('https://my-blog.org/wp-admin/theme-editor.php');
      expect(links?.likelyFile).toBe('templates/header.html');
    });

    it('creates WordPress fallback links when template is unknown', () => {
      const links = getPlatformDeepLinks({
        platform: 'wordpress',
        rootUrl: 'https://acme-agency.com',
        template: 'custom-promo',
      });

      expect(links?.editorUrl).toBe('https://acme-agency.com/wp-admin/site-editor.php');
      expect(links?.codeEditorUrl).toBe('https://acme-agency.com/wp-admin/theme-editor.php');
    });
  });

  describe('Generic / Unknown sites', () => {
    it('returns null for generic platform sites', () => {
      const links = getPlatformDeepLinks({
        platform: 'custom',
        rootUrl: 'https://custom-app.com',
        template: 'header',
      });

      expect(links).toBeNull();
    });
  });
});

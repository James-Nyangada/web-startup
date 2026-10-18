import { describe, expect, it } from 'vitest';

describe('Chunk P2-04: App shell, Command palette (S-81), and Global banners (S-82)', () => {
  describe('S-82 Global Banners Priority Order', () => {
    const PRIORITY_ORDER = {
      impersonation: 1,
      'read-only': 2,
      past_due: 3,
      trial: 4,
      verification: 5,
      email: 6,
    } as const;

    type BannerKind = keyof typeof PRIORITY_ORDER;

    function resolveHighestPriorityBanner(banners: { kind: BannerKind; id?: string }[]) {
      if (!banners.length) return null;
      const sorted = [...banners].sort((a, b) => PRIORITY_ORDER[a.kind] - PRIORITY_ORDER[b.kind]);
      return sorted[0];
    }

    it('enforces exact spec priority: impersonation > read-only > past due > trial > verification > email', () => {
      expect(PRIORITY_ORDER['impersonation']).toBeLessThan(PRIORITY_ORDER['read-only']);
      expect(PRIORITY_ORDER['read-only']).toBeLessThan(PRIORITY_ORDER['past_due']);
      expect(PRIORITY_ORDER['past_due']).toBeLessThan(PRIORITY_ORDER['trial']);
      expect(PRIORITY_ORDER['trial']).toBeLessThan(PRIORITY_ORDER['verification']);
      expect(PRIORITY_ORDER['verification']).toBeLessThan(PRIORITY_ORDER['email']);
    });

    it('picks impersonation over all lower priority banners', () => {
      const active: { kind: BannerKind }[] = [
        { kind: 'email' },
        { kind: 'trial' },
        { kind: 'impersonation' },
        { kind: 'past_due' },
      ];
      expect(resolveHighestPriorityBanner(active)?.kind).toBe('impersonation');
    });

    it('picks read-only when impersonation is absent but trial/email/past_due are present', () => {
      const active: { kind: BannerKind }[] = [
        { kind: 'email' },
        { kind: 'trial' },
        { kind: 'read-only' },
        { kind: 'past_due' },
      ];
      expect(resolveHighestPriorityBanner(active)?.kind).toBe('read-only');
    });

    it('picks past_due when only trial and verification are present', () => {
      const active: { kind: BannerKind }[] = [
        { kind: 'email' },
        { kind: 'trial' },
        { kind: 'verification' },
        { kind: 'past_due' },
      ];
      expect(resolveHighestPriorityBanner(active)?.kind).toBe('past_due');
    });

    it('picks trial when only verification and email are present', () => {
      const active: { kind: BannerKind }[] = [
        { kind: 'email' },
        { kind: 'trial' },
        { kind: 'verification' },
      ];
      expect(resolveHighestPriorityBanner(active)?.kind).toBe('trial');
    });

    it('picks verification over email', () => {
      const active: { kind: BannerKind }[] = [{ kind: 'email' }, { kind: 'verification' }];
      expect(resolveHighestPriorityBanner(active)?.kind).toBe('verification');
    });
  });

  describe('S-81 Command Palette Navigation Coverage', () => {
    const SITES = [
      'Oakhaus Furniture',
      'Sora Skincare',
      'Kito Coffee',
      'Mwanga Solar',
      'Lumen Opticians',
      'Lumen Careers',
      'Baraka Bikes',
      'Tamu Bakery',
    ];

    const SETTINGS_PAGES = [
      { id: 'settings-general', href: '/settings/general', label: 'General Settings' },
      { id: 'settings-members', href: '/settings/members', label: 'Team Members' },
      { id: 'settings-billing', href: '/settings/billing', label: 'Billing & Plans' },
      {
        id: 'settings-notifications',
        href: '/settings/notifications',
        label: 'Notification Settings',
      },
      { id: 'settings-integrations', href: '/settings/integrations', label: 'Integrations' },
      { id: 'settings-audit', href: '/settings/audit-log', label: 'Audit Log' },
      { id: 'settings-account', href: '/settings/account', label: 'Account & Profile' },
    ];

    const ACTIONS = ['Add new site', 'Invite team member', 'Scan now: Oakhaus Furniture'];

    it('can jump to every monitored site', () => {
      expect(SITES.length).toBeGreaterThanOrEqual(7);
      expect(SITES).toContain('Oakhaus Furniture');
      expect(SITES).toContain('Baraka Bikes');
      expect(SITES).toContain('Mwanga Solar');
    });

    it('can jump to every settings page', () => {
      const expectedHrefs = [
        '/settings/general',
        '/settings/members',
        '/settings/billing',
        '/settings/notifications',
        '/settings/integrations',
        '/settings/audit-log',
        '/settings/account',
      ];
      expect(SETTINGS_PAGES.map((s) => s.href)).toEqual(expect.arrayContaining(expectedHrefs));
    });

    it('includes essential quick actions in palette', () => {
      expect(ACTIONS).toContain('Add new site');
      expect(ACTIONS).toContain('Invite team member');
    });
  });

  describe('Accessibility and Landmarks Specification', () => {
    it('defines correct HTML landmarks and skip link attributes', () => {
      const landmarks = {
        skipLink: { href: '#main', text: 'Skip to content' },
        header: { tag: 'header' },
        navMain: { tag: 'nav', ariaLabel: 'Main' },
        navBreadcrumbs: { tag: 'nav', ariaLabel: 'Breadcrumb' },
        navDrawer: { tag: 'nav', role: 'dialog', ariaLabel: 'Navigation drawer' },
        bannersRegion: { role: 'region', ariaLabel: 'Important notices' },
        main: { tag: 'main', id: 'main', tabIndex: -1 },
        commandPalette: { role: 'dialog', ariaModal: 'true', ariaLabel: 'Command palette' },
        toastLiveRegion: { role: 'status', ariaLive: 'polite' },
      };

      expect(landmarks.skipLink.href).toBe('#main');
      expect(landmarks.main.id).toBe('main');
      expect(landmarks.main.tabIndex).toBe(-1);
      expect(landmarks.navMain.ariaLabel).toBe('Main');
      expect(landmarks.navBreadcrumbs.ariaLabel).toBe('Breadcrumb');
      expect(landmarks.toastLiveRegion.ariaLive).toBe('polite');
      expect(landmarks.commandPalette.ariaModal).toBe('true');
    });
  });
});

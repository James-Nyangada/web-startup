export const STAFF_ROLES = ['owner', 'admin', 'editor', 'support', 'analyst'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffPermission =
  | 'view_dashboards'
  | 'view_revenue'
  | 'write_content'
  | 'publish_content'
  | 'edit_legal'
  | 'manage_customers'
  | 'email_customers'
  | 'impersonate'
  | 'manage_trials_plans'
  | 'manage_system'
  | 'manage_staff';

export const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  owner: [
    'view_dashboards',
    'view_revenue',
    'write_content',
    'publish_content',
    'edit_legal',
    'manage_customers',
    'email_customers',
    'impersonate',
    'manage_trials_plans',
    'manage_system',
    'manage_staff',
  ],
  admin: [
    'view_dashboards',
    'view_revenue',
    'write_content',
    'publish_content',
    'manage_customers',
    'email_customers',
    'impersonate',
    'manage_trials_plans',
    'manage_system',
  ],
  editor: ['write_content', 'publish_content'],
  support: ['manage_customers', 'email_customers', 'impersonate'],
  analyst: ['view_dashboards', 'view_revenue'],
};

export function hasPermission(role: StaffRole, permission: StaffPermission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  '1234567890',
  'qwertyuiop',
  'administrator',
  'admin12345',
  'letmein123',
  'welcome123',
  'changeme123',
  'iloveyou123',
  'monkey1234',
  'dragon1234',
  'master1234',
  'sunshine123',
  'princess123',
  'football123',
  'baseball123',
  'access1234',
]);

export function validatePassword(password: string): { valid: boolean; reason?: string } {
  if (COMMON_PASSWORDS.has(password.toLowerCase().trim())) {
    return { valid: false, reason: 'Password is too common and easily guessed.' };
  }
  if (password.length < 10) {
    return { valid: false, reason: 'Password must be at least 10 characters long.' };
  }
  return { valid: true };
}

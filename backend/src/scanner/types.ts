export const PLATFORMS = [
  'shopify',
  'wordpress',
  'woocommerce',
  'webflow',
  'wix',
  'squarespace',
  'custom',
  'unknown',
] as const;

export type Platform = (typeof PLATFORMS)[number];

/** Minimal logger the scanner accepts, so it stays independent of the API's pino setup. */
export interface ScanLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
}

export const silentLogger: ScanLogger = { debug: () => {}, warn: () => {} };

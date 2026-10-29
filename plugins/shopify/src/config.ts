/**
 * Shopify App Configuration
 */

export interface AppConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string[];
  host: string;
  port: number;
  everyvisitorApiUrl: string;
  everyvisitorApiKey?: string;
  appUrl: string;
}

export function loadConfig(): AppConfig {
  return {
    apiKey: process.env.SHOPIFY_API_KEY || 'test_shopify_api_key',
    apiSecret: process.env.SHOPIFY_API_SECRET || 'test_shopify_api_secret',
    scopes: (process.env.SCOPES || 'read_themes').split(',').map((s) => s.trim()),
    host: process.env.HOST || 'http://localhost:3001',
    port: Number(process.env.PORT) || 3001,
    everyvisitorApiUrl: process.env.EVERYVISITOR_API_URL || 'https://api.everyvisitor.app',
    everyvisitorApiKey: process.env.EVERYVISITOR_API_KEY,
    appUrl: process.env.EVERYVISITOR_APP_URL || 'https://everyvisitor.app',
  };
}

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A small Shopify-like store with known accessibility problems (P1-12). Element
 * IDs and CSS-in-JS class names are random on every request, so fingerprints
 * must not depend on them (P1-09).
 *
 * Known problems:
 *   home              image without alt (logo)
 *   products/*        icon-only "add to cart" button without a name (6 pages, 1 issue)
 *   collections/all   low-contrast text
 *   pages/contact     unlabeled inputs, one with a value + email + phone in its HTML
 *   blogs/news/*      no lang on <html>, empty link
 *   cart              clean page
 */

const PRODUCTS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];

const random = () => Math.floor(100_000 + Math.random() * 900_000);
const hash = () => Math.random().toString(36).slice(2, 9).padEnd(7, 'x');

function layout(title: string, body: string, { lang = true } = {}): string {
  return `<!doctype html>
<html${lang ? ' lang="en"' : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} – Fixture Store</title>
  <script>window.Shopify = window.Shopify || {}; Shopify.theme = { name: "Fixture" };</script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; color: #1a1a1a; background: #fff; }
    header, main, footer { padding: 16px; }
    .faint { color: #b8b8b8; }
    .icon { width: 24px; height: 24px; display: inline-block; background: #333; }
  </style>
</head>
<body>
  <header>
    <a href="/" id="logo-link-${random()}"><img src="/logo.png" width="120" height="40" class="css-${hash()}"></a>
    <nav aria-label="Main">
      <ul>
        <li><a href="/collections/all">Shop</a></li>
        <li><a href="/pages/contact">Contact</a></li>
        <li><a href="/blogs/news">News</a></li>
        <li><a href="/cart">Cart</a></li>
      </ul>
    </nav>
  </header>
  <main id="main">${body}</main>
  <footer><p>© Fixture Store</p></footer>
</body>
</html>`;
}

const pages: Record<string, () => { body: string; status?: number; type?: string }> = {
  '/': () => ({
    body: layout(
      'Home',
      `<h1>Welcome</h1><p>Everything for testing.</p><p><a href="/collections/all">Browse the shop</a></p>`,
    ),
  }),
  '/collections/all': () => ({
    body: layout(
      'All products',
      `<h1>All products</h1>
       <p class="faint">Free shipping on orders over $50.</p>
       <ul>${PRODUCTS.map((p) => `<li><a href="/products/${p}">${p}</a></li>`).join('')}</ul>`,
    ),
  }),
  ...Object.fromEntries(
    PRODUCTS.map((product) => [
      `/products/${product}`,
      () => ({
        body: layout(
          product,
          `<h1>${product}</h1>
           <img src="/img/${product}.jpg" alt="${product} product photo" width="300" height="300">
           <p>Price: $19</p>
           <div class="product-form">
             <button type="button" id="add-${random()}" class="css-${hash()} add-to-cart"><span class="icon"></span></button>
           </div>`,
        ),
      }),
    ]),
  ),
  '/pages/contact': () => ({
    body: layout(
      'Contact',
      `<h1>Contact us</h1>
       <p>Call 555 123 4567 or write to hello@fixture.test.</p>
       <form action="/contact" method="post">
         <input type="text" name="name" placeholder="Your name">
         <input type="email" name="email" value="visitor@example.com" data-hint="call +1 (555) 987-6543">
         <button type="submit">Send</button>
       </form>`,
    ),
  }),
  '/blogs/news': () => ({
    body: layout(
      'News',
      `<h1>News</h1><ul><li><a href="/blogs/news/hello">Hello</a></li><li><a href="/blogs/news/second">Second</a></li></ul>`,
    ),
  }),
  '/blogs/news/hello': () => ({
    body: layout(
      'Hello',
      `<h1>Hello</h1><p>First post.</p><a href="/blogs/news"><span></span></a>`,
      { lang: false },
    ),
  }),
  '/blogs/news/second': () => ({
    body: layout(
      'Second',
      `<h1>Second</h1><p>Another post.</p><a href="/blogs/news"><span></span></a>`,
      { lang: false },
    ),
  }),
  '/cart': () => ({
    body: layout(
      'Cart',
      `<h1>Your cart</h1><p>Your cart is empty.</p><p><a href="/collections/all">Continue shopping</a></p>`,
    ),
  }),
  '/robots.txt': () => ({
    type: 'text/plain',
    body: 'User-agent: *\nDisallow: /private-area\nSitemap: {{base}}/sitemap.xml\n',
  }),
  '/sitemap.xml': () => ({
    type: 'application/xml',
    body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[
      '/',
      '/collections/all',
      ...PRODUCTS.map((p) => `/products/${p}`),
      '/pages/contact',
      '/blogs/news',
      '/blogs/news/hello',
      '/blogs/news/second',
      '/cart',
      '/private-area/secret',
    ]
      .map((path) => `<url><loc>{{base}}${path}</loc></url>`)
      .join('')}</urlset>`,
  }),
};

export interface FixtureSite {
  port: number;
  close(): Promise<void>;
}

/**
 * Starts the fixture store on 127.0.0.1. `hostForLinks` is the base URL
 * written into robots.txt and the sitemap (the scanner reaches it through a
 * test guard policy that maps a fake hostname to 127.0.0.1).
 */
export async function startFixtureSite(
  options: { port?: number; hostForLinks?: (port: number) => string } = {},
): Promise<FixtureSite> {
  let base = '';
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    if (path === '/slow') return; // never answers: used for timeout tests
    if (path === '/logo.png' || path.startsWith('/img/')) {
      res.writeHead(200, { 'content-type': 'image/png' }).end();
      return;
    }
    const page = pages[path];
    if (!page) {
      res
        .writeHead(404, { 'content-type': 'text/html' })
        .end('<!doctype html><html lang="en"><title>Not found</title><h1>Not found</h1></html>');
      return;
    }
    const { body, status = 200, type = 'text/html; charset=utf-8' } = page();
    res.writeHead(status, { 'content-type': type }).end(body.replaceAll('{{base}}', base));
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  base = options.hostForLinks ? options.hostForLinks(port) : `http://127.0.0.1:${port}`;
  return { port, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

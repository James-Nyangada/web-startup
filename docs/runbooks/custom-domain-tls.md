# Runbook: Custom portal domains and TLS

Agency Pro orgs can serve their client portal from their own domain (P6-07).

## How it works

1. The owner sets a domain in Settings → Branding. The API returns two DNS records:
   `CNAME <domain> → CUSTOM_DOMAIN_TARGET` and `TXT _plainsight-verify.<domain> = plainsight-verify=<token>`.
2. **Check DNS records** calls `POST /v1/orgs/:org/branding/custom-domain/verify`, which needs both
   records. A flattened CNAME (Cloudflare proxy) passes if the domain resolves to exactly the
   target's addresses.
3. On the first HTTPS request for the domain, Caddy's on-demand TLS calls
   `GET /internal/tls-allowed?domain=<domain>`. It answers 200 only for verified domains of
   live orgs, so no certificate is ever issued for anything else.
4. With `CUSTOM_DOMAINS_ENABLED=true` (and every host of ours listed in `NEXT_PUBLIC_APP_URL`,
   `NEXT_PUBLIC_SITE_URL` or `APP_HOSTS`), the web `proxy.ts` sends unknown hosts to the portal
   pages only. Caddy also proxies `/v1/*`
   on the custom domain to the api, so sign-in cookies are first-party for that domain.

Reference Caddy config: `docs/infra/Caddyfile.example`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Owner's verify keeps failing | `dig CNAME <domain>` and `dig TXT _plainsight-verify.<domain>`. The error message says which is missing |
| Browser shows a certificate error | `curl -i "http://api:4000/internal/tls-allowed?domain=<domain>"` from the Caddy host must be 200; Caddy logs show the ask result |
| Certificate issued but portal 404s | `APP_HOSTS` in web env must not include the custom domain; check `proxy.ts` sees the right `Host` header |
| Client cannot sign in on the custom domain | Caddy must proxy `/v1/*` on that site to the api; Better Auth trusts verified domains automatically |
| Rate limited by Let's Encrypt | Caddy's `on_demand_tls` `interval`/`burst` limits; the ask endpoint stops abuse from unverified domains |

## Removing a domain

Owners remove it in Branding. The ask endpoint then returns 404, so Caddy will not renew; the
existing certificate simply expires.

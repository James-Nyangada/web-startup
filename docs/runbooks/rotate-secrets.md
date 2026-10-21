# Runbook: Rotate secrets

**When:** a secret may have leaked (committed, pasted, laptop lost, ex-staff), a provider asks,
or yearly as routine. Secret scanning runs on every PR (`.github/workflows/security.yml`).

Secrets live only in the server's environment files and the password manager. Never in git.

| Secret | Effect of rotating | How |
| --- | --- | --- |
| `AUTH_SECRET` | Signs everyone out | Generate 32+ random bytes (`openssl rand -base64 48`), set, restart api |
| `ENCRYPTION_KEY` | **Stored webhook URLs and signing secrets become unreadable** | See below: re-encrypt first |
| `DATABASE_URL` password | Brief outage while services restart | Change the role password in Postgres/Supabase, update env, restart api + worker |
| `PADDLE_API_KEY` | None if done in order | Create new key in Paddle, deploy, then revoke the old one |
| `PADDLE_WEBHOOK_SECRET` | Webhooks fail until both sides match | Rotate in Paddle notification settings, deploy immediately, then replay any failed events |
| `R2_*` | None if done in order | Create new token in Cloudflare, deploy, revoke old |
| `RESEND_API_KEY` | Emails queue and retry | Create new key, deploy, revoke old |
| `GEMINI_API_KEY` | AI suggestions fail until deployed | Create new key, deploy, revoke old |
| `TURNSTILE_SECRET_KEY` | Free checks and sign-ups fail until deployed | Rotate in Cloudflare, deploy |
| Customer API keys (`psk_…`) | That integration stops | The org owner revokes it in Settings → API keys; staff can tell them which prefix leaked |
| Staff TOTP | Staff member must re-enrol | `update users set totp_secret_encrypted = null, totp_enabled_at = null where email = '…';` then they enrol again at /staff |

## Rotating `ENCRYPTION_KEY`

Webhook URLs and signing secrets are AES-256-GCM encrypted with this key (`backend/src/lib/encryption.ts`).
There is no automatic re-encryption yet, so rotation means:

1. Export the decrypted values with the **old** key from a one-off script run in the api container
   (`decrypt()` each `webhooks.url_encrypted` and `webhooks.secret`).
2. Set the new key, then re-encrypt and update each row with `encrypt()`.
3. Restart api and worker, then send a test event from Settings → Integrations for a few orgs.

If the old key is truly compromised and the values cannot be trusted, instead disable all
webhooks and ask owners to re-enter them.

## After any rotation

- Record it in the audit section below (date, secret, reason, by whom).
- Check Sentry for a spike of errors in the 30 minutes after deploy.

| Date | Secret | Reason | By |
| --- | --- | --- | --- |
| | | | |

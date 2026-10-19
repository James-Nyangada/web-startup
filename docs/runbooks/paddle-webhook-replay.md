# Runbook: Paddle Webhook Replay

**Purpose:** Document procedures for staff and operations engineers to inspect, troubleshoot, and replay Paddle Billing webhook events when network drops, transient database errors, or out-of-order deliveries occur.

---

## 1. Architecture Overview

Plainsight processes Paddle Billing (v2) webhooks via the following sequence:

1. **Receipt & Authentication (`POST /webhooks/paddle` / `POST /v1/webhooks/paddle`)**:
   - Computes HMAC-SHA256 signature using `PADDLE_WEBHOOK_SECRET` over `rawBody`.
   - Validates timestamp header `ts` (rejects requests older than 300 seconds / 5 minutes).
2. **Idempotent Record (`paddle_events` table)**:
   - Primary key is `event_id` (e.g., `evt_01h...`).
   - If `event_id` already exists, returns HTTP 200 immediately (no duplicate execution).
3. **Execution (`processPaddleEvent`)**:
   - Resolves target organisation via `custom_data.orgId` or `customer_id`.
   - Out-of-order check: `subscription.updated` events are checked against the stored subscription's `updated_at`. If older, the event is safely ignored.
   - Updates `subscriptions`, `organizations` (`plan`, `billing_status`), and `invoices` tables.
   - Records an append-only audit trail in `audit_log` (`action: 'plan_changed'`).
   - Updates `paddle_events.processed_at` and `paddle_events.error`.

---

## 2. Replay Safety & Idempotency Guarantees

Replaying Paddle events is **100% idempotent and safe**:

- **No Double Billing / Duplicate Invoices:** `invoices.paddle_transaction_id` is unique and upserted.
- **No Inconsistent Subscriptions:** `subscriptions.paddle_subscription_id` is unique and upserted.
- **Audit Logging:** Every plan activation or change logs `isReplay: true` so the operator action is fully traceable.

---

## 3. Replay CLI Commands

The backend includes a dedicated staff CLI tool for replaying events:

```bash
# In the backend directory:
cd backend
```

### 3.1 List Recent Webhook Events
Inspect the last 20 events received by the platform, showing their status and any error messages:

```bash
npm run paddle:replay -- --list
```

### 3.2 Replay a Specific Event by ID
When an alert fires or a customer reports that their plan has not updated after checkout:

```bash
npm run paddle:replay <eventId>
# Example:
npm run paddle:replay evt_01j7m9k2a4...
```

### 3.3 Replay All Failed Events
Re-run all events currently flagged with errors in the `paddle_events` table:

```bash
npm run paddle:replay -- --failed
```

### 3.4 Replay from a Local Payload File
Useful for manual testing, sandbox investigations, or when reproducing a customer's specific webhook payload from Paddle dashboard:

```bash
npm run paddle:replay -- --file /path/to/payload.json
```

---

## 4. Verification Steps

After executing a replay:

1. **Verify event status in database:**
   ```sql
   SELECT event_id, event_type, received_at, processed_at, error 
   FROM paddle_events 
   WHERE event_id = 'evt_01j7m9k2a4...';
   ```
   Ensure `error` is `NULL` and `processed_at` is set.

2. **Verify organisation plan & status:**
   ```sql
   SELECT id, slug, plan, billing_status, paddle_customer_id 
   FROM organizations 
   WHERE id = '<targetOrgId>';
   ```
   Confirm `billing_status = 'active'` and `plan` matches the purchased tier (`store`, `growth`, `agency`, `agency_pro`).

3. **Verify audit log trail:**
   ```sql
   SELECT id, action, actor_type, created_at, data 
   FROM audit_log 
   WHERE org_id = '<targetOrgId>' 
   ORDER BY created_at DESC LIMIT 5;
   ```
   Confirm a `plan_changed` entry is present with `data.isReplay = true`.

---

## 5. Common Troubleshooting Scenarios

| Issue | Cause | Action |
|---|---|---|
| `Unknown price ID: pri_...` | Price ID in webhook does not match `PADDLE_PRICE_*` in environment | Check `backend/.env` for missing or misconfigured price IDs. Once configured, replay the event. |
| `Missing price ID or subscription ID` | Malformed webhook payload from test source | Inspect payload with `--list`. Ensure valid Paddle Billing format. |
| `Out-of-order event ignored` | Event occurred before current subscription state | Expected behavior under Section 12.2. If manual overwrite is required, check current subscription state first. |
| `Paddle event with ID ... not found` | Webhook never reached Plainsight server | Re-send webhook from the Paddle developer dashboard or replay via `--file`. |

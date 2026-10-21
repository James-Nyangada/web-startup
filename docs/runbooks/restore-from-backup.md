# Runbook: Restore from backup

**Targets (spec 13.1):** RPO 24 h (nightly backup), RTO 4 h.
**When:** data loss or corruption, a bad migration, or the quarterly restore test (P6-13 launch check).

Backups (spec 13.4): nightly `pg_dump`, compressed and encrypted with `age`, uploaded to R2.
Retention: 14 daily, 8 weekly, 6 monthly. The `age` private key is in the password manager
under "Backups – age identity", never on the server.

## 1. Decide what to restore

| Situation | Restore to |
| --- | --- |
| Whole database lost or corrupted | Production, from the latest good dump |
| A bad migration or bulk mistake | A scratch database, then copy the affected rows back |
| Restore test | A scratch database only |

Turn on maintenance mode before restoring over production: set `MAINTENANCE_MODE=true` for the
api, worker and web services and restart them (see `maintenance-mode.md`).

## 2. Fetch and decrypt the dump

```bash
# List dumps (newest last)
aws s3 ls s3://$R2_BUCKET/backups/ --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com

aws s3 cp s3://$R2_BUCKET/backups/<file>.sql.gz.age ./restore.sql.gz.age \
  --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com
age --decrypt -i ~/age-identity.txt restore.sql.gz.age > restore.sql.gz
```

## 3. Restore

Into a scratch database first, always:

```bash
createdb -h <host> -U postgres restore_check
gunzip -c restore.sql.gz | psql -h <host> -U postgres -d restore_check -v ON_ERROR_STOP=1
```

Sanity queries (row counts should be close to yesterday's):

```sql
select count(*) from organizations where deleted_at is null;
select count(*) from sites where deleted_at is null;
select max(queued_at) from scans;           -- should be within ~24 h of the dump time
select count(*) from audit_log;             -- append-only, must not shrink between dumps
```

Only then, for a full production restore: stop api and worker, drop and recreate the production
database, restore the dump the same way, then run migrations so any newer schema is applied:

```bash
cd backend && npm run db:migrate
```

## 4. Bring the service back

1. Unset `MAINTENANCE_MODE` and restart api, worker, web.
2. Check `GET /health/deep` returns 200.
3. The worker re-queues scans that were mid-run (`recoverInterruptedScans`).
4. Data written between the dump and the incident is lost (RPO). Replay Paddle webhooks for that
   window (`paddle-webhook-replay.md`) so billing state is current.
5. Post in the status page and email affected customers if data was lost.

## 5. Restore test log

Record every test here. Launch requires a test within the last 30 days.

| Date | Dump used | Duration | Row counts OK | By |
| --- | --- | --- | --- | --- |
| | | | | |

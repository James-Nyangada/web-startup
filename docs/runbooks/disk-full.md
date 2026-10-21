# Runbook: Disk full

**Alert:** `GET /health/deep` returns `"status":"warn"` with `checks.disk.status = "warn"` (under 10 % free; UptimeRobot keyword alert on `"warn"`), or the
staff system panel (`/staff/queues`) shows disk above 90 %.

## 1. Find what is using the space

```bash
df -h
sudo du -xh --max-depth=2 /var/lib/docker | sort -h | tail -20
docker system df
sudo du -sh /var/log/* | sort -h | tail
```

## 2. Usual suspects, in order

| What | Safe action |
| --- | --- |
| Old Docker images and build cache | `docker image prune -af --filter "until=168h"` and `docker builder prune -af` |
| Container logs (rotation misconfigured) | Check `/etc/docker/daemon.json` has `"log-opts": {"max-size": "50m", "max-file": "5"}`; truncate a runaway log with `truncate -s 0 <file>` |
| `STORAGE_DIR` on local disk (R2 not configured) | Configure R2 (`R2_*`), then move objects; local storage is for development only |
| Postgres WAL or bloat (self-hosted only) | Check `pg_stat_archiver`, failing archive command; `VACUUM (VERBOSE)` large tables |
| Leftover restore files | Delete `restore*.sql.gz*` from home directories |

Never delete files inside the Postgres data directory by hand.

## 3. If the database is affected

Postgres stops accepting writes when its disk is full. Turn on maintenance mode
(`maintenance-mode.md`), free space, restart Postgres, then check `GET /health/deep`.

## 4. Prevent

- Retention (`retention.prune`, daily 02:00 UTC) removes old scan detail and expired data exports;
  check its log line `retention.prune finished` is present every day.
- Keep 30 % free. When steady-state usage passes 70 %, resize the volume or plan the move in
  `moving-to-a-second-server.md`.

# Runbook: Staff access

Internal admin lives at `/staff` (S-70 – S-75, P6-01).

## Grant

```sql
update users set is_staff = true where email = 'name@plainsight.io';
```

The person signs in normally, opens `/staff`, and sets up an authenticator app (TOTP). Every
session needs a code at most every 12 hours. Five wrong codes lock that session's attempts for
15 minutes.

## Revoke

```sql
update users set is_staff = false, totp_secret_encrypted = null, totp_enabled_at = null
 where email = 'name@plainsight.io';
delete from sessions where user_id = (select id from users where email = 'name@plainsight.io');
```

## Lost authenticator

Reset with the `totp_*` columns set to null (as above, without removing `is_staff`) after checking
identity out of band. They enrol again on next visit.

## Impersonation rules

- Always give a reason; it is written to the customer's audit log, which their owners and admins see.
- Impersonation is read-only: the API refuses every write with `IMPERSONATION_READ_ONLY`.
- Stop with the banner's **Stop impersonating** button; it ends automatically when the 12-hour
  TOTP window lapses.

## Review

Monthly: list staff and recent staff actions.

```sql
select email, totp_enabled_at from users where is_staff;
select created_at, action, org_id, data->>'reason' as reason
  from audit_log where actor_type = 'staff' order by created_at desc limit 100;
```

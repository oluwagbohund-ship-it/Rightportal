# Dave Timi EdTech Systems — PostgreSQL Migration Strategy

**Status:** Architectural Blueprint (SQLite via `node:sqlite` remains active in Phase 1 & Phase 1.5)  
**Author:** David Oluwagbohun  

## 1. Rationale & Trigger Criteria

SQLite (`WAL` mode + `PRAGMA foreign_keys = ON`) is intentionally retained for Phase 1 and Phase 1.5 to deliver zero-external-dependency reliability, deterministic local backups (`VACUUM INTO`), and fast ACID transactions. Migration to managed **PostgreSQL** is scheduled for Phase 2/3 when any of the following thresholds are reached:

1. Concurrent write throughput exceeds single-writer WAL capacity (>500 school tenants writing attendance/gradebooks concurrently).
2. Multi-instance horizontal auto-scaling behind a load balancer requires shared networked database state instead of node-local storage.
3. Read replicas, analytical partitioning, or PostgreSQL Row-Level Security (RLS) policies are required for compliance.

## 2. Schema & Type Parity Mapping

| SQLite (`001` / `002`) | PostgreSQL Target | Migration Notes |
| --- | --- | --- |
| `TEXT PRIMARY KEY` (`usr_...`, `sch_...`) | `TEXT PRIMARY KEY` or `UUID` | Prefixed string IDs (`sch_`, `usr_`) map cleanly without breaking existing API contracts. |
| `INTEGER (0/1)` booleans (`is_active`, `is_current`) | `BOOLEAN` | Convert `0/1` to `FALSE/TRUE`; add partial unique index `WHERE is_current = TRUE` on `academic_sessions(school_id)`. |
| `TEXT` ISO timestamps (`datetime('now')`) | `TIMESTAMPTZ DEFAULT NOW()` | Preserve UTC storage and JSON ISO-8601 serialization. |
| `value_json TEXT` / `metadata_json TEXT` | `JSONB` | Enables indexed queries on audit metadata and settings. |
| `PRAGMA foreign_keys = ON` | Native enforced FKs | Always enforced in PostgreSQL across all transactions. |

## 3. Multi-Tenant Isolation Upgrade (Row-Level Security)

Application-layer `school_id` scoping (`assertTenantScope` and `WHERE school_id = ?`) will be reinforced at the database layer using PostgreSQL **Row-Level Security (RLS)**:

1. Each pooled connection sets `SET LOCAL app.current_school_id = '<school_id>'` inside a transaction wrapper before executing tenant queries.
2. Policies on `school_memberships`, `academic_sessions`, `stored_files`, `notifications`, and `audit_logs` enforce `school_id = current_setting('app.current_school_id', true)`.
3. Platform Owner routes use a separate audited governance role rather than tenant-scoped queries.

## 4. Object Storage & Queue Decoupling

Before horizontally scaling Express instances:

- Move `./data/storage` binary files (`stored_files`) to private S3/GCS object storage with signed short-lived server-authorized downloads (preserving `stored_files` metadata & magic-byte validation).
- Move `login_rate_limits` and ephemeral session caching optionally to Redis while keeping `auth_sessions` revocable in PostgreSQL.
- Activate Firebase Cloud Messaging (FCM) worker dispatch against `notification_device_tokens` once tenant push certificates are configured.

## 5. Cutover Execution Runbook

1. Provision PostgreSQL with TLS (`sslmode=require`) and run Prisma/Drizzle or SQL migrations matching `001` + `002`.
2. Export deterministic SQLite snapshot via `VACUUM INTO` and run an idempotent ETL verification script validating row counts and foreign-key integrity.
3. Verify SHA-256 checksums of `stored_files` and `audit_logs` before flipping `DATABASE_URL` in production.

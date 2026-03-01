# Backup & Disaster Recovery

SecureYeoman includes a built-in backup system (Phase 61) that uses `pg_dump`/`pg_restore` to create and restore full database backups. Backup files are stored on disk alongside the core service.

---

## Prerequisites

- `pg_dump` and `pg_restore` must be available in the core container's `PATH` (included in the official Docker image)
- The core service must have write access to the backup storage directory
- Admin JWT required for all backup operations

---

## Creating a Backup

### Dashboard

1. Go to **Settings → Backup**
2. Enter an optional label (e.g. `pre-migration`, `weekly-2026-03-01`)
3. Click **Create Backup**
4. The backup runs asynchronously — status shows `running` then `completed` or `failed`

### API

```bash
curl -X POST https://your-instance/api/v1/admin/backups \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "label": "pre-migration" }'
```

Response:
```json
{
  "id": "bkp_abc123",
  "label": "pre-migration",
  "status": "running",
  "createdAt": 1709123456789,
  "filePath": null
}
```

Poll `GET /api/v1/admin/backups/<id>` until `status` is `completed`.

---

## Listing Backups

```bash
curl -H "Authorization: Bearer <admin-jwt>" \
  https://your-instance/api/v1/admin/backups
```

Returns an array of backup records sorted newest-first:

```json
[
  {
    "id": "bkp_abc123",
    "label": "pre-migration",
    "status": "completed",
    "fileSizeBytes": 15728640,
    "createdAt": 1709123456789,
    "filePath": "/var/backups/secureyeoman/bkp_abc123.pgdump"
  }
]
```

---

## Downloading a Backup

```bash
curl -H "Authorization: Bearer <admin-jwt>" \
  https://your-instance/api/v1/admin/backups/<id>/download \
  --output secureyeoman-backup.pgdump
```

The file streams as a binary `application/octet-stream`. Store it in a safe off-instance location (S3, GCS, NFS, etc.) for true disaster recovery.

---

## Restoring a Backup

> **Warning**: Restore is destructive. It drops and recreates the entire database from the backup file. All data created after the backup was taken will be lost.

### Dashboard

1. Go to **Settings → Backup**
2. Find the backup you want to restore
3. Click **Restore** — a confirmation modal appears
4. Type `RESTORE` in the confirmation field and click **Confirm**

### API

```bash
curl -X POST https://your-instance/api/v1/admin/backups/<id>/restore \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "confirm": "RESTORE" }'
```

The `confirm: "RESTORE"` field is required to prevent accidental restores. The restore runs synchronously and returns `204 No Content` on success.

After a successful restore, restart the core service to reinitialize in-memory state:

```bash
docker compose restart core
```

---

## Deleting a Backup

Removes both the database record and the on-disk `.pgdump` file.

```bash
curl -X DELETE -H "Authorization: Bearer <admin-jwt>" \
  https://your-instance/api/v1/admin/backups/<id>
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/admin/backups` | Trigger a new backup |
| `GET` | `/api/v1/admin/backups` | List all backups |
| `GET` | `/api/v1/admin/backups/:id` | Get single backup (status, size) |
| `GET` | `/api/v1/admin/backups/:id/download` | Stream backup file |
| `POST` | `/api/v1/admin/backups/:id/restore` | Restore (requires `confirm: "RESTORE"`) |
| `DELETE` | `/api/v1/admin/backups/:id` | Delete backup record + file |

---

## Recommended Backup Schedule

SecureYeoman does not include an automated backup scheduler — use an external mechanism appropriate for your deployment:

### Cron (bare metal / VM)

```bash
# /etc/cron.d/secureyeoman-backup
0 2 * * * root curl -sf -X POST https://localhost/api/v1/admin/backups \
  -H "Authorization: Bearer ${SECUREYEOMAN_BACKUP_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"label":"nightly"}' >/dev/null
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: secureyeoman-backup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: curlimages/curl
            env:
            - name: ADMIN_TOKEN
              valueFrom:
                secretKeyRef:
                  name: secureyeoman-secrets
                  key: admin-token
            command:
            - curl
            - -X POST
            - https://secureyeoman-core/api/v1/admin/backups
            - -H
            - "Authorization: Bearer $(ADMIN_TOKEN)"
            - -d
            - '{"label":"k8s-nightly"}'
          restartPolicy: OnFailure
```

### Off-Instance Sync

After creating a backup, download and upload it to durable storage:

```bash
#!/usr/bin/env bash
ID=$(curl -sf -X POST .../api/v1/admin/backups \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | jq -r '.id')

# Wait for completion
while [ "$(curl -sf .../api/v1/admin/backups/$ID | jq -r '.status')" = "running" ]; do
  sleep 2
done

curl -sf .../api/v1/admin/backups/$ID/download -o backup-$ID.pgdump
aws s3 cp backup-$ID.pgdump s3://my-backups/secureyeoman/
rm backup-$ID.pgdump
```

---

## Disaster Recovery Testing

Test your DR procedure regularly — at minimum quarterly:

1. **Create a test backup** on production
2. **Stand up a staging instance** with the same PostgreSQL version
3. **Restore the backup** to staging via the API
4. **Verify data integrity**: spot-check personalities, audit entries, and recent memories
5. **Confirm service health**: `GET /api/v1/health/deep` should return all green
6. **Document RTO/RPO**: note how long the restore took and how much data was lost relative to the backup age

---

## Security Considerations

- Backup files contain the full database in plaintext — store them encrypted at rest (use S3 server-side encryption, disk encryption, or `gpg -e` before uploading)
- The restore confirmation string (`RESTORE`) prevents accidental API misuse but is not a substitute for role-based access control — restrict backup route access to admins only via the RBAC config
- Consider rotating the admin JWT used for automated backups independently from the main admin token

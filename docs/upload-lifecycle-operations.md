# Upload staging lifecycle operations

This policy is a safety net for abandoned staged uploads. Application cleanup remains the primary mechanism because it records ownership, leases, retries, and errors in PostgreSQL. The Azure rule only targets the exact `uploads/staging/` prefix; it must never apply to `uploads/ready/` or another container.

## Safe rollout order

1. Apply `db/migrations/020_owner_scoped_uploads.sql`.
2. Deploy the server and client upload-ID support with `UPLOAD_CLEANUP_ENABLED=false`.
3. In a staging environment, verify upload create, Blob PUT, completion, document/image consumers, deck jobs, image transforms, and LINE sharing.
4. Drain legacy queued and processing deck jobs. Use the repository query below and require zero rows before removing the compatibility path:

   ```sql
   -- db/queries/deck_job_legacy_drain.sql
   SELECT count(*)::bigint AS legacy_url_jobs
   FROM deck_generation_jobs
   WHERE source_upload_id IS NULL
     AND source_document_url IS NOT NULL
     AND status IN ('queued', 'processing');
   ```

5. Enable application cleanup (`UPLOAD_CLEANUP_ENABLED=true`) and observe at least one interval. Confirm logs contain aggregate counts, stable error codes, and upload IDs only.
6. List existing Blob prefixes and confirm `uploads/staging/` contains only the new UUID-based staging convention. Do not infer safety from the lifecycle JSON alone.
7. Apply the Azure lifecycle policy from `infra/azure/storage-lifecycle-policy.json`.
8. Re-read the active policy and verify its exact `uploads/staging/` prefix, block-blob filter, and two-day delete action.

## Applying and verifying the policy

Use environment variables or an Azure CLI login context; never put account keys in the command line or documentation:

```powershell
az storage account management-policy create `
  --account-name $env:AZURE_STORAGE_ACCOUNT `
  --resource-group $env:AZURE_RESOURCE_GROUP `
  --policy '@infra/azure/storage-lifecycle-policy.json'

az storage account management-policy show `
  --account-name $env:AZURE_STORAGE_ACCOUNT `
  --resource-group $env:AZURE_RESOURCE_GROUP
```

Before applying, validate the local artifact:

```powershell
Get-Content infra/azure/storage-lifecycle-policy.json -Raw | ConvertFrom-Json | Out-Null
pnpm vitest run api/_shared/__tests__/uploadLifecyclePolicy.test.js
```

The Azure management policy is an external mutation. Local tests and a parsed JSON file do not prove that the active storage account has the intended policy; always run the `show` command after an approved change and retain its output with the deployment record.

## Rollback

1. Disable or remove the lifecycle rule first, then re-read the active policy.
2. Set `UPLOAD_CLEANUP_ENABLED=false` and redeploy the API.
3. Stop accepting new uploads during an application rollback if the upload contract is not available.
4. Redeploy the previous matched frontend and API versions.
5. Keep migration 020 in place; it is additive and required by the owner-scoped records.
6. Do not bulk-delete staging objects during rollback. Preserve them for reconciliation after the matched application version is restored.

## Operational checks

- A normal cleanup pass uses at most 100 rows by default and never more than 500.
- A failed Blob deletion leaves the row pending, stores `blob_delete_failed`, and releases the cleanup lease for retry.
- A missing staging Blob is treated as successfully deleted and the row is marked expired.
- Ready objects and generated objects are outside the lifecycle prefix and must remain untouched.

# Owner-Scoped Upload and Staging Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace caller-controlled Azure Blob destinations and long-lived client URLs with an owner-scoped upload workflow based on upload_id, then bound orphaned staging storage with application cleanup and an Azure lifecycle safety net.

**Architecture:** The authenticated server creates every upload record and chooses a fixed container plus a staging/{upload_id} path. The browser receives only a short-lived write SAS for that exact Blob, uploads the bytes, and calls a completion endpoint. Completion verifies Blob properties, promotes the object to ready/{upload_id}, and marks the database row ready. Every consuming API resolves upload_id through tenant and user ownership before reading storage. An hourly application worker expires abandoned pending uploads after 48 hours; an Azure lifecycle rule removes only old staging objects as a backstop.

**Tech Stack:** Node.js 22, Express-compatible Azure Functions handlers, PostgreSQL, Azure Blob Storage SDK, React/Vite, Vitest, pnpm, Azure CLI.

**Spec:** Codex Security P0 remediation agreed on 2026-08-24: fixed container, server-controlled path, ownership record, API migration to upload_id, staging, and lifecycle cleanup. Content-hash deduplication is explicitly deferred.

## 執行摘要

第一階段分成四個可獨立驗收的里程碑：

1. 建立 uploads 所有權資料表，以及固定容器與伺服器命名的 staging/ready 儲存規則。
2. 新增建立與完成上傳 API，將前端及所有文件、簡報、圖片與 LINE 消費端改為傳遞 upload_id。
3. 停用可由呼叫者指定容器與 Blob 名稱的舊 blob-sas 簽章能力，並保留明確的相容期錯誤。
4. 啟用 48 小時 staging 清理、Azure lifecycle 安全網、上線檢查、監控與回復程序。

本階段不做內容雜湊去重，也不自動刪除 ready 檔案，因此不會引入共用 Blob、引用計數或誤刪成功上傳檔案的風險。

## Global Constraints

- Keep user uploads in the server-configured uploads container. Never accept a container or Blob path from a client.
- Use opaque UUID upload IDs. Physical names are staging/{upload_id} while pending and ready/{upload_id} after completion.
- Bind every record to tenant_id, user_id, and purpose. Supported phase-one purposes are document and image.
- Resolve a consumer request by upload ID, authenticated tenant, authenticated user, expected purpose, and ready status before any Azure read.
- Return the same 404 response for absent, foreign-owned, wrong-purpose, and non-ready uploads. Do not reveal whether another owner has a record.
- Use a short upload SAS limited to create and write access for one exact staging Blob. Do not return a long-lived read URL to the browser.
- Make completion idempotent. A second completion call for an already-ready upload returns the existing ready metadata without another copy.
- Make concurrent and retry completion safe: if ready/{upload_id} already exists with valid properties, reconcile the database row to ready instead of starting another copy.
- Verify server-side Blob size and content type at completion. Purpose limits remain 50 MiB for documents and 10 MiB for images.
- Keep the existing document Base64 fallback only for payloads no larger than 80 KiB, and enforce that limit on the server.
- Pending uploads expire after 48 hours. Phase one does not automatically delete ready uploads.
- The application cleanup worker is authoritative for database state. Azure lifecycle management is a prefix-scoped safety net for uploads/staging/ only.
- Do not introduce content hashes, cross-upload deduplication, shared Blob ownership, or reference counting in this phase.
- Do not migrate or change generated-output storage in api/_shared/blobStorage.js.
- Do not commit on main without explicit user authorization. Commit commands below are checkpoints to run only after authorization.

## Target API Contract

### Create an upload

Request:

~~~http
POST /api/uploads
Content-Type: application/json

{
  "fileName": "brief.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 1048576,
  "purpose": "document"
}
~~~

Response:

~~~json
{
  "uploadId": "uuid",
  "status": "pending",
  "blobUrl": "https://account.blob.core.windows.net/uploads/staging/uuid",
  "sasToken": "?short-lived-token",
  "expiresAt": "ISO-8601 timestamp"
}
~~~

### Complete an upload

~~~http
POST /api/uploads/{upload_id}/complete
~~~

Response:

~~~json
{
  "uploadId": "uuid",
  "status": "ready"
}
~~~

### Consumer request changes

| Existing field | Replacement |
|---|---|
| analyze-document documentUrl | uploadId |
| deck job source documentUrl | sourceUploadId |
| analyze-style imageUrl | uploadId |
| generate-images reference imageUrl | referenceUploadId |
| image-transform imageUrl | uploadId |
| send-line-image imageUrl | uploadId |

## Acceptance Criteria

- A caller cannot choose a storage container, Blob path, or another user's upload.
- A valid user can create, upload, complete, and consume their own document or image.
- An upload cannot be consumed while pending, expired, missing, foreign-owned, or used for the wrong purpose.
- Completion fails safely if the staged Blob is missing, oversized, or has an unacceptable content type.
- The client no longer receives a one-year read SAS.
- Legacy blob-sas no longer signs arbitrary caller-selected targets after migration.
- Pending records older than 48 hours and their staging Blobs are cleaned in bounded batches.
- The Azure lifecycle rule matches only the uploads/staging/ prefix and never ready/.
- Existing document, deck, image-generation, image-transform, and LINE-sharing user flows have regression coverage.
- Rollback can stop cleanup and restore the previous application version without reversing the additive database migration.

---

### Task 1: Add the owner-scoped upload schema and repository

**Files:**

- Create: db/migrations/020_owner_scoped_uploads.sql
- Create: api/_shared/uploads.js
- Create: api/_shared/__tests__/uploads.test.js

**Interfaces:**

~~~js
createPendingUpload({
  tenantId,
  userId,
  purpose,
  originalFileName,
  contentType,
  sizeBytes,
  expiresAt
})

getOwnedUpload({ uploadId, tenantId, userId, purpose, status })
markUploadReady({ uploadId, tenantId, userId, readyBlobName })
claimExpiredUploads({ limit })
markUploadExpired({ uploadId })
releaseUploadCleanupClaim({ uploadId, errorCode })
~~~

- [ ] Write failing repository tests that prove:

  - createPendingUpload stores one UUID as both the row ID and the staging path suffix.
  - getOwnedUpload includes tenant_id and user_id in its SQL predicate.
  - getOwnedUpload can constrain purpose and status.
  - markUploadReady changes status and blob_name only for the same owner.
  - claimExpiredUploads atomically leases expired pending rows, uses FOR UPDATE SKIP LOCKED, and respects the requested batch limit.
  - a cleanup lease can be retried after 15 minutes, while a fresh lease cannot be claimed by another worker.

- [ ] Run the focused test and confirm it fails because the repository does not exist:

~~~powershell
pnpm vitest run api/_shared/__tests__/uploads.test.js
~~~

- [ ] Create migration 020 with this shape:

~~~sql
CREATE TABLE uploads (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('document', 'image')),
  original_file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  blob_name text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending', 'ready', 'expired')),
  expires_at timestamptz NOT NULL,
  ready_at timestamptz,
  cleanup_claimed_at timestamptz,
  cleanup_attempts integer NOT NULL DEFAULT 0,
  last_cleanup_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_uploads_owner
  ON uploads (tenant_id, user_id, id);

CREATE INDEX idx_uploads_pending_expiry
  ON uploads (expires_at, cleanup_claimed_at, id)
  WHERE status = 'pending';

ALTER TABLE deck_generation_jobs
  ADD COLUMN source_upload_id uuid REFERENCES uploads(id) ON DELETE RESTRICT;

CREATE INDEX idx_deck_generation_jobs_source_upload
  ON deck_generation_jobs (source_upload_id);
~~~

- [ ] Implement createPendingUpload with one database-generated ID using a CTE, so the invariant cannot drift:

~~~sql
WITH candidate AS (
  SELECT gen_random_uuid() AS id
)
INSERT INTO uploads (
  id, tenant_id, user_id, purpose, original_file_name,
  content_type, size_bytes, blob_name, status, expires_at
)
SELECT
  id, $1, $2, $3, $4, $5, $6,
  'staging/' || id::text, 'pending', $7
FROM candidate
RETURNING *;
~~~

- [ ] Implement the remaining repository functions with parameterized SQL. Use api/_shared/db.js query for ordinary operations and getPool for the cleanup transaction. claimExpiredUploads must select eligible rows with FOR UPDATE SKIP LOCKED, set cleanup_claimed_at and increment cleanup_attempts in the same transaction, then return the claimed rows. A row is eligible when cleanup_claimed_at is null or older than the 15-minute cleanup lease.

- [ ] Run:

~~~powershell
pnpm vitest run api/_shared/__tests__/uploads.test.js
pnpm lint
~~~

- [ ] If commit authorization has been given:

~~~powershell
git add db/migrations/020_owner_scoped_uploads.sql api/_shared/uploads.js api/_shared/__tests__/uploads.test.js
git commit -m "feat: add owner scoped upload records"
~~~

### Task 2: Build fixed-container staging storage primitives

**Files:**

- Create: api/_shared/uploadStorage.js
- Create: api/_shared/__tests__/uploadStorage.test.js

**Interfaces:**

~~~js
getUploadContainerName()
buildStagingBlobName(uploadId)
buildReadyBlobName(uploadId)
maxBytesForPurpose(purpose)
issueUploadGrant({ uploadId, contentType, expiresAt })
getStagedBlobProperties({ uploadId })
promoteUpload({ uploadId })
downloadUploadBuffer(upload)
issueReadGrant(upload, expiresAt)
deleteStagingBlob(uploadId)
~~~

- [ ] Write failing tests that prove:

  - getUploadContainerName returns the configured user-upload container and does not accept an argument.
  - buildStagingBlobName and buildReadyBlobName reject non-UUID input.
  - issueUploadGrant signs only staging/{upload_id}, in the fixed container, with create and write permissions, HTTPS, and a short expiry.
  - promoteUpload copies staging/{upload_id} to ready/{upload_id}, waits for successful copy status, and deletes staging only after success.
  - downloadUploadBuffer uses the stored ready blob_name rather than a caller-supplied path.
  - deleteStagingBlob treats a missing Blob as success so cleanup is retry-safe.

- [ ] Run and observe the expected missing-module failure:

~~~powershell
pnpm vitest run api/_shared/__tests__/uploadStorage.test.js
~~~

- [ ] Implement the module with BLOB_CONTAINER_UPLOADS defaulting to uploads. Keep account credentials on the server. Do not export a general-purpose signer that accepts arbitrary containers or paths.

- [ ] Define server-side limits:

~~~js
const PURPOSE_LIMITS = Object.freeze({
  document: 50 * 1024 * 1024,
  image: 10 * 1024 * 1024,
});
~~~

- [ ] For promotion, start the copy from a short-lived source SAS, poll the destination copy status until success or a bounded timeout, and delete the source only after success. Surface failed or aborted copy status as an error without changing the database row.

- [ ] Run:

~~~powershell
pnpm vitest run api/_shared/__tests__/uploadStorage.test.js
pnpm lint
~~~

- [ ] If commit authorization has been given:

~~~powershell
git add api/_shared/uploadStorage.js api/_shared/__tests__/uploadStorage.test.js
git commit -m "feat: add fixed container upload storage"
~~~

### Task 3: Add create and complete upload endpoints

**Files:**

- Create: api/uploads/index.js
- Create: api/uploads/function.json
- Create: api/uploads/__tests__/index.test.js
- Modify: api/openapi.js

**Route definition:**

~~~json
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post", "options"],
      "route": "uploads/{id?}/{action?}"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}
~~~

- [ ] Write failing handler tests for:

  - authentication required for both operations;
  - accepted fields are fileName, contentType, sizeBytes, and purpose only;
  - a supplied container, blobName, path, tenantId, or userId is ignored or rejected;
  - purpose, content type, positive size, and purpose limit validation;
  - successful create returns uploadId, pending, exact blobUrl, short SAS token, and expiresAt;
  - complete returns 404 before Azure access for an unowned or absent record;
  - complete verifies staged Blob size equals the declared size and remains within the purpose limit;
  - complete rejects disallowed or mismatched content type;
  - complete promotes storage before changing the row to ready;
  - a repeated completion for a ready record returns 200 without repeating the copy.
  - concurrent or retried completion reconciles an already-valid ready Blob instead of starting another copy.

- [ ] Run:

~~~powershell
pnpm vitest run api/uploads/__tests__/index.test.js
~~~

- [ ] Implement POST /api/uploads. Obtain tenant_id and user_id from the existing authentication context, set expires_at to current time plus 48 hours, insert the row, and sign only its staging Blob.

- [ ] Implement POST /api/uploads/{id}/complete in this order:

  1. Parse and validate the UUID.
  2. Query by upload ID, tenant, user, and pending or ready status.
  3. Return the existing success response if already ready.
  4. Read staged Blob properties.
  5. Validate byte count and content type.
  6. If a valid ready Blob already exists, skip the copy; otherwise promote staging to ready.
  7. Atomically mark the owned row ready and set ready_at.

- [ ] Map all missing, foreign, wrong-purpose, pending-at-consumption, and expired upload lookups to a common response:

~~~json
{
  "error": "upload_not_found"
}
~~~

- [ ] Add explicit OpenAPI schemas for the two endpoints, the two success responses, validation errors, authentication errors, and upload_not_found.

- [ ] Run:

~~~powershell
pnpm vitest run api/uploads/__tests__/index.test.js
pnpm lint
~~~

- [ ] If commit authorization has been given:

~~~powershell
git add api/uploads api/openapi.js
git commit -m "feat: add owner scoped upload API"
~~~

### Task 4: Migrate the browser storage service to upload IDs

**Files:**

- Modify: src/services/storageService.js
- Modify: src/services/__tests__/storageService.test.js

**Interfaces:**

~~~js
createUpload({ fileName, contentType, sizeBytes, purpose })
putUploadBytes({ blobUrl, sasToken, file })
completeUpload(uploadId)
uploadFile(file, purpose)
~~~

The high-level uploadFile result is:

~~~js
{
  uploadId,
  status: 'ready'
}
~~~

- [ ] Replace tests for requestBlobSas and uploadFileToBlob with failing contract tests that prove:

  - the create request never contains container or blobName;
  - the Blob PUT uses exactly the server-returned blobUrl and sasToken;
  - completion happens only after a successful PUT;
  - a failed PUT never calls completion;
  - a failed completion does not return a usable upload ID;
  - the public result contains no blob URL, Blob path, or read SAS.

- [ ] Run:

~~~powershell
pnpm vitest run src/services/__tests__/storageService.test.js
~~~

- [ ] Implement create, PUT, and complete as separate functions so UI flows can report which stage failed. Keep uploadFile as the common orchestration helper.

- [ ] Remove support for a caller-supplied container from the browser service.

- [ ] Run:

~~~powershell
pnpm vitest run src/services/__tests__/storageService.test.js
pnpm lint
~~~

- [ ] If commit authorization has been given:

~~~powershell
git add src/services/storageService.js src/services/__tests__/storageService.test.js
git commit -m "refactor: return upload ids from browser uploads"
~~~

### Task 5: Migrate document analysis to ownership-checked upload IDs

**Files:**

- Modify: src/hooks/useDocumentAnalysis.js
- Modify: api/analyze-document/index.js
- Create or modify: api/analyze-document/__tests__/index.test.js
- Create or modify: src/hooks/__tests__/useDocumentAnalysis.test.js

- [ ] Write failing client tests that prove a normal document upload sends uploadId rather than documentUrl and preserves existing progress and error feedback.

- [ ] Write failing API tests that prove:

  - uploadId is looked up with tenant, user, document purpose, and ready status;
  - foreign, pending, expired, wrong-purpose, and missing IDs all return upload_not_found without calling Blob Storage;
  - the downloaded bytes come from the stored ready blob_name;
  - the legacy Base64 fallback is accepted only at 80 KiB or below;
  - an oversized Base64 fallback is rejected before document processing.

- [ ] Run:

~~~powershell
pnpm vitest run src/hooks/__tests__/useDocumentAnalysis.test.js api/analyze-document/__tests__/index.test.js
~~~

- [ ] Update the hook to call uploadFile(file, 'document') and send uploadId.

- [ ] Update the API to resolve the owned upload, download its bytes through uploadStorage, and pass the resulting buffer to the existing analysis logic. Remove account-key reads selected from caller URLs and remove remote document fetch for the upload path.

- [ ] Keep the small Base64 fallback as a compatibility path, but calculate decoded byte size and reject values over 80 KiB server-side.

- [ ] Run the focused tests and then:

~~~powershell
pnpm test
pnpm lint
~~~

- [ ] If commit authorization has been given:

~~~powershell
git add src/hooks/useDocumentAnalysis.js src/hooks/__tests__/useDocumentAnalysis.test.js api/analyze-document
git commit -m "fix: authorize document uploads by owner"
~~~

### Task 6: Migrate PowerPoint deck jobs without breaking queued work

**Files:**

- Modify: src/hooks/usePptMasterDeck.js
- Modify: api/_shared/deckJobs.js
- Modify relevant deck-job create handler and worker discovered from api/server.js
- Modify or create focused deck-job tests

- [ ] Before editing, locate exact create and worker entry points:

~~~powershell
rg -n "createDeckJob|source_document_url|process.*deck|deck.*worker" api src
~~~

- [ ] Write failing tests that prove:

  - new client jobs send sourceUploadId;
  - job creation resolves a ready, owned document upload;
  - source_upload_id is persisted for new jobs;
  - the worker re-resolves the upload by the job's tenant and user before reading it;
  - legacy rows with source_document_url can still finish during the drain window;
  - a new request cannot create a URL-based job.

- [ ] Add sourceUploadId to the deck-job create contract and persist source_upload_id from migration 020. Keep source_document_url nullable for legacy rows.

- [ ] Change the worker selection rule:

  1. If source_upload_id is present, load the upload through the owner-scoped repository and storage module.
  2. If source_upload_id is null on a pre-existing row, use the legacy source_document_url path only during the documented drain window.
  3. Never accept source_document_url from a new API request.

- [ ] Add a deployment gate that counts legacy queued or processing jobs before strict enforcement:

~~~sql
SELECT status, count(*)
FROM deck_generation_jobs
WHERE source_upload_id IS NULL
  AND source_document_url IS NOT NULL
  AND status IN ('queued', 'processing')
GROUP BY status;
~~~

- [ ] Run the exact focused tests found in the first step, followed by:

~~~powershell
pnpm test
pnpm lint
~~~

- [ ] If commit authorization has been given, stage only the files changed for this task and commit:

~~~powershell
git commit -m "fix: bind deck source uploads to owners"
~~~

### Task 7: Migrate image analysis, generation, and transform flows

**Files:**

- Modify: src/InfographicGenerator.jsx
- Modify: src/hooks/useImageTransform.js
- Modify: api/analyze-style/index.js
- Modify: api/generate-images/index.js
- Modify: api/image-transform/index.js
- Modify or create focused tests beside each existing module

- [ ] Write failing tests for these field changes:

  - style analysis sends uploadId instead of imageUrl;
  - image generation sends referenceUploadId instead of a reference URL;
  - image transform sends uploadId instead of imageUrl;
  - no state field retains referenceBlobSasUrl or contentBlobSasUrl.

- [ ] Write failing API tests that prove each endpoint resolves an image-purpose upload using tenant, user, and ready status before any storage call.

- [ ] Add negative tests for a document-purpose ID, a foreign user's ID, a pending ID, and a missing ID. Require the same upload_not_found response in every case.

- [ ] Update InfographicGenerator to upload each selected image once, retain its uploadId, and pass that ID to style analysis and generation. Preserve the existing 10 MiB client limit, preview behavior, and visible error states.

- [ ] Update useImageTransform to upload with image purpose and send uploadId. If the endpoint still needs Base64 for its model provider, derive it on the server from the owned Blob; do not send both Base64 and a SAS URL from the browser.

- [ ] Remove unrestricted fetch of client-provided image URLs from analyze-style and generate-images for these first-party uploads.

- [ ] Run focused tests discovered with:

~~~powershell
rg --files api src | rg "analyze-style|generate-images|image-transform|InfographicGenerator|useImageTransform"
pnpm test
pnpm lint
~~~

- [ ] If commit authorization has been given, stage only task files and commit:

~~~powershell
git commit -m "fix: authorize image uploads by owner"
~~~

### Task 8: Preserve LINE sharing without exposing a long-lived read URL

**Files:**

- Modify: src/components/share/ShareToLineButton.jsx
- Modify: api/send-line-image/index.js
- Modify or create: api/send-line-image/__tests__/index.test.js
- Modify or create focused ShareToLineButton tests

- [ ] Write failing tests that prove:

  - a data URL is uploaded with image purpose and the browser sends uploadId to the LINE endpoint;
  - the browser never receives or sends a Blob read SAS;
  - the server verifies ownership and ready status;
  - the server issues a short-lived read grant internally and passes that URL to LINE;
  - a foreign or missing upload never reaches the LINE client;
  - arbitrary remote imageUrl input is rejected for authenticated first-party sharing.

- [ ] Change the browser payload to:

~~~json
{
  "uploadId": "uuid",
  "message": "optional text"
}
~~~

- [ ] On the server, resolve the owned image upload and generate a read-only SAS whose expiry is the shortest value that still covers LINE retrieval. Keep the SAS inside the server-to-LINE request path.

- [ ] Run:

~~~powershell
pnpm vitest run api/send-line-image/__tests__/index.test.js
pnpm test
pnpm lint
~~~

- [ ] If commit authorization has been given:

~~~powershell
git commit -m "fix: keep line share blob access server side"
~~~

### Task 9: Retire the arbitrary Blob SAS endpoint

**Files:**

- Modify: api/blob-sas/index.js
- Modify: api/blob-sas/function.json if route metadata changes
- Modify or create: api/blob-sas/__tests__/index.test.js
- Modify: api/openapi.js

- [ ] Search for all remaining callers and require zero application references before changing behavior:

~~~powershell
rg -n "blob-sas|requestBlobSas|uploadFileToBlob|readUrl|sasToken|documentUrl|referenceBlobSasUrl|contentBlobSasUrl" src api
~~~

- [ ] Write failing tests that prove the legacy endpoint:

  - requires authentication;
  - returns HTTP 410 with error upload_api_replaced;
  - does not initialize an Azure client or sign a SAS;
  - does not echo a caller's fileName, container, or blob path.

- [ ] Replace signing behavior with the authenticated 410 response. Keep the route temporarily so a stale browser bundle receives a clear migration error instead of silently using an unsafe contract.

- [ ] Mark the route deprecated in OpenAPI and point clients to POST /api/uploads.

- [ ] Run:

~~~powershell
pnpm vitest run api/blob-sas/__tests__/index.test.js
pnpm test
pnpm lint
~~~

- [ ] If commit authorization has been given:

~~~powershell
git add api/blob-sas api/openapi.js
git commit -m "fix: retire arbitrary blob sas signing"
~~~

### Task 10: Add bounded staging cleanup

**Files:**

- Create: api/_shared/uploadCleanup.js
- Create: api/_shared/__tests__/uploadCleanup.test.js
- Modify: api/server.js
- Modify: .env.example if present
- Modify relevant deployment documentation

**Interfaces:**

~~~js
cleanupExpiredUploads({ batchSize, now })
startUploadCleanupWorker({ intervalMs, batchSize })
~~~

- [ ] Write failing tests that prove:

  - one run claims no more than 100 expired pending rows;
  - each claimed row is locked with SKIP LOCKED inside a transaction;
  - the transaction records a 15-minute cleanup lease before releasing database locks;
  - successful or already-missing Blob deletion marks the row expired;
  - a transient Azure failure leaves the row pending, records a non-secret error code, and releases its lease for retry;
  - one failed deletion does not stop the remainder of the batch;
  - the worker cannot overlap with itself in one process;
  - worker timers are unrefed and shutdown clears them.

- [ ] Run:

~~~powershell
pnpm vitest run api/_shared/__tests__/uploadCleanup.test.js
~~~

- [ ] Implement one cleanup pass as a bounded batch. Claim rows, delete only the staging path derived from each upload ID, and mark expired only after deletion succeeds or storage reports not found.

- [ ] Start the worker from api/server.js alongside the existing image and deck workers with:

  - UPLOAD_CLEANUP_ENABLED default true;
  - UPLOAD_CLEANUP_INTERVAL_MS default 3600000;
  - UPLOAD_CLEANUP_BATCH_SIZE default 100 with a server-side maximum of 500.

- [ ] Log aggregate counts and upload IDs, but never SAS tokens, original filenames, or full Blob URLs.

- [ ] Run:

~~~powershell
pnpm vitest run api/_shared/__tests__/uploadCleanup.test.js
pnpm test
pnpm lint
~~~

- [ ] If commit authorization has been given:

~~~powershell
git add api/_shared/uploadCleanup.js api/_shared/__tests__/uploadCleanup.test.js api/server.js
git commit -m "feat: clean expired staging uploads"
~~~

### Task 11: Add the Azure lifecycle safety net and operations guide

**Files:**

- Create: infra/azure/storage-lifecycle-policy.json
- Create: docs/upload-lifecycle-operations.md
- Modify relevant deployment documentation

- [ ] Create a lifecycle policy with one delete action and an exact Blob prefix match:

~~~json
{
  "rules": [
    {
      "enabled": true,
      "name": "delete-abandoned-user-upload-staging",
      "type": "Lifecycle",
      "definition": {
        "actions": {
          "baseBlob": {
            "delete": {
              "daysAfterModificationGreaterThan": 2
            }
          }
        },
        "filters": {
          "blobTypes": ["blockBlob"],
          "prefixMatch": ["uploads/staging/"]
        }
      }
    }
  ]
}
~~~

- [ ] Add a static contract test or validation script using the project's existing test conventions. It must fail if the policy contains uploads/ready/, a container-wide prefix, or any action affecting ready uploads.

- [ ] Document the safe deployment order:

  1. Apply migration 020.
  2. Deploy server and client upload-ID support with cleanup disabled.
  3. Verify create, PUT, completion, and each consumer in staging.
  4. Drain legacy queued and processing deck jobs.
  5. Enable application cleanup and observe at least one interval.
  6. List existing Blob prefixes and confirm uploads/staging/ contains only the new staging convention.
  7. Apply the Azure lifecycle policy.
  8. Re-read the active policy and verify its exact prefix.

- [ ] Document commands using environment variables rather than literal account credentials:

~~~powershell
az storage account management-policy create --account-name $env:AZURE_STORAGE_ACCOUNT --resource-group $env:AZURE_RESOURCE_GROUP --policy '@infra/azure/storage-lifecycle-policy.json'
az storage account management-policy show --account-name $env:AZURE_STORAGE_ACCOUNT --resource-group $env:AZURE_RESOURCE_GROUP
~~~

- [ ] Document rollback:

  1. Disable or remove the lifecycle rule first.
  2. Set UPLOAD_CLEANUP_ENABLED=false and redeploy.
  3. Stop accepting new uploads during application rollback.
  4. Redeploy the previous matched frontend and API versions.
  5. Keep migration 020 in place; it is additive.
  6. Do not bulk-delete staging objects during rollback.

- [ ] Run JSON parsing and the focused policy test:

~~~powershell
Get-Content infra/azure/storage-lifecycle-policy.json -Raw | ConvertFrom-Json | Out-Null
pnpm test
~~~

- [ ] If commit authorization has been given:

~~~powershell
git add infra/azure/storage-lifecycle-policy.json docs/upload-lifecycle-operations.md
git commit -m "docs: add staging lifecycle operations"
~~~

### Task 12: Run full regression and collect rollout evidence

**Files:**

- Modify: docs/upload-lifecycle-operations.md with actual non-secret verification evidence
- Modify: API and client tests only if a verified regression requires correction

- [ ] Run repository verification from a clean dependency state supported by the lockfile:

~~~powershell
pnpm test
pnpm lint
pnpm build
git diff --check
~~~

- [ ] Run a security contract search. Expected results are only the deprecated endpoint, compatibility documentation, or tests that assert rejection:

~~~powershell
rg -n "container.*req|req.*container|documentUrl|imageUrl|readUrl|referenceBlobSasUrl|contentBlobSasUrl|permissions.*r|expiresOn" api src
~~~

- [ ] In a non-production Azure environment, verify:

  - create returns a staging URL in the fixed uploads container;
  - an upload over the declared size or purpose limit cannot complete;
  - a valid upload becomes ready and the staging object is removed;
  - a second completion is idempotent;
  - another test user receives the same 404 as a random UUID;
  - document analysis, deck generation, style analysis, image generation, transform, and LINE share still complete;
  - a forced expired pending upload is removed by the application worker;
  - the lifecycle policy does not match ready objects.

- [ ] Record only timestamps, status codes, upload IDs, and aggregate counts. Redact SAS tokens, account keys, cookies, authorization headers, filenames containing user data, and complete Blob URLs.

- [ ] Before production enablement, verify the legacy deck-job query returns no queued or processing URL-based rows.

- [ ] Deploy migration and application before enabling lifecycle policy. Use a matched frontend and API release so no client sends the old URL fields after the API stops accepting them.

- [ ] Observe error rate, completion failures, cleanup failures, staging object count, and ready object count during the first retention window.

- [ ] If commit authorization has been given and evidence documentation changed:

~~~powershell
git add docs/upload-lifecycle-operations.md
git commit -m "test: record upload security rollout evidence"
~~~

## Functional and User-Experience Differences

| Area | Intended difference after phase one | User-visible impact |
|---|---|---|
| Upload naming | Server assigns an opaque upload ID and path | Original filenames are no longer visible in Blob paths; UI filenames remain unchanged |
| Upload completion | Upload has an explicit pending then ready transition | A failed finalization may show a distinct completion error and require retrying the upload |
| Cross-device URL reuse | Browser does not retain a one-year read URL | Previously copied direct Blob links stop being a supported sharing method |
| Document and image processing | APIs accept upload IDs, not arbitrary URLs | First-party uploads continue; arbitrary external URLs are rejected unless a separate reviewed feature supports them |
| LINE sharing | Backend creates a short-lived read grant only when sending | Normal share behavior remains; old saved LINE Blob URLs are not reusable long term |
| Orphan retention | Incomplete staging uploads expire after 48 hours | A user returning after more than 48 hours must upload the file again |
| Ready retention | No automatic deletion in phase one | Successfully completed uploads keep current availability semantics |
| Deduplication | Not implemented | Re-uploading identical bytes creates separate upload records and ready Blobs |

## Deferred Work

- Same-user content-hash deduplication, including salted hashes, transactional reference counting, deletion semantics, and privacy review.
- Retention or archival policy for ready uploads.
- Cross-user or cross-tenant deduplication.
- User-visible upload management and manual deletion.
- Migration of generated-output storage managed by api/_shared/blobStorage.js.

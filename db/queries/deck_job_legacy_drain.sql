-- Deployment gate for the temporary legacy deck source URL drain window.
-- New requests must always populate source_upload_id; this query must return
-- zero rows before source_document_url support is removed in Task 9.
SELECT status, count(*) AS legacy_job_count
FROM deck_generation_jobs
WHERE source_upload_id IS NULL
  AND source_document_url IS NOT NULL
  AND status IN ('queued', 'processing')
GROUP BY status
ORDER BY status;

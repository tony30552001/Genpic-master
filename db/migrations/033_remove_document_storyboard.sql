-- Document storyboard analysis is retired: drop its job queue and the
-- tenant model assignments for the roles that only served it.
BEGIN;

DROP TABLE IF EXISTS document_analysis_jobs;

DELETE FROM llm_role_assignments
WHERE role IN ('document_analysis', 'scene_optimization');

COMMIT;

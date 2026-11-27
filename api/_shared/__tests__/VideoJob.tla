---- MODULE VideoJob ----
EXTENDS Naturals

CONSTANT MAX_SUBMIT_ATTEMPTS
VARIABLES status, phase, requestId, submitted, attempts, lockVersion, resultVersion

Init ==
  /\ status = "queued"
  /\ phase = "queued"
  /\ requestId = FALSE
  /\ submitted = 0
  /\ attempts = 0
  /\ lockVersion = 0
  /\ resultVersion = 0

ClaimSubmission ==
  /\ status = "queued"
  /\ attempts < MAX_SUBMIT_ATTEMPTS
  /\ status' = "processing"
  /\ phase' = "submitting"
  /\ attempts' = attempts + 1
  /\ lockVersion' = lockVersion + 1
  /\ UNCHANGED <<requestId, submitted, resultVersion>>

CancelQueued ==
  /\ status = "queued"
  /\ status' = "cancelled"
  /\ phase' = "completed"
  /\ UNCHANGED <<requestId, submitted, attempts, lockVersion, resultVersion>>

TransientBeforeSubmission ==
  /\ status = "processing"
  /\ phase = "submitting"
  /\ requestId = FALSE
  /\ attempts < MAX_SUBMIT_ATTEMPTS
  /\ status' = "queued"
  /\ phase' = "queued"
  /\ UNCHANGED <<requestId, submitted, attempts, lockVersion, resultVersion>>

SubmitSuccess ==
  /\ status = "processing"
  /\ phase = "submitting"
  /\ requestId = FALSE
  /\ requestId' = TRUE
  /\ submitted' = submitted + 1
  /\ phase' = "polling"
  /\ UNCHANGED <<status, attempts, lockVersion, resultVersion>>

LoseSubmitState ==
  /\ status = "processing"
  /\ phase = "submitting"
  /\ requestId = FALSE
  /\ status' = "failed"
  /\ phase' = "completed"
  /\ submitted' \in {submitted, submitted + 1}
  /\ UNCHANGED <<requestId, attempts, lockVersion, resultVersion>>

ClaimPolling ==
  /\ status = "processing"
  /\ phase \in {"polling", "storing"}
  /\ lockVersion < 4
  /\ lockVersion' = lockVersion + 1
  /\ UNCHANGED <<status, phase, requestId, submitted, attempts, resultVersion>>

BeginStore ==
  /\ status = "processing"
  /\ phase = "polling"
  /\ requestId = TRUE
  /\ phase' = "storing"
  /\ UNCHANGED <<status, requestId, submitted, attempts, lockVersion, resultVersion>>

StoreSuccess ==
  /\ status = "processing"
  /\ phase = "storing"
  /\ requestId = TRUE
  /\ status' = "succeeded"
  /\ phase' = "completed"
  /\ resultVersion' = lockVersion
  /\ UNCHANGED <<requestId, submitted, attempts, lockVersion>>

PermanentFailure ==
  /\ status = "processing"
  /\ status' = "failed"
  /\ phase' = "completed"
  /\ UNCHANGED <<requestId, submitted, attempts, lockVersion, resultVersion>>

Terminal ==
  /\ status \in {"succeeded", "failed", "cancelled"}
  /\ UNCHANGED <<status, phase, requestId, submitted, attempts, lockVersion, resultVersion>>

Next ==
  \/ ClaimSubmission
  \/ CancelQueued
  \/ TransientBeforeSubmission
  \/ SubmitSuccess
  \/ LoseSubmitState
  \/ ClaimPolling
  \/ BeginStore
  \/ StoreSuccess
  \/ PermanentFailure
  \/ Terminal

AcceptedOnce ==
  submitted <= 1

CancelledUnsubmitted ==
  status = "cancelled" => ~requestId /\ submitted = 0

SuccessFromLatestClaim ==
  status = "succeeded" => resultVersion = lockVersion

NoSubmissionAfterAcceptance ==
  requestId = TRUE => phase \notin {"queued", "submitting"}

Spec == Init /\ [][Next]_<<status, phase, requestId, submitted, attempts, lockVersion, resultVersion>>
====

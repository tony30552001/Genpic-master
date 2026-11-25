---- MODULE VideoRender ----
\* State machine of video_renders (api/_shared/videoRenders.js) for one
\* project. Two workers race; a lock may expire at any moment, so a render a
\* worker still holds can be reclaimed. FENCED models the lock_version guard
\* in updateByLock and UNIQUE_LIVE the partial unique index
\* video_renders_project_live_key; setting either to FALSE must break an
\* invariant.
EXTENDS Naturals, Sequences

CONSTANTS MAX_ATTEMPTS, MAX_RENDERS, Workers, FENCED, UNIQUE_LIVE
VARIABLES renders, held

vars == <<renders, held>>
None == [r |-> 0, v |-> 0]
Live(i) == renders[i].status # "failed"

Init ==
  /\ renders = <<>>
  /\ held = [w \in Workers |-> None]

Request ==
  /\ Len(renders) < MAX_RENDERS
  /\ UNIQUE_LIVE => \A i \in 1..Len(renders) : ~Live(i)
  /\ renders' = Append(renders, [status |-> "queued", attempts |-> 0, lv |-> 0, result |-> 0])
  /\ UNCHANGED held

\* A queued render, or a processing one whose lock expired.
Claim(w, i) ==
  /\ held[w] = None
  /\ \/ renders[i].status = "queued"
     \/ renders[i].status = "processing" /\ renders[i].attempts < MAX_ATTEMPTS
  /\ renders' = [renders EXCEPT ![i].status = "processing",
                                ![i].attempts = @ + 1,
                                ![i].lv = @ + 1]
  /\ held' = [held EXCEPT ![w] = [r |-> i, v |-> renders[i].lv + 1]]

\* render_timeout fails any unfinished render, held or not; render_lost (an
\* exhausted render whose lock expired) is a subset of it.
Expire(i) ==
  /\ renders[i].status \in {"queued", "processing"}
  /\ renders' = [renders EXCEPT ![i].status = "failed"]
  /\ UNCHANGED held

Owns(w) ==
  LET i == held[w].r IN
    /\ i # 0
    /\ FENCED => renders[i].status = "processing" /\ renders[i].lv = held[w].v

Release(w) == held' = [held EXCEPT ![w] = None]

Succeed(w) ==
  /\ Owns(w)
  /\ renders' = [renders EXCEPT ![held[w].r].status = "succeeded",
                                ![held[w].r].result = held[w].v]
  /\ Release(w)

Retry(w) ==
  /\ Owns(w)
  /\ renders[held[w].r].attempts < MAX_ATTEMPTS
  /\ renders' = [renders EXCEPT ![held[w].r].status = "queued"]
  /\ Release(w)

Fail(w) ==
  /\ Owns(w)
  /\ renders' = [renders EXCEPT ![held[w].r].status = "failed"]
  /\ Release(w)

\* The write was fenced off or the process died; the row is untouched.
Abandon(w) ==
  /\ held[w] # None
  /\ Release(w)
  /\ UNCHANGED renders

Next ==
  \/ Request
  \/ \E w \in Workers, i \in 1..Len(renders) : Claim(w, i)
  \/ \E i \in 1..Len(renders) : Expire(i)
  \/ \E w \in Workers : Succeed(w) \/ Retry(w) \/ Fail(w) \/ Abandon(w)
  \/ UNCHANGED vars

Spec == Init /\ [][Next]_vars

AtMostOneLive ==
  \A i, j \in 1..Len(renders) : Live(i) /\ Live(j) => i = j

\* The stored output blob (named by lock version) is the latest claim's.
SuccessFromLatestClaim ==
  \A i \in 1..Len(renders) : renders[i].status = "succeeded" => renders[i].result = renders[i].lv

AttemptsBounded ==
  \A i \in 1..Len(renders) : renders[i].attempts <= MAX_ATTEMPTS

TerminalStable ==
  [][\A i \in 1..Len(renders) :
       renders[i].status \in {"succeeded", "failed"} => renders'[i].status = renders[i].status]_vars
====

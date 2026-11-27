import React, { useEffect, useState } from "react";
import { getSegmentPlayback, getVideoPlayback } from "@/services/aiService";

/** Signed URLs belong to the player, never the saved session. A late Range
 * request after expiry gets a fresh URL and resumes at the same position. */
export default function VideoStream({ jobId, projectId, ...props }) {
  const [playback, setPlayback] = useState(null);
  const [error, setError] = useState("");
  const [resume, setResume] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const request = jobId ? getSegmentPlayback({ jobId, signal }) : getVideoPlayback({ projectId, signal });
    request.then((result) => { if (!signal.aborted) setPlayback(result); })
      .catch((caught) => { if (!signal.aborted) setError(caught.message || "影片載入失敗"); });
    return () => controller.abort();
  }, [jobId, projectId, resume]);

  if (error) return <span role="alert" className="block bg-muted p-2 text-xs text-destructive">{error}</span>;
  return (
    <video
      {...props}
      src={playback?.url}
      onLoadedMetadata={(event) => {
        if (resume) event.currentTarget.currentTime = resume.time;
      }}
      onError={(event) => {
        if (!playback) return;
        if (Date.now() >= Date.parse(playback.expiresAt) - 10_000) {
          setResume({ time: event.currentTarget.currentTime });
          setPlayback(null);
        } else setError("影片無法播放，請重新開啟");
      }}
    />
  );
}

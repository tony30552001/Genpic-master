import { useEffect, useState } from "react";

export default function useElapsedSeconds(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const timerId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}

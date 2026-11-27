// Key-order independent JSON, so an edited shot compares by content.
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

/**
 * Indexes of the planned segments a regeneration generates again, mirroring
 * the server's reuse rule: a segment is reused only when a succeeded segment
 * of `previous` covered the same shots with the same content and settings,
 * and a chained segment also needs its predecessor reused.
 */
export function regeneratedSegments({ plan, storyboard, previous }) {
  const header = ({ title, global }) => canonical({ title, global });
  const sameHeader = header(storyboard) === header(previous.storyboard);
  const oldShots = new Map(previous.storyboard.shots.map((shot) => [shot.id, canonical(shot)]));
  const reusable = new Set(
    previous.segments
      .filter((segment) => segment.status === "succeeded" && segment.shotIds)
      .map((segment) => `${segment.chained}|${segment.shotIds.join(",")}`)
  );
  const regenerated = [];
  let previousReused = true;
  plan.forEach((segment) => {
    const shots = storyboard.shots.filter((shot) => segment.shotIds.includes(shot.id));
    const reused = sameHeader
      && reusable.has(`${segment.chained}|${segment.shotIds.join(",")}`)
      && shots.every((shot) => oldShots.get(shot.id) === canonical(shot))
      && (!segment.chained || previousReused);
    if (!reused) regenerated.push(segment.index);
    previousReused = reused;
  });
  return regenerated;
}

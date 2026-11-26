const { parse } = require("partial-json");

/**
 * Progress of one storyboard job, stored on the job row and polled by the
 * browser: which step runs, the analysis model's reasoning summary, and the
 * shots the model has finished writing so far.
 */

const SAVE_INTERVAL_MS = 1000;
const MAX_REASONING = 6000;
const PREVIEW_TEXT = 160;

const storyboardSteps = (action, request) =>
  action === "fromScript" && request?.uploadId != null
    ? ["reading", "thinking", "writing", "checking", "images"]
    : ["thinking", "writing", "checking"];

const lastKey = (value) => {
  const keys = value && typeof value === "object" ? Object.keys(value) : [];
  return keys[keys.length - 1];
};

/**
 * The shots of a partial agent reply that are complete. The last parsed shot
 * may still be streaming, unless a later key shows the list was closed.
 */
const finishedShots = (text, titles) => {
  let data;
  try {
    data = parse(text);
  } catch {
    // The reply has not produced a parsable prefix yet.
    return [];
  }
  const shots = data?.storyboard?.shots;
  if (!Array.isArray(shots)) return [];
  const closed = lastKey(data) !== "storyboard" || lastKey(data.storyboard) !== "shots";
  return (closed ? shots : shots.slice(0, -1)).map((shot, index) => ({
    title: (typeof shot?.title === "string" && shot.title) || titles[index] || null,
    duration: Number.isInteger(shot?.duration) ? shot.duration : null,
    text: String(shot?.script || shot?.action || "").slice(0, PREVIEW_TEXT),
  }));
};

/**
 * `save(snapshot)` writes the JSON snapshot. Step changes are written at once;
 * streamed text and reasoning at most once per interval. `close()` writes the
 * last change and waits for every write, so nothing lands after the result.
 */
const createStoryboardProgress = ({ steps, save }) => {
  const state = { steps, step: steps[0], reasoning: "", shots: [], expectedShots: null };
  let text = "";
  let titles = [];
  let dirty = false;
  let closed = false;
  let timer = null;
  let writes = Promise.resolve();

  const write = () => {
    clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    dirty = false;
    if (text) state.shots = finishedShots(text, titles);
    const snapshot = JSON.stringify(state);
    writes = writes
      .then(() => save(snapshot))
      .catch((error) => {
        console.error("[video-storyboard-jobs] Progress update failed:", { name: error?.name, code: error?.code });
      });
  };

  const changed = (now = false) => {
    if (closed) return;
    dirty = true;
    if (now) write();
    else timer ??= setTimeout(write, SAVE_INTERVAL_MS);
  };

  return {
    step(name) {
      state.step = name;
      changed(true);
    },
    expectShots({ count = null, sceneTitles = [] }) {
      state.expectedShots = count;
      titles = sceneTitles;
      changed(true);
    },
    reasoning(delta) {
      state.reasoning = (state.reasoning + delta).slice(-MAX_REASONING);
      changed();
    },
    text(delta) {
      text += delta;
      if (state.step === "thinking") {
        state.step = "writing";
        changed(true);
      } else {
        changed();
      }
    },
    restart() {
      text = "";
      state.reasoning = "";
      state.shots = [];
      state.step = "thinking";
      changed(true);
    },
    async close() {
      write();
      closed = true;
      await writes;
    },
  };
};

module.exports = { createStoryboardProgress, finishedShots, storyboardSteps };

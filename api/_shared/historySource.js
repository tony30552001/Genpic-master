/** Creation workflows that can write a generated image into the history. */
const HISTORY_SOURCES = ["general", "document", "image-transform"];

/** Returns the workflow id when it is known, otherwise null for legacy records. */
const normalizeHistorySource = (value) => {
  const source = String(value || "").trim();
  return HISTORY_SOURCES.includes(source) ? source : null;
};

module.exports = { HISTORY_SOURCES, normalizeHistorySource };

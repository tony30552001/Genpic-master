/** Creation workflows that can write a generated image into the history. */
const HISTORY_SOURCES = [
  "general",
  "document",
  "refine",
  "bg_replace",
  "element_extract",
  "style_transfer",
];

/** Sources that exist only on records written before the creation workspace merge. */
const LEGACY_HISTORY_SOURCES = ["image-transform"];

/** Returns the workflow id when it is known, otherwise null for legacy records. */
const normalizeHistorySource = (value) => {
  const source = String(value || "").trim();
  return HISTORY_SOURCES.includes(source) ? source : null;
};

/** Returns a source that history can be filtered by, including legacy records. */
const normalizeHistorySourceFilter = (value) => {
  const source = String(value || "").trim();
  return HISTORY_SOURCES.includes(source) || LEGACY_HISTORY_SOURCES.includes(source)
    ? source
    : null;
};

module.exports = {
  HISTORY_SOURCES,
  LEGACY_HISTORY_SOURCES,
  normalizeHistorySource,
  normalizeHistorySourceFilter,
};
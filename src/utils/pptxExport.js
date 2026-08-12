const toText = (value) => (value == null ? "" : String(value).trim());
const MAX_TABLE_COLUMNS = 8;
const MAX_TABLE_ROWS = 10;
const MAX_CHART_LABELS = 12;
const MAX_CHART_SERIES = 4;

const CHART_TYPE_ALIASES = {
  bar: "bar",
  column: "bar",
  line: "line",
  pie: "pie",
  doughnut: "doughnut",
  donut: "doughnut",
};

export const extractPptxBullets = (scene = {}) => {
  const bullets = Array.isArray(scene.bullet_points)
    ? scene.bullet_points.map(toText).filter(Boolean)
    : [];

  if (bullets.length > 0) return bullets;

  const description = toText(scene.scene_description);
  return description ? [description] : [];
};

export const getPptxScenes = (scenes) =>
  Array.isArray(scenes)
    ? scenes.filter((scene) => scene && typeof scene === "object")
    : [];

export const sanitizePptxFilename = (title) =>
  toText(title).replace(/[^\w\u4e00-\u9fff\s-]/g, "").trim() || "presentation";

const toFiniteNumber = (value) => {
  const number =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : null;
};

export const normalizePptxTable = (rawTable) => {
  if (!rawTable || typeof rawTable !== "object" || Array.isArray(rawTable)) {
    return null;
  }

  const headers = (
    Array.isArray(rawTable.headers)
      ? rawTable.headers
      : Array.isArray(rawTable.columns)
        ? rawTable.columns
        : []
  )
    .slice(0, MAX_TABLE_COLUMNS)
    .map((header) => toText(header));
  const rows = (Array.isArray(rawTable.rows) ? rawTable.rows : [])
    .slice(0, MAX_TABLE_ROWS)
    .map((row) =>
      Array.isArray(row)
        ? row.slice(0, MAX_TABLE_COLUMNS).map((cell) => toText(cell))
        : []
    );
  const columnCount = Math.max(
    headers.length,
    ...rows.map((row) => row.length),
    0
  );

  if (columnCount === 0) return null;

  const normalizedHeaders = Array.from(
    { length: columnCount },
    (_, index) => headers[index] || `欄位 ${index + 1}`
  );
  const normalizedRows = rows
    .filter((row) => row.some(Boolean))
    .map((row) =>
      Array.from({ length: columnCount }, (_, index) => row[index] || "")
    );

  if (!normalizedRows.length && !headers.length) return null;

  return {
    title: toText(rawTable.title ?? rawTable.name),
    headers: normalizedHeaders,
    rows: normalizedRows,
  };
};

export const normalizePptxChart = (rawChart) => {
  if (!rawChart || typeof rawChart !== "object" || Array.isArray(rawChart)) {
    return null;
  }

  const sourceSeries = Array.isArray(rawChart.series)
    ? rawChart.series
    : Array.isArray(rawChart.datasets)
      ? rawChart.datasets
      : [];
  const series = sourceSeries
    .slice(0, MAX_CHART_SERIES)
    .map((rawSeries, index) => {
      const rawValues = Array.isArray(rawSeries?.values)
        ? rawSeries.values
        : Array.isArray(rawSeries?.data)
          ? rawSeries.data
          : [];
      const values = rawValues
        .slice(0, MAX_CHART_LABELS)
        .map(toFiniteNumber);

      if (!values.some((value) => value !== null)) return null;

      return {
        name: toText(rawSeries?.name ?? rawSeries?.label) || `系列 ${index + 1}`,
        values,
      };
    })
    .filter(Boolean);
  const rawLabels = Array.isArray(rawChart.labels)
    ? rawChart.labels
    : Array.isArray(rawChart.categories)
      ? rawChart.categories
      : [];
  const labels = rawLabels
    .slice(0, MAX_CHART_LABELS)
    .map((label) => toText(label));
  const labelCount = Math.min(
    MAX_CHART_LABELS,
    Math.max(labels.length, ...series.map((item) => item.values.length), 0)
  );

  if (!series.length || labelCount === 0) return null;

  return {
    type:
      CHART_TYPE_ALIASES[
        toText(
          rawChart.type ?? rawChart.chart_type ?? rawChart.chartType
        ).toLowerCase()
      ] || "bar",
    title: toText(rawChart.title ?? rawChart.name),
    labels: Array.from(
      { length: labelCount },
      (_, index) => labels[index] || `項目 ${index + 1}`
    ),
    series: series.map((item) => ({
      name: item.name,
      values: Array.from(
        { length: labelCount },
        (_, index) => item.values[index] ?? 0
      ),
    })),
  };
};

export const getPptxTables = (scene) =>
  (Array.isArray(scene?.tables) ? scene.tables : [])
    .map(normalizePptxTable)
    .filter(Boolean)
    .slice(0, 1);

export const getPptxCharts = (scene) =>
  (Array.isArray(scene?.charts) ? scene.charts : [])
    .map(normalizePptxChart)
    .filter(Boolean)
    .slice(0, 1);

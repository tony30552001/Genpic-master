const MAX_TABLE_COLUMNS = 8;
const MAX_TABLE_ROWS = 10;
const MAX_CHART_LABELS = 12;
const MAX_CHART_SERIES = 4;
const PRESENTATION_SCHEMA_VERSION = 2;
const PRESENTATION_MAX_SLIDES = 10;

const LAYOUT_TYPES = new Set([
  "default",
  "title_content",
  "two_column",
  "table",
  "chart",
  "closing",
]);

const PRESENTATION_SLIDE_TYPES = new Set([
  "cover",
  "section",
  "content",
  "closing",
]);

const CHART_TYPE_ALIASES = Object.freeze({
  bar: "bar",
  column: "bar",
  line: "line",
  pie: "pie",
  doughnut: "doughnut",
  donut: "doughnut",
});

const toText = (value, fallback = "") =>
  value == null ? fallback : String(value).trim();

const normalizeTextArray = (value) =>
  Array.isArray(value)
    ? value.map((item) => toText(item)).filter(Boolean)
    : [];

const toFiniteNumber = (value) => {
  const number =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : null;
};

const normalizeLayoutType = (value) => {
  const layoutType = toText(value).toLowerCase();
  return LAYOUT_TYPES.has(layoutType) ? layoutType : "default";
};

const normalizeSlideType = (value) => {
  const slideType = toText(value).toLowerCase();
  return PRESENTATION_SLIDE_TYPES.has(slideType) ? slideType : "content";
};

const normalizeChartType = (value) =>
  CHART_TYPE_ALIASES[toText(value).toLowerCase()] || "bar";

const normalizeTable = (rawTable) => {
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
  const sourceRows = Array.isArray(rawTable.rows) ? rawTable.rows : [];
  const rows = sourceRows.slice(0, MAX_TABLE_ROWS).map((row) =>
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

const normalizeChart = (rawChart) => {
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
        name:
          toText(rawSeries?.name ?? rawSeries?.label) ||
          `系列 ${index + 1}`,
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
  const valueCount = Math.max(...series.map((item) => item.values.length), 0);
  const labelCount = Math.min(
    MAX_CHART_LABELS,
    Math.max(labels.length, valueCount)
  );

  if (!series.length || labelCount === 0) return null;

  return {
    type: normalizeChartType(rawChart.type ?? rawChart.chart_type ?? rawChart.chartType),
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

const normalizeDocumentScene = (scene, index = 0) => {
  const rawScene =
    scene && typeof scene === "object" && !Array.isArray(scene) ? scene : {};
  const rawSceneNumber = Number(rawScene.scene_number ?? rawScene.sceneNumber);
  const sceneDescription = toText(
    rawScene.scene_description ??
      rawScene.sceneDescription ??
      rawScene.description
  );
  const sceneTitle =
    toText(rawScene.scene_title ?? rawScene.sceneTitle) ||
    `場景 ${index + 1}`;
  const visualPrompt =
    toText(
      rawScene.visual_prompt ??
        rawScene.visualPrompt ??
        rawScene.prompt
    ) || sceneDescription;
  const tables = (Array.isArray(rawScene.tables)
    ? rawScene.tables
    : Array.isArray(rawScene.table_data)
      ? rawScene.table_data
      : [])
    .map(normalizeTable)
    .filter(Boolean)
    .slice(0, 1);
  const charts = (Array.isArray(rawScene.charts)
    ? rawScene.charts
    : Array.isArray(rawScene.chart_data)
      ? rawScene.chart_data
      : [])
    .map(normalizeChart)
    .filter(Boolean)
    .slice(0, 1);

  return {
    scene_number:
      Number.isInteger(rawSceneNumber) && rawSceneNumber > 0
        ? rawSceneNumber
        : index + 1,
    scene_title: sceneTitle,
    scene_description: sceneDescription,
    visual_prompt: visualPrompt,
    key_elements: normalizeTextArray(
      rawScene.key_elements ?? rawScene.keyElements
    ),
    mood: toText(rawScene.mood),
    source_text: toText(rawScene.source_text ?? rawScene.sourceText),
    bullet_points: normalizeTextArray(rawScene.bullet_points),
    speaker_notes: toText(rawScene.speaker_notes),
    layout_type: normalizeLayoutType(
      rawScene.layout_type ?? rawScene.layoutType
    ),
    tables,
    charts,
  };
};

const normalizePresentationSlide = (slide, index = 0) => {
  const rawSlide =
    slide && typeof slide === "object" && !Array.isArray(slide) ? slide : {};
  const rawSlideNumber = Number(rawSlide.slide_number);
  const title = toText(rawSlide.title) || `投影片 ${index + 1}`;
  const subtitle = toText(rawSlide.subtitle);
  const body = toText(rawSlide.body);
  const bullets = normalizeTextArray(rawSlide.bullets);
  const table = normalizeTable(rawSlide.table);
  const chart = normalizeChart(rawSlide.chart);

  return {
    slide_number:
      Number.isInteger(rawSlideNumber) && rawSlideNumber > 0
        ? rawSlideNumber
        : index + 1,
    slide_type: normalizeSlideType(
      rawSlide.slide_type
    ),
    title,
    subtitle,
    body,
    bullets,
    speaker_notes: toText(rawSlide.speaker_notes),
    source_excerpt: toText(rawSlide.source_excerpt),
    table,
    chart,
  };
};

const normalizePresentationSlides = (slides) =>
  (Array.isArray(slides) ? slides : [])
    .slice(0, PRESENTATION_MAX_SLIDES)
    .map((rawSlide, index) => {
      const slide = normalizePresentationSlide(rawSlide, index);
      const source =
        rawSlide && typeof rawSlide === "object" && !Array.isArray(rawSlide)
          ? rawSlide
          : {};
      const hasText = [
        source.title,
        source.subtitle,
        source.body,
        source.speaker_notes,
        source.source_excerpt,
      ].some((value) => toText(value).length > 0);

      return hasText || slide.bullets.length > 0 || slide.table || slide.chart
        ? slide
        : null;
    })
    .filter(Boolean)
    .map((slide, index) => ({
      ...slide,
      slide_number: index + 1,
    }));

module.exports = {
  CHART_TYPE_ALIASES,
  LAYOUT_TYPES,
  MAX_CHART_LABELS,
  MAX_CHART_SERIES,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  PRESENTATION_MAX_SLIDES,
  PRESENTATION_SLIDE_TYPES,
  PRESENTATION_SCHEMA_VERSION,
  normalizeChart,
  normalizeChartType,
  normalizeLayoutType,
  normalizeDocumentScene,
  normalizePresentationSlide,
  normalizePresentationSlides,
  normalizeSlideType,
  normalizeTable,
};

const PptxGenJS = require("pptxgenjs");
const { Automizer } = require("pptx-automizer");
const {
  normalizePresentationScene,
  normalizeChartType,
} = require("./presentationSchema");

const ROOT_TEMPLATE_NAME = "pixora-generated-template";
const MAX_SCENES = 10;
const COLORS = {
  title: "1E293B",
  body: "475569",
  accent: "6366F1",
  border: "CBD5E1",
  placeholder: "F8FAFC",
};

let rootTemplateBufferPromise;

const createRootTemplateBuffer = async () => {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "Pixora 智繪";
  pptx.addSlide().background = { color: "FFFFFF" };
  return pptx.write({ outputType: "nodebuffer" });
};

const getRootTemplateBuffer = () => {
  if (!rootTemplateBufferPromise) {
    rootTemplateBufferPromise = createRootTemplateBuffer();
  }
  return rootTemplateBufferPromise;
};

const toDataImage = (value) =>
  typeof value === "string" && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
    ? value
    : null;

const addTable = (slide, table, bounds) => {
  const titleHeight = table.title ? 0.28 : 0;
  const cellBorder = { color: COLORS.border, pt: 0.5 };
  const columnWidth = bounds.w / table.headers.length;
  const rows = [
    table.headers.map((text) => ({
      text,
      options: {
        bold: true,
        color: "FFFFFF",
        fill: { color: COLORS.accent },
        align: "center",
        valign: "mid",
        border: cellBorder,
      },
    })),
    ...table.rows.map((row) =>
      row.map((text) => ({
        text,
        options: {
          color: COLORS.body,
          valign: "mid",
          border: cellBorder,
        },
      }))
    ),
  ];

  if (table.title) {
    slide.addText(table.title, {
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: titleHeight,
      fontSize: 12,
      bold: true,
      color: COLORS.title,
      margin: 0,
    });
  }

  slide.addTable(rows, {
    x: bounds.x,
    y: bounds.y + titleHeight,
    w: bounds.w,
    h: Math.max(0.6, bounds.h - titleHeight),
    colW: Array.from({ length: table.headers.length }, () => columnWidth),
    rowH: 0.31,
    fontSize: 8,
    margin: 0.05,
    autoPage: false,
    valign: "mid",
  });
};

const addChart = (slide, chart, bounds, pptxGenJs) => {
  const chartType = normalizeChartType(chart.type);
  const isCircular = chartType === "pie" || chartType === "doughnut";

  slide.addChart(
    pptxGenJs.ChartType[chartType],
    chart.series.map((series) => ({
      name: series.name,
      labels: chart.labels,
      values: series.values,
    })),
    {
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      showTitle: Boolean(chart.title),
      title: chart.title,
      titleColor: COLORS.title,
      titleFontSize: 12,
      showLegend: chart.series.length > 1,
      legendPos: "b",
      legendFontSize: 8,
      chartColors: [COLORS.accent, "0EA5E9", "F59E0B", "10B981"],
      showValue: isCircular,
      showPercent: isCircular,
      catAxisLabelColor: COLORS.body,
      catAxisLabelFontSize: 8,
      valAxisLabelColor: COLORS.body,
      valAxisLabelFontSize: 8,
    }
  );
};

const addScene = (slide, pptxGenJs, scene) => {
  const tables = scene.tables || [];
  const charts = scene.charts || [];
  const hasNativeVisual = tables.length > 0 || charts.length > 0;
  const imageData = toDataImage(scene.generatedImage);
  const isContentOnlyLayout =
    !hasNativeVisual &&
    !imageData &&
    (scene.layout_type === "title_content" || scene.layout_type === "closing");
  const isClosingLayout = scene.layout_type === "closing";
  const bullets = scene.bullet_points.length > 0
    ? scene.bullet_points
    : scene.scene_description
      ? [scene.scene_description]
      : [];

  slide.addText(`${scene.scene_number}`, {
    x: 0.2,
    y: 0.15,
    w: 0.38,
    h: 0.38,
    fontSize: 10,
    bold: true,
    color: "FFFFFF",
    fill: { color: COLORS.accent },
    align: "center",
    valign: "mid",
    rectRadius: 0.05,
  });
  slide.addText(scene.scene_title, {
    x: isClosingLayout ? 0.6 : 0.68,
    y: 0.1,
    w: isClosingLayout ? 8.7 : 5.7,
    h: 0.6,
    fontSize: 20,
    bold: true,
    color: COLORS.title,
    align: isClosingLayout ? "center" : "left",
    valign: "mid",
  });

  if (bullets.length > 0) {
    slide.addText(
      bullets.map((text) => ({
        text,
        options: {
          bullet: { type: "bullet" },
          paraSpaceAfter: 6,
          color: COLORS.body,
        },
      })),
      {
        x: isContentOnlyLayout ? 0.6 : 0.3,
        y: 0.85,
        w: isContentOnlyLayout ? 8.8 : 5.5,
        h: 4.35,
        fontSize: 13,
        valign: "top",
        lineSpacingMultiple: 1.4,
        wrap: true,
      }
    );
  }

  const visualBounds = { x: 6, y: 0.8, w: 3.75, h: 4.45 };
  if (tables.length > 0 && charts.length > 0) {
    addTable(slide, tables[0], { ...visualBounds, h: 2.1 });
    addChart(slide, charts[0], { ...visualBounds, y: 3.08, h: 2.17 }, pptxGenJs);
  } else if (tables.length > 0) {
    addTable(slide, tables[0], visualBounds);
  } else if (charts.length > 0) {
    addChart(slide, charts[0], visualBounds, pptxGenJs);
  } else if (imageData) {
    slide.addImage({
      data: imageData,
      x: visualBounds.x,
      y: visualBounds.y,
      w: visualBounds.w,
      h: visualBounds.h,
    });
  } else if (!isContentOnlyLayout) {
    slide.addText("尚未生成配圖\n可在 Pixora 中生成或自行替換", {
      ...visualBounds,
      fontSize: 13,
      color: "64748B",
      align: "center",
      valign: "mid",
      margin: 0.2,
      fill: { color: COLORS.placeholder, transparency: 4 },
      line: { color: COLORS.border, pt: 1 },
    });
  }
};

const normalizeScenes = (scenes) =>
  scenes
    .slice(0, MAX_SCENES)
    .map((scene, index) => ({
      ...normalizePresentationScene(scene, index),
      ...(typeof scene?.generatedImage === "string"
        ? { generatedImage: scene.generatedImage }
        : {}),
    }))
    .filter((scene) => scene.scene_description.trim() || scene.visual_prompt.trim());

const generatePresentationPptx = async ({ scenes }) => {
  const normalizedScenes = normalizeScenes(scenes);
  if (normalizedScenes.length === 0) {
    throw new Error("沒有可匯出的投影片內容");
  }

  const rootTemplateBuffer = await getRootTemplateBuffer();
  const automizer = new Automizer({
    removeExistingSlides: true,
    autoImportSlideMasters: true,
    compression: 3,
    verbosity: 0,
  });

  automizer
    .loadRoot(rootTemplateBuffer)
    .load(rootTemplateBuffer, ROOT_TEMPLATE_NAME);

  normalizedScenes.forEach((scene) => {
    automizer.addSlide(ROOT_TEMPLATE_NAME, 1, (slide) => {
      slide.generate((pptxSlide, pptxGenJs) => {
        addScene(pptxSlide, pptxGenJs, scene);
      });
    });
  });

  const archive = await automizer.getJSZip();
  return archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 3 },
  });
};

module.exports = {
  generatePresentationPptx,
  normalizeScenes,
  toDataImage,
};

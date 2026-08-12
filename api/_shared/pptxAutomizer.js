const fs = require("fs");
const path = require("path");
const { Automizer, ModifyTextHelper } = require("pptx-automizer");
const {
  normalizeChartType,
  normalizePresentationSlides,
  PRESENTATION_MAX_SLIDES,
} = require("./presentationSchema");

const COMPANY_TEMPLATE_NAME = "pixora-company-template";
const COMPANY_TEMPLATE_PATH = path.resolve(
  __dirname,
  "../assets/2026_ppt_template_16.9.pptx"
);
const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const COLORS = {
  title: "1E293B",
  body: "475569",
  accent: "6366F1",
  border: "CBD5E1",
};

const getTemplateSlideNumber = (slide) => {
  if (slide.slide_type === "cover") return 1;
  if (slide.slide_type === "section") return 2;
  if (slide.slide_type === "closing") return 5;
  return slide.table || slide.chart ? 4 : 3;
};

const setNamedText = (slide, name, nameIndex, value) => {
  slide.modify((document) => {
    const matches = Array.from(document.getElementsByTagName("p:cNvPr"))
      .filter((element) => element.getAttribute("name") === name)
      .map((element) => element.parentNode?.parentNode)
      .filter(Boolean);
    const target = matches[nameIndex];
    if (!target) {
      throw new Error(`公司範本缺少文字元素：${name}（第 ${nameIndex + 1} 個）`);
    }
    ModifyTextHelper.setText(value || "")(target);
  });
};

const addTable = (slide, table, bounds) => {
  const titleHeight = table.title ? 0.28 : 0;
  const columnWidth = bounds.w / table.headers.length;
  const cellBorder = { color: COLORS.border, pt: 0.5 };
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
      fontSize: 11,
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
      titleFontSize: 11,
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

const addContent = (slide, presentationSlide) => {
  const hasVisual = Boolean(presentationSlide.table || presentationSlide.chart);
  const bodyText = presentationSlide.body.trim();
  const bullets = presentationSlide.bullets;
  const contentBounds = hasVisual
    ? { x: 0.8, y: 1.45, w: 4.45, h: 3.55 }
    : { x: 3.75, y: 1.55, w: 5.05, h: 3.5 };

  slide.generate((pptxSlide, generatedPptxGenJs) => {
    if (bullets.length > 0) {
      pptxSlide.addText(
        bullets.map((text) => ({
          text,
          options: {
            bullet: { type: "bullet" },
            paraSpaceAfterPt: 8,
            color: COLORS.body,
          },
        })),
        {
          ...contentBounds,
          fontSize: 14,
          valign: "top",
          breakLine: false,
          margin: 0.04,
          fit: "shrink",
          lineSpacingMultiple: 1.1,
        }
      );
    } else if (bodyText) {
      pptxSlide.addText(bodyText, {
        ...contentBounds,
        fontSize: 15,
        color: COLORS.body,
        valign: "top",
        margin: 0.04,
        fit: "shrink",
        breakLine: false,
      });
    }

    if (presentationSlide.table && presentationSlide.chart) {
      addTable(pptxSlide, presentationSlide.table, {
        x: 5.55,
        y: 1.5,
        w: 3.75,
        h: 1.85,
      });
      addChart(
        pptxSlide,
        presentationSlide.chart,
        { x: 5.55, y: 3.55, w: 3.75, h: 1.7 },
        generatedPptxGenJs
      );
    } else if (presentationSlide.table) {
      addTable(pptxSlide, presentationSlide.table, {
        x: 5.55,
        y: 1.5,
        w: 3.75,
        h: 3.7,
      });
    } else if (presentationSlide.chart) {
      addChart(
        pptxSlide,
        presentationSlide.chart,
        { x: 5.55, y: 1.5, w: 3.75, h: 3.7 },
        generatedPptxGenJs
      );
    }
  });
};

const applyCoverSlide = (slide, presentationSlide) => {
  setNamedText(slide, "TextBox 16", 0, presentationSlide.title);
  setNamedText(slide, "TextBox 17", 0, presentationSlide.subtitle);
  setNamedText(slide, "Date Placeholder 3", 0, "");
  setNamedText(slide, "Date Placeholder 3", 1, "");
};

const applySectionSlide = (slide, presentationSlide) => {
  setNamedText(slide, "TextBox 16", 0, presentationSlide.subtitle || "重點整理");
  setNamedText(slide, "TextBox 21", 0, presentationSlide.title);
};

const applyContentSlide = (slide, presentationSlide) => {
  setNamedText(slide, "Subtitle 2", 0, presentationSlide.title);
  setNamedText(slide, "Subtitle 2", 1, presentationSlide.subtitle);
};

const applyClosingSlide = (slide, presentationSlide) => {
  setNamedText(slide, "Text Placeholder 4", 0, presentationSlide.title || "謝謝聆聽");
  setNamedText(slide, "Date Placeholder 3", 0, "");
};

const applySlideContent = (slide, presentationSlide) => {
  switch (presentationSlide.slide_type) {
    case "cover":
      applyCoverSlide(slide, presentationSlide);
      return;
    case "section":
      applySectionSlide(slide, presentationSlide);
      return;
    case "closing":
      applyClosingSlide(slide, presentationSlide);
      return;
    default:
      applyContentSlide(slide, presentationSlide);
      addContent(slide, presentationSlide);
  }
};

const generatePresentationPptx = async ({ slides }) => {
  if (!fs.existsSync(COMPANY_TEMPLATE_PATH)) {
    throw new Error(`找不到公司簡報範本：${COMPANY_TEMPLATE_PATH}`);
  }

  const normalizedSlides = normalizePresentationSlides(slides);
  if (normalizedSlides.length === 0) {
    throw new Error("沒有可匯出的投影片內容");
  }
  if (normalizedSlides.length > PRESENTATION_MAX_SLIDES) {
    throw new Error(`投影片數量不可超過 ${PRESENTATION_MAX_SLIDES} 張`);
  }

  const automizer = new Automizer({
    removeExistingSlides: true,
    autoImportSlideMasters: true,
    compression: 3,
    verbosity: 0,
  });

  automizer
    .loadRoot(COMPANY_TEMPLATE_PATH)
    .load(COMPANY_TEMPLATE_PATH, COMPANY_TEMPLATE_NAME);

  normalizedSlides.forEach((presentationSlide) => {
    const templateSlideNumber = getTemplateSlideNumber(presentationSlide);
    automizer.addSlide(
      COMPANY_TEMPLATE_NAME,
      templateSlideNumber,
      (slide) => {
        applySlideContent(slide, presentationSlide);
      }
    );
  });

  const archive = await automizer.getJSZip();
  return archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 3 },
  });
};

module.exports = {
  COMPANY_TEMPLATE_PATH,
  COMPANY_TEMPLATE_NAME,
  PPTX_CONTENT_TYPE,
  generatePresentationPptx,
};

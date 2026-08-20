const { generateJson } = require("./llmRuntime");
const pptMaster = require("./pptMasterClient");
const {
  DECK_MAX_REPAIR_ROUNDS,
  inspectSlideSvg,
  normalizeOutline,
  slideFileName,
} = require("./deckContract");
const {
  buildAuthoringSystemPrompt,
  buildOutlineSystemPrompt,
  buildRepairUserMessage,
  buildSlideUserMessage,
} = require("./svgAuthoringPrompt");

const SOURCE_EXCERPT_LIMIT = 60000;

const stripSvgWrapper = (value) => {
  const text = String(value || "").trim();
  const fenced = text.match(/```(?:svg|xml)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("<svg");
  const end = candidate.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return candidate;
  return candidate.slice(start, end + "</svg>".length).trim();
};

const generateOutline = async ({ topic, sourceMarkdown, slideCount, llm }) => {
  const material = sourceMarkdown
    ? `素材內容：\n${sourceMarkdown.slice(0, SOURCE_EXCERPT_LIMIT)}`
    : `簡報主題：${topic}\n請依據這個主題自行建構完整、具體且有實質內容的簡報論述。`;

  const outline = await generateJson({
    systemMessage: buildOutlineSystemPrompt(),
    userMessage: `${material}\n\n請規劃 ${slideCount} 頁的簡報大綱。`,
    maxOutputTokens: 16000,
    llm,
  });

  const normalized = normalizeOutline(outline, { slideCount });
  if (normalized.slides.length === 0) {
    throw new Error("AI 未能產生簡報大綱，請調整主題或更換文件");
  }
  return normalized;
};

const authorSlideSvg = async ({ systemMessage, userMessage, llm }) => {
  const result = await generateJson({
    systemMessage,
    userMessage,
    maxOutputTokens: 16000,
    llm,
  });
  const svg = stripSvgWrapper(result?.svg ?? result?.content ?? "");
  if (!svg.startsWith("<svg")) {
    throw new Error("AI 未回傳有效的 SVG 內容");
  }
  return svg;
};

const collectSlideProblems = (report, fileName) => {
  const entry = (report?.files || []).find((file) => file.file === fileName);
  const problems = [...(entry?.errors || [])];
  if (Array.isArray(report?.projectIssues)) {
    problems.push(...report.projectIssues.filter((issue) => String(issue).includes(fileName)));
  }
  return problems;
};

/**
 * Author every slide, then repair rejected slides using the Python quality
 * gate's own error strings until the whole roster passes.
 */
const authorDeck = async ({
  deckId,
  outline,
  systemMessage,
  imagesBySlide = {},
  onProgress,
  onSlidePreview,
  llm,
}) => {
  const totalSlides = outline.slides.length;
  const authored = [];

  await onProgress?.({
    step: "slides",
    detail: `逐頁設計版面，共 ${totalSlides} 頁`,
    current: 0,
    total: totalSlides,
  });

  for (const [index, slide] of outline.slides.entries()) {
    await onProgress?.({
      step: "slides",
      slideNumber: slide.slide_number,
      detail: `設計第 ${slide.slide_number} 頁：${slide.title}`,
      current: index,
      total: totalSlides,
    });

    const fileName = slideFileName(index);
    const availableImages = imagesBySlide[slide.slide_number] || [];
    let svg = await authorSlideSvg({
      systemMessage,
      llm,
      userMessage: buildSlideUserMessage({
        deckTitle: outline.title,
        slide,
        totalSlides,
        availableImages,
      }),
    });

    let localProblems = inspectSlideSvg(svg);
    let attempt = 0;
    while (localProblems.length > 0 && attempt < DECK_MAX_REPAIR_ROUNDS) {
      attempt += 1;
      svg = await authorSlideSvg({
        systemMessage,
        llm,
        userMessage: buildRepairUserMessage({
          slide,
          previousSvg: svg,
          problems: localProblems,
        }),
      });
      localProblems = inspectSlideSvg(svg);
    }
    if (localProblems.length > 0) {
      await onProgress?.({
        step: "slides",
        status: "failed",
        slideNumber: slide.slide_number,
        detail: `第 ${slide.slide_number} 頁不符合 SVG 規範`,
      });
      throw new Error(
        `第 ${slide.slide_number} 頁不符合 SVG 規範：${localProblems.join("；")}`
      );
    }

    await pptMaster.writeSlide({ deckId, name: fileName, content: svg });
    authored.push({ slide, fileName, svg });
    await onSlidePreview?.({
      slideNumber: slide.slide_number,
      title: slide.title,
      svg,
    });

    await onProgress?.({
      step: "slides",
      status: "succeeded",
      slideNumber: slide.slide_number,
      detail:
        attempt > 0
          ? `第 ${slide.slide_number} 頁完成（自我修正 ${attempt} 次）`
          : `第 ${slide.slide_number} 頁完成`,
      current: index + 1,
      total: totalSlides,
    });
  }

  await onProgress?.({
    step: "slides",
    status: "succeeded",
    detail: `${totalSlides} 頁版面完成`,
    current: totalSlides,
    total: totalSlides,
  });

  await onProgress?.({
    step: "quality",
    detail: "版面品質檢查",
    current: totalSlides,
    total: totalSlides,
  });

  let report = await pptMaster.checkDeck({ deckId });
  for (let round = 1; round <= DECK_MAX_REPAIR_ROUNDS && !report.passed; round += 1) {
    const failing = authored.filter(
      (item) => collectSlideProblems(report, item.fileName).length > 0
    );
    if (failing.length === 0) break;

    await onProgress?.({
      step: "quality",
      detail: `修正 ${failing.length} 頁（第 ${round} 輪）`,
      current: totalSlides,
      total: totalSlides,
    });

    for (const item of failing) {
      const problems = collectSlideProblems(report, item.fileName);
      const repaired = await authorSlideSvg({
        systemMessage,
        llm,
        userMessage: buildRepairUserMessage({
          slide: item.slide,
          previousSvg: item.svg,
          problems,
        }),
      });
      item.svg = repaired;
      await pptMaster.writeSlide({ deckId, name: item.fileName, content: repaired });
      await onSlidePreview?.({
        slideNumber: item.slide.slide_number,
        title: item.slide.title,
        svg: repaired,
      });
      await onProgress?.({
        step: "quality",
        status: "succeeded",
        slideNumber: item.slide.slide_number,
        detail: `第 ${item.slide.slide_number} 頁已修正（第 ${round} 輪）`,
      });
    }

    report = await pptMaster.checkDeck({ deckId });
  }

  if (!report.passed) {
    const details = (report.files || [])
      .filter((file) => (file.errors || []).length > 0)
      .map((file) => `${file.file}: ${file.errors[0]}`)
      .slice(0, 3)
      .join("；");
    throw new Error(`投影片品質檢查未通過：${details || "未知錯誤"}`);
  }

  await onProgress?.({
    step: "quality",
    status: "succeeded",
    detail: "全部通過品質檢查",
  });

  return { report, slideCount: authored.length };
};

module.exports = {
  authorDeck,
  buildAuthoringSystemPrompt,
  generateOutline,
  stripSvgWrapper,
};

const { generateJson } = require("./llmRuntime");
const pptMaster = require("./pptMasterClient");
const {
  DECK_MAX_REPAIR_ROUNDS,
  applyImagePolicy,
  inspectSlideSvg,
  normalizeOutline,
  slideFileName,
} = require("./deckContract");
const {
  DEFAULT_DESIGN_SYSTEM,
  buildDesignSystemPrompt,
  buildDesignSystemUserMessage,
  normalizeDesignSystem,
} = require("./deckDesign");
const {
  buildAuthoringSystemPrompt,
  buildOutlineSystemPrompt,
  buildOutlineUserMessage,
  buildRepairUserMessage,
  buildSlideUserMessage,
} = require("./svgAuthoringPrompt");
const { buildRecipePlan } = require("./deckRecipes");

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

const generateOutline = async ({
  topic,
  sourceMarkdown,
  slideCount,
  imageDensity,
  templateSpecs,
  recipeId,
  brief,
  llm,
}) => {
  const material = sourceMarkdown
    ? `素材內容：\n${sourceMarkdown.slice(0, SOURCE_EXCERPT_LIMIT)}`
    : `簡報主題：${topic}\n請依據這個主題自行建構完整、具體且有實質內容的簡報論述。`;

  const outline = await generateJson({
    systemMessage: buildOutlineSystemPrompt({ imageDensity, recipeId, slideCount }),
    userMessage: buildOutlineUserMessage({ material, slideCount, templateSpecs, brief }),
    maxOutputTokens: 16000,
    llm,
  });

  const normalized = normalizeOutline(outline, {
    slideCount,
    spine: buildRecipePlan(recipeId, slideCount),
  });
  if (normalized.slides.length === 0) {
    throw new Error("AI 未能產生簡報大綱，請調整主題或更換文件");
  }
  return applyImagePolicy({ outline: normalized, density: imageDensity });
};

/**
 * The deck's visual constitution.
 *
 * Pages are authored one call at a time and page 7 never sees page 6, so
 * without a shared palette, type scale and grid a free-form deck arrives as a
 * set of individually pleasant but unrelated slides. This step is what makes
 * them one document.
 *
 * It never fails the job: a deck built on the default system is worth far more
 * than no deck, so a failure is recorded as an event and the default is used.
 */
const generateDesignSystem = async ({ outline, templateSpecs, brief, llm, onProgress }) => {
  try {
    const raw = await generateJson({
      systemMessage: buildDesignSystemPrompt({ templateSpecs }),
      userMessage: buildDesignSystemUserMessage({
        deckTitle: outline.title,
        summary: outline.summary,
        slides: outline.slides,
        brief,
      }),
      maxOutputTokens: 4000,
      llm,
    });
    const designSystem = normalizeDesignSystem(raw);
    await onProgress?.({
      step: "design",
      status: "succeeded",
      detail: `設計系統：${designSystem.name}`,
    });
    return designSystem;
  } catch (error) {
    await onProgress?.({
      step: "design",
      status: "failed",
      detail: `設計系統建立失敗，改用預設樣式：${error.message}`,
    });
    return DEFAULT_DESIGN_SYSTEM;
  }
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
 * One page: author it, then repair it against the local contract until it
 * passes or the rounds run out. Returns the remaining problems rather than
 * throwing so the caller can decide whether to retreat to fixed geometry.
 */
const authorSlideWithRepair = async ({
  systemMessage,
  llm,
  deckTitle,
  slide,
  totalSlides,
  availableImages,
  frameGeometry,
}) => {
  let svg = await authorSlideSvg({
    systemMessage,
    llm,
    userMessage: buildSlideUserMessage({
      deckTitle,
      slide,
      totalSlides,
      availableImages,
      frameGeometry,
    }),
  });

  let problems = inspectSlideSvg(svg);
  let attempts = 0;
  while (problems.length > 0 && attempts < DECK_MAX_REPAIR_ROUNDS) {
    attempts += 1;
    svg = await authorSlideSvg({
      systemMessage,
      llm,
      userMessage: buildRepairUserMessage({
        slide,
        previousSvg: svg,
        problems,
        frameGeometry,
      }),
    });
    problems = inspectSlideSvg(svg);
  }

  return { svg, attempts, problems };
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
    let { svg, attempts, problems } = await authorSlideWithRepair({
      systemMessage,
      llm,
      deckTitle: outline.title,
      slide,
      totalSlides,
      availableImages,
      frameGeometry: false,
    });

    /**
     * The retreat. Free-form layout is the default because it produces better
     * pages, but a page that cannot satisfy the compiler contract after a full
     * repair loop gets rebuilt on the frame's pre-solved bounds instead of
     * failing the whole deck. The event is deliberately visible: a rising
     * retreat rate is the signal that the inversion is not working.
     */
    let retreated = false;
    if (problems.length > 0) {
      retreated = true;
      await onProgress?.({
        step: "slides",
        slideNumber: slide.slide_number,
        detail: `第 ${slide.slide_number} 頁自由版面未通過，改用固定骨架 ${slide.frame} 重新產生`,
        current: index,
        total: totalSlides,
      });

      const fallback = await authorSlideWithRepair({
        systemMessage,
        llm,
        deckTitle: outline.title,
        slide,
        totalSlides,
        availableImages,
        frameGeometry: true,
      });
      svg = fallback.svg;
      attempts += fallback.attempts + 1;
      problems = fallback.problems;
    }

    if (problems.length > 0) {
      await onProgress?.({
        step: "slides",
        status: "failed",
        slideNumber: slide.slide_number,
        detail: `第 ${slide.slide_number} 頁不符合 SVG 規範`,
      });
      throw new Error(
        `第 ${slide.slide_number} 頁不符合 SVG 規範：${problems.join("；")}`
      );
    }

    await pptMaster.writeSlide({ deckId, name: fileName, content: svg });
    authored.push({ slide, fileName, svg, retreated });
    await onSlidePreview?.({
      slideNumber: slide.slide_number,
      title: slide.title,
      svg,
    });

    await onProgress?.({
      step: "slides",
      status: "succeeded",
      slideNumber: slide.slide_number,
      detail: retreated
        ? `第 ${slide.slide_number} 頁完成（已退回固定骨架）`
        : attempts > 0
          ? `第 ${slide.slide_number} 頁完成（自我修正 ${attempts} 次）`
          : `第 ${slide.slide_number} 頁完成`,
      current: index + 1,
      total: totalSlides,
    });
  }

  const retreatedCount = authored.filter((item) => item.retreated).length;
  await onProgress?.({
    step: "slides",
    status: "succeeded",
    detail:
      retreatedCount > 0
        ? `${totalSlides} 頁版面完成（其中 ${retreatedCount} 頁退回固定骨架）`
        : `${totalSlides} 頁版面完成`,
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
          frameGeometry: item.retreated,
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
  generateDesignSystem,
  generateOutline,
  stripSvgWrapper,
};

const TEMPLATE_CONTEXT_VERSION = 1;

const TEMPLATE_DEFINITIONS = Object.freeze({
  infographic: Object.freeze({
    title: "資訊圖引擎",
    purpose: "infographic",
    moduleCounts: Object.freeze([3, 4, 5, 6]),
    informationFlows: Object.freeze(["橫向流程", "縱向時間線", "放射中心", "矩陣對比"]),
    guidance: Object.freeze([
      "以清楚的視覺層級呈現每個模組，讓讀者快速理解重點。",
      "讓標題、關鍵數字與輔助說明有明確的閱讀順序。",
    ]),
    pitfalls: Object.freeze([
      "避免長段正文塞入畫面。",
      "模組數不可超過設定值。",
    ]),
  }),
  poster: Object.freeze({
    title: "敘事海報",
    purpose: "freeform",
    moduleCounts: Object.freeze([1, 2, 3, 4]),
    informationFlows: Object.freeze(["主視覺聚焦", "上標下圖", "中心構圖", "留白平衡"]),
    guidance: Object.freeze([
      "保持單一視覺焦點，讓標題與主訊息有足夠留白。",
      "用大小、位置與對比建立一眼可讀的訊息層級。",
    ]),
    pitfalls: Object.freeze([
      "避免把多個平等訊息堆成資訊牆。",
      "避免裝飾元素搶過主訊息。",
    ]),
  }),
  product: Object.freeze({
    title: "商品展示",
    purpose: "freeform",
    moduleCounts: Object.freeze([2, 3, 4, 5]),
    informationFlows: Object.freeze(["主體＋細節", "情境展示", "正面主視覺", "材質拆解"]),
    guidance: Object.freeze([
      "優先呈現產品輪廓、材質與使用情境，背景保持克制。",
      "讓產品主體與細節說明形成清晰的視覺關係。",
    ]),
    pitfalls: Object.freeze([
      "避免裝飾元素搶過產品主體。",
      "避免讓背景細節模糊產品輪廓。",
    ]),
  }),
  storyboard: Object.freeze({
    title: "電影分鏡",
    purpose: "storyboard",
    moduleCounts: Object.freeze([3, 4, 5, 6]),
    informationFlows: Object.freeze(["鏡頭序列", "三幕節奏", "平行剪接", "情緒遞進"]),
    guidance: Object.freeze([
      "以鏡位、景別與動作交代場景節奏，保持敘事連續。",
      "讓每個畫面都能獨立表達一個可辨識的故事節點。",
    ]),
    pitfalls: Object.freeze([
      "避免把分鏡做成沒有動作關係的靜態拼貼。",
      "避免同一場景的鏡位與角色位置突然跳動。",
    ]),
  }),
});

class TemplateContextError extends Error {
  constructor(message) {
    super(message);
    this.name = "TemplateContextError";
    this.code = "invalid_template_context";
    this.status = 400;
  }
}

const assertStringArray = (value, fieldName) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw new TemplateContextError(`${fieldName} 必須是 1-4 項文字陣列`);
  }

  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0 || item.length > 240) {
      throw new TemplateContextError(`${fieldName} 包含無效文字`);
    }
    return item.trim();
  });
};

const normalizeTemplateContext = (value) => {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TemplateContextError("templateContext 必須是物件");
  }
  if (value.version !== TEMPLATE_CONTEXT_VERSION) {
    throw new TemplateContextError("templateContext 版本不受支援");
  }

  const templateId = typeof value.id === "string" ? value.id.trim() : "";
  if (!Object.hasOwn(TEMPLATE_DEFINITIONS, templateId)) {
    throw new TemplateContextError("templateContext 含有不受支援的範本");
  }
  const definition = TEMPLATE_DEFINITIONS[templateId];
  if (value.outputType !== undefined && value.outputType !== templateId) {
    throw new TemplateContextError("templateContext outputType 與範本不一致");
  }
  if (
    !Number.isInteger(value.moduleCount) ||
    !definition.moduleCounts.includes(value.moduleCount)
  ) {
    throw new TemplateContextError("templateContext moduleCount 不受支援");
  }
  if (
    typeof value.informationFlow !== "string" ||
    !definition.informationFlows.includes(value.informationFlow)
  ) {
    throw new TemplateContextError("templateContext informationFlow 不受支援");
  }

  const guidance = assertStringArray(value.guidance, "templateContext guidance");
  const pitfalls = assertStringArray(value.pitfalls, "templateContext pitfalls");
  if (guidance.join("").length + pitfalls.join("").length > 1600) {
    throw new TemplateContextError("templateContext 規則內容過長");
  }

  return {
    version: TEMPLATE_CONTEXT_VERSION,
    id: templateId,
    outputType: templateId,
    title: definition.title,
    purpose: definition.purpose,
    moduleCount: value.moduleCount,
    informationFlow: value.informationFlow,
    guidance,
    pitfalls,
  };
};

const buildTemplateInstruction = (value) => {
  const context = normalizeTemplateContext(value);
  if (!context) return "";

  return [
    `Follow the "${context.title}" output structure.`,
    `Organize the content into exactly ${context.moduleCount} visual modules or story beats.`,
    `Use a ${context.informationFlow} information flow.`,
    `Structure requirements: ${context.guidance.join(" ")}`,
    `Avoid these pitfalls: ${context.pitfalls.join(" ")}`,
  ].join(" ");
};

module.exports = {
  TEMPLATE_CONTEXT_VERSION,
  TEMPLATE_DEFINITIONS,
  TemplateContextError,
  normalizeTemplateContext,
  buildTemplateInstruction,
};

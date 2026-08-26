/**
 * Sample outline used to preview every design template.
 *
 * The wording is identical for every template on purpose: when the content is
 * held constant, the only thing that can differ between two previews is the
 * design language itself. That is exactly what the picker is asking the user
 * to choose.
 *
 * Two pages, because one is not enough to show how a template treats a cover
 * versus a working content page, and three would triple the cost of a full
 * catalogue run for no extra information.
 */
const PREVIEW_OUTLINE = {
  title: "2026 年度營運策略",
  slides: [
    {
      slide_number: 1,
      page_role: "cover",
      title: "2026 年度營運策略",
      subtitle: "從規模成長轉向獲利品質",
      key_points: [],
      speaker_notes: "",
      needs_image: false,
      image_prompt: "",
    },
    {
      slide_number: 2,
      page_role: "content",
      title: "三個市場的營收結構",
      subtitle: "雲端服務已成為主要成長引擎",
      key_points: [
        "雲端服務營收年增 58%，占整體比重首次過半",
        "硬體維持穩定，但毛利率較去年下滑 2.4 個百分點",
        "顧問服務規模最小，卻貢獻最高的單位獲利",
      ],
      speaker_notes: "",
      chart: {
        type: "column",
        title: "各事業群營收（億元）",
        categories: ["雲端服務", "硬體", "顧問服務"],
        series: [
          { name: "2025", values: [42, 38, 11] },
          { name: "2026", values: [66, 39, 15] },
        ],
      },
      needs_image: false,
      image_prompt: "",
    },
  ],
};

module.exports = { PREVIEW_OUTLINE };

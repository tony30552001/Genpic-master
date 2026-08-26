/**
 * 產生檔，請勿手動編輯。
 *
 * 由 `node api/scripts/generate-style-previews.cjs` 依真實產生流程輸出。
 * 升級 PPT_MASTER_VERSION、改動設計系統或骨架之後必須重跑，否則預覽會與實際產出脫節。
 */
export const TEMPLATE_PREVIEWS = {
  styles: {
    "academic-research": ["/template-previews/styles/academic-research-1.svg","/template-previews/styles/academic-research-2.svg"],
    "consulting-decision": ["/template-previews/styles/consulting-decision-1.svg","/template-previews/styles/consulting-decision-2.svg"],
    "creative-pitch": ["/template-previews/styles/creative-pitch-1.svg","/template-previews/styles/creative-pitch-2.svg"],
    "incident-postmortem": ["/template-previews/styles/incident-postmortem-1.svg","/template-previews/styles/incident-postmortem-2.svg"],
    "investor-pitch": ["/template-previews/styles/investor-pitch-1.svg","/template-previews/styles/investor-pitch-2.svg"],
    "narrative-keynote": ["/template-previews/styles/narrative-keynote-1.svg","/template-previews/styles/narrative-keynote-2.svg"],
    "operating-review": ["/template-previews/styles/operating-review-1.svg","/template-previews/styles/operating-review-2.svg"],
    "product-launch": ["/template-previews/styles/product-launch-1.svg","/template-previews/styles/product-launch-2.svg"],
    "science-explainer": ["/template-previews/styles/science-explainer-1.svg","/template-previews/styles/science-explainer-2.svg"],
    "solution-proposal": ["/template-previews/styles/solution-proposal-1.svg","/template-previews/styles/solution-proposal-2.svg"],
    "technical-deepdive": ["/template-previews/styles/technical-deepdive-1.svg","/template-previews/styles/technical-deepdive-2.svg"],
    "workshop-teaching": ["/template-previews/styles/workshop-teaching-1.svg","/template-previews/styles/workshop-teaching-2.svg"],
  },
  layouts: {

  },
};

export const describeTemplatePreview = (kind, templateId) =>
  TEMPLATE_PREVIEWS[kind]?.[templateId] || [];

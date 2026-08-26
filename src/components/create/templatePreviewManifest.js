/**
 * 產生檔，請勿手動編輯。
 *
 * 由 `node api/scripts/generate-style-previews.cjs` 依真實產生流程輸出。
 * 升級 PPT_MASTER_VERSION、改動設計系統或骨架之後必須重跑，否則預覽會與實際產出脫節。
 */
export const TEMPLATE_PREVIEWS = {
  styles: {
  },
  layouts: {
  },
};

export const describeTemplatePreview = (kind, templateId) =>
  TEMPLATE_PREVIEWS[kind]?.[templateId] || [];

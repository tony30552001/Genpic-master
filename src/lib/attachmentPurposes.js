/**
 * How the creation workspace uses an attached image.
 *
 * `reference` sends the image to generate-images as content reference; every
 * other purpose is an image-transform mode that edits the attachment and keeps
 * its aspect ratio. The purpose id doubles as the history source of transforms.
 */
export const REFERENCE_PURPOSE = "reference";
export const STYLE_TRANSFER_PURPOSE = "style_transfer";

export const ATTACHMENT_PURPOSES = [
  {
    id: REFERENCE_PURPOSE,
    label: "參考內容",
    fieldLabel: "內容描述",
    placeholder: "描述要生成的畫面，內容圖作為參考\n例如：同一瓶飲料放在大理石桌上",
    buttonText: "開始生成圖片",
    requiresPrompt: true,
    keepsSourceAspectRatio: false,
    usesStyle: true,
  },
  {
    id: "refine",
    label: "修改這張",
    fieldLabel: "要修改的地方",
    placeholder: "描述要修改的地方\n例如：衣服改成黃色",
    buttonText: "修改這張",
    requiresPrompt: true,
    keepsSourceAspectRatio: true,
    usesStyle: false,
  },
  {
    id: "bg_replace",
    label: "換背景",
    fieldLabel: "新的背景",
    placeholder: "描述新的背景\n例如：日落海邊",
    buttonText: "換背景",
    requiresPrompt: false,
    keepsSourceAspectRatio: true,
    usesStyle: true,
  },
  {
    id: "element_extract",
    label: "取出元素",
    fieldLabel: "要取出的元素與新場景",
    placeholder: "描述要取出的主體與新場景\n例如：角色放到星空中",
    buttonText: "取出元素",
    requiresPrompt: false,
    keepsSourceAspectRatio: true,
    usesStyle: true,
  },
  {
    id: STYLE_TRANSFER_PURPOSE,
    label: "套用風格到內容圖",
    fieldLabel: "想要的畫風",
    placeholder: "描述想要的畫風\n例如：日式水彩，柔和色調",
    buttonText: "套用風格",
    requiresPrompt: false,
    keepsSourceAspectRatio: true,
    usesStyle: true,
  },
];

/** Purposes offered next to the attachment; style transfer lives under the advanced style section. */
export const PRIMARY_ATTACHMENT_PURPOSES = ATTACHMENT_PURPOSES.filter(
  (purpose) => purpose.id !== STYLE_TRANSFER_PURPOSE
);

export const getAttachmentPurpose = (id) =>
  ATTACHMENT_PURPOSES.find((purpose) => purpose.id === id) || ATTACHMENT_PURPOSES[0];

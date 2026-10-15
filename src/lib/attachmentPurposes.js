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
    placeholder: "描述要生成的畫面，附圖會作為內容參考…\n例如：同一瓶飲料放在大理石桌面上，晨光從左側照入",
    buttonText: "開始生成圖片",
    requiresPrompt: true,
    keepsSourceAspectRatio: false,
    usesStyle: true,
  },
  {
    id: "refine",
    label: "修改這張",
    fieldLabel: "要修改的地方",
    placeholder: "描述要修改的地方，其他部分會保持不變…\n例如：把行人的衣服改成黃色",
    buttonText: "修改這張",
    requiresPrompt: true,
    keepsSourceAspectRatio: true,
    usesStyle: false,
  },
  {
    id: "bg_replace",
    label: "換背景",
    fieldLabel: "新的背景",
    placeholder: "描述新的背景，前景主體會保持不變…\n例如：換成日落海邊，橙紅色天空",
    buttonText: "換背景",
    requiresPrompt: false,
    keepsSourceAspectRatio: true,
    usesStyle: true,
  },
  {
    id: "element_extract",
    label: "取出元素",
    fieldLabel: "要取出的元素與新場景",
    placeholder: "描述要取出的主體與要放進的新場景…\n例如：把角色放到宇宙星空中",
    buttonText: "取出元素",
    requiresPrompt: false,
    keepsSourceAspectRatio: true,
    usesStyle: true,
  },
  {
    id: STYLE_TRANSFER_PURPOSE,
    label: "套用風格到附圖",
    fieldLabel: "想要的畫風",
    placeholder: "描述想要的畫風，內容與構圖會保持不變…\n例如：日式水彩插畫，柔和色調",
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

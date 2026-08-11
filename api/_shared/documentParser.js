const {
  formatFromBytes,
  formatFromExtension,
  toMarkdownBytes,
} = require("@firecrawl/anydoc");

const EXTENSION_MIME_TYPES = Object.freeze({
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  docm: "application/vnd.ms-word.document.macroEnabled.12",
  ppt: "application/vnd.ms-powerpoint",
  pps: "application/vnd.ms-powerpoint",
  pot: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
  ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  ppsm: "application/vnd.ms-powerpoint.slideshow.macroEnabled.12",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  epub: "application/epub+zip",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
});

const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXTENSION_MIME_TYPES));
const SUPPORTED_MIME_TYPES = new Set(Object.values(EXTENSION_MIME_TYPES));
const TEXT_EXTENSIONS = new Set(["txt", "md"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);

class DocumentConversionError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "DocumentConversionError";
    this.code = code;
    this.status = status;
  }
}

const getExtension = (fileName) => {
  if (!fileName || typeof fileName !== "string" || !fileName.includes(".")) {
    return "";
  }
  return fileName.toLowerCase().split(".").pop();
};

const inferMimeType = (fileName) =>
  EXTENSION_MIME_TYPES[getExtension(fileName)] || "application/octet-stream";

const isSupportedDocument = (mimeType, fileName) => {
  const extension = getExtension(fileName);
  return SUPPORTED_EXTENSIONS.has(extension) || SUPPORTED_MIME_TYPES.has(mimeType);
};

const mapAnyDocError = (conversionError) => {
  const detail = conversionError?.message ? `：${conversionError.message}` : "";
  switch (conversionError?.code) {
    case "encrypted":
      return new DocumentConversionError(
        `文件已加密或受密碼保護，請先解除保護後再上傳${detail}`,
        "document_encrypted",
        422
      );
    case "malformed":
    case "missingPart":
      return new DocumentConversionError(
        `文件結構損毀或缺少必要內容${detail}`,
        "document_malformed",
        422
      );
    case "resourceLimit":
      return new DocumentConversionError(
        `文件解壓或結構超過安全限制${detail}`,
        "document_resource_limit",
        413
      );
    case "unsupported":
      return new DocumentConversionError(
        `文件內容無法由 AnyDoc 解析${detail}`,
        "document_unsupported",
        415
      );
    case "io":
      return new DocumentConversionError(
        `讀取文件失敗${detail}`,
        "document_read_failed",
        502
      );
    default:
      return new DocumentConversionError(
        `AnyDoc 文件轉換失敗${detail}`,
        "document_conversion_failed",
        500
      );
  }
};

const resolveFormat = (buffer, extension, mimeType) => {
  if (extension) {
    const extensionFormat = formatFromExtension(extension);
    if (extensionFormat) return extensionFormat;
  }

  const detectedFormat = formatFromBytes(buffer);
  if (detectedFormat) return detectedFormat;

  if (mimeType === "text/csv") return "csv";
  return null;
};

const parseDocumentBuffer = async ({ buffer, fileName, mimeType }) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new DocumentConversionError(
      "文件內容為空",
      "document_empty",
      422
    );
  }

  const extension = getExtension(fileName);
  const resolvedMimeType =
    mimeType && mimeType !== "application/octet-stream"
      ? mimeType
      : inferMimeType(fileName);

  if (TEXT_EXTENSIONS.has(extension) || (!extension && resolvedMimeType === "text/plain")) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    if (!text.trim()) {
      throw new DocumentConversionError(
        "文字文件沒有可分析的內容",
        "document_empty",
        422
      );
    }
    return {
      kind: "text",
      text,
      format: extension || "txt",
      parser: "plain_text",
      mimeType: resolvedMimeType,
    };
  }

  if (IMAGE_EXTENSIONS.has(extension) || resolvedMimeType.startsWith("image/")) {
    return {
      kind: "vision",
      buffer,
      format: extension || resolvedMimeType,
      parser: "gpt_vision",
      mimeType: resolvedMimeType,
    };
  }

  const format = resolveFormat(buffer, extension, resolvedMimeType);
  if (!format) {
    throw new DocumentConversionError(
      "無法辨識文件格式",
      "document_unsupported",
      415
    );
  }

  try {
    const markdown = await toMarkdownBytes(buffer, format);
    if (!markdown.trim()) {
      throw new DocumentConversionError(
        "AnyDoc 未從文件中擷取到可分析內容",
        "document_empty",
        422
      );
    }
    return {
      kind: "text",
      text: markdown,
      format,
      parser: "anydoc",
      mimeType: resolvedMimeType,
    };
  } catch (conversionError) {
    if (format === "pdf" && conversionError?.code === "unsupported") {
      return {
        kind: "vision",
        buffer,
        format,
        parser: "gpt_vision",
        mimeType: "application/pdf",
      };
    }
    if (conversionError instanceof DocumentConversionError) {
      throw conversionError;
    }
    throw mapAnyDocError(conversionError);
  }
};

module.exports = {
  DocumentConversionError,
  EXTENSION_MIME_TYPES,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_MIME_TYPES,
  getExtension,
  inferMimeType,
  isSupportedDocument,
  mapAnyDocError,
  parseDocumentBuffer,
};

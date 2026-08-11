export const MAX_DOCUMENT_FILE_SIZE = 50 * 1024 * 1024;

export const DOCUMENT_EXTENSION_MIME_TYPES = Object.freeze({
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

export const DOCUMENT_SUPPORTED_EXTENSIONS = Object.freeze(
  Object.keys(DOCUMENT_EXTENSION_MIME_TYPES)
);

export const DOCUMENT_ACCEPT = DOCUMENT_SUPPORTED_EXTENSIONS
  .map((extension) => `.${extension}`)
  .join(",");

export const DOCUMENT_FORMAT_GROUPS = Object.freeze([
  "PDF",
  "Word",
  "PowerPoint",
  "Excel",
  "OpenDocument",
  "RTF",
  "EPUB",
  "CSV",
  "TXT / MD",
  "PNG / JPG",
]);

export const getDocumentExtension = (fileName) => {
  if (!fileName || !fileName.includes(".")) return "";
  return fileName.toLowerCase().split(".").pop();
};

export const inferDocumentMimeType = (file) => {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return (
    DOCUMENT_EXTENSION_MIME_TYPES[getDocumentExtension(file.name)] ||
    "application/octet-stream"
  );
};

export const isSupportedDocumentFile = (file) =>
  DOCUMENT_SUPPORTED_EXTENSIONS.includes(getDocumentExtension(file.name));

const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DEFAULT_TIMEOUT_MS = Number(process.env.PPT_MASTER_TIMEOUT_MS || 900000);

const getServiceUrl = () =>
  String(process.env.PPT_MASTER_SERVICE_URL || "").replace(/\/+$/, "");

const getServiceKey = () => String(process.env.PPT_MASTER_SERVICE_KEY || "");

const isConfigured = () => Boolean(getServiceUrl() && getServiceKey());

const describeFailure = (payload, status) => {
  const detail = payload?.detail;
  if (typeof detail === "string") return `${detail} (${status})`;
  if (detail?.message) {
    const stderr = String(detail.stderr || "").trim();
    return stderr
      ? `${detail.message}: ${stderr.slice(-400)} (${status})`
      : `${detail.message} (${status})`;
  }
  return `ppt-master 服務請求失敗 (${status})`;
};

const request = async (path, { method = "GET", body, headers, expect = "json" } = {}) => {
  if (!isConfigured()) {
    throw new Error(
      "PPT_MASTER_SERVICE_URL 或 PPT_MASTER_SERVICE_KEY 尚未設定，無法使用 PPT Master 簡報生成"
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${getServiceUrl()}${path}`, {
      method,
      headers: {
        "X-Pixora-Service-Key": getServiceKey(),
        ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("ppt-master 服務逾時未回應");
    }
    throw new Error(`無法連線 ppt-master 服務：${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (expect === "buffer") {
    if (!response.ok) {
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
      throw new Error(describeFailure(payload, response.status));
    }
    return Buffer.from(await response.arrayBuffer());
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(describeFailure(payload, response.status));
  }
  return payload;
};

const getHealth = () => request("/health");

const getFonts = () => request("/fonts");

const getCatalog = () => request("/catalog");

const getTemplateSpec = ({ kind, templateId }) =>
  request(
    `/catalog/${encodeURIComponent(kind)}/${encodeURIComponent(templateId)}/spec`
  );

/**
 * The sidecar rejects file names outside a conservative ASCII allow list
 * ("unsafe file name"), which fails every upload with a non-Latin name. Upload
 * under a sanitised name and keep the extension, which its format detection
 * relies on.
 */
const sidecarFileName = (fileName) => {
  const raw = String(fileName || "").trim();
  const dot = raw.lastIndexOf(".");
  const extension =
    dot > 0 ? raw.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const stem = (dot > 0 ? raw.slice(0, dot) : raw)
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 60);
  const safeStem = stem || "source";
  return extension ? `${safeStem}.${extension}` : safeStem;
};

const convertSource = async ({ fileName, buffer, contentType }) => {
  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: contentType || "application/octet-stream" }),
    sidecarFileName(fileName)
  );
  return request("/sources/convert", { method: "POST", body: form });
};

const createDeck = ({ name }) => request("/decks", { method: "POST", body: { name } });

const deleteDeck = ({ deckId }) =>
  request(`/decks/${encodeURIComponent(deckId)}`, { method: "DELETE" });

const writeSlide = ({ deckId, name, content }) =>
  request(
    `/decks/${encodeURIComponent(deckId)}/svg/${encodeURIComponent(name)}`,
    { method: "PUT", body: { content } }
  );

const writeImage = async ({ deckId, name, buffer, contentType }) => {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType || "image/png" }), name);
  return request(
    `/decks/${encodeURIComponent(deckId)}/images/${encodeURIComponent(name)}`,
    { method: "PUT", body: form }
  );
};

const checkDeck = ({ deckId }) =>
  request(`/decks/${encodeURIComponent(deckId)}/check`, { method: "POST" });

const exportDeck = ({ deckId, fileStem }) =>
  request(`/decks/${encodeURIComponent(deckId)}/export`, {
    method: "POST",
    body: { fileStem: fileStem || "deck" },
    expect: "buffer",
  });

module.exports = {
  PPTX_CONTENT_TYPE,
  checkDeck,
  convertSource,
  createDeck,
  deleteDeck,
  exportDeck,
  getCatalog,
  getFonts,
  getHealth,
  getTemplateSpec,
  isConfigured,
  sidecarFileName,
  writeImage,
  writeSlide,
};

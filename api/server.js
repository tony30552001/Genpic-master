const express = require("express");
const { corsHeaders } = require("./_shared/http");

const admin = require("./admin");
const analyzeDocument = require("./analyze-document");
const analyzeStyle = require("./analyze-style");
const blobSas = require("./blob-sas");
const embeddings = require("./embeddings");
const generateFilename = require("./generate-filename");
const generateImages = require("./generate-images");
const health = require("./health");
const history = require("./history");
const imageTransform = require("./image-transform");
const lineConfig = require("./line-config");
const me = require("./me");
const optimizePrompt = require("./optimize-prompt");
const optimizeScene = require("./optimize-scene");
const sendLineImage = require("./send-line-image");
const styles = require("./styles");
const stylesBackfill = require("./styles-backfill");
const stylesSearch = require("./styles-search");
const templates = require("./templates");

const app = express();
const apiBodyLimit = process.env.API_BODY_LIMIT || "100mb";

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: apiBodyLimit }));

const createLogger = () => {
  const log = (...args) => console.log(...args);
  log.info = log;
  log.warn = (...args) => console.warn(...args);
  log.error = (...args) => console.error(...args);
  return log;
};

const sendFunctionResponse = (res, response = {}) => {
  const status = Number(response.status || 200);
  const headers = response.headers || {};

  Object.entries(headers).forEach(([name, value]) => {
    if (value !== undefined && value !== null) {
      res.setHeader(name, value);
    }
  });

  if (status === 204 || status === 304 || response.body === undefined) {
    res.status(status).end();
    return;
  }

  if (Buffer.isBuffer(response.body) || typeof response.body === "string") {
    res.status(status).send(response.body);
    return;
  }

  res.status(status).json(response.body);
};

const invokeFunction = (handler) => async (req, res, next) => {
  const context = {
    req,
    bindingData: { ...req.params },
    log: createLogger(),
    res: undefined,
  };

  try {
    await handler(context, req);
    if (!res.headersSent) {
      sendFunctionResponse(res, context.res);
    }
  } catch (error) {
    next(error);
  }
};

const registerRoute = (path, methods, handler) => {
  methods.forEach((method) => {
    const register = app[method.toLowerCase()];
    if (typeof register !== "function") {
      throw new Error(`Unsupported HTTP method in API route: ${method}`);
    }
    register.call(app, path, invokeFunction(handler));
  });
};

const registerRoutes = (path, methods, handler) => {
  path.forEach((routePath) => registerRoute(routePath, methods, handler));
};

registerRoutes(["/api/health"], ["GET", "OPTIONS"], health);
registerRoutes(["/api/me"], ["GET", "OPTIONS"], me);
registerRoutes(["/api/analyze-document"], ["POST", "OPTIONS"], analyzeDocument);
registerRoutes(["/api/analyze-style"], ["POST", "OPTIONS"], analyzeStyle);
registerRoutes(["/api/blob-sas"], ["POST", "OPTIONS"], blobSas);
registerRoutes(["/api/embeddings"], ["POST", "OPTIONS"], embeddings);
registerRoutes(["/api/generate-filename"], ["GET", "POST", "OPTIONS"], generateFilename);
registerRoutes(["/api/generate-images"], ["POST", "OPTIONS"], generateImages);
registerRoutes(["/api/image-transform"], ["POST", "OPTIONS"], imageTransform);
registerRoutes(["/api/line-config"], ["GET", "POST", "DELETE", "OPTIONS"], lineConfig);
registerRoutes(["/api/optimize-prompt"], ["POST", "OPTIONS"], optimizePrompt);
registerRoutes(["/api/optimize-scene"], ["POST", "OPTIONS"], optimizeScene);
registerRoutes(["/api/send-line-image"], ["POST", "OPTIONS"], sendLineImage);
registerRoutes(
  ["/api/history", "/api/history/:id"],
  ["GET", "POST", "DELETE", "OPTIONS"],
  history
);
registerRoutes(
  ["/api/styles/search"],
  ["POST", "OPTIONS"],
  stylesSearch
);
registerRoutes(
  ["/api/styles/backfill-embeddings"],
  ["POST", "OPTIONS"],
  stylesBackfill
);
registerRoutes(
  ["/api/styles", "/api/styles/:id", "/api/styles/:id/:action"],
  ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  styles
);
registerRoutes(
  ["/api/templates", "/api/templates/:id"],
  ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  templates
);
registerRoutes(
  ["/api/management", "/api/management/:resource", "/api/management/:resource/:id"],
  ["GET", "PUT", "DELETE", "OPTIONS"],
  admin
);

app.use("/api", (req, res) => {
  res.set(corsHeaders(req));
  res.status(404).json({
    error: {
      code: "not_found",
      message: "API route not found",
    },
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    res.set(corsHeaders(req));
    res.status(400).json({
      error: {
        code: "bad_request",
        message: "Invalid JSON body",
      },
    });
    return;
  }

  console.error("[api] Unhandled request error:", error);
  res.set(corsHeaders(req));
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Internal server error",
    },
  });
});

const start = () => {
  const port = Number(process.env.PORT || 3000);
  return app.listen(port, "0.0.0.0", () => {
    console.log(`[api] App Service server listening on port ${port}`);
  });
};

if (require.main === module) {
  start();
}

module.exports = { app, start };

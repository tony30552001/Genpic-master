const express = require("express");
const { apiReference } = require("@scalar/express-api-reference");
const { corsHeaders } = require("./_shared/http");
const openapiDocument = require("./openapi");

const admin = require("./admin");
const analyzeDocument = require("./analyze-document");
const analyzeStyle = require("./analyze-style");
const auth = require("./auth");
const blobSas = require("./blob-sas");
const deckJobs = require("./deck-jobs");
const { startDeckJobWorker } = require("./_shared/deckJobs");
const embeddings = require("./embeddings");
const generateFilename = require("./generate-filename");
const generateImages = require("./generate-images");
const generatePresentation = require("./generate-presentation");
const health = require("./health");
const history = require("./history");
const imageJobs = require("./image-jobs");
const imageTransform = require("./image-transform");
const { startImageJobWorker } = require("./_shared/imageJobs");
const lineConfig = require("./line-config");
const me = require("./me");
const optimizePrompt = require("./optimize-prompt");
const optimizeScene = require("./optimize-scene");
const pptTemplates = require("./ppt-templates");
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

app.get("/api/openapi.json", (req, res) => {
  res.set(corsHeaders(req));
  res.json(openapiDocument);
});

app.use(
  "/api/docs",
  apiReference({
    url: "/api/openapi.json",
    pageTitle: "Pixora API Reference",
  })
);

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
registerRoutes(["/api/auth/entra/start"], ["GET", "OPTIONS"], auth);
registerRoutes(["/api/auth/entra/callback"], ["GET", "OPTIONS"], auth);
registerRoutes(["/api/auth/google"], ["POST", "OPTIONS"], auth);
registerRoutes(["/api/auth/session"], ["GET", "OPTIONS"], auth);
registerRoutes(["/api/auth/logout"], ["POST", "OPTIONS"], auth);
registerRoutes(["/api/me"], ["GET", "OPTIONS"], me);
registerRoutes(["/api/analyze-document"], ["POST", "OPTIONS"], analyzeDocument);
registerRoutes(["/api/analyze-style"], ["POST", "OPTIONS"], analyzeStyle);
registerRoutes(["/api/blob-sas"], ["POST", "OPTIONS"], blobSas);
registerRoutes(["/api/deck-jobs"], ["POST", "OPTIONS"], deckJobs);
registerRoutes(
  [
    "/api/deck-jobs/:id",
    "/api/deck-jobs/:id/:action",
    "/api/deck-jobs/:id/slides/:slideNumber",
  ],
  ["GET", "OPTIONS"],
  deckJobs
);
registerRoutes(["/api/ppt-templates"], ["GET", "OPTIONS"], pptTemplates);
registerRoutes(["/api/embeddings"], ["POST", "OPTIONS"], embeddings);
registerRoutes(["/api/generate-filename"], ["GET", "POST", "OPTIONS"], generateFilename);
registerRoutes(["/api/generate-images"], ["POST", "OPTIONS"], generateImages);
registerRoutes(["/api/generate-presentation"], ["POST", "OPTIONS"], generatePresentation);
registerRoutes(["/api/image-jobs/:id"], ["GET", "OPTIONS"], imageJobs);
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
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`[api] App Service server listening on port ${port}`);
  });
  startImageJobWorker();
  startDeckJobWorker();
  return server;
};

if (require.main === module) {
  start();
}

module.exports = { app, start };

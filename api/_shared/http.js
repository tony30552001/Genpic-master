const isExplicitDevelopment =
  process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Development";
const isProductionEnvironment =
  !isExplicitDevelopment &&
  (process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Production" ||
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.WEBSITE_SITE_NAME));

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
];

const configuredOrigins = String(process.env.CORS_ALLOW_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (configuredOrigins.includes("*")) {
  console.warn(
    "[CORS] CORS_ALLOW_ORIGIN contains '*'. Wildcards are ignored for credentialed sessions."
  );
}

const ALLOWED_ORIGINS = Array.from(
  new Set(
    configuredOrigins
      .filter((origin) => origin !== "*")
      .concat(configuredOrigins.length > 0 || isProductionEnvironment ? [] : DEFAULT_DEV_ORIGINS)
  )
);

const getAllowedOrigins = () => [...ALLOWED_ORIGINS];

const getRequestOrigin = (req) => req?.headers?.origin || req?.headers?.Origin || "";

const corsHeaders = (req) => {
  const requestOrigin = getRequestOrigin(req);
  const allowOrigin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : "";

  return {
    ...(allowOrigin
      ? {
          "Access-Control-Allow-Origin": allowOrigin,
          "Access-Control-Allow-Credentials": "true",
        }
      : {}),
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-CSRF-Token",
    Vary: "Origin",
  };
};

const ok = (body, status = 200, req = null) => ({
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  body,
});

const error = (message, code = "unknown", status = 400, req = null) => ({
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  body: { error: { code, message } },
});

const options = (req = null) => ({
  status: 204,
  headers: { ...corsHeaders(req) },
});

module.exports = { ok, error, options, corsHeaders, getAllowedOrigins };

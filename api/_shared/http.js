const corsHeaders = () => {
  const origin = process.env.CORS_ALLOW_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
  };
};

const ok = (body, status = 200) => ({
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders() },
  body,
});

const error = (message, code = "unknown", status = 400) => ({
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders() },
  body: { error: { code, message } },
});

const options = () => ({
  status: 204,
  headers: { ...corsHeaders() },
});

module.exports = { ok, error, options, corsHeaders };

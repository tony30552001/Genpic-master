const { ok, options } = require("../_shared/http");

module.exports = async function (context) {
  if ((context.req?.method || "").toUpperCase() === "OPTIONS") {
    context.res = options();
    return;
  }
  context.res = ok({ status: "ok" });
};

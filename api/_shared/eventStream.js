/**
 * Server-sent events for handlers that stream a reply.
 *
 * Express owns the socket, so the stream is opened from the route adapter and
 * handed to the handler through `context.openEventStream()`. Once opened, the
 * handler must report every outcome as an event; `context.res` is ignored.
 */

const { corsHeaders } = require("./http");

const HEARTBEAT_MS = 15_000;

/**
 * @returns {{ send: (event: string, data: object) => void, end: () => void, signal: AbortSignal }}
 *   `signal` aborts when the client disconnects before `end()`.
 */
const openEventStream = (req, res) => {
  const controller = new AbortController();
  let ended = false;

  res.status(200);
  Object.entries(corsHeaders(req)).forEach(([name, value]) => res.setHeader(name, value));
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), HEARTBEAT_MS);
  res.on("close", () => {
    clearInterval(heartbeat);
    if (!ended) controller.abort();
  });

  return {
    signal: controller.signal,
    send: (event, data) => {
      if (ended || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end: () => {
      if (ended) return;
      ended = true;
      clearInterval(heartbeat);
      res.end();
    },
  };
};

module.exports = { openEventStream };

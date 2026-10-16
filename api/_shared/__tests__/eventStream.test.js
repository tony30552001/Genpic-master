import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const express = require("express");
const { openEventStream } = require("../eventStream");

let server;
const listen = (handler) =>
  new Promise((resolve) => {
    const app = express();
    app.post("/stream", handler);
    server = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}/stream`));
  });

describe("server-sent event stream", () => {
  afterEach(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));

  it("writes named JSON events with streaming headers", async () => {
    const url = await listen((req, res) => {
      const stream = openEventStream(req, res);
      stream.send("delta", { text: "你好" });
      stream.send("done", { ok: true });
      stream.end();
      stream.send("late", {});
    });
    const response = await fetch(url, { method: "POST" });
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(await response.text()).toBe(
      'event: delta\ndata: {"text":"你好"}\n\nevent: done\ndata: {"ok":true}\n\n'
    );
  });

  it("aborts the handler signal when the client disconnects", async () => {
    let aborted;
    const url = await listen((req, res) => {
      const stream = openEventStream(req, res);
      aborted = new Promise((resolve) => stream.signal.addEventListener("abort", () => resolve(true)));
      stream.send("delta", { text: "x" });
    });
    const client = new AbortController();
    const response = await fetch(url, { method: "POST", signal: client.signal });
    await response.body.getReader().read();
    client.abort();
    await expect(aborted).resolves.toBe(true);
  });
});

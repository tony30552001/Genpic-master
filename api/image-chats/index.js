const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { ImageModelError } = require("../_shared/imageModelConfig");
const { createImageJob } = require("../_shared/imageJobs");
const { buildImagePrompt, buildTransformPrompt } = require("../_shared/imagePrompt");
const { resolveOwnedImageUpload } = require("../_shared/imageUploads");
const { LlmConfigurationError, resolveRoleModel } = require("../_shared/llmModels");
const { LlmStreamError, streamResponse } = require("../_shared/llmRuntime");
const {
  CONTEXT_MESSAGE_LIMIT,
  ImageChatDecisionError,
  MAX_OUTPUT_TOKENS,
  buildModelMessages,
  buildSystemMessage,
  resolveDecision,
  toolsFor,
} = require("../_shared/imageChatAgent");
const chats = require("../_shared/imageChats");

const { ImageChatRequestError } = chats;

/** Replies streaming in this process, so a stop request can cut the model call short. */
const activeTurns = new Map();

const isKnownError = (err) =>
  err instanceof ImageChatRequestError ||
  err instanceof ImageModelError ||
  err instanceof LlmConfigurationError;

const queueImage = ({ identity, turn, upload, decision, assistantMessage, text }) => {
  const { settings, style } = turn;
  const generate = decision.action === "generate";
  const prompt = generate
    ? buildImagePrompt({
        userScript: decision.prompt,
        stylePrompt: style?.prompt,
        styleTags: style?.tags,
        purpose: decision.purpose,
        imageLanguage: settings.imageLanguage,
        aspectRatio: settings.aspectRatio,
        hasReferenceImage: Boolean(upload),
      })
    : buildTransformPrompt({
        mode: "refine",
        prompt: decision.prompt,
        imageLanguage: settings.imageLanguage,
        aspectRatio: settings.aspectRatio,
      });
  const sourceJobId = generate ? null : turn.sourceJobId;

  return createImageJob({
    tenantId: identity.tenantId,
    userId: identity.userId,
    prompt,
    aspectRatio: settings.aspectRatio,
    quality: settings.quality ?? undefined,
    operation: generate && !upload ? "generate" : "edit",
    sourceUploadId: generate && upload ? upload.id : null,
    sourceJobId,
    afterInsert: (client, job) =>
      chats.attachImageJob(client, {
        messageId: assistantMessage.id,
        action: decision.action,
        job,
        sourceJobId,
        content: text,
        prompt: decision.prompt,
      }),
  });
};

const describeFailure = (err, disconnected) => {
  if (disconnected) {
    return { status: "interrupted", code: "client_disconnected", message: "連線中斷，回覆未完成" };
  }
  if (err instanceof LlmStreamError) {
    return {
      status: err.code === "aborted" ? "interrupted" : "failed",
      code: err.code === "aborted" ? "stopped" : err.code,
      message: err.message,
    };
  }
  if (err instanceof ImageChatDecisionError || isKnownError(err)) {
    return { status: "failed", code: err.code, message: err.message };
  }
  return { status: "failed", code: "chat_failed", message: "對話回覆失敗，請稍後重試" };
};

/**
 * Streams one assistant reply. Validation and turn admission fail as JSON;
 * once the event stream is open, every outcome is reported as events and the
 * stream always ends with `done` unless the client is gone.
 */
const runTurn = async (context, { identity, owner, turn }) => {
  const existing = await chats.getTurnMessages({ chatId: owner.chatId, turnId: turn.turnId });
  if (existing.assistantMessage) {
    // A resent request: report the accepted turn instead of answering twice.
    const stream = context.openEventStream();
    stream.send("turn", { chatId: owner.chatId, turnId: turn.turnId, ...existing });
    stream.send("done", { message: existing.assistantMessage });
    stream.end();
    return;
  }

  let upload = null;
  if (turn.attachmentUploadId) {
    upload = await resolveOwnedImageUpload({
      uploadId: turn.attachmentUploadId,
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
    if (!upload) throw new ImageChatRequestError("找不到可用的附圖", "upload_not_found", 404);
  }
  if (turn.sourceJobId) {
    await chats.requireOwnedSucceededJob({ ...identity, jobId: turn.sourceJobId });
  }
  const llm = await resolveRoleModel(identity.tenantId, "image_chat");
  const history = await chats.listContextMessages({
    chatId: owner.chatId,
    limit: CONTEXT_MESSAGE_LIMIT,
  });
  const { userMessage, assistantMessage } = await chats.beginTurn(owner, turn);

  const stream = context.openEventStream();
  const stop = new AbortController();
  activeTurns.set(turn.turnId, stop);
  const agentTurn = {
    settings: turn.settings,
    style: turn.style,
    hasAttachment: Boolean(upload),
    hasSelectedImage: Boolean(turn.sourceJobId),
  };
  let text = "";

  try {
    stream.send("turn", { chatId: owner.chatId, turnId: turn.turnId, userMessage, assistantMessage });
    try {
      const reply = await streamResponse({
        llm,
        systemMessage: buildSystemMessage(agentTurn),
        messages: buildModelMessages(history, turn.content),
        tools: toolsFor(agentTurn),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        signal: AbortSignal.any([stream.signal, stop.signal]),
        onTextDelta: (delta) => {
          text += delta;
          stream.send("delta", { text: delta });
        },
      });
      const decision = resolveDecision(reply.toolCalls, agentTurn);
      if (decision.action === "none") {
        await chats.completeReply(assistantMessage.id, text);
      } else {
        const job = await queueImage({ identity, turn, upload, decision, assistantMessage, text });
        stream.send("action", {
          action: decision.action,
          jobId: job.id,
          sourceJobId: decision.action === "refine" ? turn.sourceJobId : null,
          prompt: decision.prompt,
          status: job.status,
        });
      }
    } catch (err) {
      const failure = describeFailure(err, stream.signal.aborted);
      if (failure.code === "chat_failed") {
        context.log.error("Image chat turn failed:", { code: err?.code, status: err?.status });
      }
      await chats.endReply(assistantMessage.id, { ...failure, content: text });
      stream.send("error", { code: failure.code, message: failure.message });
    }
    stream.send("done", { message: await chats.getMessage(assistantMessage.id) });
  } catch (err) {
    context.log.error("Image chat stream could not finish:", { code: err?.code });
    stream.send("error", { code: "chat_failed", message: "對話回覆失敗，請重新整理後再試" });
  } finally {
    activeTurns.delete(turn.turnId);
    stream.end();
  }
};

const methodNotAllowed = (req) => error("不支援的方法", "method_not_allowed", 405, req);

const handleCollection = async (context, req, method, identity) => {
  if (method === "GET") {
    context.res = ok(await chats.listChats({ ...identity, cursor: req.query?.cursor }), 200, req);
  } else if (method === "POST") {
    const settings = chats.validateSettings(req.body?.settings);
    context.res = ok(await chats.createChat({ ...identity, settings }), 201, req);
  } else {
    context.res = methodNotAllowed(req);
  }
};

const handleChat = async (context, req, method, owner) => {
  if (method === "GET") {
    const chat = await chats.requireChat(owner);
    const messages = await chats.listMessages({ chatId: owner.chatId });
    context.res = ok({ chat, messages: messages.items, nextBefore: messages.nextBefore }, 200, req);
  } else if (method === "DELETE") {
    await chats.deleteChat(owner);
    context.res = options(req);
  } else {
    context.res = methodNotAllowed(req);
  }
};

const handleChatAction = async (context, req, method, { owner, action, identity }) => {
  if (action === "messages" && method === "GET") {
    await chats.requireChat(owner);
    const before = chats.parseBefore(req.query?.before);
    context.res = ok(await chats.listMessages({ chatId: owner.chatId, before }), 200, req);
  } else if (action === "messages" && method === "POST") {
    await runTurn(context, { identity, owner, turn: chats.validateTurnRequest(req.body) });
  } else if (action === "state" && method === "PUT") {
    const state = chats.validateStateRequest(req.body);
    context.res = ok(await chats.saveChatState(owner, state), 200, req);
  } else {
    context.res = error("找不到 API", "not_found", 404, req);
  }
};

const handleStop = async (context, req, method, { owner, turnId }) => {
  if (method !== "POST") {
    context.res = methodNotAllowed(req);
    return;
  }
  const id = chats.requireUuid(turnId, "回合 ID ");
  const stopped = await chats.stopTurn(owner, id);
  activeTurns.get(id)?.abort();
  context.res = ok({ stopped }, 200, req);
};

module.exports = async function (context, req) {
  const method = (req.method || "").toUpperCase();
  if (method === "OPTIONS") {
    context.res = options(req);
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;

  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429, req);
    return;
  }

  const { tenantId, userId } = await resolveIdentity(auth.user);
  if (!userId || !tenantId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return;
  }
  const identity = { tenantId, userId };
  const { id, action, turnId } = { ...context.bindingData, ...req.params };

  try {
    if (!id) {
      await handleCollection(context, req, method, identity);
      return;
    }
    const owner = { ...identity, chatId: chats.requireUuid(id, "對話 ID ") };
    if (turnId) {
      await handleStop(context, req, method, { owner, turnId });
    } else if (action) {
      await handleChatAction(context, req, method, { owner, action, identity });
    } else {
      await handleChat(context, req, method, owner);
    }
  } catch (err) {
    if (isKnownError(err)) {
      context.res = error(err.message, err.code, err.status, req);
      if (err.chat) context.res.body.chat = err.chat;
      return;
    }
    context.log.error("Image chat request failed:", { code: err?.code, status: err?.status });
    context.res = error("對話服務暫時無法使用", "chat_failed", 500, req);
  }
};

module.exports.activeTurns = activeTurns;

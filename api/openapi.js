const { IMAGE_API_TYPES, IMAGE_QUALITIES } = require("./_shared/imageModelConfig");
const {
  ANGLES,
  CAMERAS,
  MAX_CHARACTERS,
  MAX_PROJECT_SECONDS,
  MAX_SEGMENT_SHOTS,
  MAX_SHOT_REFERENCES,
  MAX_SHOTS,
  PROMPT_LIMIT,
  SHOT_SIZES,
} = require("./_shared/videoStoryboard");

const jsonObjectSchema = {
  type: "object",
  additionalProperties: true,
};

const pathParameters = (...names) =>
  names.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));

const requestBody = {
  required: true,
  content: {
    "application/json": {
      schema: jsonObjectSchema,
    },
  },
};

const csrfHeaderParameter = {
  name: "X-CSRF-Token",
  in: "header",
  required: true,
  schema: { type: "string" },
  description: "CSRF token returned by GET /api/auth/session.",
};

const response = (
  description,
  { contentType = "application/json", schema = jsonObjectSchema } = {}
) => ({
  description,
  content: {
    [contentType]: {
      schema,
    },
  },
});

const uploadCreateRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fileName", "contentType", "sizeBytes", "purpose"],
  properties: {
    fileName: {
      type: "string",
      minLength: 1,
      maxLength: 255,
      pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F]+$",
      description: "Human-readable source filename; never used as a Blob path.",
    },
    contentType: {
      type: "string",
      description:
        "Allowlisted media type. Empty or application/octet-stream may be inferred from a supported document filename.",
    },
    sizeBytes: {
      type: "integer",
      format: "int64",
      minimum: 1,
    },
    purpose: {
      type: "string",
      enum: ["document", "image"],
    },
  },
  oneOf: [
    {
      title: "Document upload",
      properties: {
        purpose: { type: "string", enum: ["document"] },
        sizeBytes: {
          type: "integer",
          format: "int64",
          minimum: 1,
          maximum: 52428800,
        },
      },
    },
    {
      title: "Image upload",
      properties: {
        purpose: { type: "string", enum: ["image"] },
        sizeBytes: {
          type: "integer",
          format: "int64",
          minimum: 1,
          maximum: 10485760,
        },
      },
    },
  ],
  discriminator: { propertyName: "purpose" },
};

const uploadCreateSuccessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["uploadId", "status", "blobUrl", "sasToken", "expiresAt"],
  properties: {
    uploadId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["pending"] },
    blobUrl: { type: "string", format: "uri" },
    sasToken: { type: "string" },
    expiresAt: {
      type: "string",
      format: "date-time",
      description: "Expiration of the short-lived upload SAS grant.",
    },
  },
};

const uploadReadySuccessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["uploadId", "status"],
  properties: {
    uploadId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["ready"] },
  },
};

const uploadErrorSchema = (codes) => ({
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string", enum: codes },
        message: { type: "string" },
      },
    },
  },
});

const uploadResponse = (description, schema) =>
  response(description, { schema });

const operation = ({
  summary,
  description,
  tags,
  deprecated = false,
  auth = true,
  body = false,
  bodySchema = jsonObjectSchema,
  csrf = false,
  successStatuses = [200],
  successContentType = "application/json",
  successSchema = jsonObjectSchema,
  parameters = [],
}) => ({
  summary,
  ...(description ? { description } : {}),
  ...(deprecated ? { deprecated: true } : {}),
  tags,
  ...(auth
    ? {
        security: [
          { sessionCookie: [] },
        ],
      }
    : {}),
  ...(body
    ? { requestBody: { ...requestBody, content: { "application/json": { schema: bodySchema } } } }
    : {}),
  ...((parameters.length > 0 || csrf)
    ? {
        parameters: [...parameters, ...(csrf ? [csrfHeaderParameter] : [])],
      }
    : {}),
  responses: {
    ...Object.fromEntries(
      successStatuses.map((status) => [
        status,
        status === 204 || status === 302 || status === 304
          ? { description: status === 302 ? "Redirect" : "No content" }
          : response(
              status === 202 ? "Accepted" : "Successful response",
              { contentType: successContentType, schema: successSchema }
            ),
      ])
    ),
    400: response("Invalid request"),
    401: response("Authentication required or invalid"),
    403: response("Insufficient permissions"),
    404: response("Resource not found"),
    429: response("Rate limit exceeded"),
    500: response("Internal server error"),
  },
});

const paths = {};

const addOperation = (path, method, config) => {
  paths[path] ||= {};
  paths[path][method] = operation(config);
};

addOperation("/api/health", "get", {
  summary: "Check API health",
  tags: ["System"],
  auth: false,
});

addOperation("/api/auth/entra/start", "get", {
  summary: "Start Entra ID sign-in",
  tags: ["Authentication"],
  auth: false,
  successStatuses: [302],
});

addOperation("/api/auth/entra/callback", "get", {
  summary: "Handle Entra ID auth-code callback",
  tags: ["Authentication"],
  auth: false,
  successStatuses: [302],
});

addOperation("/api/auth/google", "post", {
  summary: "Create Pixora session from Google credential",
  tags: ["Authentication"],
  auth: false,
  body: true,
});

addOperation("/api/auth/session", "get", {
  summary: "Get current Pixora session state",
  tags: ["Authentication"],
  auth: false,
});

addOperation("/api/auth/logout", "post", {
  summary: "Revoke current Pixora session",
  tags: ["Authentication"],
  csrf: true,
});

addOperation("/api/me", "get", {
  summary: "Get the current user profile and model policy",
  tags: ["Authentication"],
});

addOperation("/api/analyze-style", "post", {
  summary: "Analyze a visual style",
  tags: ["AI"],
  body: true,
  csrf: true,
});

addOperation("/api/blob-sas", "post", {
  summary: "Deprecated: arbitrary Blob SAS signing",
  description: "This route is retired. Use POST /api/uploads for owner-scoped staged uploads.",
  deprecated: true,
  tags: ["Storage"],
  body: true,
  csrf: true,
});

paths["/api/uploads"] = {
  post: {
    summary: "Create an owner-scoped staged upload",
    tags: ["Storage"],
    security: [{ sessionCookie: [] }],
    parameters: [csrfHeaderParameter],
    requestBody: {
      required: true,
      content: {
        "application/json": { schema: uploadCreateRequestSchema },
      },
    },
    responses: {
      201: uploadResponse("Pending upload and short-lived write grant", uploadCreateSuccessSchema),
      400: uploadResponse("Invalid upload metadata", uploadErrorSchema(["invalid_upload"])),
      401: uploadResponse("Authentication required or invalid", uploadErrorSchema(["unauthorized"])),
      403: uploadResponse("CSRF validation failed", uploadErrorSchema(["forbidden"])),
      429: uploadResponse("Rate limit exceeded", uploadErrorSchema(["rate_limited"])),
      500: uploadResponse(
        "Identity, upload record, or grant creation failed",
        uploadErrorSchema(["upload_identity_failed", "upload_create_failed"])
      ),
    },
  },
};

paths["/api/uploads/{id}/complete"] = {
  post: {
    summary: "Validate and promote an owned staged upload",
    tags: ["Storage"],
    security: [{ sessionCookie: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
      csrfHeaderParameter,
    ],
    responses: {
      200: uploadResponse("Upload is ready", uploadReadySuccessSchema),
      401: uploadResponse("Authentication required or invalid", uploadErrorSchema(["unauthorized"])),
      403: uploadResponse("CSRF validation failed", uploadErrorSchema(["forbidden"])),
      404: uploadResponse("No owned upload is available", uploadErrorSchema(["upload_not_found"])),
      409: uploadResponse("Upload state changed concurrently", uploadErrorSchema(["upload_state_conflict"])),
      422: uploadResponse("Stored upload declaration is invalid", uploadErrorSchema(["upload_invalid"])),
      429: uploadResponse("Rate limit exceeded", uploadErrorSchema(["rate_limited"])),
      500: uploadResponse(
        "Identity or upload completion could not be persisted",
        uploadErrorSchema(["upload_identity_failed", "upload_completion_failed"])
      ),
      502: uploadResponse("Staged Blob validation or promotion failed", uploadErrorSchema(["upload_promotion_failed"])),
    },
  },
};

addOperation("/api/embeddings", "post", {
  summary: "Create text embeddings",
  tags: ["AI"],
  body: true,
  csrf: true,
});

for (const method of ["get", "post"]) {
  addOperation("/api/generate-filename", method, {
    summary: "Generate a filename",
    tags: ["AI"],
    body: method === "post",
    csrf: method === "post",
  });
}

addOperation("/api/generate-images", "post", {
  summary: "Queue an image generation or reference-image edit",
  description: "The tenant default chooses the model. Reference uploads must belong to the caller. All requests return an image job; no synchronous provider response is supported.",
  tags: ["AI"],
  body: true,
  csrf: true,
  successStatuses: [202],
  bodySchema: {
    type: "object",
    required: ["userScript"],
    properties: {
      userScript: { type: "string", minLength: 1 },
      stylePrompt: { type: "string" },
      styleTags: { type: "array", items: { type: "string" } },
      purpose: { type: "string" },
      imageLanguage: { type: "string" },
      aspectRatio: { type: "string" },
      imageSize: { type: "string" },
      referenceUploadId: { type: "string", format: "uuid" },
      quality: {
        type: "string", enum: IMAGE_QUALITIES,
        description: "Must be supported by the tenant default model. Only omission uses its default quality; invalid explicit values are rejected.",
      },
    },
  },
});

addOperation("/api/image-jobs/{id}", "get", {
  summary: "Get the status of an image generation job",
  tags: ["AI"],
  parameters: pathParameters("id"),
});

addOperation("/api/video-storyboard/jobs/{id}", "get", {
  summary: "Get an owned storyboard agent job",
  description: "status is queued, processing, succeeded (with result, the storyboard action's response) or failed (with error.code and error.message). progress is null until the worker starts, then { steps, step, reasoning, shots, expectedShots }: steps lists the job's steps (reading, thinking, writing, checking, images), step is the current one, reasoning is the analysis model's streamed reasoning summary, shots are the finished shots so far as { title, duration, text } previews, and expectedShots is the shot count when known. Finished jobs are deleted a day after they complete.",
  tags: ["Video"],
  parameters: pathParameters("id"),
});

addOperation("/api/image-jobs/{id}/image", "get", {
  summary: "Download the result image of an owned succeeded image job",
  description: "Returns 409 until the job succeeds. Results are immutable, so the response is privately cacheable.",
  tags: ["AI"],
  parameters: pathParameters("id"),
  successContentType: "image/*",
  successSchema: { type: "string", format: "binary" },
});

addOperation("/api/video-projects", "post", {
  summary: "Queue a storyboard as a video project",
  description: `Uses an allowed tenant video model and enforces the user's daily quota unless the user is unlimited. The storyboard (at most ${MAX_PROJECT_SECONDS} seconds) is split into segments that fit one model request; a segment closes at a shot with cut=true, at the model's per-request length, or after ${MAX_SEGMENT_SHOTS} shots. Each segment is one video job; each generated one counts against the quota. A segment that continues the same scene starts from the previous segment's last frame (image-to-video); a segment after a cut is text-to-video. An end frame requires a single segment. Image sources must be owned by the caller. With baseProjectId (an owned project the storyboard was edited from), every segment whose request is unchanged from a succeeded segment of that project — and, when chained, whose previous segment is also reused — is copied as succeeded with reused=true and reusedFromJobId set to the copied job, and does not count against the quota; only the other segments are generated. Each returned segment lists the storyboard shotIds it covers.`,
  tags: ["Video"],
  body: true,
  csrf: true,
  successStatuses: [202],
  bodySchema: {
    type: "object",
    required: ["modelKey", "storyboard", "mode"],
    properties: {
      modelKey: { type: "string" },
      storyboard: { $ref: "#/components/schemas/VideoStoryboard" },
      mode: { type: "string", enum: ["t2v", "i2v"], description: "Mode of the first segment" },
      resolution: { type: "string", enum: ["480P", "768P", "1080P"] },
      aspectRatio: { type: "string", description: "Used by text-to-video segments" },
      generateAudio: { type: "boolean" },
      sourceUploadId: { type: "string", format: "uuid" },
      sourceImageJobId: { type: "string", format: "uuid" },
      endSourceUploadId: { type: "string", format: "uuid" },
      endSourceImageJobId: { type: "string", format: "uuid" },
      baseProjectId: { type: "string", format: "uuid", description: "Owned project whose unchanged segments are reused" },
    },
  },
});

addOperation("/api/video-projects/{id}", "get", {
  summary: "Get an owned video project with the status of each segment",
  description: "status is failed when any segment failed, succeeded when all succeeded, processing once any segment started, otherwise queued. Each segment lists the storyboard shotIds it covers and, when copied from a base project, reused=true with reusedFromJobId. Download each succeeded segment from /api/video-jobs/{jobId}/video. render is null for a single segment; for several segments it is the newest render ({ renderId, status, completedAt, error? }) or null before the first render request.",
  tags: ["Video"],
  parameters: pathParameters("id"),
});

addOperation("/api/video-projects/{id}/render", "post", {
  summary: "Join a finished multi-segment project into one MP4",
  description: "Requires every segment to have succeeded. Queues a render job that joins the segments in order; matching segments are stream-copied, others are re-encoded to the first segment's size and frame rate. While a render is queued, processing or succeeded, the call returns that render instead of queueing another; after a failure it queues a new one. Poll GET /api/video-projects/{id} for render.status.",
  tags: ["Video"],
  csrf: true,
  parameters: pathParameters("id"),
  successStatuses: [202],
});

addOperation("/api/video-projects/{id}/retry", "post", {
  summary: "Requeue the failed segments of an owned video project",
  description: "Every failed segment is queued again as new work and counts against today's quota; succeeded segments are kept and a chained segment still starts from the previous segment's last frame. Returns the project like GET /api/video-projects/{id}. 409 nothing_to_retry when no segment failed.",
  tags: ["Video"],
  csrf: true,
  parameters: pathParameters("id"),
  successStatuses: [202],
});

addOperation("/api/video-projects/{id}/video", "get", {
  summary: "Download the finished MP4 of an owned video project",
  description: "The only segment of a single-segment project, or the succeeded render of a multi-segment project. Returns 409 until that video exists.",
  tags: ["Video"],
  parameters: pathParameters("id"),
  successContentType: "video/mp4",
  successSchema: { type: "string", format: "binary" },
});

addOperation("/api/video-projects/{id}/playback", "get", {
  summary: "Get a short-lived streaming URL for the finished MP4 of an owned video project",
  description: "Same video as /api/video-projects/{id}/video, as a read-only signed Blob Storage URL valid for one hour so a video element can stream it with range requests. Returns 409 until that video exists.",
  tags: ["Video"],
  parameters: pathParameters("id"),
  successSchema: {
    type: "object",
    required: ["url", "expiresAt"],
    properties: {
      url: { type: "string", format: "uri" },
      expiresAt: { type: "string", format: "date-time" },
    },
  },
});

addOperation("/api/video-jobs/{id}/video", "get", {
  summary: "Download the immutable MP4 of an owned succeeded video segment",
  tags: ["Video"],
  parameters: pathParameters("id"),
  successContentType: "video/mp4",
  successSchema: { type: "string", format: "binary" },
});

const videoSessionSnapshotSchema = {
  type: "object",
  required: ["title", "state"],
  properties: {
    title: { type: "string", maxLength: 40 },
    state: {
      type: "object",
      description: "Browser-owned snapshot of the storyboard conversation, board, composer settings and video turns; at most 2 MB of JSON (413 state_too_large).",
    },
  },
};

addOperation("/api/video-sessions", "get", {
  summary: "List the caller's video creation sessions, newest first",
  tags: ["Video"],
  parameters: [{ name: "cursor", in: "query", required: false, schema: { type: "string" } }],
});

addOperation("/api/video-sessions", "post", {
  summary: "Save a new video creation session",
  tags: ["Video"],
  body: true,
  csrf: true,
  successStatuses: [201],
  bodySchema: videoSessionSnapshotSchema,
});

addOperation("/api/video-sessions/{id}", "get", {
  summary: "Get an owned video creation session with its snapshot",
  tags: ["Video"],
  parameters: pathParameters("id"),
});

addOperation("/api/video-sessions/{id}", "put", {
  summary: "Replace the snapshot of an owned video creation session",
  description: "Optimistic: returns 409 `state_conflict` when `stateVersion` is stale.",
  tags: ["Video"],
  body: true,
  csrf: true,
  parameters: pathParameters("id"),
  bodySchema: {
    ...videoSessionSnapshotSchema,
    required: ["stateVersion", "title", "state"],
    properties: { stateVersion: { type: "integer", minimum: 1 }, ...videoSessionSnapshotSchema.properties },
  },
});
paths["/api/video-sessions/{id}"].put.responses[409] = response("The session changed in another window");

addOperation("/api/video-sessions/{id}", "delete", {
  summary: "Delete an owned video creation session",
  description: "Videos already saved to history are kept.",
  tags: ["Video"],
  csrf: true,
  successStatuses: [204],
  parameters: pathParameters("id"),
});

const imageChatSettingsSchema = {
  type: "object",
  required: ["aspectRatio", "imageLanguage", "purpose"],
  properties: {
    aspectRatio: { type: "string", example: "16:9" },
    quality: { type: "string", nullable: true, description: "Validated against the tenant image model when an image is queued; null uses its default." },
    imageLanguage: { type: "string", description: "In-image text language, or `none`." },
    purpose: { type: "string", enum: ["infographic", "freeform"] },
  },
};

addOperation("/api/image-chats", "get", {
  summary: "List the caller's image chats, newest first",
  tags: ["Image chat"],
  parameters: [{ name: "cursor", in: "query", required: false, schema: { type: "string" } }],
});

addOperation("/api/image-chats", "post", {
  summary: "Create an empty image chat",
  tags: ["Image chat"],
  body: true,
  csrf: true,
  successStatuses: [201],
  bodySchema: { type: "object", required: ["settings"], properties: { settings: imageChatSettingsSchema } },
});

addOperation("/api/image-chats/{id}", "get", {
  summary: "Get an owned image chat with its newest messages",
  tags: ["Image chat"],
  parameters: pathParameters("id"),
});

addOperation("/api/image-chats/{id}", "delete", {
  summary: "Delete an owned image chat",
  description: "Returns 409 `chat_busy` while a reply or image is still in progress. Saved history entries are kept.",
  tags: ["Image chat"],
  csrf: true,
  successStatuses: [204],
  parameters: pathParameters("id"),
});

addOperation("/api/image-chats/{id}/messages", "get", {
  summary: "Page older messages of an owned image chat",
  tags: ["Image chat"],
  parameters: [
    ...pathParameters("id"),
    { name: "before", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
  ],
});

addOperation("/api/image-chats/{id}/messages", "post", {
  summary: "Send a message and stream the assistant reply",
  description: [
    "Validation and admission errors return JSON. Once accepted, the reply streams as `text/event-stream` events:",
    "`turn` (recorded user and assistant messages), `delta` ({ text }), optional `reasoning` ({ text } reasoning-summary fragment), optional `memory` ({ notes } appended to the user's chat memory),",
    "one optional `image` ({ action, jobId, sourceJobId, prompt, status }) per queued image (up to 4 per reply),",
    "optional `error` ({ code, message }), and a final `done` ({ message }). A resent `clientMessageId` replays the accepted turn without calling the model.",
    "Queued images complete in the background; poll `/api/image-jobs/{jobId}`.",
  ].join(" "),
  tags: ["Image chat"],
  body: true,
  csrf: true,
  parameters: pathParameters("id"),
  successContentType: "text/event-stream",
  successSchema: { type: "string" },
  bodySchema: {
    type: "object",
    required: ["clientMessageId", "content", "settings"],
    properties: {
      clientMessageId: { type: "string", format: "uuid" },
      content: { type: "string", minLength: 1, maxLength: 4000 },
      settings: imageChatSettingsSchema,
      style: {
        type: "object",
        nullable: true,
        required: ["prompt"],
        properties: {
          id: { type: "string", format: "uuid", nullable: true },
          name: { type: "string" },
          prompt: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      attachmentUploadId: { type: "string", format: "uuid", nullable: true },
      sourceJobId: { type: "string", format: "uuid", nullable: true, description: "Selected owned succeeded image version the assistant may refine." },
      maskUploadId: { type: "string", format: "uuid", nullable: true, description: "Owned PNG brush mask for `sourceJobId`; transparent pixels mark the area to edit. Limits the reply to refining that version." },
    },
  },
});

addOperation("/api/image-chats/{id}/state", "put", {
  summary: "Save the chat draft, settings and selected version",
  description: "Optimistic: returns 409 `state_conflict` with the current `chat` when `stateVersion` is stale.",
  tags: ["Image chat"],
  body: true,
  csrf: true,
  parameters: pathParameters("id"),
  bodySchema: {
    type: "object",
    required: ["stateVersion", "draft", "settings"],
    properties: {
      stateVersion: { type: "integer", minimum: 1 },
      draft: { type: "string", maxLength: 4000 },
      settings: imageChatSettingsSchema,
      selectedJobId: { type: "string", format: "uuid", nullable: true },
    },
  },
});

addOperation("/api/image-chats/{id}/turns/{turnId}/stop", "post", {
  summary: "Stop a streaming assistant reply",
  description: "Only a reply that has not queued an image can be stopped; returns { stopped }.",
  tags: ["Image chat"],
  csrf: true,
  parameters: pathParameters("id", "turnId"),
});
for (const entry of [
  paths["/api/image-chats/{id}"].delete,
  paths["/api/image-chats/{id}/messages"].post,
  paths["/api/image-chats/{id}/state"].put,
]) {
  entry.responses[409] = response("The chat is busy or its state changed");
}
paths["/api/image-chats/{id}/messages"].post.responses[503] = response("The image-chat model is not configured");

const imageChatMemorySchema = {
  type: "object",
  properties: {
    content: { type: "string", maxLength: 4000, description: "Markdown preferences and rules every image chat follows." },
    updatedAt: { type: "string", format: "date-time", nullable: true },
  },
};

addOperation("/api/image-chat-memory", "get", {
  summary: "Read the caller's image-chat memory",
  tags: ["Image chat"],
  successSchema: imageChatMemorySchema,
});

addOperation("/api/image-chat-memory", "put", {
  summary: "Replace the caller's image-chat memory",
  tags: ["Image chat"],
  body: true,
  csrf: true,
  bodySchema: { type: "object", required: ["content"], properties: { content: { type: "string", maxLength: 4000 } } },
  successSchema: imageChatMemorySchema,
});

addOperation("/api/deck-jobs", "post", {
  summary: "Queue a PPT Master deck generation job",
  description: "Pins the tenant image model at admission. Image-free decks do not require an image model; later policy changes do not change this job's illustrations.",
  tags: ["AI"],
  body: true,
  csrf: true,
  successStatuses: [202],
});

addOperation("/api/deck-jobs/{id}", "get", {
  summary: "Get the status of a PPT Master deck generation job",
  tags: ["AI"],
  parameters: pathParameters("id"),
});

addOperation("/api/deck-jobs/{id}/download", "get", {
  summary: "Download the generated PPT Master presentation",
  tags: ["AI"],
  parameters: pathParameters("id"),
  successContentType:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  successSchema: {
    type: "string",
    format: "binary",
  },
});

addOperation("/api/deck-jobs/{id}/slides/{slideNumber}", "get", {
  summary: "Get one authored slide of a deck job as an SVG preview",
  tags: ["AI"],
  parameters: pathParameters("id", "slideNumber"),
  successContentType: "image/svg+xml",
  successSchema: {
    type: "string",
  },
});

addOperation("/api/ppt-templates", "get", {
  summary: "List the available PPT Master style and layout templates",
  tags: ["Templates"],
});

addOperation("/api/image-transform", "post", {
  summary: "Queue an owned-image transform",
  tags: ["AI"],
  body: true,
  csrf: true,
  successStatuses: [202],
  bodySchema: {
    type: "object",
    required: ["uploadId"],
    properties: {
      uploadId: { type: "string", format: "uuid" },
      mode: { type: "string", enum: ["style_transfer", "element_extract", "bg_replace", "reference_gen", "refine"] },
      maskUploadId: { type: "string", format: "uuid", description: "Owned PNG brush mask; transparent pixels mark the area to edit. Only for `refine`." },
      prompt: { type: "string" },
      aspectRatio: { type: "string" },
      imageSize: { type: "string" },
      imageLanguage: { type: "string" },
      quality: {
        type: "string", enum: IMAGE_QUALITIES,
        description: "Must be supported by the tenant default model. Omit to use its default quality.",
      },
    },
  },
});

for (const method of ["get", "post", "delete"]) {
  addOperation("/api/line-config", method, {
    summary: `${method === "get" ? "Get" : method === "post" ? "Save" : "Delete"} LINE configuration`,
    tags: ["LINE"],
    body: method === "post",
    csrf: method !== "get",
  });
}

addOperation("/api/optimize-prompt", "post", {
  summary: "Optimize an image prompt",
  tags: ["AI"],
  body: true,
  csrf: true,
});

addOperation("/api/video-storyboard", "post", {
  summary: "Queue a storyboard agent job, or inspect a video storyboard",
  description: "draft, revise and fromScript return 202 with a jobId and run in the storyboard job worker, because one analysis-model call can outlast the SWA linked backend's 45-second request limit; poll GET /api/video-storyboard/jobs/{id} for the result. The worker rechecks model access when the job runs. inspect validates synchronously and returns 200. draft, revise and fromScript use the tenant video_storyboard model, which must be a reasoning model because its reply is streamed with a reasoning summary; fromScript keeps every script verbatim unless condensed. fromScript takes either pasted script text or the uploadId of a ready document upload (DOCX, TXT or MD; other types return 415). A document becomes one shot per scene: DOCX scenes start at a heading-styled or short all-bold paragraph, TXT and MD scenes start at a # heading line, text before the first heading is the film-wide setting, and a document without headings returns 422. DOCX embedded images are stored as the caller's image uploads and attached as shot references. draft with an uploadId adapts a source document (DOCX, TXT, MD or text-based PDF; other types return 415, a PDF without text returns 422, text over 50,000 characters returns 422) into structured shots, brief becomes optional extra instructions, and only the document images the agent picks for a shot (up to 40 offered) are stored and attached. referencePreviews maps each new uploadId to a small data URL. Every result carries warnings and the planned segments, each with its compiled model request. Agent output that breaks storyboard rules fails the job with storyboard_agent_failed.",
  successStatuses: [200, 202],
  tags: ["Video"],
  body: true,
  csrf: true,
  bodySchema: {
    type: "object",
    required: ["action", "modelKey"],
    properties: {
      action: { type: "string", enum: ["draft", "revise", "fromScript", "inspect"] },
      modelKey: { type: "string" },
      brief: { type: "string", maxLength: 20000, description: "draft; required unless uploadId is set" },
      durationSeconds: { type: "integer", minimum: 1, maximum: MAX_PROJECT_SECONDS, description: "draft" },
      shotCount: { type: "integer", minimum: 1, maximum: MAX_SHOTS, description: "draft; set for direct generation" },
      hasStartFrame: { type: "boolean" },
      storyboard: { $ref: "#/components/schemas/VideoStoryboard" },
      instruction: { type: "string", maxLength: 4000, description: "revise" },
      shotIds: { type: "array", minItems: 1, items: { type: "string" }, description: "revise only these shots" },
      script: { type: "string", maxLength: 50000, description: "fromScript; exclusive with uploadId" },
      uploadId: { type: "string", format: "uuid", description: "a ready document upload; fromScript (exclusive with script) or draft (source document)" },
      characters: {
        type: "array",
        maxItems: MAX_CHARACTERS,
        description: "draft and fromScript; revise and inspect read them from storyboard.global",
        items: { $ref: "#/components/schemas/VideoCharacter" },
      },
    },
  },
});

addOperation("/api/send-line-image", "post", {
  summary: "Send an image through LINE",
  tags: ["LINE"],
  body: true,
  csrf: true,
});

for (const path of ["/api/history", "/api/history/{id}"]) {
  for (const method of ["get", "post", "delete"]) {
    addOperation(path, method, {
      summary: `${method === "get" ? "List" : method === "post" ? "Save" : "Delete"} history`,
      tags: ["History"],
      body: method === "post",
      csrf: method !== "get",
      parameters: path.includes("{id}") ? pathParameters("id") : [],
    });
  }
}

addOperation("/api/styles/search", "post", {
  summary: "Search the shared style library",
  tags: ["Styles"],
  body: true,
  csrf: true,
});

addOperation("/api/styles/backfill-embeddings", "post", {
  summary: "Backfill style embeddings",
  tags: ["Styles"],
  body: true,
  csrf: true,
});

for (const path of ["/api/styles", "/api/styles/{id}", "/api/styles/{id}/{action}"]) {
  for (const method of ["get", "post", "put", "delete"]) {
    addOperation(path, method, {
      summary: `${method.toUpperCase()} style resource`,
      tags: ["Styles"],
      body: ["post", "put"].includes(method),
      csrf: method !== "get",
      parameters: pathParameters(
        ...(path.includes("{id}") ? ["id"] : []),
        ...(path.includes("{action}") ? ["action"] : [])
      ),
    });
  }
}

for (const path of ["/api/templates", "/api/templates/{id}"]) {
  for (const method of ["get", "post", "put", "delete"]) {
    addOperation(path, method, {
      summary: `${method.toUpperCase()} template resource`,
      tags: ["Templates"],
      body: ["post", "put"].includes(method),
      csrf: method !== "get",
      parameters: path.includes("{id}") ? pathParameters("id") : [],
    });
  }
}

for (const path of ["/api/management", "/api/management/{resource}", "/api/management/{resource}/{id}"]) {
  for (const method of ["get", "put", "delete"]) {
    addOperation(path, method, {
      summary: `${method.toUpperCase()} management resource`,
      tags: ["Administration"],
      body: method === "put",
      csrf: method !== "get",
      parameters: pathParameters(
        ...(path.includes("{resource}") ? ["resource"] : []),
        ...(path.includes("{id}") ? ["id"] : [])
      ),
    });
  }
}

const publicImageModelSchema = {
  type: "object",
  additionalProperties: false,
  required: ["modelKey", "label", "apiType", "supportedQualities", "defaultQuality"],
  properties: {
    modelKey: { type: "string" },
    label: { type: "string" },
    apiType: { type: "string", enum: IMAGE_API_TYPES.map(({ id }) => id) },
    supportedQualities: { type: "array", minItems: 1, items: { type: "string", enum: IMAGE_QUALITIES } },
    defaultQuality: { type: "string", enum: IMAGE_QUALITIES },
  },
};
const adminImageModelSchema = {
  ...publicImageModelSchema,
  properties: {
    ...publicImageModelSchema.properties,
    deploymentName: { type: "string" },
    endpoint: { type: "string", format: "uri" },
    hasApiKey: { type: "boolean" },
    createdAt: jsonObjectSchema,
    updatedAt: jsonObjectSchema,
  },
};
const imageModelWriteSchema = {
  type: "object",
  additionalProperties: false,
  required: ["modelKey", "label", "apiType", "deploymentName", "endpoint", "supportedQualities", "defaultQuality"],
  properties: {
    ...publicImageModelSchema.properties,
    deploymentName: { type: "string", description: "Azure deployment name; immutable after creation." },
    endpoint: { type: "string", format: "uri", description: "Azure HTTPS resource, v1 base, or v1 images/generations URL. No credentials/query/fragment." },
    apiKey: { type: "string", writeOnly: true, description: "Required for create. Omit or send empty on update to retain the encrypted key." },
  },
};
const imageCatalogSchema = {
  type: "object",
  properties: {
    models: { type: "array", items: adminImageModelSchema },
    apiTypes: { type: "array", items: jsonObjectSchema },
    qualities: { type: "array", items: { type: "string", enum: IMAGE_QUALITIES } },
  },
};
const modelPolicySchema = {
  type: "object",
  properties: {
    allowedModels: { type: "array", items: { type: "string" } },
    defaultModel: { type: "string", nullable: true, description: "Model for generate jobs." },
    defaultEditModel: { type: "string", nullable: true, description: "Model for edit jobs (refine, precise edit, transforms)." },
    updatedAt: { ...jsonObjectSchema, nullable: true },
  },
};
const queuedImageSchema = {
  type: "object",
  required: ["jobId", "status", "model"],
  properties: {
    jobId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["queued"] },
    model: { type: "string", description: "The immutable catalog key selected by the backend." },
    prompt: { type: "string" },
    aspectRatio: { type: "string" },
    mode: { type: "string" },
  },
};

for (const method of ["get", "post"]) {
  addOperation("/api/management/image-models", method, {
    summary: method === "get" ? "List tenant image models without secrets" : "Register an image model without changing tenant policy",
    tags: ["Administration"],
    body: method === "post",
    bodySchema: { ...imageModelWriteSchema, required: [...imageModelWriteSchema.required, "apiKey"] },
    csrf: method !== "get",
    successStatuses: method === "post" ? [201] : [200],
    successSchema: imageCatalogSchema,
  });
}
for (const method of ["put", "delete"]) {
  addOperation("/api/management/image-models/{id}", method, {
    summary: method === "put" ? "Update image model settings" : "Delete an unused tenant image model",
    description: "The path id is modelKey. Models referenced by policy cannot be deleted; runtime changes and deletion are blocked by active image or deck jobs.",
    tags: ["Administration"],
    body: method === "put",
    bodySchema: imageModelWriteSchema,
    csrf: true,
    parameters: pathParameters("id"),
    successSchema: imageCatalogSchema,
  });
}
addOperation("/api/management/image-model-tests", "post", {
  summary: "Explicitly queue a billed, low-quality generation test of a saved model",
  description: "Requires administrator privileges. Does not change policy or verify editing/all qualities. Poll the returned image job.",
  tags: ["Administration"],
  body: true,
  bodySchema: { type: "object", required: ["modelKey"], properties: { modelKey: { type: "string" } } },
  csrf: true,
  successStatuses: [202],
  successSchema: queuedImageSchema,
});
for (const method of ["get", "put"]) {
  addOperation("/api/management/settings", method, {
    summary: method === "get" ? "Read image model policy and public catalog" : "Set allowed, generation and edit tenant image models",
    tags: ["Administration"],
    body: method === "put",
    bodySchema: {
      type: "object", required: ["allowedModels", "defaultModel", "defaultEditModel"],
      properties: {
        allowedModels: { type: "array", minItems: 1, items: { type: "string" } },
        defaultModel: { type: "string" },
        defaultEditModel: { type: "string" },
      },
    },
    csrf: method === "put",
    successSchema: {
      type: "object",
      properties: { modelPolicy: modelPolicySchema, models: { type: "array", items: publicImageModelSchema } },
    },
  });
}
paths["/api/me"].get.responses[200] = response("Profile and public image model metadata", {
  schema: {
    type: "object",
    properties: {
      user: jsonObjectSchema,
      modelPolicy: modelPolicySchema,
      imageModels: { type: "array", items: publicImageModelSchema },
    },
  },
});
for (const path of ["/api/generate-images", "/api/image-transform"]) {
  paths[path].post.responses[202] = response("Queued image job", { schema: queuedImageSchema });
}
paths["/api/image-jobs/{id}"].get.responses[200] = response("Owner-scoped image job status", {
  schema: {
    type: "object",
    required: ["jobId", "status", "model", "operation"],
    properties: {
      jobId: { type: "string", format: "uuid" },
      status: { type: "string", enum: ["queued", "processing", "succeeded", "failed"] },
      model: { type: "string" },
      operation: { type: "string", enum: ["generate", "edit"] },
      imageUrl: { type: "string", description: "Present only for succeeded jobs." },
      error: jsonObjectSchema,
    },
  },
});
paths["/api/history"].post.requestBody = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        oneOf: [{ required: ["jobId", "imageUrl"] }, { required: ["videoProjectId"] }],
        properties: {
          jobId: { type: "string", format: "uuid", description: "Owned succeeded image job; the server derives the history model from this job, never current policy." },
          imageUrl: { type: "string", description: "Compressed history preview; required with jobId." },
          videoProjectId: { type: "string", format: "uuid", description: "Owned video project with a finished video: its only segment succeeded, or its multi-segment render succeeded. The model comes from the project." },
          fullPrompt: { type: "string" },
          userScript: { type: "string" },
          stylePrompt: { type: "string" },
          styleId: { type: "string", nullable: true },
          source: { type: "string" },
        },
      },
    },
  },
};
paths["/api/history"].post.responses[201] = response("Saved image or video history");
delete paths["/api/history"].post.responses[200];
paths["/api/history"].post.responses[409] = response("The image job has not succeeded, or the video project has no finished video");
paths["/api/deck-jobs"].post.responses[202] = response("Queued deck job", {
  schema: {
    type: "object",
    required: ["jobId", "status"],
    properties: {
      jobId: { type: "string", format: "uuid" },
      status: { type: "string", enum: ["queued"] },
      model: { type: "string", description: "Image model catalog key pinned at admission; omitted when no model is assigned." },
      createdAt: { type: "string", format: "date-time" },
    },
  },
});
paths["/api/deck-jobs/{id}"].get.responses[200] = response("Deck status including the pinned image model", {
  schema: {
    ...jsonObjectSchema,
    properties: {
      model: { type: "string", description: "The saved image model key, not the current tenant policy; omitted when unassigned." },
    },
  },
});
for (const path of [
  "/api/management/image-models", "/api/management/image-models/{id}",
  "/api/management/image-model-tests", "/api/management/settings",
  "/api/generate-images", "/api/image-transform",
]) {
  for (const entry of Object.values(paths[path])) {
    entry.responses[409] = response("Model configuration or usage conflict");
    entry.responses[503] = response("Image model is not configured");
  }
}

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "Pixora API",
    version: "1.0.0",
    description: "Interactive API reference for the Pixora image generation platform.",
  },
  servers: [{ url: "/", description: "Current host" }],
  tags: [
    { name: "System" },
    { name: "Authentication" },
    { name: "AI" },
    { name: "Image chat" },
    { name: "Storage" },
    { name: "History" },
    { name: "Styles" },
    { name: "Templates" },
    { name: "LINE" },
    { name: "Administration" },
  ],
  components: {
    schemas: {
      VideoCharacter: {
        type: "object",
        required: ["id", "name", "uploadIds"],
        description: "A character or product. Kling image-to-video sends it as an element referenced by @ElementN; otherwise the name and description are written into each shot.",
        properties: {
          id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,40}$" },
          name: { type: "string", maxLength: 30 },
          description: { type: "string", maxLength: 300 },
          uploadIds: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            description: "Owned image uploads; the first is the frontal image.",
            items: { type: "string", format: "uuid" },
          },
          imageLabel: { type: ["string", "null"], pattern: "^Image[1-9][0-9]?$", description: "Script @ImageN this character replaces" },
        },
      },
      VideoStoryboard: {
        type: "object",
        required: ["title", "global", "shots"],
        properties: {
          title: { type: "string", maxLength: 30 },
          global: {
            type: "object",
            properties: {
              style: { type: "string", maxLength: 300 },
              lighting: { type: "string", maxLength: 300 },
              constraints: { type: "array", maxItems: 8, items: { type: "string", maxLength: 200 } },
              negative: { type: "string", maxLength: PROMPT_LIMIT },
              characters: { type: "array", maxItems: MAX_CHARACTERS, items: { $ref: "#/components/schemas/VideoCharacter" } },
            },
          },
          shots: {
            type: "array",
            minItems: 1,
            maxItems: MAX_SHOTS,
            description: "A shot is either structured (script null) or a script shot (shotSize through environment null).",
            items: {
              type: "object",
              required: ["id", "duration"],
              properties: {
                id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,40}$" },
                title: { type: ["string", "null"], maxLength: 30 },
                script: { type: ["string", "null"], maxLength: PROMPT_LIMIT },
                scriptOriginal: { type: ["string", "null"] },
                references: {
                  type: "array",
                  maxItems: MAX_SHOT_REFERENCES,
                  description: "Images imported with the shot's script; the agent never sees or changes them",
                  items: {
                    type: "object",
                    required: ["label", "uploadId"],
                    properties: {
                      label: { type: "string", pattern: "^Image[0-9]+$" },
                      uploadId: { type: "string", format: "uuid" },
                    },
                  },
                },
                startFrameUploadId: {
                  type: ["string", "null"],
                  format: "uuid",
                  description: "Image upload that starts this shot's segment as image-to-video; only on the first shot or a cut shot, and not together with a request start frame",
                },
                duration: { type: "integer", minimum: 1, maximum: 15 },
                cut: { type: "boolean", description: "Starts a new scene and a new text-to-video segment; ignored on the first shot" },
                shotSize: { type: ["string", "null"], enum: [...Object.keys(SHOT_SIZES), null] },
                angle: { type: ["string", "null"], enum: [...Object.keys(ANGLES), null] },
                camera: { type: ["string", "null"], enum: [...Object.keys(CAMERAS), null] },
                action: { type: ["string", "null"], maxLength: 1000 },
                environment: { type: ["string", "null"], maxLength: 500 },
                characterIds: { type: "array", items: { type: "string" }, description: "ids from global.characters" },
              },
            },
          },
        },
      },
    },
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "pixora_session",
        description: "Opaque Pixora server session cookie.",
      },
    },
  },
  paths,
};

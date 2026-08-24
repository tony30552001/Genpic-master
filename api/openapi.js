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
  tags,
  auth = true,
  body = false,
  csrf = false,
  successStatuses = [200],
  successContentType = "application/json",
  successSchema = jsonObjectSchema,
  parameters = [],
}) => ({
  summary,
  tags,
  ...(auth
    ? {
        security: [
          { sessionCookie: [] },
        ],
      }
    : {}),
  ...(body ? { requestBody } : {}),
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

addOperation("/api/analyze-document", "post", {
  summary: "Analyze an uploaded document",
  tags: ["AI"],
  body: true,
  csrf: true,
});

addOperation("/api/analyze-style", "post", {
  summary: "Analyze a visual style",
  tags: ["AI"],
  body: true,
  csrf: true,
});

addOperation("/api/blob-sas", "post", {
  summary: "Create a blob upload SAS URL",
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
  summary: "Start an image generation request",
  tags: ["AI"],
  body: true,
  csrf: true,
  successStatuses: [200, 202],
});

addOperation("/api/image-jobs/{id}", "get", {
  summary: "Get the status of an image generation job",
  tags: ["AI"],
  parameters: pathParameters("id"),
});

addOperation("/api/deck-jobs", "post", {
  summary: "Queue a PPT Master deck generation job",
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
  summary: "Transform an image",
  tags: ["AI"],
  body: true,
  csrf: true,
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

addOperation("/api/optimize-scene", "post", {
  summary: "Optimize a document scene",
  tags: ["AI"],
  body: true,
  csrf: true,
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
    { name: "Storage" },
    { name: "History" },
    { name: "Styles" },
    { name: "Templates" },
    { name: "LINE" },
    { name: "Administration" },
  ],
  components: {
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

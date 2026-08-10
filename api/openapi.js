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

const response = (description) => ({
  description,
  content: {
    "application/json": {
      schema: jsonObjectSchema,
    },
  },
});

const operation = ({
  summary,
  tags,
  auth = true,
  body = false,
  successStatuses = [200],
  parameters = [],
}) => ({
  summary,
  tags,
  ...(auth
    ? {
        security: [
          { authToken: [] },
          { bearerAuth: [] },
        ],
      }
    : {}),
  ...(body ? { requestBody } : {}),
  ...(parameters.length > 0 ? { parameters } : {}),
  responses: {
    ...Object.fromEntries(
      successStatuses.map((status) => [
        status,
        status === 204
          ? { description: "No content" }
          : response(status === 202 ? "Accepted" : "Successful response"),
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

addOperation("/api/me", "get", {
  summary: "Get the current user profile and model policy",
  tags: ["Authentication"],
});

addOperation("/api/analyze-document", "post", {
  summary: "Analyze an uploaded document",
  tags: ["AI"],
  body: true,
});

addOperation("/api/analyze-style", "post", {
  summary: "Analyze a visual style",
  tags: ["AI"],
  body: true,
});

addOperation("/api/blob-sas", "post", {
  summary: "Create a blob upload SAS URL",
  tags: ["Storage"],
  body: true,
});

addOperation("/api/embeddings", "post", {
  summary: "Create text embeddings",
  tags: ["AI"],
  body: true,
});

for (const method of ["get", "post"]) {
  addOperation("/api/generate-filename", method, {
    summary: "Generate a filename",
    tags: ["AI"],
    body: method === "post",
  });
}

addOperation("/api/generate-images", "post", {
  summary: "Start an image generation request",
  tags: ["AI"],
  body: true,
  successStatuses: [200, 202],
});

addOperation("/api/image-jobs/{id}", "get", {
  summary: "Get the status of an image generation job",
  tags: ["AI"],
  parameters: pathParameters("id"),
});

addOperation("/api/image-transform", "post", {
  summary: "Transform an image",
  tags: ["AI"],
  body: true,
});

for (const method of ["get", "post", "delete"]) {
  addOperation("/api/line-config", method, {
    summary: `${method === "get" ? "Get" : method === "post" ? "Save" : "Delete"} LINE configuration`,
    tags: ["LINE"],
    body: method === "post",
  });
}

addOperation("/api/optimize-prompt", "post", {
  summary: "Optimize an image prompt",
  tags: ["AI"],
  body: true,
});

addOperation("/api/optimize-scene", "post", {
  summary: "Optimize a document scene",
  tags: ["AI"],
  body: true,
});

addOperation("/api/send-line-image", "post", {
  summary: "Send an image through LINE",
  tags: ["LINE"],
  body: true,
});

for (const path of ["/api/history", "/api/history/{id}"]) {
  for (const method of ["get", "post", "delete"]) {
    addOperation(path, method, {
      summary: `${method === "get" ? "List" : method === "post" ? "Save" : "Delete"} history`,
      tags: ["History"],
      body: method === "post",
      parameters: path.includes("{id}") ? pathParameters("id") : [],
    });
  }
}

addOperation("/api/styles/search", "post", {
  summary: "Search the shared style library",
  tags: ["Styles"],
  body: true,
});

addOperation("/api/styles/backfill-embeddings", "post", {
  summary: "Backfill style embeddings",
  tags: ["Styles"],
  body: true,
});

for (const path of ["/api/styles", "/api/styles/{id}", "/api/styles/{id}/{action}"]) {
  for (const method of ["get", "post", "put", "delete"]) {
    addOperation(path, method, {
      summary: `${method.toUpperCase()} style resource`,
      tags: ["Styles"],
      body: ["post", "put"].includes(method),
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
      authToken: {
        type: "apiKey",
        in: "header",
        name: "X-Auth-Token",
        description: "Microsoft Entra ID or Google ID token.",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Alternative Authorization header accepted by the API.",
      },
    },
  },
  paths,
};

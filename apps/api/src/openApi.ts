import type { FastifyInstance } from "fastify";

function openApiPath(url: string) {
  return url.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function pathParameters(url: string) {
  return [...url.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" }
  }));
}

export function installOpenApi(app: FastifyInstance) {
  const paths: Record<string, Record<string, unknown>> = {};
  app.addHook("onRoute", (route: any) => {
    const methods = (Array.isArray(route.method) ? route.method : [route.method]).map((item: string) => item.toLowerCase());
    const path = openApiPath(route.url);
    paths[path] ??= {};
    for (const method of methods) {
      if (method === "head") continue;
      const parameters: any[] = pathParameters(route.url);
      const isPaginated = method === "get" && (/catalog|ranking-(?:top100|border)|live2d\/models|virtual-lives\/context/.test(route.url));
      const isAccountMutation = route.url.startsWith("/api/me/") && !route.url.startsWith("/api/me/tools/") && ["post", "put", "patch", "delete"].includes(method);
      const isPng = method === "get" && route.url.endsWith(".png");
      if (isPaginated) {
        parameters.push(
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 24 } }
        );
      }
      if (isAccountMutation) {
        parameters.push({ $ref: "#/components/parameters/IdempotencyKey" });
        if (["put", "patch", "delete"].includes(method)) parameters.push({ $ref: "#/components/parameters/IfMatch" });
      }
      paths[path][method] = {
        operationId: `${method}_${route.url.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
        tags: [route.url.startsWith("/api/me") ? "Account" : route.url.startsWith("/api/master") ? "Master data" : route.url.startsWith("/api/events") ? "Events" : route.url.startsWith("/api/tools") ? "Tools" : route.url.startsWith("/api/auth") ? "Authentication" : route.url.startsWith("/api/share") ? "Sharing" : "System"],
        parameters,
        ...(route.url.startsWith("/api/me") ? { security: [{ bearerAuth: [] }] } : {}),
        ...(method !== "get" && method !== "delete" ? { requestBody: { required: false, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } } } : {}),
        responses: {
          "200": isPng
            ? { description: "Rendered PNG image", content: { "image/png": { schema: { type: "string", contentEncoding: "binary" } } } }
            : { description: "Successful response", content: { "application/json": { schema: isPaginated ? { $ref: "#/components/schemas/Pagination" } : { type: "object", additionalProperties: true } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "409": { $ref: "#/components/responses/Conflict" },
          "412": { $ref: "#/components/responses/PreconditionFailed" }
        }
      };
    }
  });

  return () => ({
    openapi: "3.1.0",
    info: { title: "pjsktools API", version: "0.2.0", description: "Public and authenticated API contract for pjsktools." },
    servers: [{ url: "/", description: "Current server" }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: {
        Pagination: {
          type: "object",
          required: ["items", "page", "pageSize", "total", "totalPages", "hasNextPage", "hasPreviousPage"],
          properties: {
            items: { type: "array", items: {} }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" }, hasNextPage: { type: "boolean" }, hasPreviousPage: { type: "boolean" }
          }
        },
        Error: { type: "object", required: ["statusCode", "code", "message"], properties: { statusCode: { type: "integer" }, code: { type: "string" }, message: { type: "string" }, retryable: { type: "boolean" } } }
      },
      responses: {
        BadRequest: { description: "Invalid input", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Unauthorized: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Conflict: { description: "Idempotency or resource conflict", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        PreconditionFailed: { description: "Optimistic concurrency check failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
      },
      parameters: {
        IdempotencyKey: { name: "Idempotency-Key", in: "header", schema: { type: "string", minLength: 8, maxLength: 128 } },
        IfMatch: { name: "If-Match", in: "header", schema: { type: "string" } }
      }
    }
  });
}

import { describe, expect, it } from "vitest";
import { buildApp, catalogResponse } from "./app.js";

function replyMock() {
  const headers: Record<string, string> = {};
  let statusCode: number | undefined;
  return {
    headers,
    get statusCode() { return statusCode; },
    header(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    code(value: number) {
      statusCode = value;
      return this;
    },
    send() { return this; }
  };
}

describe("catalog response validators", () => {
  it("returns 200 when response data changes under the same registry content hash", () => {
    const firstReply = replyMock();
    const firstPayload = { contentHash: "registry-v1", items: [{ id: "1", name: "Before" }] };
    catalogResponse(firstReply, { headers: {} }, firstPayload);

    const secondReply = replyMock();
    const secondPayload = { contentHash: "registry-v1", items: [{ id: "1", name: "After" }] };
    const result = catalogResponse(secondReply, { headers: { "if-none-match": firstReply.headers.etag } }, secondPayload);

    expect(result).toEqual(secondPayload);
    expect(secondReply.statusCode).toBeUndefined();
    expect(secondReply.headers.etag).not.toBe(firstReply.headers.etag);
    expect(secondReply.headers["x-master-content-hash"]).toBe("registry-v1");
  });

  it("returns 304 only when the complete response body is unchanged", () => {
    const firstReply = replyMock();
    const payload = { contentHash: "registry-v1", items: [{ id: "1", name: "Same" }] };
    catalogResponse(firstReply, { headers: {} }, payload);

    const cachedReply = replyMock();
    const result = catalogResponse(cachedReply, { headers: { "if-none-match": firstReply.headers.etag } }, payload);

    expect(cachedReply.statusCode).toBe(304);
    expect(result).toBe(cachedReply);
  });

  it("exposes catalog validators to browser clients through CORS", async () => {
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "http://127.0.0.1:5173" }
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["access-control-expose-headers"]).toContain("etag");
      expect(response.headers["access-control-expose-headers"]).toContain("x-master-content-hash");
    } finally {
      await app.close();
    }
  });
});

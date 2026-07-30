import { describe, expect, it } from "vitest";
import { MemoryStore } from "./store.js";
import { createWriteControls } from "./writeControls.js";

function request(path: string) {
  return {
    method: "POST",
    url: path,
    body: { region: "jp", playerUid: "123456789012345678" },
    headers: { "idempotency-key": "privacy-test-key" }
  } as any;
}

function reply() {
  return {
    header() { return this; },
    code() { return this; },
    send() { return this; }
  } as any;
}

describe("Haruki idempotency privacy", () => {
  it.each([
    "/api/me/haruki/public/preview",
    "/api/me/haruki/oauth/start"
  ])("does not reserve response storage for %s", async (path) => {
    const store = new MemoryStore();
    const controls = createWriteControls(store);
    await controls.before(request(path), reply(), "user-1");

    expect(await store.getIdempotencyRecord(`user-1:POST:${path}`, "privacy-test-key")).toBeNull();
  });

  it("continues to reserve ordinary mutation responses", async () => {
    const store = new MemoryStore();
    const controls = createWriteControls(store);
    const path = "/api/me/scores";
    await controls.before(request(path), reply(), "user-1");

    expect(await store.getIdempotencyRecord(`user-1:POST:${path}`, "privacy-test-key")).not.toBeNull();
  });
});

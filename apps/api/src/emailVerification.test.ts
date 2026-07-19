import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStore } from "./store.js";

describe("email verification delivery", () => {
  it("returns expiry and cooldown metadata and enforces the email cooldown", async () => {
    const testStore = new MemoryStore();
    const app = await buildApp({
      smtpAvailable: true,
      verificationEmailSender: async () => ({ sent: true }),
      authStore: testStore
    });
    const email = `verification-${Date.now()}@example.com`;
    const first = await app.inject({
      method: "POST",
      url: "/api/auth/email-code/start",
      payload: { email, purpose: "register" }
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ok: true, sent: true, expiresIn: 300, resendAfter: 60 });
    expect(await testStore.getLatestEmailVerificationCode(email, "register")).not.toBeNull();

    const sameEmail = await app.inject({
      method: "POST",
      url: "/api/auth/email-code/start",
      payload: { email, purpose: "register" }
    });
    expect(sameEmail.statusCode).toBe(429);
    expect(sameEmail.headers["retry-after"]).toBeTruthy();
    expect(sameEmail.json().code).toBe("EMAIL_CODE_COOLDOWN");

    await app.close();
  });

  it("atomically reserves a cooldown shared by concurrent callers", async () => {
    const sharedStore = new MemoryStore();
    const email = `concurrent-${Date.now()}@example.com`;
    const [first, second] = await Promise.all([
      sharedStore.reserveEmailVerificationCooldown({ email, purpose: "register", reservationId: randomUUID(), cooldownSeconds: 60 }),
      sharedStore.reserveEmailVerificationCooldown({ email, purpose: "register", reservationId: randomUUID(), cooldownSeconds: 60 })
    ]);
    expect([first, second].filter((value) => value === 0)).toHaveLength(1);
    expect([first, second].filter((value) => value > 0)).toHaveLength(1);
  });

  it("does not create a usable code when email delivery fails", async () => {
    const testStore = new MemoryStore();
    const app = await buildApp({
      smtpAvailable: true,
      verificationEmailSender: async () => { throw new Error("SMTP_DELIVERY_FAILED"); },
      authStore: testStore
    });
    const email = `failed-${Date.now()}@example.com`;
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/email-code/start",
      payload: { email, purpose: "register" }
    });
    expect(response.statusCode).toBe(503);
    expect(await testStore.getLatestEmailVerificationCode(email, "register")).toBeNull();
    await app.close();
  });
});

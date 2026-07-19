import { describe, expect, it } from "vitest";
import { smtpCommandError } from "./emailService.js";

describe("SMTP error redaction", () => {
  it("never includes credentials, recipient, code, command payload, or server text in errors", async () => {
    const sensitive = {
      user: "smtp-user@example.com",
      pass: "smtp-secret-token",
      recipient: "recipient@example.com",
      code: "123456",
      response: "334 sensitive-server-response"
    };
    const message = smtpCommandError("AUTH_PASS", `${sensitive.response} ${Object.values(sensitive).join(" ")}`).message;
    expect(message).toBe("SMTP_AUTH_PASS_FAILED_334");
    for (const value of Object.values(sensitive)) expect(message).not.toContain(value);
  });
});

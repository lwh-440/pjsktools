import { describe, expect, it } from "vitest";
import { parseQqCallback, safeQqReturnTo } from "./qqOAuth";

describe("QQ OAuth browser navigation", () => {
  it("allows only local path returns", () => {
    expect(safeQqReturnTo("/me?tab=qq#account")).toBe("/me?tab=qq#account");
    expect(safeQqReturnTo("//attacker.example/callback")).toBe("/me");
    expect(safeQqReturnTo("https://attacker.example/callback")).toBe("/me");
    expect(safeQqReturnTo("/auth/qq/callback?handoff=loop")).toBe("/me");
    expect(safeQqReturnTo("javascript:alert(1)")).toBe("/me");
  });

  it("accepts only web-audience handoffs", () => {
    expect(parseQqCallback("?handoff=web_11111111111111111111111111111111&returnTo=%2Fsection%2Fsongs")).toEqual({
      status: "exchange",
      handoff: "web_11111111111111111111111111111111",
      returnTo: "/section/songs"
    });
    expect(parseQqCallback("?handoff=11111111111111111111111111111111").status).toBe("error");
    expect(parseQqCallback("?handoff=web_short").status).toBe("error");
  });

  it("maps server error codes to readable messages without reflecting arbitrary text", () => {
    expect(parseQqCallback("?error=qq_authorization_cancelled&returnTo=%2Flogin")).toEqual({
      status: "error",
      message: "你已取消 QQ 授权，可以重新尝试或使用邮箱登录。",
      returnTo: "/login"
    });
    expect(parseQqCallback("?error=attacker-controlled").status).toBe("error");
    expect((parseQqCallback("?error=attacker-controlled") as { message: string }).message).not.toContain("attacker");
  });
});

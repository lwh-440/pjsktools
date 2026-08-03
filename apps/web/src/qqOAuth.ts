export const QQ_CONNECT_BUTTON_URL = "https://qzonestyle.gtimg.cn/qzone/vas/opensns/res/img/Connect_logo_3.png";

const webHandoffPattern = /^web_[0-9a-f]{32}$/;

export function safeQqReturnTo(value: string | null | undefined, fallback = "/me") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const target = new URL(value, "https://sekai-tools.invalid");
    if (target.origin !== "https://sekai-tools.invalid" || target.pathname === "/auth/qq/callback") return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export type QqCallbackInput =
  | { status: "exchange"; handoff: string; returnTo: string }
  | { status: "error"; message: string; returnTo: string };

export function parseQqCallback(search: string): QqCallbackInput {
  const params = new URLSearchParams(search);
  const returnTo = safeQqReturnTo(params.get("returnTo"));
  const error = params.get("error");
  if (error) {
    const message = error === "qq_authorization_cancelled"
      ? "你已取消 QQ 授权，可以重新尝试或使用邮箱登录。"
      : error === "qq_login_failed"
        ? "QQ 登录服务暂时不可用，请稍后重试。"
        : "QQ 授权未完成，请重新尝试。";
    return { status: "error", message, returnTo };
  }
  const handoff = params.get("handoff") ?? "";
  if (!webHandoffPattern.test(handoff)) {
    return { status: "error", message: "QQ 登录回调无效或不完整，请从登录页重新发起。", returnTo };
  }
  return { status: "exchange", handoff, returnTo };
}

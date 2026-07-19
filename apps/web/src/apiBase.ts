const localApiBaseUrl = "http://127.0.0.1:4000";

export function resolveApiBaseUrl(configuredUrl?: string, pageUrl?: string) {
  const configured = configuredUrl?.trim().replace(/\/+$/, "");
  if (configured) {
    if (pageUrl) {
      const page = new URL(pageUrl);
      const api = new URL(configured, page);
      const isProductionSite = page.hostname === "sekai-tools.cn" || page.hostname === "www.sekai-tools.cn";
      if (isProductionSite && page.protocol === "https:" && api.protocol === "http:") return "https://api.sekai-tools.cn";
    }
    return configured;
  }

  if (!pageUrl) return localApiBaseUrl;
  const page = new URL(pageUrl);
  if (page.hostname === "sekai-tools.cn" || page.hostname === "www.sekai-tools.cn") return "https://api.sekai-tools.cn";
  return localApiBaseUrl;
}

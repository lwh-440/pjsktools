import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_DEV_API_PROXY_TARGET?.trim().replace(/\/+$/, "");

  return {
    server: proxyTarget
      ? {
          proxy: {
            "/api": {
              target: proxyTarget,
              changeOrigin: true,
              secure: false
            }
          }
        }
      : undefined
  };
});

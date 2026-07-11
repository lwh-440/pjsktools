import { buildApp } from "./app.js";
import { startAutoUpdate } from "./autoUpdate.js";
import { config } from "./config.js";

const app = await buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
  startAutoUpdate(app.log);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

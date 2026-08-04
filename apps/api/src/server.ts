import { buildApp } from "./app.js";
import { startAutoUpdate } from "./autoUpdate.js";
import { config } from "./config.js";
import { assertDatabaseRuntimeRoleSafety } from "./store.js";
import { assertHarukiDatabaseRuntimeRoleSafety } from "./harukiStore.js";

const databaseRuntimeLogins=await assertDatabaseRuntimeRoleSafety();
await assertHarukiDatabaseRuntimeRoleSafety(databaseRuntimeLogins);
const app = await buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
  startAutoUpdate(app.log);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

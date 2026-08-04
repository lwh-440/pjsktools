import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { config } from "../config.js";

function getApiRoot() {
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}api`) ? cwd : path.join(cwd, "apps", "api");
}

async function main() {
  if (!config.databaseMigrationUrl) {
    throw new Error("DATABASE_MIGRATION_URL is required for db:migrate and must not be exposed to the API runtime");
  }
  const pool = new Pool({ connectionString: config.databaseMigrationUrl });
  const migrationsDir = path.join(getApiRoot(), "src", "db", "migrations");
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  try {
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), "utf-8");
      await pool.query(sql);
      console.log(`Applied ${file}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

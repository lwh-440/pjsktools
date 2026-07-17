import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildApp } from "./app.js";

const app = await buildApp();
try {
  const response = await app.inject({ method: "GET", url: "/openapi.json" });
  if (response.statusCode !== 200) throw new Error(`OpenAPI export failed with ${response.statusCode}`);
  const workspace = process.cwd().endsWith(path.join("apps", "api")) ? process.cwd() : path.resolve(process.cwd(), "apps", "api");
  const output = process.env.OPENAPI_OUTPUT
    ? path.resolve(process.env.OPENAPI_OUTPUT)
    : path.join(workspace, "openapi", "openapi.json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(response.json(), null, 2)}\n`, "utf-8");
  console.log(output);
} finally {
  await app.close();
}

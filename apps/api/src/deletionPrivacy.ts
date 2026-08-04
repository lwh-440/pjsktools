import { createHmac } from "node:crypto";
import { config } from "./config.js";

export function deletionIdentifierHash(kind: "user" | "email", value: string) {
  const normalized = kind === "email" ? value.trim().toLowerCase() : value;
  return createHmac("sha256", config.deletionTombstoneKey).update(`${kind}:${normalized}`).digest("hex");
}

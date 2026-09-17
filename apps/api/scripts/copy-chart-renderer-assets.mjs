import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const source = resolve(import.meta.dirname, "../src/vendor/pjsekai-scores");
const destination = resolve(import.meta.dirname, "../dist/vendor/pjsekai-scores");
await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });

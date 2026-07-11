import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const roots = ["apps/api/src", "apps/api/test", "apps/web/src", "android/app/src/main", "scripts", "README.md", "agent.md", "spawn EPERM解决.md"];
const extensions = new Set([".ts", ".tsx", ".css", ".html", ".json", ".md", ".kt", ".xml", ".kts"]);
const suspiciousPatterns = [
  /\uFFFD/u,
  /\?{4,}/u,
  /鐩|褰|鍗|绋|涓|鏃|瑙|妗|鏆|姝|鍔|绾|鎼|鏉|瀹|銆|鈽|鎾|妯|杩|濯|棰|琛|璧/u
];

async function collectFiles(target) {
  const targetPath = path.resolve(target);
  try {
    const entries = await readdir(targetPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const child = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectFiles(child)));
      } else if (extensions.has(path.extname(entry.name))) {
        files.push(child);
      }
    }
    return files;
  } catch {
    return extensions.has(path.extname(targetPath)) ? [targetPath] : [];
  }
}

const files = (await Promise.all(roots.map(collectFiles))).flat();
const failures = [];

for (const file of files) {
  const buffer = await readFile(file);
  const text = buffer.toString("utf8");
  if (Buffer.from(text, "utf8").compare(buffer) !== 0) {
    failures.push(`${file}: not valid UTF-8`);
    continue;
  }
  if (suspiciousPatterns.some((pattern) => pattern.test(text))) {
    failures.push(`${file}: contains suspicious mojibake/replacement text`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Encoding check passed for ${files.length} files.`);

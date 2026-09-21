import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const roots = ["app", "lib", "supabase", "docs", ".github"];
const allowed = new Set([".env.example"]);
const suspicious = [
  { name: "hard-coded Supabase service-role JWT", regex: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
  { name: "hard-coded GitHub token", regex: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: "hard-coded private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

async function walk(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const rel = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...await walk(rel));
    else out.push(rel);
  }
  return out;
}

const files = (await Promise.all(roots.map(walk))).flat().filter((f) => !allowed.has(f));
let failed = false;
for (const file of files) {
  if (/\.(?:png|jpg|jpeg|gif|ico|zip|woff2?)$/i.test(file)) continue;
  const text = await readFile(file, "utf8").catch(() => "");
  for (const rule of suspicious) {
    if (rule.regex.test(text)) {
      console.error(`Potential ${rule.name}: ${file}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`Secret scan passed (${files.length} text files checked).`);

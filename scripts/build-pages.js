const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "public");
const output = path.join(root, "_site");
const jszip = path.join(root, "node_modules", "jszip", "dist", "jszip.min.js");

if (!fs.existsSync(jszip)) {
  console.error("JSZip is missing. Run npm install before building Pages.");
  process.exit(1);
}

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
fs.mkdirSync(path.join(output, "vendor"), { recursive: true });
fs.copyFileSync(jszip, path.join(output, "vendor", "jszip.min.js"));
fs.writeFileSync(path.join(output, ".nojekyll"), "");
console.log("Static GitHub Pages build created in _site/");

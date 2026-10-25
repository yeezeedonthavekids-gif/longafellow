// Builds a fully static copy of the site into dist/ (for Netlify or any static host).
// The Wisp server can't run on a static host, so set WISP_URL to one hosted elsewhere.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist");
const mod = (p) => join(root, "node_modules", "@mercuryworkshop", p);

rmSync(out, { recursive: true, force: true });
cpSync(join(root, "public"), out, { recursive: true });

const copies = {
	scramjet: [mod("scramjet/dist"), ["scramjet.js", "scramjet.wasm"]],
	controller: [mod("scramjet-controller/dist"), ["controller.api.js", "controller.sw.js", "controller.inject.js"]],
	epoxy: [mod("epoxy-transport/dist"), ["index.mjs"]],
	libcurl: [mod("libcurl-transport/dist"), ["index.mjs"]],
};
for (const [dir, [src, files]] of Object.entries(copies)) {
	mkdirSync(join(out, dir), { recursive: true });
	for (const f of files) cpSync(join(src, f), join(out, dir, f));
}

const wisp = process.env.WISP_URL || "";
writeFileSync(
	join(out, "config.js"),
	`self.LONGAFELLOW_CONFIG = ${JSON.stringify({ wisp }, null, "\t")};\n`,
);
console.log(`Built dist/ (wisp: ${wisp || "same host /wisp/"})`);

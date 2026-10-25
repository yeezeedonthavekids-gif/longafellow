import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = (name) => join(__dirname, "node_modules", name);

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";

logging.set_level(logging.WARN);
// Off by default so the proxy can't be used to reach your own network.
if (process.env.ALLOW_LOCAL === "1") {
	wisp.options.allow_loopback_ips = true;
	wisp.options.allow_private_ips = true;
}

// URL prefix -> directory on disk
const mounts = [
	["/scramjet/", join(pkgDir("@mercuryworkshop/scramjet"), "dist")],
	["/controller/", join(pkgDir("@mercuryworkshop/scramjet-controller"), "dist")],
	["/epoxy/", join(pkgDir("@mercuryworkshop/epoxy-transport"), "dist")],
	["/libcurl/", join(pkgDir("@mercuryworkshop/libcurl-transport"), "dist")],
	["/", join(__dirname, "public")],
];

const types = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".wasm": "application/wasm",
	".png": "image/png",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".map": "application/json",
};

function resolveFile(pathname) {
	for (const [prefix, dir] of mounts) {
		if (!pathname.startsWith(prefix)) continue;
		let rel = normalize(decodeURIComponent(pathname.slice(prefix.length)));
		if (rel.startsWith("..")) return null;
		let file = join(dir, rel);
		try {
			let st = statSync(file);
			if (st.isDirectory()) {
				file = join(file, "index.html");
				st = statSync(file);
			}
			return { file, size: st.size };
		} catch {
			// fall through to the next mount
		}
	}
	return null;
}

const server = http.createServer((req, res) => {
	const { pathname } = new URL(req.url, "http://localhost");
	const found = resolveFile(pathname);
	if (!found) {
		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not found");
		return;
	}
	const headers = {
		"Content-Type": types[extname(found.file)] || "application/octet-stream",
		"Content-Length": found.size,
		"Cache-Control": "no-cache",
	};
	// the service worker must be allowed to control the whole origin
	if (pathname === "/sw.js") headers["Service-Worker-Allowed"] = "/";
	res.writeHead(200, headers);
	createReadStream(found.file).pipe(res);
});

server.on("upgrade", (req, socket, head) => {
	if (req.url.endsWith("/wisp/")) {
		wisp.routeRequest(req, socket, head);
	} else {
		socket.end();
	}
});

server.listen(PORT, HOST, () => {
	console.log(`Longafellow running at http://localhost:${PORT}`);
});

function shutdown() {
	server.close();
	process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

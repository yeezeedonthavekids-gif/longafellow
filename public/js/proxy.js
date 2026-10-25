import { settings } from "./settings.js";
import { isBlocked, countBlocked } from "./adblock.js";

// Wires Scramjet (v2, via @mercuryworkshop/scramjet-controller) to a Wisp transport.
let controller = null;
let readyPromise = null;
let activeWisp = null;

const splitList = (v) => (Array.isArray(v) ? v : String(v || "").split(/[\s,]+/)).map((s) => s.trim()).filter(Boolean);

// Every Wisp server we know about, in priority order.
export function wispCandidates() {
	const config = self.LONGAFELLOW_CONFIG || {};
	const sameHost = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/wisp/`;
	const list = [settings.wisp, config.wisp, ...splitList(settings.wispBackups), ...splitList(config.wispBackups), sameHost];
	return [...new Set(list.filter(Boolean))];
}

export function wispUrl() {
	return activeWisp || wispCandidates()[0];
}

export function usingBackupWisp() {
	return activeWisp !== null && activeWisp !== wispCandidates()[0];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Picks the first server that answers. The main server gets a few seconds' head start,
// because a sleeping free-tier host can take a while to wake up.
async function pickWisp() {
	const candidates = wispCandidates();
	if (candidates.length === 1) return candidates[0];
	const checks = candidates.map((url) => checkWisp(url, 45000));
	if (await Promise.race([checks[0], sleep(5000).then(() => false)])) return candidates[0];
	const winner = await new Promise((resolve) => {
		let pending = checks.length;
		checks.forEach((p, i) =>
			p.then((ok) => {
				if (ok) resolve(candidates[i]);
				else if (--pending === 0) resolve(null);
			}),
		);
	});
	return winner || candidates[0];
}

async function makeTransport() {
	activeWisp = await pickWisp();
	const mod = settings.transport === "libcurl" ? await import("/libcurl/index.mjs") : await import("/epoxy/index.mjs");
	const transport = new mod.default({ wisp: activeWisp });
	await transport.init();
	return transport;
}

export function initProxy() {
	readyPromise ??= (async () => {
		if (!("serviceWorker" in navigator)) {
			throw new Error("Service workers are unavailable (use https or localhost, and not a private window).");
		}
		await navigator.serviceWorker.register("/sw.js", { scope: "/" });
		const reg = await navigator.serviceWorker.ready;
		const transport = await makeTransport();
		controller = new $scramjetController.Controller({
			serviceworker: reg.active,
			transport,
		});
		await controller.wait();
		return controller;
	})();
	return readyPromise;
}

export async function switchTransport() {
	await initProxy();
	controller.setTransport(await makeTransport());
}

export async function createFrame(iframe) {
	await initProxy();
	const frame = controller.createFrame(iframe);
	// built-in ad & tracker blocking
	$scramjet.Tap.tap(frame.hooks.fetch.request, (ctx, props) => {
		if (!settings.adblock) return;
		let host;
		try {
			host = new URL(String(props.url)).hostname;
		} catch {
			return;
		}
		if (isBlocked(host)) {
			countBlocked();
			props.earlyResponse = new Response(null, { status: 204, statusText: "Blocked" });
		}
	});
	// show a readable page instead of a raw stack trace when a page fails to load
	$scramjet.Tap.tap(frame.hooks.error.request, (ctx, props) => {
		const dest = ctx.rawrequest.destination;
		if (dest !== "document" && dest !== "iframe") return;
		props.setResponse = {
			body: errorPage(targetUrl(frame, ctx.rawrequest.rawUrl), ctx.error),
			status: 502,
			statusText: "Bad Gateway",
			headers: [["Content-Type", "text/html; charset=utf-8"]],
		};
	});
	return frame;
}

// Fetches a URL through the Wisp transport (for when a host is blocked on the local network).
export async function proxyFetchText(url) {
	await initProxy();
	const res = await controller.transport.request(new URL(url), "GET", null, [], undefined);
	if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
	return new Response(res.body).text();
}

// Resolves true if a WebSocket to the Wisp server opens within the timeout.
export function checkWisp(url = wispUrl(), timeout = 8000) {
	return new Promise((resolve) => {
		let ws;
		const done = (ok) => {
			clearTimeout(timer);
			try {
				ws.close();
			} catch {
				// already closed
			}
			resolve(ok);
		};
		const timer = setTimeout(() => done(false), timeout);
		try {
			ws = new WebSocket(url);
		} catch {
			return done(false);
		}
		ws.onopen = () => done(true);
		ws.onerror = () => done(false);
	});
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function targetUrl(frame, rawUrl) {
	const base = new URL(frame.prefix, location.href).href;
	if (!rawUrl.startsWith(base)) return rawUrl;
	try {
		return controller.config.codec.decode(rawUrl.slice(base.length));
	} catch {
		return rawUrl;
	}
}

function errorPage(target, error) {
	const message = String(error?.message || error);
	const wispDown = /websocket/i.test(message);
	const accent = settings.accent;
	const title = wispDown ? "Can't reach the Wisp server" : "This page couldn't load";
	const hint = wispDown
		? `Longafellow couldn't connect to <code>${escapeHtml(wispUrl())}</code>. Make sure your Wisp server is running and that <code>WISP_URL</code> (or <b>Settings &rarr; Search &amp; proxy &rarr; Wisp server</b>) points to it.`
		: `The site may be down, blocking proxies, or the address may be wrong. Try again, or switch the transport in <b>Settings &rarr; Search &amp; proxy</b>.`;
	return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:${settings.bg};color:${settings.text};font-family:system-ui,sans-serif}
.box{max-width:620px;padding:32px}h1{margin:0 0 12px;font-size:26px}p{line-height:1.6;opacity:.85}
code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:6px;word-break:break-all}
.url{opacity:.6;font-size:14px;word-break:break-all}
details{margin-top:18px;font-size:13px;opacity:.7}pre{white-space:pre-wrap;word-break:break-all}
button{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:${accent};color:#fff;font-weight:600;cursor:pointer}
</style></head><body><div class="box"><h1>${escapeHtml(title)}</h1><div class="url">${escapeHtml(target)}</div><p>${hint}</p>
<button onclick="location.reload()">Try again</button><details><summary>Technical details</summary><pre>${escapeHtml(message)}</pre></details></div></body></html>`;
}

// Turns the iframe's proxied location back into the real URL.
export function realUrl(frame) {
	try {
		const href = frame.element.contentWindow.location.href;
		const base = new URL(frame.prefix, location.href).href;
		if (!href.startsWith(base)) return null;
		const url = new URL(controller.config.codec.decode(href.slice(base.length)));
		// scramjet tags navigations with an internal origin marker; hide it from the user
		url.searchParams.delete("$io");
		return url.href;
	} catch {
		return null;
	}
}

import { settings } from "./settings.js";

// Wires Scramjet (v2, via @mercuryworkshop/scramjet-controller) to a Wisp transport.
let controller = null;
let readyPromise = null;

export function wispUrl() {
	if (settings.wisp) return settings.wisp;
	if (self.LONGAFELLOW_CONFIG?.wisp) return self.LONGAFELLOW_CONFIG.wisp;
	return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/wisp/`;
}

async function makeTransport() {
	const mod = settings.transport === "libcurl" ? await import("/libcurl/index.mjs") : await import("/epoxy/index.mjs");
	const transport = new mod.default({ wisp: wispUrl() });
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
	return controller.createFrame(iframe);
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

const KEY = "longafellow:settings";

export const themes = {
	midnight: { label: "Midnight", accent: "#3b82f6", accent2: "#22d3ee", bg: "#030916", text: "#e6efff" },
	cobalt: { label: "Cobalt", accent: "#2563eb", accent2: "#60a5fa", bg: "#040a22", text: "#e8eeff" },
	ocean: { label: "Ocean Deep", accent: "#0ea5e9", accent2: "#5eead4", bg: "#02111b", text: "#e3f6ff" },
	arctic: { label: "Arctic", accent: "#60a5fa", accent2: "#c7f0ff", bg: "#0a1426", text: "#f1f7ff" },
	electric: { label: "Electric", accent: "#3b5bff", accent2: "#00e5ff", bg: "#000000", text: "#ffffff" },
	sapphire: { label: "Sapphire Dusk", accent: "#4f46e5", accent2: "#38bdf8", bg: "#070616", text: "#ecebff" },
	glacier: { label: "Glacier", accent: "#38bdf8", accent2: "#e0f2fe", bg: "#0b1220", text: "#eef6ff" },
	navy: { label: "Navy Gold", accent: "#1d4ed8", accent2: "#fbbf24", bg: "#020617", text: "#f8fafc" },
};

export const engines = {
	google: { label: "Google", url: "https://www.google.com/search?q=%s" },
	duckduckgo: { label: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
	bing: { label: "Bing", url: "https://www.bing.com/search?q=%s" },
	brave: { label: "Brave", url: "https://search.brave.com/search?q=%s" },
	startpage: { label: "Startpage", url: "https://www.startpage.com/do/search?query=%s" },
	custom: { label: "Custom", url: "" },
};

export const cloaks = {
	none: { label: "None (Longafellow)", title: "", icon: "" },
	classroom: { label: "Google Classroom", title: "Home", icon: "https://ssl.gstatic.com/classroom/favicon.png" },
	drive: { label: "Google Drive", title: "My Drive - Google Drive", icon: "https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png" },
	docs: { label: "Google Docs", title: "Google Docs", icon: "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico" },
	canvas: { label: "Canvas", title: "Dashboard", icon: "https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico" },
	wikipedia: { label: "Wikipedia", title: "Wikipedia, the free encyclopedia", icon: "https://en.wikipedia.org/static/favicon/wikipedia.ico" },
	custom: { label: "Custom", title: "", icon: "" },
};

export const fonts = ["Outfit", "Inter", "Space Grotesk", "Poppins", "JetBrains Mono", "system-ui"];

export const defaults = {
	theme: "midnight",
	...pick(themes.midnight, ["accent", "accent2", "bg", "text"]),
	surfaceOpacity: 55,
	blur: 16,
	radius: 14,
	glow: 55,
	font: "Outfit",
	scale: 100,

	background: "stars",
	bgImage: "",
	starCount: 220,
	starSpeed: 30,
	reduceMotion: false,

	wordmarkText: "LONGAFELLOW",
	tagline: "Wander anywhere. Your web, your way.",
	wordmarkGradient: true,
	showClock: true,
	use24h: false,
	showLogo: true,
	showWordmark: true,
	showTagline: true,
	showShortcuts: true,
	showRail: true,

	engine: "google",
	customEngine: "",

	transport: "epoxy",
	wisp: "",
	wispBackups: "",
	adblock: true,
	suggestions: true,
	restoreTabs: true,
	showHomeGames: true,
	showWidgets: true,
	widgets: ["todo", "timer", "calendar"],
	homeOrder: ["clock", "logo", "title", "search", "shortcuts", "games", "widgets"],
	showBookmarksBar: true,
	bookmarks: [],

	cloak: "none",
	cloakTitle: "",
	cloakIcon: "",
	autoBlank: false,
	panicKey: "`",
	panicUrl: "https://classroom.google.com",
	saveHistory: true,
	confirmClose: false,
	autoCloak: false,
	autoCloakPreset: "classroom",
	lockEnabled: false,
	lockHash: "",
	lockSalt: "",

	shortcuts: [
		{ name: "YouTube", url: "https://www.youtube.com", color: "#e11d48" },
		{ name: "Wikipedia", url: "https://en.wikipedia.org", color: "#475569" },
		{ name: "GitHub", url: "https://github.com", color: "#1f2937" },
		{ name: "Reddit", url: "https://www.reddit.com", color: "#ea580c" },
		{ name: "Discord", url: "https://discord.com/app", color: "#5865f2" },
		{ name: "Spotify", url: "https://open.spotify.com", color: "#16a34a" },
	],
};

function pick(obj, keys) {
	return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

const listeners = new Set();

function load() {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
		return { ...structuredClone(defaults), ...raw };
	} catch {
		return structuredClone(defaults);
	}
}

export const settings = load();

export function save() {
	try {
		localStorage.setItem(KEY, JSON.stringify(settings));
	} catch {
		// storage might be unavailable (private mode); settings just won't persist
	}
}

export function set(patch) {
	Object.assign(settings, patch);
	save();
	for (const fn of listeners) fn(patch);
}

export function onChange(fn) {
	listeners.add(fn);
}

export function reset() {
	for (const k of Object.keys(settings)) delete settings[k];
	Object.assign(settings, structuredClone(defaults));
	save();
	for (const fn of listeners) fn({ ...settings });
}

export function exportJSON() {
	return JSON.stringify(settings, null, 2);
}

export function importJSON(text) {
	const data = JSON.parse(text);
	if (typeof data !== "object" || !data) throw new Error("Invalid settings file");
	const clean = {};
	for (const k of Object.keys(defaults)) if (k in data) clean[k] = data[k];
	set(clean);
}

/* ---------- applying settings to the page ---------- */

function hexToRgb(hex) {
	const n = parseInt(hex.replace("#", ""), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
	return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

export function applyAppearance() {
	const s = settings;
	const root = document.documentElement.style;
	const bg = hexToRgb(s.bg);
	const accent = hexToRgb(s.accent);
	// panels are a lifted version of the background tinted toward the accent
	const surface = mix(mix(bg, [255, 255, 255], 0.06), accent, 0.14);
	const text = hexToRgb(s.text);

	root.setProperty("--accent", s.accent);
	root.setProperty("--accent-2", s.accent2);
	root.setProperty("--bg", s.bg);
	root.setProperty("--text", s.text);
	root.setProperty("--muted", `rgb(${mix(text, bg, 0.42).join(",")})`);
	root.setProperty("--surface", `rgba(${surface.join(",")}, ${s.surfaceOpacity / 100})`);
	root.setProperty("--surface-solid", `rgb(${mix(surface, bg, 0.3).join(",")})`);
	root.setProperty("--border", `rgba(${mix(accent, [255, 255, 255], 0.4).join(",")}, 0.16)`);
	root.setProperty("--blur", `${s.blur}px`);
	root.setProperty("--radius", `${s.radius}px`);
	root.setProperty("--glow", s.glow / 100);
	root.setProperty("--scale", s.scale / 100);
	root.setProperty("--font", s.font === "system-ui" ? "system-ui, sans-serif" : `"${s.font}", system-ui, sans-serif`);

	const body = document.body.classList;
	for (const c of [...body]) if (c.startsWith("bg-")) body.remove(c);
	body.add(`bg-${s.background}`);
	body.toggle("no-motion", s.reduceMotion);
	body.toggle("hide-clock", !s.showClock);
	body.toggle("hide-logo", !s.showLogo);
	body.toggle("hide-wordmark", !s.showWordmark);
	body.toggle("hide-tagline", !s.showTagline);
	body.toggle("hide-shortcuts", !s.showShortcuts);
	body.toggle("hide-home-games", !s.showHomeGames);
	body.toggle("hide-widgets", !s.showWidgets);
	// home page section order
	const order = [...s.homeOrder, ...defaults.homeOrder.filter((id) => !s.homeOrder.includes(id))];
	order.forEach((id, i) => document.querySelector(`.hero [data-section="${id}"]`)?.style.setProperty("order", i));
	body.toggle("rail-hidden", !s.showRail);
	body.toggle("wordmark-solid", !s.wordmarkGradient);

	const img = document.getElementById("bg-image");
	// an uploaded wallpaper ("local") is applied by the app once it's read from storage
	if (s.bgImage !== "local") img.style.backgroundImage = s.background === "image" && s.bgImage ? `url("${s.bgImage.replace(/"/g, "%22")}")` : "";

	document.getElementById("wordmark").textContent = s.wordmarkText || "LONGAFELLOW";
	document.getElementById("tagline").textContent = s.tagline;
	const engine = engineLabel();
	document.getElementById("engine-chip").textContent = engine.toUpperCase();
	document.getElementById("omni-engine").textContent = engine.toUpperCase();
	applyCloak();
}

export function engineLabel() {
	return engines[settings.engine]?.label || "Search";
}

export function searchTemplate() {
	if (settings.engine === "custom" && settings.customEngine.includes("%s")) return settings.customEngine;
	return (engines[settings.engine] || engines.google).url || engines.google.url;
}

export function applyCloak(preset = settings.cloak) {
	const s = settings;
	let title = "Longafellow";
	let icon = "/favicon.png";
	if (preset === "custom") {
		title = s.cloakTitle || title;
		icon = s.cloakIcon || icon;
	} else if (cloaks[preset] && preset !== "none") {
		title = cloaks[preset].title;
		icon = cloaks[preset].icon;
	}
	document.title = title;
	document.getElementById("favicon").href = icon;
}

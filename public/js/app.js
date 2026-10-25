import { hydrateIcons, icon } from "./icons.js";
import {
	settings,
	set,
	onChange,
	reset,
	exportJSON,
	importJSON,
	applyAppearance,
	searchTemplate,
	themes,
	engines,
	cloaks,
	fonts,
	defaults,
	applyCloak,
} from "./settings.js";
import { startBackground, seedStars } from "./background.js";
import { initProxy, createFrame, realUrl, switchTransport, wispUrl, checkWisp, proxyFetchText, usingBackupWisp } from "./proxy.js";
import {
	renderGames,
	loadGames,
	getGame,
	markPlayed,
	fetchGameHtml,
	GAME_COVERS,
	isFavorite,
	toggleFavorite,
	recentGames,
	featuredGames,
	randomGame,
	searchGames,
} from "./games.js";
import { blockedSoFar } from "./adblock.js";
import { exportAll, importAll, downloadJSON } from "./saves.js";
import { attachSuggest } from "./suggest.js";
import { initLock, lock, setPin, clearPin, isLocked } from "./lock.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const INTERNAL = {
	newtab: { title: "New Tab", url: "longafellow://newtab" },
	settings: { title: "Settings", url: "longafellow://settings" },
	history: { title: "History", url: "longafellow://history" },
	games: { title: "Games", url: "longafellow://games" },
};

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg) {
	const el = $("#toast");
	el.textContent = msg;
	el.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ---------------- url helpers ---------------- */
function toUrl(input) {
	const text = input.trim();
	if (!text) return null;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
	// bare domains like "example.com/page" or "localhost:3000"
	if (/^localhost(:\d+)?(\/|$)/i.test(text)) return "http://" + text;
	if (!/\s/.test(text) && /^[^/]+\.[a-z]{2,}(?::\d+)?(\/|$)/i.test(text)) return "https://" + text;
	return searchTemplate().replace("%s", encodeURIComponent(text));
}

/* ---------------- history ---------------- */
const HISTORY_KEY = "longafellow:history";
let history = [];
try {
	history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
} catch {
	history = [];
}

function recordHistory(url, title) {
	if (!settings.saveHistory || !url) return;
	const last = history[0];
	if (last && last.url === url) {
		last.title = title || last.title;
	} else {
		history.unshift({ url, title, time: Date.now() });
		history.length = Math.min(history.length, 500);
	}
	try {
		localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
	} catch {
		// ignore quota errors
	}
	if (activeTab()?.kind === "history") renderHistory();
}

/* ---------------- tabs ---------------- */
const tabs = [];
let activeId = null;
let nextId = 1;
const activeTab = () => tabs.find((t) => t.id === activeId);

function newTab(kind = "newtab", url) {
	const tab = { id: nextId++, kind, url: null, title: INTERNAL[kind]?.title || "New Tab", favicon: null, loading: false };
	tabs.push(tab);
	activate(tab.id);
	if (url) navigate(url, tab);
	return tab;
}

function closeTab(id) {
	const i = tabs.findIndex((t) => t.id === id);
	if (i === -1) return;
	const [tab] = tabs.splice(i, 1);
	tab.iframe?.remove();
	if (!tabs.length) {
		newTab();
		return;
	}
	if (activeId === id) activate(tabs[Math.min(i, tabs.length - 1)].id);
	else renderTabs();
}

function activate(id) {
	activeId = id;
	renderTabs();
	showActive();
}

function showActive() {
	const tab = activeTab();
	if (tab.pending) return resolvePending(tab);
	for (const page of document.querySelectorAll(".page")) page.classList.remove("show");
	for (const t of tabs) t.iframe?.classList.toggle("show", t === tab && (t.kind === "web" || t.kind === "game"));
	if (tab.kind === "newtab") $("#page-newtab").classList.add("show");
	if (tab.kind === "settings") {
		renderSettings();
		$("#page-settings").classList.add("show");
	}
	if (tab.kind === "history") {
		renderHistory();
		$("#page-history").classList.add("show");
	}
	if (tab.kind === "games") {
		renderGames($("#page-games"), { onLaunch: (game) => launchGame(game, newTab("game")) });
		$("#page-games").classList.add("show");
	}
	for (const b of document.querySelectorAll("#rail [data-action]")) {
		b.classList.toggle("active", b.dataset.action === (tab.kind === "newtab" ? "home" : tab.kind));
	}
	syncOmnibox();
	if (tab.kind === "newtab") {
		renderHomeGames();
		setTimeout(() => !isLocked() && $("#hero-input").focus(), 0);
	}
}

/* ---------------- session (reopen tabs) ---------------- */
const SESSION_KEY = "longafellow:session";

function saveSession() {
	try {
		if (!settings.restoreTabs) return localStorage.removeItem(SESSION_KEY);
		const data = {
			active: tabs.findIndex((t) => t.id === activeId),
			tabs: tabs.map((t) => ({
				kind: t.kind,
				title: t.title,
				url: t.kind === "web" ? t.url || t.pending?.url : undefined,
				game: t.kind === "game" ? (t.game?.id ?? t.pending?.game) : undefined,
			})),
		};
		localStorage.setItem(SESSION_KEY, JSON.stringify(data));
	} catch {
		// storage full or unavailable
	}
}

function restoreSession() {
	if (!settings.restoreTabs) return false;
	let data;
	try {
		data = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
	} catch {
		return false;
	}
	if (!Array.isArray(data?.tabs) || !data.tabs.length) return false;
	for (const s of data.tabs) {
		const tab = { id: nextId++, kind: s.kind, url: null, title: s.title || INTERNAL[s.kind]?.title || "New Tab", favicon: null, loading: false };
		// web pages and games load only when their tab is opened, so restored tabs don't all start playing at once
		if (s.kind === "web" && s.url) tab.pending = { url: s.url };
		else if (s.kind === "game" && s.game != null) tab.pending = { game: s.game };
		else if (!INTERNAL[s.kind]) Object.assign(tab, { kind: "newtab", title: "New Tab" });
		tabs.push(tab);
	}
	activate(tabs[Math.min(Math.max(data.active, 0), tabs.length - 1)].id);
	return true;
}

function resolvePending(tab) {
	const { url, game } = tab.pending;
	tab.pending = null;
	if (url) return navigate(url, tab);
	loadGames()
		.then(() => {
			const g = getGame(game);
			if (g) launchGame(g, tab);
			else navigate(INTERNAL.games.url, tab);
		})
		.catch(() => navigate(INTERNAL.games.url, tab));
}

function syncOmnibox() {
	const tab = activeTab();
	if (!tab) return;
	const input = $("#omni-input");
	if (document.activeElement !== input) {
		input.value =
			tab.kind === "web" ? tab.url || "" : tab.kind === "game" ? `longafellow://games/${tab.game?.id ?? ""}` : tab.kind === "newtab" ? "" : INTERNAL[tab.kind].url;
	}
	const secure = tab.kind === "web" && tab.url?.startsWith("https:");
	$("#omni-scheme").innerHTML = icon(secure ? "lock" : tab.kind === "web" ? "globe" : "search");
	const here = currentUrl(tab);
	$("#bookmark-btn").classList.toggle("on", !!here && settings.bookmarks.some((b) => sameUrl(b.url, here)));
	$("#game-actions").hidden = tab.kind !== "game";
	if (tab.kind === "game" && tab.game) $("#game-fav-btn").classList.toggle("on", isFavorite(tab.game.id));
}

// The address of what a tab shows, if it's something that can be bookmarked.
function currentUrl(tab) {
	if (tab.kind === "web") return tab.url;
	if (tab.kind === "game" && tab.game) return `longafellow://games/${tab.game.id}`;
	return null;
}

/* ---------------- bookmarks bar ---------------- */
function renderBookmarks() {
	const bar = $("#bookmarks-bar");
	const list = settings.bookmarks;
	bar.hidden = !settings.showBookmarksBar || !list.length;
	bar.innerHTML = list
		.map(
			(b, i) =>
				`<button class="bm" data-i="${i}" title="${esc(b.url)}&#10;Right-click to remove"><span class="b">${esc((b.title || "?")[0].toUpperCase())}</span><span>${esc(b.title)}</span></button>`,
		)
		.join("");
}

function toggleBookmark(tab) {
	const url = currentUrl(tab);
	if (!url) return toast("Open a web page or game to bookmark it");
	const exists = settings.bookmarks.some((b) => sameUrl(b.url, url));
	if (exists) {
		set({ bookmarks: settings.bookmarks.filter((b) => !sameUrl(b.url, url)) });
		toast("Bookmark removed");
	} else {
		set({ bookmarks: [...settings.bookmarks, { title: (tab.title || url).slice(0, 40), url }] });
		toast(settings.showBookmarksBar ? "Bookmarked" : "Bookmarked (the bookmarks bar is turned off in Settings)");
	}
}

$("#bookmarks-bar").addEventListener("click", (e) => {
	const el = e.target.closest(".bm");
	if (el) navigate(settings.bookmarks[el.dataset.i].url);
});
$("#bookmarks-bar").addEventListener("auxclick", (e) => {
	const el = e.target.closest(".bm");
	if (el && e.button === 1) newTab("newtab", settings.bookmarks[el.dataset.i].url);
});
$("#bookmarks-bar").addEventListener("contextmenu", (e) => {
	const el = e.target.closest(".bm");
	if (!el) return;
	e.preventDefault();
	const removed = settings.bookmarks[el.dataset.i];
	set({ bookmarks: settings.bookmarks.filter((_, i) => i !== Number(el.dataset.i)) });
	toast(`Removed "${removed.title}"`);
});

const sameUrl = (a, b) => (a || "").replace(/\/$/, "") === (b || "").replace(/\/$/, "");

function renderTabs() {
	const wrap = $("#tabs");
	wrap.innerHTML = "";
	for (const tab of tabs) {
		const el = document.createElement("div");
		el.className = "tab" + (tab.id === activeId ? " active" : "") + (tab.loading ? " loading" : "");
		el.title = tab.title;
		const fav = tab.favicon
			? `<img src="${esc(tab.favicon)}" alt="" onerror="this.remove()">`
			: tab.kind === "web"
				? esc((tab.title || "?")[0].toUpperCase())
				: `<img src="/assets/logo.png" alt="">`;
		el.innerHTML = `<span class="fav">${fav}</span><span class="title">${esc(tab.title)}</span><button class="close" title="Close (Alt+W)">${icon("x")}</button>`;
		el.addEventListener("click", () => activate(tab.id));
		el.addEventListener("auxclick", (e) => e.button === 1 && closeTab(tab.id));
		el.querySelector(".close").addEventListener("click", (e) => {
			e.stopPropagation();
			closeTab(tab.id);
		});
		wrap.append(el);
	}
	saveSession();
}

// Destroys a tab's page so its audio/video stops instead of playing in the background.
function unloadPage(tab) {
	tab.iframe?.remove();
	tab.iframe = null;
	tab.frame = null;
	tab.game = null;
	tab.url = null;
	tab.loading = false;
}

async function navigate(input, tab = activeTab()) {
	const text = input.trim();
	const gameMatch = /^longafellow:\/\/games\/(-?\d+)$/i.exec(text);
	if (gameMatch) {
		await loadGames().catch(() => {});
		const game = getGame(Number(gameMatch[1]));
		if (game) return launchGame(game, tab);
	}
	const internal = Object.entries(INTERNAL).find(([, v]) => v.url === text.toLowerCase());
	if (internal) {
		unloadPage(tab);
		tab.kind = internal[0];
		tab.title = INTERNAL[tab.kind].title;
		tab.favicon = null;
		renderTabs();
		if (tab.id === activeId) showActive();
		return;
	}
	const url = toUrl(text);
	if (!url) return;

	if (tab.kind === "game") unloadPage(tab);
	tab.kind = "web";
	tab.url = url;
	tab.title = url.replace(/^https?:\/\//, "");
	tab.loading = true;
	if (!tab.iframe) {
		tab.iframe = document.createElement("iframe");
		tab.iframe.setAttribute("allow", "fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture");
		tab.iframe.addEventListener("load", () => onFrameLoad(tab));
		$("#frames").append(tab.iframe);
	}
	renderTabs();
	if (tab.id === activeId) showActive();
	try {
		tab.frame ??= await createFrame(tab.iframe);
		tab.frame.go(url);
	} catch (err) {
		console.error(err);
		tab.loading = false;
		renderTabs();
		toast("Proxy isn't ready: " + err.message);
	}
}

function onFrameLoad(tab) {
	if (!tab.frame) return;
	try {
		const win = tab.iframe.contentWindow;
		win.addEventListener("keydown", handleKeys, true);
		// links that try to open new windows become new tabs instead
		win.open = (u) => {
			if (u) newTab("web", new URL(u, realUrl(tab.frame) || undefined).href);
			return null;
		};
	} catch {
		// cross-origin (e.g. the proxy errored); nothing to hook
	}
	pollTab(tab);
}

async function launchGame(game, tab = activeTab()) {
	unloadPage(tab);
	const iframe = document.createElement("iframe");
	iframe.setAttribute("allow", "fullscreen; autoplay; gamepad; clipboard-read; clipboard-write; pointer-lock");
	Object.assign(tab, { kind: "game", game, iframe, title: game.name, favicon: GAME_COVERS + game.cover, loading: true });
	$("#frames").append(iframe);
	renderTabs();
	if (tab.id === activeId) showActive();
	markPlayed(game);
	recordHistory(`longafellow://games/${game.id}`, game.name);

	let html;
	try {
		html = await fetchGameHtml(game, proxyFetchText);
	} catch (err) {
		html = `<body style="margin:0;display:grid;place-items:center;height:100vh;background:${settings.bg};color:${settings.text};font-family:system-ui">
			<div style="text-align:center"><h2>Couldn't load ${esc(game.name)}</h2><p style="opacity:.7">Every game source failed. Details: ${esc(err.message)}</p></div></body>`;
	}
	// the tab may have been closed or sent elsewhere while we were downloading
	if (tab.iframe !== iframe) return;
	const doc = iframe.contentDocument;
	doc.open();
	doc.write(html);
	doc.close();
	try {
		iframe.contentWindow.addEventListener("keydown", handleKeys, true);
	} catch {
		// ignore
	}
	tab.loading = false;
	renderTabs();
}

function pollTab(tab) {
	if (tab.kind !== "web" || !tab.frame) return;
	let doc;
	try {
		doc = tab.iframe.contentDocument;
	} catch {
		return;
	}
	const url = realUrl(tab.frame) || tab.url;
	const title = doc?.title?.trim() || url?.replace(/^https?:\/\//, "") || "Untitled";
	const iconEl = doc?.querySelector('link[rel~="icon"]');
	const favicon = iconEl?.href || null;
	const loading = doc?.readyState !== "complete";
	if (url !== tab.url || title !== tab.title || favicon !== tab.favicon || loading !== tab.loading) {
		const urlChanged = url !== tab.url;
		Object.assign(tab, { url, title, favicon, loading });
		renderTabs();
		if (tab.id === activeId) syncOmnibox();
		if (urlChanged || !loading) recordHistory(url, title);
	}
}

setInterval(() => tabs.forEach(pollTab), 600);

/* ---------------- new tab page ---------------- */
let homeFeatured = null;

async function renderHomeGames() {
	const el = $("#home-games");
	if (!settings.showHomeGames) {
		el.hidden = true;
		return;
	}
	try {
		await loadGames();
	} catch {
		el.hidden = true;
		return;
	}
	const recent = recentGames(6);
	homeFeatured ??= featuredGames(6);
	const list = recent.length ? recent : homeFeatured;
	el.innerHTML = `<div class="home-games-head"><span>${recent.length ? "Jump back in" : "Featured games"}</span><button data-action="games">See all games &rarr;</button></div>
		<div class="home-games-row">${list
			.map((g) => `<button class="mini-game" data-game="${g.id}" title="${esc(g.name)}"><img loading="lazy" alt="" src="${GAME_COVERS}${esc(g.cover)}"><span>${esc(g.name)}</span></button>`)
			.join("")}</div>`;
	el.hidden = false;
}

$("#home-games").addEventListener("click", (e) => {
	const el = e.target.closest("[data-game]");
	if (el) launchGame(getGame(Number(el.dataset.game)), activeTab());
});

function tickClock() {
	const now = new Date();
	$("#date").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
	$("#time").textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: !settings.use24h });
	const h = now.getHours();
	$("#greeting").textContent = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Good night";
}

function renderShortcuts() {
	const wrap = $("#shortcuts");
	wrap.innerHTML = "";
	settings.shortcuts.forEach((s, i) => {
		const a = document.createElement("button");
		a.className = "shortcut";
		a.title = `${s.url}\nRight-click to edit`;
		a.innerHTML = `<span class="tile" style="background:${esc(s.color)};color:${esc(s.color)}"><span style="color:#fff">${esc((s.name || "?")[0].toUpperCase())}</span></span><span class="label">${esc(s.name)}</span><span class="remove" title="Remove">${icon("x")}</span>`;
		a.addEventListener("click", (e) => {
			if (e.target.closest(".remove")) {
				const list = settings.shortcuts.filter((_, j) => j !== i);
				set({ shortcuts: list });
				return;
			}
			navigate(s.url);
		});
		a.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			editShortcut(i);
		});
		wrap.append(a);
	});
	const add = document.createElement("button");
	add.className = "shortcut";
	add.innerHTML = `<span class="tile add">${icon("plus")}</span><span class="label">Add</span>`;
	add.addEventListener("click", () => editShortcut(-1));
	wrap.append(add);
}

function editShortcut(index, preset) {
	const dialog = $("#shortcut-dialog");
	const form = $("#shortcut-form");
	const item = index >= 0 ? settings.shortcuts[index] : preset || { name: "", url: "", color: settings.accent };
	$("#shortcut-dialog-title").textContent = index >= 0 ? "Edit shortcut" : "Add shortcut";
	form.name.value = item.name;
	form.url.value = item.url;
	form.color.value = item.color;
	dialog.returnValue = "";
	dialog.onclose = () => {
		if (dialog.returnValue !== "save") return;
		const entry = { name: form.name.value.trim(), url: toUrl(form.url.value) || form.url.value, color: form.color.value };
		const list = [...settings.shortcuts];
		if (index >= 0) list[index] = entry;
		else list.push(entry);
		set({ shortcuts: list });
		toast(index >= 0 ? "Shortcut updated" : "Shortcut added");
	};
	dialog.showModal();
}

/* ---------------- history page ---------------- */
function renderHistory() {
	const page = $("#page-history");
	let html = `<h2>History</h2><p class="sub">Pages you've visited through Longafellow. Stored only in this browser.</p>
		<div style="margin-bottom:16px"><button class="btn ghost" id="clear-history">Clear history</button></div><div class="history-list">`;
	if (!history.length) html += `<div class="empty">Nothing here yet.${settings.saveHistory ? "" : " History saving is turned off in Settings."}</div>`;
	let day = "";
	history.forEach((h, i) => {
		const d = new Date(h.time);
		const label = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
		if (label !== day) {
			day = label;
			html += `<div class="history-day">${esc(label)}</div>`;
		}
		html += `<div class="history-item" data-i="${i}"><span class="when">${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span><div style="min-width:0"><div class="t">${esc(h.title || h.url)}</div><div class="u">${esc(h.url)}</div></div></div>`;
	});
	page.innerHTML = html + "</div>";
	$("#clear-history", page).onclick = () => {
		history = [];
		localStorage.removeItem(HISTORY_KEY);
		renderHistory();
		toast("History cleared");
	};
	for (const el of page.querySelectorAll(".history-item")) {
		el.onclick = () => navigate(history[el.dataset.i].url);
	}
}

/* ---------------- settings page ---------------- */
const sections = [
	{
		id: "appearance",
		icon: "palette",
		title: "Appearance",
		items: [
			{ type: "themes" },
			{ key: "accent", type: "color", name: "Accent color", desc: "Buttons, highlights and glows." },
			{ key: "accent2", type: "color", name: "Secondary accent", desc: "Wordmark gradient, headings and large stars." },
			{ key: "bg", type: "color", name: "Background color" },
			{ key: "text", type: "color", name: "Text color" },
			{ key: "font", type: "select", name: "Font", options: fonts.map((f) => [f, f === "system-ui" ? "System default" : f]) },
			{ key: "scale", type: "range", name: "Interface size", min: 80, max: 130, unit: "%" },
			{ key: "radius", type: "range", name: "Corner roundness", min: 0, max: 28, unit: "px" },
			{ key: "surfaceOpacity", type: "range", name: "Panel opacity", min: 10, max: 95, unit: "%" },
			{ key: "blur", type: "range", name: "Glass blur", min: 0, max: 40, unit: "px" },
			{ key: "glow", type: "range", name: "Glow strength", min: 0, max: 100, unit: "%" },
		],
	},
	{
		id: "background",
		icon: "layout",
		title: "Background",
		items: [
			{
				key: "background",
				type: "select",
				name: "Background style",
				options: [
					["stars", "Starfield + glow"],
					["aurora", "Aurora glow"],
					["gradient", "Gradient"],
					["solid", "Solid color"],
					["image", "Custom image"],
				],
			},
			{ key: "bgImage", type: "text", name: "Image URL", desc: "Any direct image link.", placeholder: "https://…/wallpaper.jpg", when: (s) => s.background === "image" },
			{ key: "starCount", type: "range", name: "Star count", min: 0, max: 1000, when: (s) => s.background === "stars" || s.background === "image" },
			{ key: "starSpeed", type: "range", name: "Star drift speed", min: 0, max: 100, when: (s) => s.background === "stars" || s.background === "image" },
			{ key: "reduceMotion", type: "toggle", name: "Reduce motion", desc: "Freeze stars, glows and the floating logo." },
		],
	},
	{
		id: "home",
		icon: "home",
		title: "Home page",
		items: [
			{ key: "wordmarkText", type: "text", name: "Title text", placeholder: "LONGAFELLOW" },
			{ key: "tagline", type: "text", name: "Tagline", placeholder: "Leave empty to hide" },
			{ key: "wordmarkGradient", type: "toggle", name: "Gradient title" },
			{ key: "showLogo", type: "toggle", name: "Show logo" },
			{ key: "showWordmark", type: "toggle", name: "Show title" },
			{ key: "showTagline", type: "toggle", name: "Show tagline" },
			{ key: "showClock", type: "toggle", name: "Show clock & greeting" },
			{ key: "use24h", type: "toggle", name: "24-hour clock", when: (s) => s.showClock },
			{ key: "showShortcuts", type: "toggle", name: "Show shortcuts", desc: "Right-click a shortcut to edit it." },
			{ key: "showHomeGames", type: "toggle", name: "Show games on the home page", desc: "Your recent games, or featured ones if you haven't played any." },
			{ key: "showRail", type: "toggle", name: "Show side bar" },
			{ key: "showBookmarksBar", type: "toggle", name: "Show bookmarks bar", desc: "Bookmark pages and games with the bookmark button next to the address bar." },
			{ key: "restoreTabs", type: "toggle", name: "Reopen tabs from last time", desc: "Pages and games reload when you click their tab." },
			{ type: "button", name: "Restore default shortcuts", label: "Restore", run: () => set({ shortcuts: structuredClone(defaults.shortcuts) }) },
		],
	},
	{
		id: "proxy",
		icon: "globe",
		title: "Search & proxy",
		items: [
			{ key: "engine", type: "select", name: "Search engine", options: Object.entries(engines).map(([k, v]) => [k, v.label]) },
			{ key: "customEngine", type: "text", name: "Custom search URL", desc: "Use %s where the query goes.", placeholder: "https://example.com/search?q=%s", when: (s) => s.engine === "custom" },
			{ key: "suggestions", type: "toggle", name: "Search suggestions", desc: "Suggestions from DuckDuckGo, fetched through the proxy. Games and history always show." },
			{ key: "adblock", type: "toggle", name: "Block ads & trackers", desc: () => `Blocks common ad and tracking networks on proxied sites. ${blockedSoFar()} blocked since this page opened.` },
			{
				key: "transport",
				type: "select",
				name: "Transport",
				desc: "How requests reach the Wisp server. Try the other one if a site misbehaves.",
				options: [
					["epoxy", "Epoxy (default)"],
					["libcurl", "libcurl.js"],
				],
			},
			{ key: "wisp", type: "text", name: "Wisp server", desc: "Leave empty to use the default server.", placeholder: () => wispUrl() },
			{ key: "wispBackups", type: "text", name: "Backup Wisp servers", desc: "Used automatically if the main server is down. Separate several with commas.", placeholder: "wss://backup.example.com/wisp/" },
		],
	},
	{
		id: "privacy",
		icon: "shield",
		title: "Privacy & cloaking",
		items: [
			{ key: "cloak", type: "select", name: "Tab cloak", desc: "Disguise this tab's title and icon.", options: Object.entries(cloaks).map(([k, v]) => [k, v.label]) },
			{ key: "cloakTitle", type: "text", name: "Custom tab title", when: (s) => s.cloak === "custom" },
			{ key: "cloakIcon", type: "text", name: "Custom tab icon URL", when: (s) => s.cloak === "custom" },
			{ type: "button", name: "Open in about:blank", desc: "Relaunch Longafellow inside an about:blank tab.", label: "Launch", run: () => openBlank() },
			{ key: "autoBlank", type: "toggle", name: "Always open in about:blank", desc: "Relaunches automatically on your first click." },
			{ key: "panicKey", type: "key", name: "Panic key", desc: "Instantly leaves to the panic URL. Click the box, then press a key." },
			{ key: "panicUrl", type: "text", name: "Panic URL", placeholder: "https://classroom.google.com" },
			{ key: "autoCloak", type: "toggle", name: "Disguise when you switch tabs", desc: "Changes this tab's title and icon while you're looking at another tab." },
			{ key: "autoCloakPreset", type: "select", name: "Disguise as", options: Object.entries(cloaks).filter(([k]) => k !== "none").map(([k, v]) => [k, v.label]), when: (s) => s.autoCloak },
			{ type: "button", name: "PIN lock", desc: "Ask for a PIN whenever Longafellow opens. Alt+L locks it right away.", label: () => (settings.lockEnabled ? "Change PIN" : "Set PIN"), run: () => openPinDialog() },
			{ type: "button", name: "Lock now", label: "Lock", when: (s) => s.lockEnabled, run: () => lock() },
			{ type: "button", name: "Remove PIN", label: "Remove", danger: true, when: (s) => s.lockEnabled, run: () => confirm("Remove the PIN lock?") && (clearPin(), renderSettings(), toast("PIN removed")) },
			{ key: "saveHistory", type: "toggle", name: "Save history" },
			{ key: "confirmClose", type: "toggle", name: "Confirm before closing", desc: "Ask before the tab is closed or reloaded." },
		],
	},
	{
		id: "data",
		icon: "database",
		title: "Data",
		items: [
			{ type: "button", name: "Back up everything", desc: "Settings, history, bookmarks and game saves in one file. Use it to move progress to another Longafellow site, or as a safety copy.", label: "Download backup", run: backupEverything },
			{ type: "button", name: "Restore a backup", desc: "Loads a backup file into this site. Data with the same name is replaced.", label: "Restore", run: restoreBackup },
			{ type: "button", name: "Export settings only", desc: "Just your theme, shortcuts and options.", label: "Export", run: exportSettings },
			{ type: "button", name: "Import settings", label: "Import", run: importSettings },
			{ type: "button", name: "Reset everything", desc: "Return all settings to their defaults.", label: "Reset", danger: true, run: () => confirm("Reset all Longafellow settings?") && (reset(), toast("Settings reset")) },
		],
	},
];

let settingsSection = "appearance";

function controlHtml(item) {
	const v = settings[item.key];
	switch (item.type) {
		case "color":
			return `<input type="color" data-key="${item.key}" value="${esc(v)}">`;
		case "range":
			return `<input type="range" data-key="${item.key}" min="${item.min}" max="${item.max}" value="${v}"><span class="val">${v}${item.unit || ""}</span>`;
		case "toggle":
			return `<label class="switch"><input type="checkbox" data-key="${item.key}" ${v ? "checked" : ""}><span></span></label>`;
		case "select":
			return `<select data-key="${item.key}">${item.options.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
		case "text": {
			const ph = typeof item.placeholder === "function" ? item.placeholder() : item.placeholder || "";
			return `<input type="text" data-key="${item.key}" value="${esc(v)}" placeholder="${esc(ph)}" spellcheck="false">`;
		}
		case "key":
			return `<input type="text" data-key="${item.key}" data-capture value="${esc(v)}" readonly style="width:90px;text-align:center">`;
		case "button":
			return `<button class="btn ${item.danger ? "danger" : "ghost"}" data-run>${esc(typeof item.label === "function" ? item.label() : item.label)}</button>`;
	}
	return "";
}

function renderSettings() {
	const page = $("#page-settings");
	const scroll = page.scrollTop;
	const current = sections.find((s) => s.id === settingsSection);
	let html = `<h2>Settings</h2><p class="sub">Make Longafellow yours. Changes save automatically.</p><div class="settings-layout"><div class="settings-nav">`;
	for (const s of sections) html += `<button data-section="${s.id}" class="${s.id === settingsSection ? "active" : ""}"><i data-icon="${s.icon}"></i>${s.title}</button>`;
	html += `</div><div><div class="card"><h3>${current.title}</h3>`;
	current.items.forEach((item, i) => {
		if (item.when && !item.when(settings)) return;
		if (item.type === "themes") {
			html += `<div class="presets">${Object.entries(themes)
				.map(
					([k, t]) =>
						`<button class="preset ${settings.theme === k ? "active" : ""}" data-theme="${k}"><div class="sw" style="background:radial-gradient(circle at 30% 120%, ${t.accent}, transparent 70%), radial-gradient(circle at 90% 0%, ${t.accent2}, transparent 60%), ${t.bg}"></div>${t.label}</button>`,
				)
				.join("")}</div>`;
			return;
		}
		const desc = typeof item.desc === "function" ? item.desc() : item.desc;
		html += `<div class="setting" data-i="${i}"><div class="info"><div class="name">${esc(item.name)}</div>${desc ? `<div class="desc">${esc(desc)}</div>` : ""}</div><div class="control">${controlHtml(item)}</div></div>`;
	});
	html += `</div>`;
	if (settingsSection === "proxy") {
		html += `<div class="card"><h3>About</h3><div class="setting"><div class="info"><div class="name">Engine</div><div class="desc">Scramjet ${esc(globalThis.$scramjet?.versionInfo?.version || "")} · controller ${esc(globalThis.$scramjetController?.VERSION || "")}</div></div></div></div>`;
	}
	page.innerHTML = html + "</div></div>";
	hydrateIcons(page);
	page.scrollTop = scroll;

	for (const b of page.querySelectorAll("[data-section]")) {
		b.onclick = () => {
			settingsSection = b.dataset.section;
			page.scrollTop = 0;
			renderSettings();
		};
	}
	for (const b of page.querySelectorAll("[data-theme]")) {
		b.onclick = () => {
			const t = themes[b.dataset.theme];
			set({ theme: b.dataset.theme, accent: t.accent, accent2: t.accent2, bg: t.bg, text: t.text });
			renderSettings();
		};
	}
	for (const row of page.querySelectorAll(".setting[data-i]")) {
		const item = current.items[row.dataset.i];
		const input = row.querySelector("[data-key]");
		if (item.type === "button") {
			row.querySelector("[data-run]").onclick = item.run;
			continue;
		}
		if (item.type === "key") {
			input.onkeydown = (e) => {
				e.preventDefault();
				e.stopPropagation();
				if (e.key === "Escape" || e.key === "Tab") return input.blur();
				input.value = e.key;
				set({ panicKey: e.key });
				toast(`Panic key set to "${e.key}"`);
				input.blur();
			};
			continue;
		}
		const handler = () => {
			let value = input.type === "checkbox" ? input.checked : input.value;
			if (item.type === "range") {
				value = Number(value);
				row.querySelector(".val").textContent = value + (item.unit || "");
			}
			const patch = { [item.key]: value };
			if (item.type === "color" && ["accent", "accent2", "bg", "text"].includes(item.key)) patch.theme = "custom";
			set(patch);
			// rows that depend on this value may need to appear/disappear
			if (item.type === "select" || item.type === "toggle") renderSettings();
		};
		input.addEventListener(item.type === "text" ? "change" : "input", handler);
	}
}

function exportSettings() {
	const blob = new Blob([exportJSON()], { type: "application/json" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = "longafellow-settings.json";
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importSettings() {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "application/json,.json";
	input.onchange = async () => {
		try {
			importJSON(await input.files[0].text());
			toast("Settings imported");
		} catch (e) {
			toast("Couldn't import: " + e.message);
		}
	};
	input.click();
}

async function backupEverything() {
	try {
		toast("Preparing backup…");
		const data = await exportAll();
		downloadJSON(data, `longafellow-backup-${location.hostname}-${new Date().toISOString().slice(0, 10)}.json`);
		toast("Backup downloaded");
	} catch (e) {
		toast("Backup failed: " + e.message);
	}
}

function restoreBackup() {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "application/json,.json";
	input.onchange = async () => {
		try {
			const data = JSON.parse(await input.files[0].text());
			if (!confirm(`Restore this backup from ${data.origin || "another site"}? Matching settings and game saves here will be replaced, then the page reloads.`)) return;
			toast("Restoring…");
			// close running games and pages so nothing holds their save databases open
			for (const t of tabs) if (t.iframe) unloadPage(t);
			await importAll(data);
			// skip the beforeunload prompt for this reload
			settings.confirmClose = false;
			location.reload();
		} catch (e) {
			toast("Couldn't restore: " + e.message);
		}
	};
	input.click();
}

function openPinDialog() {
	const dialog = $("#pin-dialog");
	const form = $("#pin-form");
	form.reset();
	dialog.returnValue = "";
	dialog.onclose = async () => {
		if (dialog.returnValue !== "save") return;
		if (form.pin.value !== form.confirm.value) return toast("The PINs didn't match. Try again.");
		await setPin(form.pin.value);
		renderSettings();
		toast("PIN set");
	};
	dialog.showModal();
}

/* ---------------- keyboard shortcuts help ---------------- */
function showHelp() {
	const keys = [
		["Alt + T", "New tab"],
		["Alt + W", "Close tab"],
		["Alt + 1–9", "Switch to tab 1–9"],
		["Ctrl + L", "Go to the address bar"],
		["/", "Search (on the home page)"],
		["Alt + G", "Games"],
		["Alt + R", "Random game"],
		["Alt + F", "Fullscreen the page or game"],
		["Alt + L", "Lock (when a PIN is set)"],
		[settings.panicKey || "—", "Panic: leave instantly"],
		["?", "Show this list"],
	];
	$("#help-keys").innerHTML = keys.map(([k, d]) => `<span class="k">${k.split(" + ").map((x) => `<kbd>${esc(x)}</kbd>`).join(" + ")}</span><span>${esc(d)}</span>`).join("");
	$("#help-dialog").showModal();
}

/* ---------------- cloaking & panic ---------------- */
function openBlank(src = location.href) {
	const win = window.open("about:blank", "_blank");
	if (!win) {
		toast("Pop-up blocked — allow pop-ups for this site to use about:blank");
		return false;
	}
	const d = win.document;
	d.title = document.title;
	const link = d.createElement("link");
	link.rel = "icon";
	link.href = new URL($("#favicon").getAttribute("href"), location.href).href;
	d.head.append(link);
	const frame = d.createElement("iframe");
	frame.src = src;
	frame.allow = "fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media";
	frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;margin:0";
	d.body.style.margin = "0";
	d.body.append(frame);
	return true;
}

function panic() {
	const url = toUrl(settings.panicUrl || "https://classroom.google.com");
	window.top.location.replace(url);
}

function handleKeys(e) {
	const typing = e.target.closest?.("input, textarea, [contenteditable='true']");
	if (settings.panicKey && e.key === settings.panicKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.dataset?.capture) {
		if (!typing || e.key.length > 1) {
			e.preventDefault();
			panic();
			return;
		}
	}
	if (isLocked()) return;
	// e.code, because Alt+letter types special characters on Macs
	if (e.altKey && !e.ctrlKey && !e.metaKey) {
		const alt = {
			KeyT: () => newTab(),
			KeyW: () => closeTab(activeId),
			KeyG: () => runAction("games"),
			KeyR: () => runAction("game-random"),
			KeyF: () => runAction("fullscreen"),
			KeyL: () => lock() || toast("Set a PIN in Settings → Privacy first"),
		}[e.code];
		const digit = /^Digit([1-9])$/.exec(e.code);
		if (alt) {
			e.preventDefault();
			alt();
			return;
		}
		if (digit && tabs[digit[1] - 1]) {
			e.preventDefault();
			activate(tabs[digit[1] - 1].id);
			return;
		}
	}
	if (e.key === "?" && !typing && !$("#help-dialog").open) {
		e.preventDefault();
		showHelp();
	} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
		e.preventDefault();
		window.focus();
		$("#omni-input").focus();
		$("#omni-input").select();
	} else if (e.key === "/" && !typing && activeTab()?.kind === "newtab") {
		e.preventDefault();
		$("#hero-input").focus();
	}
}

/* ---------------- wiring ---------------- */
function runAction(action) {
	const tab = activeTab();
	switch (action) {
		case "home":
			if (tab.kind === "newtab") return;
			unloadPage(tab);
			tab.kind = "newtab";
			tab.title = "New Tab";
			tab.favicon = null;
			renderTabs();
			showActive();
			break;
		case "newtab":
			newTab();
			break;
		case "settings":
		case "history":
		case "games": {
			const existing = tabs.find((t) => t.kind === action);
			if (existing) activate(existing.id);
			else newTab(action);
			break;
		}
		case "back":
			if (tab.kind === "web") tab.frame?.back();
			else if (tab.kind === "game") navigate(INTERNAL.games.url, tab);
			break;
		case "forward":
			tab.kind === "web" && tab.frame?.forward();
			break;
		case "reload":
			if (tab.kind === "web" && tab.frame) tab.frame.reload();
			else if (tab.kind === "game") launchGame(tab.game, tab);
			else showActive();
			break;
		case "bookmark":
			toggleBookmark(tab);
			break;
		case "game-restart":
			if (tab.game) launchGame(tab.game, tab);
			break;
		case "game-favorite":
			if (!tab.game) return;
			toast(toggleFavorite(tab.game.id) ? `Added ${tab.game.name} to favorites` : `Removed ${tab.game.name} from favorites`);
			syncOmnibox();
			break;
		case "game-random":
			loadGames().then(() => {
				const game = randomGame();
				if (game) launchGame(game, tab.kind === "game" || tab.kind === "newtab" ? tab : newTab("game"));
			});
			break;
		case "game-fullscreen":
			tab.iframe?.requestFullscreen?.();
			break;
		case "shortcuts-help":
			showHelp();
			break;
		case "popout":
			if (tab.kind !== "web" || !tab.iframe) return toast("Open a web page first");
			openBlank(tab.iframe.contentWindow.location.href);
			break;
		case "cloak":
			if (openBlank()) panic();
			break;
		case "fullscreen":
			if (document.fullscreenElement) document.exitFullscreen();
			else if ((tab.kind === "game" || tab.kind === "web") && tab.iframe) tab.iframe.requestFullscreen?.();
			else document.documentElement.requestFullscreen?.();
			break;
	}
}

document.addEventListener("click", (e) => {
	const btn = e.target.closest("[data-action]");
	if (btn) runAction(btn.dataset.action);
});
$("#add-tab").onclick = () => newTab();
document.addEventListener("keydown", handleKeys, true);

$("#omnibox").addEventListener("submit", (e) => {
	e.preventDefault();
	const input = $("#omni-input");
	navigate(input.value);
	input.blur();
});
$("#omni-input").addEventListener("focus", (e) => e.target.select());
$("#omni-input").addEventListener("blur", () => setTimeout(syncOmnibox, 0));

$("#hero-search").addEventListener("submit", (e) => {
	e.preventDefault();
	const input = $("#hero-input");
	if (!input.value.trim()) return;
	navigate(input.value);
	input.value = "";
});
$("#engine-chip").onclick = () => {
	const keys = Object.keys(engines).filter((k) => k !== "custom" || settings.customEngine.includes("%s"));
	const next = keys[(keys.indexOf(settings.engine) + 1) % keys.length];
	set({ engine: next });
	toast(`Searching with ${engines[next].label}`);
};

/* ---------------- suggestions ---------------- */
function localSuggestions(q) {
	const games = searchGames(q, 2).map((g) => ({ type: "game", label: g.name, sub: "Game", value: g }));
	const lower = q.toLowerCase();
	const seen = new Set();
	const past = [];
	for (const h of history) {
		if (past.length >= 3) break;
		if (seen.has(h.url) || !((h.title || "").toLowerCase().includes(lower) || h.url.toLowerCase().includes(lower))) continue;
		seen.add(h.url);
		past.push({ type: "history", label: h.title || h.url, sub: h.url.replace(/^https?:\/\//, ""), value: h.url });
	}
	return [...games, ...past];
}

async function remoteSuggestions(q) {
	if (!settings.suggestions) return [];
	const text = await proxyFetchText(`https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`);
	const data = JSON.parse(text);
	return Array.isArray(data[1]) ? data[1] : data.map((d) => d.phrase).filter(Boolean);
}

function pickSuggestion(item, input) {
	input.value = "";
	input.blur();
	const tab = activeTab();
	if (item.type === "game") launchGame(item.value, tab);
	else navigate(item.value, tab);
}

for (const id of ["#hero-input", "#omni-input"]) {
	const input = $(id);
	attachSuggest(input, { local: localSuggestions, remote: remoteSuggestions, onPick: (item) => pickSuggestion(item, input) });
}
loadGames().catch(() => {});

/* ---------------- disguise when hidden ---------------- */
document.addEventListener("visibilitychange", () => {
	if (!settings.autoCloak) return;
	if (document.hidden) applyCloak(settings.autoCloakPreset);
	else applyCloak();
});

window.addEventListener("beforeunload", (e) => {
	if (settings.confirmClose) {
		e.preventDefault();
		e.returnValue = "";
	}
});

let transportTimer;
onChange((patch) => {
	applyAppearance();
	if ("starCount" in patch) seedStars();
	if ("shortcuts" in patch) renderShortcuts();
	if ("bookmarks" in patch || "showBookmarksBar" in patch) renderBookmarks();
	if ("showHomeGames" in patch && activeTab()?.kind === "newtab") renderHomeGames();
	if ("restoreTabs" in patch) saveSession();
	if ("use24h" in patch) tickClock();
	if ("transport" in patch || "wisp" in patch || "wispBackups" in patch) {
		clearTimeout(transportTimer);
		transportTimer = setTimeout(() => {
			switchTransport()
				.then(() => {
					toast("Transport updated");
					updateStatus();
				})
				.catch((e) => toast("Transport error: " + e.message));
		}, 300);
	}
	syncOmnibox();
});

/* ---------------- boot ---------------- */
hydrateIcons();
applyAppearance();
startBackground();
tickClock();
setInterval(tickClock, 1000);
renderShortcuts();
renderBookmarks();
initLock();
document.documentElement.classList.remove("pre-lock");
if (!restoreSession()) newTab();

if (settings.autoBlank && window.top === window) {
	// pop-ups need a user gesture, so relaunch on the first click
	document.addEventListener("click", () => openBlank() && panic(), { once: true, capture: true });
}

const dot = $("#status-dot");
const status = $("#status-text");
async function updateStatus() {
	dot.className = "dot";
	status.textContent = "Connecting to Wisp server…";
	if (await checkWisp(wispUrl(), 45000)) {
		dot.className = "dot ok";
		status.textContent = usingBackupWisp() ? "Proxy ready (using a backup server)" : "Proxy ready";
	} else {
		dot.className = "dot err";
		status.textContent = `Can't reach Wisp server at ${wispUrl()}. Click to retry, or change it in Settings`;
	}
}
status.addEventListener("click", () => dot.classList.contains("err") && switchTransport().then(updateStatus, updateStatus));

initProxy()
	.then(updateStatus)
	.catch((err) => {
		console.error(err);
		dot.className = "dot err";
		status.textContent = "Proxy failed to start: " + err.message;
	});

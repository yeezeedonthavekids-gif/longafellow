import { icon } from "./icons.js";

// Game files and covers come from the gn-math repos, served through jsDelivr.
export const GAME_HTML = "https://cdn.jsdelivr.net/gh/gn-math/html@main/";
export const GAME_COVERS = "https://cdn.jsdelivr.net/gh/gn-math/covers@main/";

const FAV_KEY = "longafellow:games:favorites";
const RECENT_KEY = "longafellow:games:recent";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function readList(key) {
	try {
		const v = JSON.parse(localStorage.getItem(key) || "[]");
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
}

function writeList(key, list) {
	try {
		localStorage.setItem(key, JSON.stringify(list));
	} catch {
		// storage unavailable; favorites just won't persist
	}
}

let games = null;
let loading = null;
let favorites = new Set(readList(FAV_KEY));
let recent = readList(RECENT_KEY);
const state = { query: "", filter: "all", sort: "featured" };
let built = false;

export function loadGames() {
	loading ??= fetch("/data/games.json")
		.then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r.json();
		})
		.then((list) => (games = list))
		.catch((e) => {
			loading = null;
			throw e;
		});
	return loading;
}

export function getGame(id) {
	return games?.find((g) => g.id === id);
}

export function markPlayed(game) {
	recent = [game.id, ...recent.filter((id) => id !== game.id)].slice(0, 30);
	writeList(RECENT_KEY, recent);
}

function sorted(list) {
	if (state.filter === "recent") {
		const order = new Map(recent.map((id, i) => [id, i]));
		return list.slice().sort((a, b) => order.get(a.id) - order.get(b.id));
	}
	if (state.sort === "az") return list.slice().sort((a, b) => a.name.localeCompare(b.name));
	if (state.sort === "new") return list.slice().sort((a, b) => b.id - a.id);
	// featured first, then the list's own order
	return list.slice().sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
}

function visible() {
	const q = state.query.trim().toLowerCase();
	return sorted(
		games.filter((g) => {
			if (state.filter === "featured" && !g.featured) return false;
			if (state.filter === "favorites" && !favorites.has(g.id)) return false;
			if (state.filter === "recent" && !recent.includes(g.id)) return false;
			if (q && !g.name.toLowerCase().includes(q) && !(g.author || "").toLowerCase().includes(q)) return false;
			return true;
		}),
	);
}

function cardHtml(g) {
	const tags = (g.tags || []).map((t) => `<span class="game-tag">${esc(t)}</span>`).join("");
	return `<div class="game-card" data-id="${g.id}" role="button" tabindex="0" title="${esc(g.name)}">
		<div class="game-cover"><img loading="lazy" decoding="async" alt="" src="${GAME_COVERS}${esc(g.cover)}" onerror="this.style.visibility='hidden'">${tags}</div>
		<button class="game-fav ${favorites.has(g.id) ? "on" : ""}" title="Favorite">${icon("star")}</button>
		<div class="game-name">${esc(g.name)}</div>
		<div class="game-author">${esc(g.author || "")}</div>
	</div>`;
}

function renderGrid(page) {
	const list = visible();
	const grid = page.querySelector(".game-grid");
	page.querySelector(".game-count").textContent = `${list.length} of ${games.length} games`;
	grid.innerHTML = list.length
		? list.map(cardHtml).join("")
		: `<div class="empty">${state.filter === "favorites" ? "No favorites yet — tap the star on a game." : state.filter === "recent" ? "You haven't played anything yet." : "No games match your search."}</div>`;
}

export async function renderGames(page, { onLaunch, onError }) {
	if (!built) {
		page.innerHTML = `<h2>Games</h2><p class="sub">Loading games…</p>`;
	}
	try {
		await loadGames();
	} catch (e) {
		page.innerHTML = `<h2>Games</h2><p class="sub">Couldn't load the game list (${esc(e.message)}).</p>`;
		onError?.(e);
		return;
	}
	if (built) {
		renderGrid(page);
		return;
	}
	built = true;
	const filters = [
		["all", "All"],
		["featured", "Featured"],
		["favorites", "Favorites"],
		["recent", "Recent"],
	];
	page.innerHTML = `<h2>Games</h2><p class="sub">${games.length} HTML games, courtesy of gn-math. Click one to play it in a new tab.</p>
		<div class="game-toolbar">
			<label class="game-search">${icon("search")}<input type="search" placeholder="Search games…" spellcheck="false"></label>
			<div class="game-filters">${filters.map(([k, l]) => `<button data-filter="${k}" class="${state.filter === k ? "active" : ""}">${l}</button>`).join("")}</div>
			<select class="game-sort"><option value="featured">Featured first</option><option value="az">A–Z</option><option value="new">Newest</option></select>
		</div>
		<div class="game-count"></div>
		<div class="game-grid"></div>`;

	const search = page.querySelector(".game-search input");
	search.addEventListener("input", () => {
		state.query = search.value;
		renderGrid(page);
	});
	page.querySelector(".game-sort").addEventListener("change", (e) => {
		state.sort = e.target.value;
		renderGrid(page);
	});
	for (const b of page.querySelectorAll("[data-filter]")) {
		b.addEventListener("click", () => {
			state.filter = b.dataset.filter;
			page.querySelectorAll("[data-filter]").forEach((x) => x.classList.toggle("active", x === b));
			renderGrid(page);
		});
	}
	const grid = page.querySelector(".game-grid");
	const activate = (e) => {
		const card = e.target.closest(".game-card");
		if (!card) return;
		const game = getGame(Number(card.dataset.id));
		if (e.target.closest(".game-fav")) {
			if (favorites.has(game.id)) favorites.delete(game.id);
			else favorites.add(game.id);
			writeList(FAV_KEY, [...favorites]);
			e.target.closest(".game-fav").classList.toggle("on", favorites.has(game.id));
			if (state.filter === "favorites") renderGrid(page);
			return;
		}
		onLaunch(game);
	};
	grid.addEventListener("click", activate);
	grid.addEventListener("keydown", (e) => e.key === "Enter" && activate(e));
	renderGrid(page);
}

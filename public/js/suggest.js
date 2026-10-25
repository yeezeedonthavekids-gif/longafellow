import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Adds a suggestion dropdown to a search input.
// sources.local(q) -> [{ type, label, sub?, value }] synchronously (games, history)
// sources.remote(q) -> Promise<string[]> (search engine suggestions), may be null
// onPick(item) is called when a suggestion is chosen.
export function attachSuggest(input, { local, remote, onPick }) {
	const form = input.closest("form");
	const box = document.createElement("div");
	box.className = "suggest";
	box.hidden = true;
	form.append(box);

	let items = [];
	let index = -1;
	let seq = 0;
	let timer;

	const typeIcon = { game: "gamepad", history: "history", search: "search", url: "globe" };

	function render() {
		if (!items.length || document.activeElement !== input) {
			box.hidden = true;
			return;
		}
		box.innerHTML = items
			.map(
				(it, i) =>
					`<div class="suggest-item ${i === index ? "active" : ""}" data-i="${i}">${icon(typeIcon[it.type] || "search")}<span class="label">${esc(it.label)}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ""}</div>`,
			)
			.join("");
		box.hidden = false;
	}

	async function update() {
		const q = input.value.trim();
		const mine = ++seq;
		index = -1;
		if (!q) {
			items = [];
			return render();
		}
		const localItems = local(q);
		items = localItems;
		render();
		if (!remote) return;
		try {
			const phrases = await remote(q);
			if (mine !== seq) return;
			const seen = new Set(localItems.map((i) => i.label.toLowerCase()));
			const remoteItems = phrases
				.filter((p) => !seen.has(p.toLowerCase()))
				.slice(0, 6)
				.map((p) => ({ type: "search", label: p, value: p }));
			items = [...localItems, ...remoteItems].slice(0, 9);
			render();
		} catch {
			// suggestions are a nice-to-have; ignore failures
		}
	}

	input.addEventListener("input", () => {
		clearTimeout(timer);
		timer = setTimeout(update, 120);
	});
	input.addEventListener("focus", () => input.value.trim() && update());
	input.addEventListener("blur", () => setTimeout(() => (box.hidden = true), 120));
	input.addEventListener("keydown", (e) => {
		if (box.hidden || !items.length) return;
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const n = items.length;
			index = e.key === "ArrowDown" ? (index + 1) % n : (index - 1 + n) % n;
			render();
		} else if (e.key === "Enter" && index >= 0) {
			e.preventDefault();
			pick(items[index]);
		} else if (e.key === "Escape") {
			items = [];
			render();
		}
	});
	// mousedown so the input doesn't blur (and hide the box) before the click lands
	box.addEventListener("mousedown", (e) => {
		const el = e.target.closest(".suggest-item");
		if (!el) return;
		e.preventDefault();
		pick(items[el.dataset.i]);
	});

	function pick(item) {
		items = [];
		seq++;
		render();
		onPick(item);
	}

	return {
		close() {
			items = [];
			seq++;
			render();
		},
	};
}

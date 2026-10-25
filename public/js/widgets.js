import { icon } from "./icons.js";

// Home page widgets. Each one keeps its own data in localStorage (so it's included in backups).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function load(key, fallback) {
	try {
		return JSON.parse(localStorage.getItem(`longafellow:widget:${key}`)) ?? fallback;
	} catch {
		return fallback;
	}
}

function store(key, value) {
	try {
		localStorage.setItem(`longafellow:widget:${key}`, JSON.stringify(value));
	} catch {
		// storage full; the widget still works for this visit
	}
}

/* ---------- to-do ---------- */
function todo(card) {
	let items = load("todo", []);
	const body = card.querySelector(".w-body");
	function render() {
		const left = items.filter((i) => !i.done).length;
		card.querySelector(".w-meta").textContent = items.length ? `${left} left` : "";
		body.innerHTML = `<form class="todo-add"><input placeholder="Add a task…" maxlength="120"><button class="w-btn" title="Add">${icon("plus")}</button></form>
			<ul class="todo-list">${items
				.map(
					(it, i) =>
						`<li class="${it.done ? "done" : ""}"><label><input type="checkbox" data-i="${i}" ${it.done ? "checked" : ""}><span>${esc(it.t)}</span></label><button class="w-x" data-del="${i}" title="Delete">${icon("x")}</button></li>`,
				)
				.join("")}</ul>${items.some((i) => i.done) ? `<button class="w-link" data-clear>Clear completed</button>` : ""}`;
		const input = body.querySelector(".todo-add input");
		body.querySelector(".todo-add").onsubmit = (e) => {
			e.preventDefault();
			const t = input.value.trim();
			if (!t) return;
			items.push({ t, done: false });
			store("todo", items);
			render();
			body.querySelector(".todo-add input").focus();
		};
	}
	body.addEventListener("change", (e) => {
		const i = e.target.dataset.i;
		if (i === undefined) return;
		items[i].done = e.target.checked;
		store("todo", items);
		render();
	});
	body.addEventListener("click", (e) => {
		const del = e.target.closest("[data-del]");
		if (del) items.splice(Number(del.dataset.del), 1);
		else if (e.target.closest("[data-clear]")) items = items.filter((i) => !i.done);
		else return;
		store("todo", items);
		render();
	});
	render();
}

/* ---------- notes ---------- */
function notes(card) {
	const body = card.querySelector(".w-body");
	body.innerHTML = `<textarea class="notes" placeholder="Jot something down…" spellcheck="true"></textarea>`;
	const area = body.querySelector("textarea");
	area.value = load("notes", "");
	let t;
	area.addEventListener("input", () => {
		card.querySelector(".w-meta").textContent = "Saving…";
		clearTimeout(t);
		t = setTimeout(() => {
			store("notes", area.value);
			card.querySelector(".w-meta").textContent = "Saved";
		}, 400);
	});
}

/* ---------- timer ---------- */
let timerTick = null;

function beep() {
	try {
		const ctx = new AudioContext();
		[0, 0.35, 0.7].forEach((at) => {
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.frequency.value = 880;
			g.gain.setValueAtTime(0.25, ctx.currentTime + at);
			g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.3);
			o.connect(g).connect(ctx.destination);
			o.start(ctx.currentTime + at);
			o.stop(ctx.currentTime + at + 0.3);
		});
	} catch {
		// audio blocked; the toast still shows
	}
}

function timer(card, { toast }) {
	// running: { end }  paused: { left }  — both in ms
	let state = load("timer", { total: 25 * 60000, left: 25 * 60000, end: null });
	const body = card.querySelector(".w-body");
	body.innerHTML = `<div class="timer-face"></div>
		<div class="timer-presets">${[5, 15, 25, 45].map((m) => `<button class="w-chip" data-min="${m}">${m}m</button>`).join("")}</div>
		<div class="timer-controls"><button class="btn" data-go></button><button class="btn ghost" data-reset>Reset</button></div>`;
	const face = body.querySelector(".timer-face");
	const go = body.querySelector("[data-go]");
	const remaining = () => (state.end ? Math.max(0, state.end - Date.now()) : state.left);

	function draw() {
		const ms = remaining();
		const s = Math.ceil(ms / 1000);
		face.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
		face.style.setProperty("--p", `${(1 - ms / state.total) * 100}%`);
		go.textContent = state.end ? "Pause" : ms < state.total ? "Resume" : "Start";
		card.querySelector(".w-meta").textContent = state.end ? "Running" : "";
		if (state.end && ms === 0) {
			state = { total: state.total, left: state.total, end: null };
			store("timer", state);
			beep();
			toast("⏰ Time's up!");
			draw();
		}
	}
	go.onclick = () => {
		state = state.end ? { total: state.total, left: remaining(), end: null } : { total: state.total, left: null, end: Date.now() + remaining() };
		store("timer", state);
		draw();
	};
	body.querySelector("[data-reset]").onclick = () => {
		state = { total: state.total, left: state.total, end: null };
		store("timer", state);
		draw();
	};
	body.querySelector(".timer-presets").onclick = (e) => {
		const m = e.target.closest("[data-min]")?.dataset.min;
		if (!m) return;
		state = { total: m * 60000, left: m * 60000, end: null };
		store("timer", state);
		draw();
	};
	clearInterval(timerTick);
	timerTick = setInterval(draw, 250);
	draw();
}

/* ---------- calendar ---------- */
function calendar(card) {
	const body = card.querySelector(".w-body");
	const now = new Date();
	let view = new Date(now.getFullYear(), now.getMonth(), 1);
	function render() {
		const y = view.getFullYear();
		const m = view.getMonth();
		const first = new Date(y, m, 1).getDay();
		const days = new Date(y, m + 1, 0).getDate();
		const isNow = y === now.getFullYear() && m === now.getMonth();
		const names = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" }));
		let cells = names.map((n) => `<span class="cal-h">${n}</span>`).join("");
		cells += "<span></span>".repeat(first);
		for (let d = 1; d <= days; d++) cells += `<span class="${isNow && d === now.getDate() ? "today" : ""}">${d}</span>`;
		body.innerHTML = `<div class="cal-head"><button class="w-btn" data-step="-1" title="Previous month">${icon("left")}</button><span>${view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span><button class="w-btn" data-step="1" title="Next month">${icon("right")}</button></div><div class="cal-grid">${cells}</div>`;
	}
	body.addEventListener("click", (e) => {
		const step = e.target.closest("[data-step]")?.dataset.step;
		if (!step) return;
		view = new Date(view.getFullYear(), view.getMonth() + Number(step), 1);
		render();
	});
	render();
}

export const WIDGETS = {
	todo: { label: "To-do list", icon: "check", build: todo },
	notes: { label: "Notes", icon: "note", build: notes },
	timer: { label: "Timer", icon: "timer", build: timer },
	calendar: { label: "Calendar", icon: "calendar", build: calendar },
};

export function renderWidgets(container, enabled, helpers) {
	const list = enabled.filter((id) => WIDGETS[id]);
	container.hidden = !list.length;
	container.innerHTML = "";
	if (!list.length) clearInterval(timerTick);
	for (const id of list) {
		const w = WIDGETS[id];
		const card = document.createElement("section");
		card.className = `widget w-${id}`;
		card.innerHTML = `<header><span class="w-title">${icon(w.icon)}${w.label}</span><span class="w-meta"></span></header><div class="w-body"></div>`;
		container.append(card);
		w.build(card, helpers);
	}
}

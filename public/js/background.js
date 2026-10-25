import { settings } from "./settings.js";

// Twinkling, slowly drifting starfield drawn on a canvas.
const canvas = document.getElementById("stars");
const ctx = canvas.getContext("2d");
let stars = [];
let w = 0;
let h = 0;
let last = 0;

function resize() {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	w = canvas.clientWidth;
	h = canvas.clientHeight;
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function seedStars() {
	const count = Math.max(0, Math.min(1200, settings.starCount | 0));
	stars = Array.from({ length: count }, () => ({
		x: Math.random() * w,
		y: Math.random() * h,
		r: Math.random() * 1.3 + 0.25,
		z: Math.random() * 0.8 + 0.2, // depth: closer stars move faster
		phase: Math.random() * Math.PI * 2,
		tw: Math.random() * 1.5 + 0.5,
	}));
}

function frame(t) {
	const dt = Math.min(64, t - last) / 1000;
	last = t;
	const active = settings.background === "stars" || settings.background === "image";
	if (active && !document.hidden) {
		ctx.clearRect(0, 0, w, h);
		const speed = settings.reduceMotion ? 0 : settings.starSpeed / 10;
		const tint = settings.accent2;
		for (const s of stars) {
			s.x -= speed * s.z * dt * 4;
			s.y += speed * s.z * dt * 1.5;
			if (s.x < -2) s.x = w + 2;
			if (s.y > h + 2) s.y = -2;
			const a = settings.reduceMotion ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(t / 1000 * s.tw + s.phase));
			ctx.globalAlpha = a * s.z;
			ctx.fillStyle = s.r > 1.25 ? tint : "#ffffff";
			ctx.beginPath();
			ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}
	requestAnimationFrame(frame);
}

export function startBackground() {
	resize();
	seedStars();
	window.addEventListener("resize", () => {
		resize();
		seedStars();
	});
	requestAnimationFrame(frame);
}

import { settings, set } from "./settings.js";

// A PIN screen over the whole app. It only keeps casual onlookers out:
// anything stored in the browser can be read by someone with dev tools.

async function hash(pin, salt) {
	const data = new TextEncoder().encode(`${salt}:${pin}`);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function setPin(pin) {
	const salt = crypto.getRandomValues(new Uint32Array(4)).join("-");
	set({ lockEnabled: true, lockSalt: salt, lockHash: await hash(pin, salt) });
}

export function clearPin() {
	set({ lockEnabled: false, lockSalt: "", lockHash: "" });
}

export function isLocked() {
	return !document.getElementById("lock").hidden;
}

export function lock() {
	if (!settings.lockEnabled || !settings.lockHash) return false;
	const screen = document.getElementById("lock");
	const input = document.getElementById("lock-input");
	screen.hidden = false;
	input.value = "";
	document.getElementById("lock-error").textContent = "";
	setTimeout(() => input.focus(), 0);
	return true;
}

export function initLock() {
	const form = document.getElementById("lock-form");
	const input = document.getElementById("lock-input");
	const error = document.getElementById("lock-error");
	let attempts = 0;
	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		if ((await hash(input.value, settings.lockSalt)) === settings.lockHash) {
			document.getElementById("lock").hidden = true;
			attempts = 0;
			return;
		}
		attempts++;
		input.value = "";
		error.textContent = attempts >= 3 ? "Wrong PIN. Forgot it? Clear this site's data in your browser to reset." : "Wrong PIN";
		form.classList.remove("shake");
		void form.offsetWidth;
		form.classList.add("shake");
	});
	lock();
}

// Uploaded wallpapers live in IndexedDB (too big for localStorage). Backups include them.
const DB = "longafellow-wallpaper";
const STORE = "files";
let currentUrl = null;

function open() {
	return new Promise((resolve, reject) => {
		const r = indexedDB.open(DB, 1);
		r.onupgradeneeded = () => r.result.createObjectStore(STORE);
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}

async function run(mode, fn) {
	const db = await open();
	try {
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, mode);
			const result = fn(tx.objectStore(STORE));
			tx.oncomplete = () => resolve(result?.result);
			tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

export async function saveWallpaper(file) {
	await run("readwrite", (s) => s.put(file, "wallpaper"));
}

// Returns an object URL for the uploaded wallpaper, or null if there isn't one.
export async function wallpaperUrl() {
	const blob = await run("readonly", (s) => s.get("wallpaper")).catch(() => null);
	if (currentUrl) URL.revokeObjectURL(currentUrl);
	currentUrl = blob ? URL.createObjectURL(blob) : null;
	return currentUrl;
}

// Full backup of everything this site stores in the browser: Longafellow's settings and history,
// and the localStorage / IndexedDB data games use for their save files.

const b64 = {
	encode(buf) {
		const bytes = new Uint8Array(buf);
		let s = "";
		for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		return btoa(s);
	},
	decode(str) {
		return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)).buffer;
	},
};

// JSON can't hold binary data or dates, so tag them.
async function encode(v) {
	if (v === null || typeof v !== "object") return v;
	if (v instanceof Date) return { $lf: "date", v: v.getTime() };
	if (v instanceof ArrayBuffer) return { $lf: "buf", v: b64.encode(v) };
	if (ArrayBuffer.isView(v)) return { $lf: "view", t: v.constructor.name, v: b64.encode(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)) };
	if (v instanceof Blob) return { $lf: "blob", t: v.type, v: b64.encode(await v.arrayBuffer()) };
	if (v instanceof Map) return { $lf: "map", v: await Promise.all([...v].map(async ([k, x]) => [await encode(k), await encode(x)])) };
	if (v instanceof Set) return { $lf: "set", v: await Promise.all([...v].map(encode)) };
	if (Array.isArray(v)) return Promise.all(v.map(encode));
	const out = {};
	for (const [k, x] of Object.entries(v)) out[k] = await encode(x);
	return out;
}

function decode(v) {
	if (v === null || typeof v !== "object") return v;
	if (Array.isArray(v)) return v.map(decode);
	switch (v.$lf) {
		case "date":
			return new Date(v.v);
		case "buf":
			return b64.decode(v.v);
		case "view":
			return new (globalThis[v.t] || Uint8Array)(b64.decode(v.v));
		case "blob":
			return new Blob([b64.decode(v.v)], { type: v.t });
		case "map":
			return new Map(v.v.map(([k, x]) => [decode(k), decode(x)]));
		case "set":
			return new Set(v.v.map(decode));
	}
	const out = {};
	for (const [k, x] of Object.entries(v)) out[k] = decode(x);
	return out;
}

const req = (r) =>
	new Promise((resolve, reject) => {
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});

const done = (tx) =>
	new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = tx.onabort = () => reject(tx.error);
	});

async function dumpDatabase(name) {
	const db = await req(indexedDB.open(name));
	try {
		const stores = [];
		for (const storeName of db.objectStoreNames) {
			const tx = db.transaction(storeName, "readonly");
			const store = tx.objectStore(storeName);
			const [keys, values] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
			const indexes = [...store.indexNames].map((n) => {
				const idx = store.index(n);
				return { name: n, keyPath: idx.keyPath, unique: idx.unique, multiEntry: idx.multiEntry };
			});
			stores.push({
				name: storeName,
				keyPath: store.keyPath,
				autoIncrement: store.autoIncrement,
				indexes,
				records: await Promise.all(keys.map(async (k, i) => [await encode(k), await encode(values[i])])),
			});
		}
		return { name, version: db.version, stores };
	} finally {
		db.close();
	}
}

function deleteDatabase(name) {
	return new Promise((resolve, reject) => {
		const r = indexedDB.deleteDatabase(name);
		r.onsuccess = r.onerror = () => resolve();
		// another tab or game still has it open
		r.onblocked = () => setTimeout(() => reject(new Error(`"${name}" is in use. Close other Longafellow tabs and try again.`)), 3000);
	});
}

async function writeRecords(db, dump) {
	for (const s of dump.stores) {
		const tx = db.transaction(s.name, "readwrite");
		const store = tx.objectStore(s.name);
		store.clear();
		for (const [k, v] of s.records) {
			// stores with a keyPath keep the key inside the value
			if (s.keyPath !== null && s.keyPath !== undefined) store.put(decode(v));
			else store.put(decode(v), decode(k));
		}
		await done(tx);
	}
}

async function restoreDatabase(dump) {
	// If the database already has these stores, replace their contents in place. This works
	// even while something (like the proxy's cookie store) keeps the database open.
	const existing = await req(indexedDB.open(dump.name));
	const fits = existing.version >= (dump.version || 1) && dump.stores.every((s) => existing.objectStoreNames.contains(s.name));
	if (fits) {
		try {
			return await writeRecords(existing, dump);
		} finally {
			existing.close();
		}
	}
	existing.close();
	await deleteDatabase(dump.name);
	const open = indexedDB.open(dump.name, dump.version || 1);
	open.onupgradeneeded = () => {
		const db = open.result;
		for (const s of dump.stores) {
			const store = db.createObjectStore(s.name, { keyPath: s.keyPath ?? undefined, autoIncrement: s.autoIncrement });
			for (const i of s.indexes) store.createIndex(i.name, i.keyPath, { unique: i.unique, multiEntry: i.multiEntry });
		}
	};
	const db = await req(open);
	try {
		await writeRecords(db, dump);
	} finally {
		db.close();
	}
}

export async function exportAll() {
	const local = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		local[k] = localStorage.getItem(k);
	}
	const databases = [];
	const list = (await indexedDB.databases?.()) || [];
	for (const { name } of list) {
		if (!name) continue;
		try {
			databases.push(await dumpDatabase(name));
		} catch (e) {
			console.warn("Skipping database", name, e);
		}
	}
	return { app: "longafellow", kind: "full-backup", version: 1, origin: location.origin, exported: new Date().toISOString(), localStorage: local, indexedDB: databases };
}

export async function importAll(data) {
	if (data?.app !== "longafellow" || data.kind !== "full-backup") throw new Error("This isn't a Longafellow backup file");
	for (const [k, v] of Object.entries(data.localStorage || {})) localStorage.setItem(k, v);
	for (const dump of data.indexedDB || []) await restoreDatabase(dump);
}

export function downloadJSON(obj, filename) {
	const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

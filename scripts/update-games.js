// Refreshes public/data/games.json from gn-math's game list.
// Usage: npm run update-games            (downloads the latest list)
//        npm run update-games -- zones.json (uses a local copy)
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://cdn.jsdelivr.net/gh/gn-math/assets@main/zones.json";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "games.json");

const local = process.argv[2];
const zones = local ? JSON.parse(readFileSync(local, "utf8")) : await (await fetch(SOURCE)).json();

const games = zones
	.filter((z) => typeof z.url === "string" && z.url.startsWith("{HTML_URL}/"))
	.map((z) => {
		const g = { id: z.id, name: z.name.trim(), file: z.url.slice("{HTML_URL}/".length), cover: z.cover.replace("{COVER_URL}/", "") };
		if (z.author) g.author = z.author;
		if (z.featured) g.featured = true;
		if (Array.isArray(z.special) && z.special.length) g.tags = z.special;
		return g;
	});

writeFileSync(out, JSON.stringify(games));
console.log(`Wrote ${games.length} games to public/data/games.json`);

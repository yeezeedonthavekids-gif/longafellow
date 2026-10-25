// Site-wide defaults. Netlify can't run a Wisp server, so the site points at the one hosted on Render.
// Override at build time with the WISP_URL / WISP_BACKUPS env vars, or per-browser in Settings -> Search & proxy.
self.LONGAFELLOW_CONFIG = {
	wisp: "wss://longafellow.onrender.com/wisp/",
	// extra Wisp servers to fall back to if the main one is down, e.g. ["wss://other-host.example.com/wisp/"]
	wispBackups: [],
};

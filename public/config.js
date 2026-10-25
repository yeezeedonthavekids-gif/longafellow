// Site-wide defaults. Netlify can't run a Wisp server, so the site points at the one hosted on Render.
// Override at build time with the WISP_URL env var, or per-browser in Settings -> Search & proxy.
self.LONGAFELLOW_CONFIG = {
	wisp: "wss://longafellow.onrender.com/wisp/",
};

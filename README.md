# Longafellow

A blue, highly customizable web proxy built on [Scramjet](https://github.com/MercuryWorkshop/scramjet) `v2.0.67-alpha.2`.

## Run it

```bash
npm install
npm start          # http://localhost:8080
```

Environment variables:

| Variable      | Default   | Purpose                                                        |
| ------------- | --------- | -------------------------------------------------------------- |
| `PORT`        | `8080`    | Port to listen on                                              |
| `HOST`        | `0.0.0.0` | Interface to bind                                              |
| `ALLOW_LOCAL` | off       | Set to `1` to let the proxy reach localhost/private IPs (dev only) |

Service workers only run on `https://` or `localhost`, so deploy it behind HTTPS.

## Deploying to Netlify

Netlify only hosts static files, so the site deploys there but the **Wisp server can't**.
Wisp is the WebSocket backend that actually fetches pages. You need both parts:

1. **Frontend (Netlify).** Import this repo. `netlify.toml` already sets the build (`npm run build`) and publish dir (`dist`).
   It uses `wss://longafellow.onrender.com/wisp/` by default (see `public/config.js`). To use a different server, set `WISP_URL` in
   *Site configuration → Environment variables* and redeploy.
2. **Wisp server (any host with WebSockets).** Deploy this same repo to Render, Railway, Fly.io, or a VPS with
   `npm install` / `npm start`. Its `/wisp/` endpoint is your `WISP_URL`. (It also serves the full site, so that host works on its own too.)

Users can also point to a different Wisp server in *Settings → Search & proxy*.

**Backup servers:** deploy the repo to a second host (e.g. Railway or Fly.io) and set `WISP_BACKUPS` on Netlify
(comma-separated `wss://…/wisp/` URLs). If the main server doesn't answer, Longafellow switches to a backup automatically.

**Keep Render awake:** free Render services sleep after 15 minutes. Point a free uptime monitor
(UptimeRobot, cron-job.org) at `https://<your-service>.onrender.com/health` every 10 minutes.

### Vercel

Import the repo. `vercel.json` makes Vercel build the static site (`npm run build` into `dist`), and `.vercelignore`
keeps it from trying to run `server.js`, since Vercel can't host the Wisp server. The site uses the Render Wisp server by default.

### Fastly

- Fastly can sit in front of Netlify as a CDN. Make sure `/sw.js` and `/config.js` aren't cached long (they're sent with `Cache-Control: no-cache`).
- To put Fastly in front of the Wisp server, WebSocket passthrough must be enabled on the Fastly service, or `/wisp/` connections will fail.
  Simplest is to point `WISP_URL` straight at the Wisp host.

## Games

The **Games** page lists 849 HTML games from [gn-math](https://github.com/gn-math/html), with search, favorites and recently played.
The list is bundled at `public/data/games.json`, and each game file and cover loads from GitHub (raw.githubusercontent.com) when you open it, falling back to jsDelivr and then the proxy.
To refresh the list, run `npm run update-games`.

## How it works

- `server.js` serves the UI, the Scramjet/controller/transport bundles, and a **Wisp** WebSocket server at `/wisp/`.
- `public/sw.js` loads the Scramjet controller's service worker and routes proxied requests.
- `public/js/proxy.js` starts the `Controller` with an Epoxy or libcurl transport. Each browser tab gets its own Scramjet `Frame`.

## Customizing

Everything is in **Settings** (gear icon) and is saved in the browser:

- **Appearance:** 8 blue theme presets, accent/secondary/background/text colors, font, UI size, corner roundness, glass blur, panel opacity, glow
- **Background:** starfield, aurora, gradient, solid color, or a custom image, plus star count and speed and a reduce-motion option
- **Home page:** use the **Customize** button to drag sections into any order, turn them on or off, pick widgets (to-do list, notes, timer, calendar) and change the wallpaper, including uploading your own image. Also: title text, tagline, gradient title, side bar and bookmarks bar. Shortcuts can be added, edited (right-click) or removed. You can also choose to reopen your tabs from last time
- **Search & proxy:** search engine (or a custom `%s` URL), search suggestions, ad & tracker blocking, Epoxy/libcurl transport, a custom Wisp server and backup servers
- **Privacy:** tab cloak presets, a disguise used when you switch to another tab, PIN lock, about:blank launcher (or auto-launch), panic key + URL, history toggle, confirm-on-close
- **Data:** a full backup and restore (settings, history, bookmarks and game saves), settings-only export/import, reset

Press `?` in the app for all keyboard shortcuts: `Alt+T` new tab · `Alt+W` close tab · `Alt+1–9` switch tabs · `Ctrl+L` address bar ·
`/` search · `Alt+G` games · `Alt+R` random game · `Alt+F` fullscreen · `Alt+L` lock · panic key (default `` ` ``).

### Moving game saves between sites

Each site (for example `lfhub.netlify.app` and `longlearning.netlify.app`) keeps its own saves. To move them, go to
*Settings → Data → Back up everything* on one site, then *Restore a backup* on the other.

To change the code defaults, edit `public/js/settings.js`. To change the logo, replace `public/assets/logo.png` and `public/favicon.png`.

## License

AGPL-3.0, the same license as Scramjet.

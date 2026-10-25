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
   In *Site configuration → Environment variables* add `WISP_URL`, e.g. `wss://your-wisp-host.example.com/wisp/`, then redeploy.
2. **Wisp server (any host with WebSockets).** Deploy this same repo to Render, Railway, Fly.io, or a VPS with
   `npm install` / `npm start`. Its `/wisp/` endpoint is your `WISP_URL`. (It also serves the full site, so that host works on its own too.)

Users can also point to a different Wisp server in *Settings → Search & proxy*.

### Fastly

- Fastly can sit in front of Netlify as a CDN. Make sure `/sw.js` and `/config.js` aren't cached long (they're sent with `Cache-Control: no-cache`).
- To put Fastly in front of the Wisp server, WebSocket passthrough must be enabled on the Fastly service, or `/wisp/` connections will fail.
  Simplest is to point `WISP_URL` straight at the Wisp host.

## How it works

- `server.js` serves the UI, the Scramjet/controller/transport bundles, and a **Wisp** WebSocket server at `/wisp/`.
- `public/sw.js` loads the Scramjet controller's service worker and routes proxied requests.
- `public/js/proxy.js` starts the `Controller` with an Epoxy or libcurl transport. Each browser tab gets its own Scramjet `Frame`.

## Customizing

Everything is in **Settings** (gear icon) and is saved in the browser:

- **Appearance:** 8 blue theme presets, accent/secondary/background/text colors, font, UI size, corner roundness, glass blur, panel opacity, glow
- **Background:** starfield, aurora, gradient, solid color, or a custom image, plus star count and speed and a reduce-motion option
- **Home page:** title text, tagline, gradient title, and toggles for the logo, clock, shortcuts and side bar. Shortcuts can be added, edited (right-click) or removed
- **Search & proxy:** search engine (or a custom `%s` URL), Epoxy/libcurl transport, custom Wisp server
- **Privacy:** tab cloak presets, about:blank launcher (or auto-launch), panic key + URL, history toggle, confirm-on-close
- **Data:** export/import settings as JSON, reset

Shortcuts: `Alt+T` new tab · `Alt+W` close tab · `Ctrl+L` address bar · `/` focus search · panic key (default `` ` ``).

To change the code defaults, edit `public/js/settings.js`. To change the logo, replace `public/assets/logo.png` and `public/favicon.png`.

## License

AGPL-3.0, the same license as Scramjet.

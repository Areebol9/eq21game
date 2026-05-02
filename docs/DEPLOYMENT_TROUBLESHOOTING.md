# Deployment Troubleshooting

This project is a static Cloudflare Pages app with a PWA service worker. When the site fails only after a first visit, or fails differently across browsers, debug it by layer instead of assuming "cache" or "network".

## Prevention Rules

- Keep `manifest.json` `start_url` as `./` or `/`. Do not point it at `./index.html`, because Cloudflare Pages redirects `/index.html` to `/`.
- Do not precache redirected URLs in `sw.js`. The app shell must be `./`.
- Keep navigation requests network-first, with cached app-shell fallback only after the network fails.
- Keep `/sw.js` on `Cache-Control: no-cache, no-store, must-revalidate`.
- Generate a fresh service-worker cache name for every Pages build.
- Keep `js/deploy-config.js` out of the service-worker precache and serve it with `no-store`.
- Keep the recovery URL available: `https://eq21game.com/?reset-sw=1`.

## Standard Checks

Run local static checks before deploying:

```sh
npm.cmd test
```

After deploying, run the production smoke check:

```sh
npm.cmd run smoke:pages
```

To smoke-test a preview or alternate domain:

```sh
npm.cmd run smoke:pages -- https://example-preview.equation-21-simple.pages.dev
```

The smoke check verifies:

- `/` returns a real HTML app shell.
- `/index.html` is not required as the app shell.
- `/sw.js` is `no-store`, uses a generated cache name, and does not precache `./index.html`.
- `/manifest.json` uses `./` or `/` as `start_url`.
- Core JS/CSS resources return `200` and are not HTML error pages.
- `js/deploy-config.js` is `no-store`.

## Troubleshooting Flow

1. Confirm whether the request reaches Cloudflare.
   - Open `https://eq21game.com/cdn-cgi/trace`.
   - Check Cloudflare Dashboard > Security > Events for the visitor IP.
   - If there are no events and trace does not load, the request may not be reaching Cloudflare.

2. Compare entry points.
   - `https://eq21game.com/`
   - `https://www.eq21game.com/`
   - `https://equation-21-simple.pages.dev/`
   - The latest preview deployment URL from Wrangler output.
   - If Pages preview works but the apex domain fails, inspect custom-domain DNS, Cloudflare rules, and WAF/Bot settings.

3. Inspect PWA state.
   - Fetch `/sw.js` and check the cache name.
   - Fetch `/manifest.json` and check `start_url`.
   - Confirm `sw.js` does not contain `./index.html`.
   - In browser devtools, clear Service Workers and Cache Storage for the site, then retest.
   - For a user-facing recovery path, open `https://eq21game.com/?reset-sw=1`.

4. Inspect runtime resources.
   - Look for console syntax errors.
   - Ensure JS files are not returning HTML or redirect pages.
   - For solo-mode issues, check `js/solver-worker.js` loading and worker responses.

5. Recover production.
   - Prefer rolling back Pages to the last known good deployment.
   - If the active service worker is the issue, deploy an emergency `sw.js` that clears `equation21-*` caches and claims clients.
   - If Cloudflare Security or Rules are involved, temporarily disable the narrow rule and retest.

## Acceptance Checklist

- `/` returns `200`.
- `/sw.js` is `no-store` and has a new generated `equation21-v-*` cache name.
- `/manifest.json` has `start_url` set to `./` or `/`.
- `/index.html` may redirect, but it is not precached by the service worker.
- First and second visits work on PC, mobile, and in-app browsers.
- Solo practice, `+牌`, hint, and card hover remain responsive.

## Known Risk

`www.eq21game.com` should either be attached to the Pages project or redirected to `https://eq21game.com/`. Leaving it unresolved creates a hidden broken entry point for browser auto-complete, search results, and shared links.

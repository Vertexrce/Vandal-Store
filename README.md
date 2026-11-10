# VANDAL Website

Updated responsive VANDAL front-end, styled in red / black / white and based on the screenshots supplied.

## Run locally
Open `index.html` in Edge or Chrome. No build step is required.

## Deploy to Railway
The project includes a `Dockerfile` using NGINX. Push the contents of this folder to a GitHub repository, connect that repository in Railway, and generate a public domain under Settings → Networking.

## Files
- `index.html` — page structure and all tabs
- `styles.css` — responsive layout and VANDAL styling
- `script.js` — tab navigation, store filters, cart preview, and placeholder dialogs
- `assets/hero.gif` — the animated banner you uploaded
- `Dockerfile` — static-site hosting on Railway

## Included sections
Home, Store (VIP / Packs / Kits / Cart), Clans, Leaderboard, Inventory, Gems. **Top Supporters is at the bottom of the Store page**, as clarified.

## Important integration notes
- The website only shows EU 2X.
- The leaderboard contains empty placeholders and does not use Saturn player statistics or connect to Saturn.
- Store products shown are visual examples/placeholders. Replace or populate them from your admin panel later.
- Player population, account linking, Discord OAuth, clans, inventory, gem balance, supporter data, checkout, and purchases need your own backend/API integration before they become live features.
- Replace the Discord invite and social/legal placeholder links before publishing.


### Favicon
The browser tab icon uses the VANDAL Discord server icon hosted on Discord CDN. The site references the image URL directly, so the browser needs an internet connection to load it. Some browsers may display only a static frame of animated WebP favicons.


## Railway port fix
The Dockerfile now uses an NGINX config template that listens on Railway's runtime
`PORT` instead of hard-coding port 80. In Railway, remove any manually-set `PORT`
variable unless you intentionally want a fixed port. If you set a Target Port in
Networking, make it match the service's `PORT`.

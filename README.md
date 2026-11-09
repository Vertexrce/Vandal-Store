# VANDAL Website

A responsive static website based on the Saturn screenshots you supplied, rebranded for VANDAL with a red / black / white palette.

## Preview
Open `index.html` in a browser. No build tools are required.

## Files
- `index.html` — page structure and content
- `styles.css` — responsive layout and VANDAL styling
- `script.js` — mobile navigation, demo population, and placeholder dialogs

## Before publishing
1. Replace the Discord invite URL (`https://discord.com/`) with your server invite.
2. Add your real YouTube, TikTok, X, Terms, and Privacy URLs.
3. Connect the EU 2X population display to your server status API. The current `0/100` is demo data.
4. Configure Discord OAuth and game-account linking on a secure backend. The current sign-in and link-account dialogs are placeholders and do not collect credentials.
5. If you want to use your animated GIF as the hero background, put it in `assets/` as `hero.gif` and add this to `.hero` in `styles.css`:
   `background-image: linear-gradient(rgba(0,0,0,.58), rgba(0,0,0,.72)), url("assets/hero.gif"); background-size: cover; background-position: center;`
   The GIF was not included in the files available in this chat, so the current hero uses a CSS-generated dark/red background.

## Design notes
The bottom "Ready to Play?" call-to-action section is intentionally omitted. The footer remains.

# VANDAL Website — Discord login + Admin dashboard

This build adds a Node/Express backend to the VANDAL site. Discord sign-in uses OAuth2, and admin access is checked server-side against the VANDAL Discord guild and role IDs supplied for this project.

## Railway setup

Deploy this folder as a Docker service from GitHub. The Dockerfile runs the Express server and serves the website. Add these variables in Railway → Service → Variables:

| Variable | Value |
|---|---|
| `DISCORD_CLIENT_ID` | Client ID from your Discord Developer Portal application |
| `DISCORD_CLIENT_SECRET` | Client Secret from that application — keep private |
| `DISCORD_REDIRECT_URI` | `https://vandalrce.up.railway.app/auth/discord/callback` |
| `DISCORD_BOT_TOKEN` | Token for the VANDAL Store bot (keep private) |
| `DISCORD_GUILD_ID` | `1565095830560575508` |
| `DISCORD_ADMIN_ROLE_ID` | `1569519586166972497` |
| `SESSION_SECRET` | A long, random secret string (32+ random bytes recommended) |
| `DATA_DIR` | `/data` |

Do not commit the bot token, client secret, or session secret to GitHub. The Discord bot must be in guild `1565095830560575508`. The backend asks Discord for the signed-in user's guild member record using the bot token and checks whether the returned roles include `1569519586166972497`. It does not trust a role ID supplied by the browser.

## Discord Developer Portal

1. Open https://discord.com/developers/applications and select your VANDAL application.
2. Under OAuth2, add this exact redirect URI: `https://vandalrce.up.railway.app/auth/discord/callback`.
3. Add the Client ID and Client Secret to Railway variables above.
4. OAuth scope used is `identify` only. The bot token separately verifies guild membership and role membership.

## Admin dashboard

After signing in, a user with role `1569519586166972497` in guild `1565095830560575508` gets an **ADMIN** link and can open `/admin`. All admin API routes re-check the role with Discord, so hiding the link is not the security boundary. Other signed-in users cannot use the dashboard APIs.

The first dashboard includes product creation and deletion for VIP, Packs, and Kits. Product records are JSON files in `DATA_DIR` (`/data` in this setup). In Railway, attach a Volume to this service and mount it at `/data` so product data survives container replacement/redeploys.

## Local run

Requires Node.js 20+. Run `npm install` then set the environment variables and run `npm start`. For local OAuth, register `http://localhost:8080/auth/discord/callback` as an additional redirect URI and set `DISCORD_REDIRECT_URI` to that value.

## Notes

- The public pages and VANDAL styling/banner are retained.
- The site only displays EU 2X.
- The leaderboard is a visual placeholder and does not pull Saturn player statistics.
- Discord OAuth login and the role-gated admin dashboard are implemented. Game linking, live server population, checkout, inventory, clan functions and live leaderboard data still need their own integrations.
- Product admin records are currently stored for the dashboard; connecting them to the public Store page and a payment/delivery system is a separate integration.

# VANDAL Website — Discord login + Admin dashboard

This build adds a Node/Express backend to the VANDAL site. Discord sign-in uses OAuth2, and admin access is checked server-side against the VANDAL Discord guild and role IDs supplied for this project.

## Railway setup

Deploy this folder as a Docker service from GitHub. The Dockerfile runs the Express server and serves the website. Add these variables in Railway → Service → Variables:

| Variable | Value |
|---|---|
| `DISCORD_CLIENT_ID` | Client ID from your Discord Developer Portal application |
| `DISCORD_CLIENT_SECRET` | Client Secret from that application — keep private |
| `DISCORD_REDIRECT_URI` | `https://vandalrce.up.railway.app/auth/discord/callback` |
| `DISCORD_BOT_TOKEN` | Token for the VANDAL Store bot (keep private). The app also accepts `DISCORD_TOKEN` or `TOKEN` if that is the variable name you already used. |
| `DISCORD_GUILD_ID` | `1565095830560575508` |
| `DISCORD_ADMIN_ROLE_ID` | `1569519586166972497` |
| `DISCORD_DASHBOARD_INTENTS` | Set to `true` after enabling the bot's privileged Discord intents in the Developer Portal. |
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

The dashboard includes product creation and deletion for VIP, Packs, and Kits. Product records (`products.json`), Discord-to-gamertag links (`accounts.json`), and login sessions (`sessions/`) are stored in `DATA_DIR` (`/data` in this setup). In Railway, attach a Volume to this service and mount it at `/data`, and set `DATA_DIR=/data`, so logins survive restarts and redeploys. Keep the same `SESSION_SECRET` in Railway Variables across deploys; changing it invalidates existing login cookies.

## Local run

Requires Node.js 20+. Run `npm install` then set the environment variables and run `npm start`. For local OAuth, register `http://localhost:8080/auth/discord/callback` as an additional redirect URI and set `DISCORD_REDIRECT_URI` to that value.

## Notes

- The public pages and VANDAL styling/banner are retained.
- The public server cards are generated from servers configured in the admin dashboard and show live player count, capacity, and queue when the configured WebRCON server reports those fields.
- The leaderboard is a visual placeholder and does not pull Saturn player statistics.
- Discord OAuth login sends every account back to the public homepage. Users with the configured admin role can open the role-gated dashboard from the account menu.
- Admin-created products are served to the public Store page and can be added to its cart. Payment checkout, purchase records, and in-game delivery are not connected yet.
- The gamertag flow stores the name supplied by the signed-in user; it does not prove ownership of that console account.
- The website keeps its own server configuration in `DATA_DIR/servers.json`; it does not automatically import the Python bot's SQLite `game_servers` table. Add the same server through the dashboard if both services need it.
- The Clans page reads the active-clans panel, invite channel, and logs channel from Discord. It does not read the Python bot's private SQLite clan tables directly; it reflects what the bot posts to the selected Discord channels.

## Admin dashboard additions

The left menu contains **Home**, **Store**, **RCON**, **Discord**, and **Clans**. Home shows the current admin verification, product count, Discord member count, count of members with the configured admin role, approximate Discord presence count, and configured server population. Discord counts come from Discord's API and show as unavailable rather than being guessed if Discord cannot provide them.

### Discord permissions and intents

In the Discord Developer Portal, enable the privileged **Server Members Intent**, **Presence Intent**, and **Message Content Intent** for the bot application. Then set `DISCORD_DASHBOARD_INTENTS=true` in the website service variables to enable them in the bot's gateway connection. The bot also needs **View Channels** and **Read Message History** for the channels selected in the dashboard. Keep the bot token in Railway Variables; never add it to a file or browser code.

The dashboard can list text channels in the configured guild, show recent channel messages, and save the active-clans, invite, and clan-log channel selections. The Discord bot must be in guild `1565095830560575508`. If member-role counts remain unavailable, verify the Server Members Intent is enabled and that the bot has access to the guild.

### Configure game servers and RCON

Open **RCON & Servers** in the dashboard and enter a display name, region, public hostname/IP, RCON port, and password. Use **Test RCON** to check the WebRCON endpoint, then save. The password is stored in `DATA_DIR` with private file permissions and is never returned in API responses. Mount a persistent Railway Volume at `/data` and set `DATA_DIR=/data` so server records and channel settings survive redeploys.

The RCON console only targets a server saved in the dashboard, re-checks the Discord admin role for every request, and asks for browser confirmation before sending commands. Treat RCON as full game-server administration: only add servers you own or are authorized to manage, and do not expose the dashboard or RCON credentials.


## Discord bot startup

The website server starts the Discord bot automatically in the same Railway service. Install dependencies with `npm install` (the Dockerfile does this during deployment). Set the bot token in Railway Variables as `DISCORD_BOT_TOKEN` (recommended), `DISCORD_TOKEN`, or `TOKEN`. The bot needs to be invited to your Discord server and must be enabled in the Discord Developer Portal. Railway logs should show `[VANDAL BOT] Online as ...` when it connects. Do not put the token in website JavaScript, HTML, or GitHub.

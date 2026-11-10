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
| `RCE_API_URL` | Base URL of the Python RCE bot's private bridge service, without `/v1` |
| `RCE_WEB_API_SECRET` | Shared 32+ character secret; set the same value on the website and RCE bot services |
| `PUBLIC_BASE_URL` | Optional canonical website origin, used for uploaded clan images |
| `DISCORD_BOT_ENABLED` | Set to `false` on the website service if it shares the same Discord bot token as the Python RCE service |

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
- Admin-created products are served to the public Store page and can be added to its cart. Payment checkout and purchase records are not connected yet. Store Kits can be manually issued by an admin through the RCE bot.
- The gamertag flow stores the name supplied by the signed-in user; it does not prove ownership of that console account.
- The website keeps its own server configuration in `DATA_DIR/servers.json`; it does not automatically import the Python bot's SQLite `game_servers` table. Add the same server through the dashboard if both services need it.
- Clan server tabs, clan records, members, and invite codes are read from the Python RCE bot over its authenticated HTTP bridge. The website does not make a second clan database.

## Admin dashboard additions

The left menu contains **Home**, **Store**, **Kits & Linked Users**, **RCON**, **Discord**, and **Clans**. Home shows the current admin verification, product count, Discord member count, count of members with the configured admin role, approximate Discord presence count, and configured server population. Discord counts come from Discord's API and show as unavailable rather than being guessed if Discord cannot provide them.

### Connect the Python RCE bot

Deploy the supplied `Vandal-Rce-main` folder as its own Python service with a persistent database volume. Set `DISCORD_TOKEN`, `GUILD_ID`, and `DISCORD_ADMIN_ROLE_ID` for the same Discord guild and admin role used by the website. The bot must have the Discord permissions used by `/clan setup`, including Manage Roles, Manage Channels, and permissions to post/edit its active-clans panel.

Set `RCE_WEB_API_SECRET` to the same private random value on both services (32+ characters). On the Python bot service, bind the bridge to `0.0.0.0`; it listens on `PORT` by default or `RCE_API_PORT` if explicitly set. On the website service, set `RCE_API_URL` to the bot service's base URL, including HTTPS for a public domain, and set the matching secret. For an internal service URL, use the platform's private network URL and port. Never put the secret in website JavaScript, GitHub, or chat.

If both services use the same Discord bot token, set `DISCORD_BOT_ENABLED=false` on the website service so only the Python bot owns the Discord gateway connection; the website can still use its server-side token for Discord REST lookups. If the website has a separate bot application, the gateway client can stay enabled.

Register each game server with the Python bot (`/game-server add`), then run `/clan setup` in Discord for that server and choose its application, invite, and active-clans channels. The website clan page will show those registered servers; creation stays unavailable until setup is complete. Website clan creation uses the bot to create the clan role/channel and refresh the active panel. Clan invite codes generated on either surface use the same database; players can use the website **Join Clan** button or Discord `/clan join <server> <code>`.

### Store Kits and linked accounts

To make a kit available in the admin grant form, add it under **Store → Kits** and enter the exact in-game RCE kit name. Existing Kit products without a game-kit name can be mapped in **Kits & Linked Users**. The admin form sends only a selected Store Kit through the bot's `kit givetoplayer` RCON flow and asks for confirmation before giving it. Linked Users lists website Discord accounts and their saved in-game names; the current linking form is unverified and does not prove the name belongs to that player.

### Discord permissions and intents

In the Discord Developer Portal, enable the privileged **Server Members Intent**, **Presence Intent**, and **Message Content Intent** for the bot application. Then set `DISCORD_DASHBOARD_INTENTS=true` in the website service variables to enable them in the bot's gateway connection. The bot also needs **View Channels** and **Read Message History** for the channels selected in the dashboard. Keep the bot token in Railway Variables; never add it to a file or browser code.

The dashboard can list text channels in the configured guild, show recent channel messages, and save the active-clans, invite, and clan-log channel selections for its activity viewer. The Python bot's actual clan setup is performed separately with `/clan setup`. The Discord bot must be in guild `1565095830560575508`. If member-role counts remain unavailable, verify the Server Members Intent is enabled and that the bot has access to the guild.

### Configure game servers and RCON

Open **RCON & Servers** in the dashboard and enter a display name, region, public hostname/IP, RCON port, and password. Use **Test RCON** to check the WebRCON endpoint, then save. The password is stored in `DATA_DIR` with private file permissions and is never returned in API responses. Mount a persistent Railway Volume at `/data` and set `DATA_DIR=/data` so server records and channel settings survive redeploys.

The RCON console only targets a server saved in the dashboard, re-checks the Discord admin role for every request, and asks for browser confirmation before sending commands. Treat RCON as full game-server administration: only add servers you own or are authorized to manage, and do not expose the dashboard or RCON credentials.


## Discord bot startup

The website's small Discord gateway client starts automatically unless `DISCORD_BOT_ENABLED=false`. Install dependencies with `npm install` (the Dockerfile does this during deployment). Set its token in Railway Variables as `DISCORD_BOT_TOKEN` (recommended), `DISCORD_TOKEN`, or `TOKEN`. The bot needs to be invited to your Discord server and must be enabled in the Discord Developer Portal. Railway logs should show `[VANDAL BOT] Online as ...` when it connects. Do not put the token in website JavaScript, HTML, or GitHub.

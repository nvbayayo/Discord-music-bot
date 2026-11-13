# Limplimp Music Bot

Anime-themed Discord music bot using Discord.js v14, `lavalink-client`, Lavalink v4 and the Lavalink YouTube source plugin.

## Files
- `index.js` — bot and slash commands
- `assets/menu.png` — generated anime menu image used by `/help`
- `.env.example` — environment variable template
- `application.yml` — Lavalink node configuration

## 1. Requirements
- Node.js 20+
- Java 17+ for Lavalink
- A Discord application/bot
- A Lavalink v4 server (can be on the same VPS or a separate host)

## 2. Install
```bash
npm install
cp .env.example .env
```
Fill in `.env`. Never share your bot token.

## 3. Lavalink
Run a Lavalink v4 server and put `application.yml` in its working directory. Make sure the plugin configuration is valid for the Lavalink release you install. The YouTube source plugin is required because Lavalink v4's built-in YouTube source is disabled/deprecated.

The example uses YouTube source plugin `1.18.2`. Check the plugin's Releases/README for a newer compatible version if this version is unavailable or YouTube changes break it.

The `password` in `application.yml` must match `LAVALINK_PASSWORD` in `.env`. Set `LAVALINK_HOST` and `LAVALINK_PORT` to the reachable Lavalink address and port.

## 4. Discord developer portal
Enable the bot and invite it with OAuth2 scopes:
- `bot`
- `applications.commands`

Required server permissions:
- View Channels
- Send Messages
- Embed Links
- Attach Files
- Connect
- Speak

## 5. Run
Start Lavalink first and wait for it to accept connections. Then:
```bash
npm start
```

Commands are registered to the `GUILD_ID` server for quick testing:
`/help`, `/play`, `/pause`, `/resume`, `/skip`, `/stop`, `/queue`, `/nowplaying`, `/volume`, `/shuffle`, `/join`, `/leave`.

## Notes
- `/play` defaults to `ytmsearch` (YouTube Music search).
- YouTube playback can be affected by YouTube anti-bot checks, regional restrictions, and plugin/client changes. A working Lavalink node and YouTube source plugin are required.
- This is a starter bot. Test in a private server before inviting it widely.

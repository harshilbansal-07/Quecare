# QueCare Chatbot

WhatsApp chatbot for QueCare using [Evolution API](https://github.com/EvolutionAPI/evolution-api). Runs locally on Windows at http://localhost:3000. It talks to the QueCare website (port 4000) and receives notifications from it.

Requires **Node 20.6+** (uses `node --env-file`).

## Run (Windows PowerShell)

```powershell
cd quecare-chatbot
copy .env.example .env     # then fill in EVO_API_KEY, EVO_INSTANCE, INTERNAL_SECRET
npm install
npm start
```

Check it is up: http://localhost:3000/health returns `{"ok":true}`.

Register the webhook in Evolution API (once, with Evolution running):

```powershell
npm run setup
```

`INTERNAL_SECRET` must be the **same value** in this project's `.env` and the website's `.env`. Start the website first.

Run the conversation tests (fake website, no WhatsApp needed): `npm test`

## What patients can type

| Text | Action |
| --- | --- |
| `hi`, `hello`, `hey`, `menu` | Show menu (works in every state) |
| `1`, `book`, `token`, `new` | Book a token (name, then doctor number) |
| `2`, `status`, `check` | Check token status |
| `3`, `cancel` | Cancel token (then YES or NO) |
| `help` | Show menu |

## Routes

- `POST /evo-incoming` Evolution webhook (answers 200 immediately, processes in background; ignores your own and group messages).
- `POST /notify` website only; needs header `x-internal-secret`, body `{phone, message}`.
- `GET /health`

## Test manually without WhatsApp

Set `EVO_MOCK=true` in `.env` to log replies instead of sending them, then in PowerShell:

```powershell
$body = '{"data":{"key":{"remoteJid":"919876543210@s.whatsapp.net","fromMe":false},"message":{"conversation":"hi"}}}'
Invoke-RestMethod -Uri http://localhost:3000/evo-incoming -Method Post -ContentType "application/json" -Body $body
```

The console shows `[incoming]` and the `[evolution][MOCK]` reply. Remove `EVO_MOCK` to send for real.

## Assumptions

- Webhook payload shape: `data.key.remoteJid`, `data.key.fromMe`, `data.message.conversation` or `data.message.extendedTextMessage.text` (Evolution API v2 style). Messages with no text (images, reactions) are ignored.
- A phone is the digits before the `@` in `remoteJid`.
- Only a MENU keyword (`hi`, `hello`, `hey`, `menu`) is the escape hatch inside a flow. `help` works from IDLE. A person whose name is literally "Hi" or "Menu" would be sent back to the menu.
- Sessions are in memory (placeholder for a `chat_sessions` table), so a restart returns everyone to the menu.
- In the cancel flow only `YES` and `NO` (any case) are accepted.
- If a cancel is requested for a token that is still pending, the bot says "token request (not confirmed yet)" because no label exists yet.
- `/notify` answers 502 if Evolution could not send, so the website logs the failure (and never fails its own request).
- `EVO_MOCK` and `test-flow.js` are small extras for testing, not in the requested file list.
- `setup-webhook.js` uses `host.docker.internal:3000` as specified, which assumes Evolution runs in Docker on the same Windows machine.
- The core API errors (for example "You already have an active token") are shown to the patient as is.

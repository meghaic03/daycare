# Daycare Schedule Bot

A WhatsApp bot that turns your mom's texts about kid counts and worker
availability into a formatted weekly schedule and a separate, private payroll
summary — the same workflow she does by hand today.

## How it works

- She texts the bot things like:
  - `12 kids on Wednesday`
  - `Muslima off Thursday`
  - `Fatema available 9-5 Friday`
  - `send the schedule`
  - `send pay`
  - `reset week` (starts a fresh blank week)
- The bot uses Claude to turn that free text into structured changes, then a
  plain deterministic JavaScript module (`lib/scheduler.js`) does all the
  actual hour and pay math — Claude never does arithmetic, so numbers can't
  drift.
- The schedule reply is safe to forward to workers. The payroll reply is
  always sent as its own separate message, clearly marked private, and is
  **only** ever sent when explicitly asked for — never automatically.

## Local setup

```bash
npm install
cp .env.example .env
# fill in .env with real values (see below)
npm test        # verify the scheduling/payroll math before doing anything else
npm start        # runs the server locally on PORT (default 3000)
```

## Environment variables

| Variable | Where to get it |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Console home page |
| `TWILIO_AUTH_TOKEN` | Twilio Console home page |
| `TWILIO_WHATSAPP_NUMBER` | Your registered WhatsApp sender, e.g. `whatsapp:+12038710590` |
| `OWNER_WHATSAPP_NUMBER` | Your mom's WhatsApp number, e.g. `whatsapp:+12035551234` — the bot ignores messages from any other number |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

**Never** commit `.env` or paste these values anywhere public. They belong
only in your local `.env` file and in your hosting provider's private
environment variable settings.

## Deploying so Twilio can actually reach it

This needs to run on a public server, since Twilio calls a webhook URL when a
message arrives — it can't reach your laptop directly. Easiest free options:

1. **Render** (render.com) — create a new "Web Service", connect this code
   (push it to a GitHub repo first), set the environment variables in
   Render's dashboard, deploy. Note the URL it gives you, e.g.
   `https://your-app.onrender.com`.
2. Alternatively **Railway** (railway.app) works the same way.

Once deployed:

1. Go to Twilio Console → Messaging → Senders → WhatsApp Senders.
2. Click into your number's configuration.
3. Set the incoming webhook URL to `https://your-app.onrender.com/whatsapp`,
   method POST.
4. Save.

Now when your mom texts the WhatsApp number, Twilio forwards it to this
server, which replies through the same number.

## Persistence

Every change (a kid count, a shift edit, a rate change) is written to disk
immediately in `data/state.json`, before the bot even replies. If the server
process restarts, it reloads exactly where it left off — nothing she's
already texted in gets lost.

**One real caveat depending on where you deploy:** some free hosting tiers
(including Render's free web service plan) wipe the disk on every new
deploy, because the filesystem itself isn't guaranteed persistent. This is
still a big improvement over in-memory-only, but it's not bulletproof on
every host.

For true durability across deploys, do one of:
- **Railway** — its default volumes persist across restarts and redeploys,
  no extra setup needed. Simplest option.
- **Render** — add a "Persistent Disk" to the service (small monthly cost)
  and point `STATE_DIR` at a path on that disk.
- Later upgrade: swap `lib/store.js` for a real hosted database (e.g. a free
  Postgres or Redis instance) — the rest of the code doesn't need to change,
  since everything else only talks to `loadState()`/`saveState()`.

Run `npm test` any time — it includes tests that simulate a full process
restart and confirm no data is lost.

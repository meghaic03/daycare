require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const { newWeekState } = require("./lib/scheduler");
const { parseInstruction } = require("./lib/parser");
const { applyActions } = require("./lib/actions");
const { loadState, saveState } = require("./lib/store");

const app = express();
app.use(express.urlencoded({ extended: false }));

// --- Config from environment (never hardcode these) ---
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER, // e.g. "whatsapp:+12038710590"
  OWNER_WHATSAPP_NUMBER, // e.g. "whatsapp:+12035551234" — your mom's number, for a basic allowlist
  PORT,
} = process.env;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// --- Single week state for MVP (one daycare, one user) ---
// Loaded from disk on boot, saved to disk after every change, so a restart
// never loses progress on the current week.
function nextSunday() {
  const d = new Date();
  const add = (7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + add);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

let state = loadState();
if (state) {
  console.log("Loaded saved week in progress from disk.");
} else {
  state = newWeekState(nextSunday());
  saveState(state);
  console.log("No saved state found — started a fresh week.");
}

app.post("/whatsapp", async (req, res) => {
  const from = req.body.From; // e.g. "whatsapp:+12035551234"
  const body = (req.body.Body || "").trim();

  // Basic allowlist so random numbers can't mess with the schedule.
  if (OWNER_WHATSAPP_NUMBER && from !== OWNER_WHATSAPP_NUMBER) {
    console.log(`Ignored message from unrecognized number: ${from}`);
    res.status(200).end();
    return;
  }

  res.status(200).end(); // ack Twilio immediately; we send replies async via REST API

  try {
    if (/^reset week/i.test(body)) {
      state = newWeekState(nextSunday());
      saveState(state);
      await send(from, "Started a fresh week. Tell me kid counts and any changes whenever you're ready.");
      return;
    }

    const actions = await parseInstruction(body, state);

    if (actions.length === 0) {
      await send(
        from,
        `I didn't catch anything I could act on. You can tell me things like:\n"12 kids on Wednesday"\n"Muslima off Thursday"\n"send the schedule"\n"send pay"`
      );
      return;
    }

    const replies = applyActions(state, actions);
    saveState(state); // persist immediately — before replying, so a crash after this point loses nothing
    for (const r of replies) {
      await send(from, r.text);
    }
  } catch (err) {
    console.error(err);
    await send(from, "Something went wrong on my end — try again in a minute, or tell me and I'll get it fixed.");
  }
});

async function send(to, text) {
  await twilioClient.messages.create({
    from: TWILIO_WHATSAPP_NUMBER,
    to,
    body: text,
  });
}

const port = PORT || 3000;
app.listen(port, () => console.log(`Daycare bot listening on port ${port}`));

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
  console.log(`Incoming message from ${from}: "${body}"`);

  // Basic allowlist so random numbers can't mess with the schedule.
  if (OWNER_WHATSAPP_NUMBER && from !== OWNER_WHATSAPP_NUMBER) {
    console.log(`Ignored — expected OWNER_WHATSAPP_NUMBER="${OWNER_WHATSAPP_NUMBER}" but got From="${from}"`);
    res.status(200).end();
    return;
  }

  res.status(200).end(); // ack Twilio immediately; we send replies async via REST API

  try {
    if (/^reset week/i.test(body)) {
      state = newWeekState(nextSunday());
      saveState(state);
      console.log("Week reset.");
      await send(from, "Started a fresh week. Tell me kid counts and any changes whenever you're ready.");
      return;
    }

    console.log("Calling Claude to parse the message...");
    const actions = await parseInstruction(body, state);
    console.log("Parsed actions:", JSON.stringify(actions));

    if (actions.length === 0) {
      console.log("No actions parsed — sending help message.");
      await send(
        from,
        `I didn't catch anything I could act on. You can tell me things like:\n"12 kids on Wednesday"\n"MWF I need 3 workers"\n"Muslima off Thursday"\n"send the schedule"\n"send pay"`
      );
      return;
    }

    const replies = applyActions(state, actions);
    saveState(state); // persist immediately — before replying, so a crash after this point loses nothing
    console.log(`Sending ${replies.length} reply message(s)...`);
    for (const r of replies) {
      await send(from, r.text);
    }
    console.log("Done.");
  } catch (err) {
    console.error("ERROR handling message:", err);
    await send(from, "Something went wrong on my end — try again in a minute, or tell me and I'll get it fixed.");
  }
});

async function send(to, text) {
  console.log(`Sending WhatsApp message to ${to}: "${text.slice(0, 60)}..."`);
  try {
    const msg = await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to,
      body: text,
    });
    console.log(`Sent OK, Twilio SID: ${msg.sid}`);
  } catch (err) {
    console.error("FAILED to send WhatsApp message:", err.message);
    throw err;
  }
}

const port = PORT || 3000;
app.listen(port, () => console.log(`Daycare bot listening on port ${port}`));

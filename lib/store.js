const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.STATE_DIR || path.join(__dirname, "..", "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read saved state, starting fresh:", e.message);
    return null;
  }
}

// Atomic-ish write: write to a temp file then rename, so a crash mid-write
// can never corrupt the real state file.
function saveState(state) {
  ensureDataDir();
  const tmpFile = STATE_FILE + ".tmp";
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
  fs.renameSync(tmpFile, STATE_FILE);
}

module.exports = { loadState, saveState };

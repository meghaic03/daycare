const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Use a throwaway temp directory so tests never touch real data
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "daycare-bot-test-"));
process.env.STATE_DIR = tmpDir;

// Must require AFTER setting STATE_DIR since store.js reads it at load time
delete require.cache[require.resolve("../lib/store")];
const { loadState, saveState } = require("../lib/store");
const { newWeekState } = require("../lib/scheduler");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}`);
    console.error(e.message);
    process.exitCode = 1;
  }
}

test("loadState returns null when nothing saved yet", () => {
  assert.strictEqual(loadState(), null);
});

test("saveState then loadState round-trips identical data", () => {
  const state = newWeekState("7/20", 5);
  state.days[0].kids = 12;
  state.days[1].shifts.Muslima.off = true;
  state.rates.Farida = 16;

  saveState(state);
  const reloaded = loadState();

  assert.deepStrictEqual(reloaded, state);
});

test("saveState survives a simulated process restart (fresh require)", () => {
  const state = newWeekState("8/3", 5);
  state.days[2].kids = 14;
  saveState(state);

  // Simulate a restart: clear the module cache and re-require, like a real
  // server reboot would force a fresh read from disk.
  delete require.cache[require.resolve("../lib/store")];
  const freshStore = require("../lib/store");
  const reloaded = freshStore.loadState();

  assert.strictEqual(reloaded.days[2].kids, 14);
});

test("write is atomic: no partial/corrupt file left behind on disk", () => {
  const state = newWeekState("7/27", 5);
  saveState(state);
  const files = fs.readdirSync(tmpDir);
  assert.ok(files.includes("state.json"));
  assert.ok(!files.includes("state.json.tmp"), "temp file should not remain after a successful save");
});

// cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

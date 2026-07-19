const assert = require("assert");
const {
  newWeekState,
  hoursDecimal,
  fmtHours,
  fmt12,
  requiredStaff,
  coverageCheck,
  generateScheduleText,
  generatePayrollText,
  findDay,
} = require("../lib/scheduler");
const { applyActions } = require("../lib/actions");

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

test("hoursDecimal computes 6.5h shift like 7:30-2:00pm", () => {
  const h = hoursDecimal("07:30", "14:00");
  assert.strictEqual(h, 6.5);
  assert.strictEqual(fmtHours(h), "6:30");
});

test("hoursDecimal computes 8:45h shift like 8:15-5:00pm", () => {
  const h = hoursDecimal("08:15", "17:00");
  assert.strictEqual(Math.round(h * 100) / 100, 8.75);
  assert.strictEqual(fmtHours(h), "8:45");
});

test("fmt12 formats times correctly", () => {
  assert.strictEqual(fmt12("07:30"), "7:30am");
  assert.strictEqual(fmt12("14:00"), "2pm");
  assert.strictEqual(fmt12("17:30"), "5:30pm");
  assert.strictEqual(fmt12("00:00"), "12am");
});

test("requiredStaff: 2 normally, 3 when over 10 kids", () => {
  assert.strictEqual(requiredStaff(5), 2);
  assert.strictEqual(requiredStaff(10), 2);
  assert.strictEqual(requiredStaff(11), 3);
});

test("coverageCheck flags a day with a mid-day gap", () => {
  const state = newWeekState("7/20", 1);
  const day = state.days[0];
  day.kids = 5;
  // Only one person working, leaves the whole day understaffed
  Object.keys(day.shifts).forEach((n) => (day.shifts[n].off = true));
  day.shifts.Muslima.off = false;
  day.shifts.Muslima.start = "07:30";
  day.shifts.Muslima.end = "14:00";
  const c = coverageCheck(day);
  assert.strictEqual(c.ok, false);
});

test("coverageCheck passes when 2 people overlap the whole day", () => {
  const state = newWeekState("7/20", 1);
  const day = state.days[0];
  day.kids = 5;
  Object.keys(day.shifts).forEach((n) => (day.shifts[n].off = true));
  day.shifts.Muslima.off = false;
  day.shifts.Muslima.start = "07:30";
  day.shifts.Muslima.end = "17:00";
  day.shifts.Momina.off = false;
  day.shifts.Momina.start = "07:30";
  day.shifts.Momina.end = "17:00";
  const c = coverageCheck(day);
  assert.strictEqual(c.ok, true);
});

test("payroll math matches hand calculation", () => {
  const state = newWeekState("7/20", 1);
  const day = state.days[0];
  Object.keys(day.shifts).forEach((n) => (day.shifts[n].off = true));
  day.shifts.Fatema.off = false;
  day.shifts.Fatema.start = "09:00";
  day.shifts.Fatema.end = "17:00"; // 8 hours
  state.rates.Fatema = 15;

  const text = generatePayrollText(state);
  assert.ok(text.includes("Fatema: 8 hrs x $15/hr = $120.00"));
  assert.ok(text.includes("TOTAL: $120.00"));
});

test("applyActions: set_kids updates the right day", () => {
  const state = newWeekState("7/20", 5);
  const targetDate = state.days[2].date;
  applyActions(state, [{ type: "set_kids", date: targetDate, kids: 12 }]);
  assert.strictEqual(findDay(state, targetDate).kids, 12);
});

test("applyActions: set_shift off:true takes someone off", () => {
  const state = newWeekState("7/20", 5);
  const targetDate = state.days[0].date;
  applyActions(state, [{ type: "set_shift", date: targetDate, employee: "Muslima", off: true }]);
  assert.strictEqual(findDay(state, targetDate).shifts.Muslima.off, true);
});

test("applyActions: generate_payroll is marked private and never mixed with schedule", () => {
  const state = newWeekState("7/20", 1);
  const replies = applyActions(state, [{ type: "generate_schedule" }, { type: "generate_payroll" }]);
  const schedule = replies.find((r) => r.kind === "schedule");
  const payroll = replies.find((r) => r.kind === "payroll");
  assert.ok(schedule && !schedule.private);
  assert.ok(payroll && payroll.private);
  assert.notStrictEqual(schedule.text, payroll.text);
  assert.ok(!schedule.text.includes("$"));
});

test("applyActions: generate_schedule alone never includes payroll info", () => {
  const state = newWeekState("7/20", 1);
  const replies = applyActions(state, [{ type: "generate_schedule" }]);
  assert.strictEqual(replies.some((r) => r.kind === "payroll"), false);
});

test("full week matches example format structure", () => {
  const state = newWeekState("7/13", 5);
  const [d1] = state.days;
  d1.kids = 8;
  const text = generateScheduleText(state);
  assert.ok(text.startsWith(d1.date));
  assert.ok(text.includes("Muslima 7:30am-2pm(6:30)"));
});

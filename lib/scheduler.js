// Pure scheduling + payroll logic. No I/O, no AI — just deterministic math and formatting.
// This is the part that must always be exactly right, so it stays simple and testable.

const EMPLOYEES = ["Farida", "Lina", "Fatema", "Momina", "Muslima"];
const DEFAULT_RATE = 15;

function defaultShiftsForDay(dayIndex) {
  return {
    Muslima: { off: false, start: "07:30", end: "14:00" },
    Momina: { off: false, start: "08:00", end: "16:00" },
    Fatema: { off: false, start: "09:00", end: "17:00" },
    Farida: { off: dayIndex % 2 === 0, start: "13:00", end: "17:30" },
    Lina: { off: dayIndex % 2 !== 0, start: "13:00", end: "17:30" },
  };
}

function newWeekState(startDateLabel /* e.g. "7/20" */, numDays = 5) {
  const days = [];
  const [m, d] = startDateLabel.split("/").map(Number);
  const year = new Date().getFullYear();
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 0; i < numDays; i++) {
    const dt = new Date(year, m - 1, d + i);
    days.push({
      date: `${dt.getMonth() + 1}/${dt.getDate()}`,
      weekday: weekdayNames[dt.getDay()],
      kids: 0,
      requiredOverride: null, // if set, this wins over the kid-count-derived minimum
      shifts: defaultShiftsForDay(i),
    });
  }
  const rates = {};
  EMPLOYEES.forEach((n) => (rates[n] = DEFAULT_RATE));
  return { days, rates };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fmt12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return m === 0 ? `${hh}${period}` : `${hh}:${String(m).padStart(2, "0")}${period}`;
}

function hoursDecimal(start, end) {
  let mins = toMinutes(end) - toMinutes(start);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

function fmtHours(h) {
  const whole = Math.floor(h);
  const rem = Math.round((h - whole) * 60);
  return rem === 0 ? `${whole}` : `${whole}:${String(rem).padStart(2, "0")}`;
}

function requiredStaff(kids) {
  return kids > 10 ? 3 : 2;
}

// The number actually required for a day: an explicit override she gave
// (e.g. "MWF I need 3") always wins over the kid-count-derived minimum.
function requiredForDay(day) {
  return day.requiredOverride != null ? day.requiredOverride : requiredStaff(day.kids);
}

function coverageCheck(day) {
  const active = EMPLOYEES.filter((n) => !day.shifts[n].off).map((n) => day.shifts[n]);
  if (active.length === 0) return { ok: false, msg: "No one scheduled." };
  const points = new Set();
  active.forEach((s) => {
    points.add(toMinutes(s.start));
    points.add(toMinutes(s.end));
  });
  const sorted = [...points].sort((a, b) => a - b);
  const need = requiredForDay(day);
  for (let i = 0; i < sorted.length - 1; i++) {
    const mid = (sorted[i] + sorted[i + 1]) / 2;
    const count = active.filter((s) => toMinutes(s.start) <= mid && toMinutes(s.end) > mid).length;
    if (count < need) {
      const hh = Math.floor(mid / 60),
        mm = Math.round(mid % 60);
      const label = fmt12(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
      return { ok: false, msg: `Only ${count} on duty around ${label} — needs ${need}.` };
    }
  }
  return { ok: true };
}

function weekCoverageWarnings(state) {
  const warnings = [];
  state.days.forEach((day) => {
    const c = coverageCheck(day);
    if (!c.ok) warnings.push(`${day.date}: ${c.msg}`);
  });
  return warnings;
}

function generateScheduleText(state) {
  let text = "";
  state.days.forEach((day) => {
    text += day.date + "\n";
    EMPLOYEES.forEach((name) => {
      const s = day.shifts[name];
      if (s.off) return;
      const hrs = hoursDecimal(s.start, s.end);
      text += `${name} ${fmt12(s.start)}-${fmt12(s.end)}(${fmtHours(hrs)})\n`;
    });
    text += "\n";
  });
  return text.trim();
}

function generatePayrollText(state) {
  const totals = {};
  EMPLOYEES.forEach((n) => (totals[n] = 0));
  state.days.forEach((day) => {
    EMPLOYEES.forEach((name) => {
      const s = day.shifts[name];
      if (s.off) return;
      totals[name] += hoursDecimal(s.start, s.end);
    });
  });
  let text = `PAY — week of ${state.days[0] ? state.days[0].date : ""}\n\n`;
  let grand = 0;
  EMPLOYEES.forEach((name) => {
    const hrs = totals[name];
    if (hrs === 0) return;
    const rate = state.rates[name] || 0;
    const pay = hrs * rate;
    grand += pay;
    text += `${name}: ${fmtHours(hrs)} hrs x $${rate}/hr = $${pay.toFixed(2)}\n`;
  });
  text += `\nTOTAL: $${grand.toFixed(2)}`;
  return text;
}

function findDay(state, dateLabel) {
  return state.days.find((d) => d.date === dateLabel);
}

module.exports = {
  EMPLOYEES,
  DEFAULT_RATE,
  newWeekState,
  toMinutes,
  fmt12,
  hoursDecimal,
  fmtHours,
  requiredStaff,
  requiredForDay,
  coverageCheck,
  weekCoverageWarnings,
  generateScheduleText,
  generatePayrollText,
  findDay,
};

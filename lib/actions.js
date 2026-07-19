const {
  EMPLOYEES,
  findDay,
  generateScheduleText,
  generatePayrollText,
  weekCoverageWarnings,
} = require("./scheduler");

// Applies a list of structured actions to state (mutates in place) and
// returns an array of reply message objects: { text, private }
// "private" messages (payroll) must never be merged with public ones.
function applyActions(state, actions) {
  const replies = [];
  const changeLog = [];

  for (const action of actions) {
    switch (action.type) {
      case "set_kids": {
        const day = findDay(state, action.date);
        if (!day) {
          changeLog.push(`Couldn't find ${action.date} on the schedule — skipped.`);
          break;
        }
        day.kids = action.kids;
        changeLog.push(`${action.date}: ${action.kids} kids expected.`);
        break;
      }
      case "set_shift": {
        const day = findDay(state, action.date);
        if (!day) {
          changeLog.push(`Couldn't find ${action.date} on the schedule — skipped.`);
          break;
        }
        if (!EMPLOYEES.includes(action.employee)) {
          changeLog.push(`Don't recognize "${action.employee}" — skipped.`);
          break;
        }
        const shift = day.shifts[action.employee];
        if (action.off === true) {
          shift.off = true;
          changeLog.push(`${action.date}: ${action.employee} is OFF.`);
        } else {
          shift.off = false;
          if (action.start) shift.start = action.start;
          if (action.end) shift.end = action.end;
          changeLog.push(
            `${action.date}: ${action.employee} ${shift.start}-${shift.end}.`
          );
        }
        break;
      }
      case "set_rate": {
        if (!EMPLOYEES.includes(action.employee)) {
          changeLog.push(`Don't recognize "${action.employee}" — skipped.`);
          break;
        }
        state.rates[action.employee] = action.rate;
        changeLog.push(`${action.employee}'s rate set to $${action.rate}/hr.`);
        break;
      }
      case "generate_schedule": {
        const warnings = weekCoverageWarnings(state);
        let text = generateScheduleText(state);
        if (warnings.length) {
          text += `\n\n⚠️ Coverage warning:\n` + warnings.join("\n");
        }
        replies.push({ text, private: false, kind: "schedule" });
        break;
      }
      case "generate_payroll": {
        const text = generatePayrollText(state);
        replies.push({
          text: `🔒 PRIVATE — don't forward to workers\n\n${text}`,
          private: true,
          kind: "payroll",
        });
        break;
      }
      default:
        changeLog.push(`Didn't understand one part of that message — ignored.`);
    }
  }

  if (changeLog.length) {
    replies.unshift({ text: changeLog.join("\n"), private: false, kind: "confirmation" });
  }

  return replies;
}

module.exports = { applyActions };

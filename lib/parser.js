const Anthropic = require("@anthropic-ai/sdk");
const { EMPLOYEES } = require("./scheduler");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function systemPrompt(state) {
  const dayList = state.days.map((d) => d.date).join(", ");
  return `You convert a daycare owner's WhatsApp texts into structured JSON actions.

Employees: ${EMPLOYEES.join(", ")}
This week's dates: ${dayList}

Return ONLY a JSON array (no prose, no markdown fences) of action objects. Valid action types:

- {"type":"set_kids","date":"7/20","kids":12}
- {"type":"set_shift","date":"7/20","employee":"Muslima","off":true}
- {"type":"set_shift","date":"7/20","employee":"Muslima","off":false,"start":"07:30","end":"14:00"}  (times in 24h HH:MM)
- {"type":"set_rate","employee":"Farida","rate":16}
- {"type":"generate_schedule"}
- {"type":"generate_payroll"}

Rules:
- Only use dates from the list above. If the person names a weekday instead of a date, map it to the matching date in the list.
- If a message just reports someone is unavailable/sick/has an appointment for a whole day, use set_shift with off:true.
- If the message gives a specific available time window instead, use off:false with that start/end.
- If the person asks to "send the schedule" or similar, include generate_schedule.
- If they ask for "pay", "payroll", or similar, include generate_payroll — but NEVER include generate_payroll unless explicitly asked; payroll must not be sent automatically.
- If a message is unclear or not actionable, return an empty array [].
- Never invent kid counts, times, or rates that weren't stated.`;
}

async function parseInstruction(text, state) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: systemPrompt(state),
    messages: [{ role: "user", content: text }],
  });

  const raw = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

module.exports = { parseInstruction };

// Shared Claude proxy logic for the Express server (server/index.js) and the
// Vercel function (api/chat.js). The API key never reaches the browser.

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 30;
const MAX_TRACKED_IPS = 5000;

// The browser sends the system prompt, so cap everything it controls. Without
// these limits the endpoint is a free general-purpose Claude proxy on your key.
const MAX_SYSTEM_CHARS = 6000;
const MAX_MESSAGE_CHARS = 12000;
const MAX_MESSAGES = 20;

const hits = new Map();

// Best-effort per-IP limiter. On serverless hosts each warm instance has its
// own map, so this slows abuse rather than stopping it; the real spend guard
// is the monthly cap set in console.anthropic.com.
export function limited(ip) {
  const now = Date.now();
  const rec = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  rec.push(now);
  hits.set(ip, rec);
  if (hits.size > MAX_TRACKED_IPS) hits.clear();
  return rec.length > MAX_REQUESTS;
}

function validate(body) {
  const { system, messages } = body || {};
  if (typeof system !== "string" || !system.trim() || system.length > MAX_SYSTEM_CHARS) return null;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const recent = messages.slice(-MAX_MESSAGES);
  for (const m of recent) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
    if (typeof m.content !== "string" || !m.content || m.content.length > MAX_MESSAGE_CHARS) return null;
  }
  // The API requires the conversation to start with a user turn.
  while (recent.length && recent[0].role !== "user") recent.shift();
  if (!recent.length) return null;
  return { system, messages: recent.map((m) => ({ role: m.role, content: m.content })) };
}

// Returns { status, reply } for the caller to send as JSON.
export async function chat(ip, body) {
  if (limited(ip)) {
    return { status: 429, reply: "Rate limit reached — take a short break and try again." };
  }
  const input = validate(body);
  if (!input) {
    return { status: 400, reply: "That request was too long or malformed. Shorten it and try again." };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: 500, reply: "Server is missing its API key. Set ANTHROPIC_API_KEY and redeploy." };
  }
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: input.system,
        messages: input.messages,
      }),
    });
    const data = await r.json();
    if (data.error) {
      console.error("Anthropic error:", data.error);
      return { status: 502, reply: "Upstream error — check your API credits and try again." };
    }
    const reply = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    return { status: 200, reply: reply || "No response — try again." };
  } catch (e) {
    console.error(e);
    return { status: 502, reply: "Upstream error — try again in a moment." };
  }
}

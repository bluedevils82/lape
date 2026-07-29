// Claude proxy. The API key never reaches the browser.
// Note: serverless instances are ephemeral, so this limiter is best-effort
// per warm instance — it slows abuse, it does not hard-stop it. The real
// spend guard is the monthly cap you set in console.anthropic.com.
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const rec = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  rec.push(now);
  hits.set(ip, rec);
  if (hits.size > 5000) hits.clear();
  return rec.length > 30;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ reply: "Method not allowed." });

  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (limited(ip)) {
    return res.status(429).json({ reply: "Rate limit reached — take a short break and try again." });
  }

  const { system, messages } = req.body || {};
  if (!system || !Array.isArray(messages)) {
    return res.status(400).json({ reply: "Bad request." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ reply: "Server is missing its API key. Add ANTHROPIC_API_KEY in Vercel." });
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
        system,
        messages: messages.slice(-20),
      }),
    });
    const data = await r.json();
    if (data.error) {
      console.error("Anthropic error:", data.error);
      return res.status(502).json({ reply: "Upstream error — check your API credits and try again." });
    }
    const reply = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    return res.status(200).json({ reply: reply || "No response — try again." });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ reply: "Upstream error — try again in a moment." });
  }
}

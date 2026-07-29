// LAPE — production server
// Serves the built app + proxies Claude API calls (key stays server-side)
// + Stripe webhook stub for post-purchase fulfillment.
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Stripe webhook must read the RAW body (register before json parser) ──
app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), (req, res) => {
  // TODO when going live:
  // 1. npm install stripe
  // 2. const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  // 3. const event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  // 4. On "checkout.session.completed": email the buyer their export package
  //    (system prompt + starter code + guide) or grant a download link.
  console.log("Stripe webhook received (stub). Wire fulfillment here.");
  res.json({ received: true });
});

app.use(express.json({ limit: "1mb" }));

// ── Payment links exposed to the frontend ──
app.get("/api/config", (_req, res) => {
  res.json({
    export: process.env.STRIPE_LINK_EXPORT || "",
    kit: process.env.STRIPE_LINK_KIT || "",
  });
});

// ── Claude proxy: rate-limited, key never leaves the server ──
const hits = new Map(); // naive per-IP limiter: 30 req / 10 min
function limited(ip) {
  const now = Date.now();
  const rec = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  rec.push(now);
  hits.set(ip, rec);
  return rec.length > 30;
}

app.post("/api/chat", async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ reply: "Rate limit reached — take a short break and try again." });
  const { system, messages } = req.body || {};
  if (!system || !Array.isArray(messages)) return res.status(400).json({ reply: "Bad request." });
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
        messages: messages.slice(-20), // cap history
      }),
    });
    const data = await r.json();
    const reply = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    res.json({ reply: reply || "No response — try again." });
  } catch (e) {
    console.error(e);
    res.status(502).json({ reply: "Upstream error — try again in a moment." });
  }
});

// ── Static build ──
const dist = path.join(__dirname, "..", "dist");
app.use(express.static(dist));
app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));

app.listen(PORT, () => console.log(`LAPE running on :${PORT}`));

// LAPE — production server
// Serves the built app + proxies Claude API calls (key stays server-side)
// + Stripe webhook stub for post-purchase fulfillment.
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { chat } from "../lib/chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Railway and similar hosts sit behind one proxy. Without this, req.ip is the
// proxy address and every visitor shares a single rate limit.
app.set("trust proxy", 1);

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

// ── Claude proxy: rate-limited, key never leaves the server (logic in lib/chat.js) ──
app.post("/api/chat", async (req, res) => {
  const { status, reply } = await chat(req.ip, req.body);
  res.status(status).json({ reply });
});

// ── Static build ──
const dist = path.join(__dirname, "..", "dist");
// Vite fingerprints everything under /assets, so it can be cached for good.
app.use("/assets", express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y" }));
app.use(express.static(dist));
app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));

app.listen(PORT, () => console.log(`LAPE running on :${PORT}`));

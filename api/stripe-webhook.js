// Optional: automated fulfillment after purchase.
// Until you wire this, Stripe's confirmation page + your delivery email does the job.
// To go live:
//   1. npm install stripe
//   2. import Stripe from "stripe";
//   3. Verify the signature with STRIPE_WEBHOOK_SECRET, then on
//      "checkout.session.completed" email the buyer their export package.
// Vercel parses JSON by default; signature verification needs the raw body,
// so disable the parser when you implement it:
export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ received: false });
  console.log("Stripe webhook received (stub). Wire fulfillment here.");
  return res.status(200).json({ received: true });
}

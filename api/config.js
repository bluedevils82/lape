// Payment links exposed to the frontend. Empty values = demo mode.
export default function handler(_req, res) {
  res.status(200).json({
    export: process.env.STRIPE_LINK_EXPORT || "",
    kit: process.env.STRIPE_LINK_KIT || "",
  });
}

// Claude proxy (Vercel function). Logic lives in lib/chat.js, shared with the
// Express server.
import { chat } from "../lib/chat.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ reply: "Method not allowed." });
  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const { status, reply } = await chat(ip, req.body);
  return res.status(status).json({ reply });
}

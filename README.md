# LAPE

Build-your-first-agent playground. Free to build and test, $29 export, $99 starter kit.

## Stack
Vite + React frontend · Express backend (Claude API proxy with rate limiting, Stripe payment links, webhook stub).

## Run locally
```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run build && npm start   # http://localhost:3000
```
For hot-reload dev: `npm start` in one terminal, `npm run dev` in another (Vite proxies /api).

## Deploy on Railway (10 minutes)
1. Push this folder to a GitHub repo.
2. Railway → New Project → Deploy from GitHub → select the repo.
3. Variables tab → add `ANTHROPIC_API_KEY`. (Build/start commands are auto-detected: `npm run build`, `npm start`.)
4. Settings → Networking → Generate Domain (or attach your custom domain).
5. Open the URL — the app runs in demo mode until Stripe links are set.

## Go live with Stripe (5 minutes, exact click-path)
1. dashboard.stripe.com → **Product catalog → Add product**
   - "Agent Export" — $29 one-time
   - "Agent Starter Kit" — $99 one-time
2. **Payment Links → New** → pick each product → Create link.
3. Copy both URLs into Railway variables: `STRIPE_LINK_EXPORT`, `STRIPE_LINK_KIT`. Redeploy.
4. On each Payment Link, set the confirmation page to a custom message with the delivery instructions (or a Google Drive link to the guides) — this gets you selling TODAY without building fulfillment.

## Automated fulfillment (later, optional)
`server/index.js` contains a commented webhook stub at `/api/stripe-webhook`. Wire it to email the export package on `checkout.session.completed`. Until then, Stripe's confirmation page + your delivery email does the job manually.

## Hard rules honored
- API key never ships to the browser (server-side proxy only)
- Naive rate limiting on /api/chat (30 req / 10 min / IP) so a scraper can't drain your key
- No analytics or tracking included — add your own if wanted

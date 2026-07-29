import { useState, useRef, useEffect } from "react";

/* ─────────────────────────────────────────────────────────
   LAPE — Builder Playground
   Blueprint drafting-table aesthetic. The signature element
   is the live Spec Sheet: the agent's system prompt assembles
   itself on white drafting paper as the user fills fields,
   with annotations that teach WHY each section exists.
   ───────────────────────────────────────────────────────── */

const T = {
  deep: "#142A4A",
  panel: "#1B3560",
  line: "rgba(234,241,250,0.14)",
  cyan: "#7FD1E8",
  ink: "#EAF1FA",
  dim: "#9FB2CC",
  safety: "#FF6B2C",
  paper: "#F6F3EC",
  paperInk: "#1B3560",
  paperDim: "#5A6B85",
};

const BLUEPRINTS = [
  {
    id: "email",
    tag: "OPS-01",
    name: "Email Triage Agent",
    blurb: "Sorts, summarizes, and drafts replies so inbox time drops from hours to minutes.",
    role: "an email triage assistant for a busy professional",
    defaultRules: "Never send anything — only draft.\nFlag anything involving money, legal terms, or deadlines as URGENT.\nSummaries must be 2 sentences max per email.",
    defaultFormat: "For each email: PRIORITY (urgent/normal/low), 2-sentence summary, suggested action, and a draft reply if one is needed.",
  },
  {
    id: "research",
    tag: "INT-02",
    name: "Research Assistant",
    blurb: "Turns a vague question into a structured brief with sources, gaps, and a recommendation.",
    role: "a research assistant that produces decision-ready briefs",
    defaultRules: "Separate facts from inference — label each.\nAlways state what you could NOT verify.\nEnd with one clear recommendation and its biggest risk.",
    defaultFormat: "A brief with: Question restated, Key findings (bulleted), What's uncertain, Recommendation, One risk to watch.",
  },
  {
    id: "content",
    tag: "MKT-03",
    name: "Content Repurposer",
    blurb: "One long piece in, five platform-native posts out. No generic filler.",
    role: "a content repurposing specialist who converts long-form content into platform-specific posts",
    defaultRules: "Match each platform's native voice — LinkedIn is not X.\nNo hashtag spam: 3 max on LinkedIn, 1 on X.\nEvery post must contain one specific number, example, or claim from the source.",
    defaultFormat: "For each platform (LinkedIn, X, email newsletter): the post text, character count, and the single hook it leads with.",
  },
  {
    id: "meetings",
    tag: "OPS-04",
    name: "Meeting → Action Items",
    blurb: "Raw notes or transcript in, owned action items with deadlines out.",
    role: "a meeting notes processor that extracts decisions and action items",
    defaultRules: "Every action item needs an owner — if none was stated, mark it UNASSIGNED and flag it.\nDecisions are separate from action items.\nIgnore small talk entirely.",
    defaultFormat: "Three sections: Decisions made, Action items (owner / task / due date), Open questions.",
  },
  {
    id: "faq",
    tag: "SVC-05",
    name: "Customer FAQ Responder",
    blurb: "Consistent, on-policy answers to repeat customer questions, escalating what it shouldn't touch.",
    role: "a customer support responder for a small business",
    defaultRules: "Never invent policy — if the answer isn't in the provided knowledge, say so and escalate.\nNo refund promises, ever. Escalate those.\nKeep replies under 120 words.",
    defaultFormat: "A ready-to-send reply, plus an internal note: CONFIDENT or ESCALATE with a one-line reason.",
  },
];

const TONES = ["Direct and efficient", "Warm and conversational", "Formal and precise", "Coaching and encouraging"];

const ANNOTATIONS = {
  role: "The role line anchors every response. Vague role = vague agent.",
  tone: "Tone is a spec, not a vibe. Written down, it survives every conversation.",
  rules: "Rules are your guardrails. This is what separates an agent from a chatbot.",
  format: "Fixed output format is what makes an agent usable in a real workflow.",
};

function buildSystemPrompt(bp, cfg) {
  if (!bp) return "";
  const parts = [];
  parts.push(`You are ${cfg.name ? cfg.name + ", " : ""}${bp.role}.`);
  if (cfg.audience) parts.push(`You work for: ${cfg.audience}.`);
  parts.push(`\nTONE\n${cfg.tone}.`);
  if (cfg.rules.trim()) parts.push(`\nRULES\n${cfg.rules.trim()}`);
  if (cfg.format.trim()) parts.push(`\nOUTPUT FORMAT\n${cfg.format.trim()}`);
  parts.push(`\nIf a request falls outside this job, say so briefly and steer back to what you do.`);
  return parts.join("\n");
}

const STARTER_CODE = (systemPrompt) => `// Your agent, as a Node.js starter (Anthropic SDK)
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic(); // uses ANTHROPIC_API_KEY env var

const SYSTEM_PROMPT = \`${systemPrompt.replace(/`/g, "\\`")}\`;

async function runAgent(userInput) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userInput }],
  });
  return msg.content[0].text;
}

runAgent("PASTE A REAL TASK HERE").then(console.log);`;

export default function AgentFactory() {
  const [step, setStep] = useState(1);
  const [bp, setBp] = useState(null);
  const [cfg, setCfg] = useState({ name: "", audience: "", tone: TONES[0], rules: "", format: "" });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [copied, setCopied] = useState("");
  const [payLinks, setPayLinks] = useState({ export: "", kit: "" });
  const chatEnd = useRef(null);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((c) => setPayLinks(c)).catch(() => {});
  }, []);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const systemPrompt = buildSystemPrompt(bp, cfg);

  const pickBlueprint = (b) => {
    setBp(b);
    setCfg({ name: "", audience: "", tone: TONES[0], rules: b.defaultRules, format: b.defaultFormat });
    setMessages([]);
    setStep(2);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.reply || "No response — try again.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Connection error. Send that again." }]);
    }
    setBusy(false);
  };

  const copy = (label, text) => {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  const field = (label, key, props = {}) => (
    <div style={{ marginBottom: 18 }}>
      <label style={S.label}>{label}</label>
      {props.textarea ? (
        <textarea style={{ ...S.input, minHeight: 92, resize: "vertical" }} value={cfg[key]}
          onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })} placeholder={props.placeholder} />
      ) : props.select ? (
        <select style={S.input} value={cfg[key]} onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}>
          {TONES.map((t) => <option key={t}>{t}</option>)}
        </select>
      ) : (
        <input style={S.input} value={cfg[key]} onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })} placeholder={props.placeholder} />
      )}
    </div>
  );

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::selection { background: ${T.safety}; color: #fff; }
        input:focus, textarea:focus, select:focus { outline: 2px solid ${T.cyan}; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid ${T.cyan}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
        .bpcard:hover { border-color: ${T.safety} !important; transform: translateY(-2px); }
        .bpcard { transition: transform .15s ease, border-color .15s ease; }
        @media (max-width: 900px) { .split { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Toolbar */}
      <header style={S.toolbar}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={S.brand}>LAPE</span>
          <span style={S.mono}>DWG NO. AF-{bp ? bp.tag : "000"}</span>
        </div>
        <nav style={{ display: "flex", gap: 4 }} aria-label="Build steps">
          {["BLUEPRINT", "CONFIGURE", "TEST DRIVE"].map((s, i) => {
            const n = i + 1, active = step === n, done = step > n;
            return (
              <button key={s} onClick={() => (n === 1 || bp) && setStep(n)}
                style={{ ...S.stepBtn, background: active ? T.safety : "transparent", color: active ? "#fff" : done ? T.cyan : T.dim, borderColor: active ? T.safety : T.line }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{String.fromCharCode(65 + i)}</span> {s}
              </button>
            );
          })}
        </nav>
      </header>

      {/* STEP 1 — Blueprint picker */}
      {step === 1 && (
        <main style={S.main}>
          <div style={{ maxWidth: 640, marginBottom: 34 }}>
            <h1 style={S.h1}>Build your first working agent<span style={{ color: T.safety }}>.</span></h1>
            <p style={{ color: T.dim, fontSize: 16, lineHeight: 1.6, margin: 0 }}>
              Pick a blueprint. Configure it in plain English. Test it against real work — live, right here.
              You leave with an agent, not a lecture.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {BLUEPRINTS.map((b) => (
              <button key={b.id} className="bpcard" onClick={() => pickBlueprint(b)} style={S.card}>
                <div style={{ ...S.mono, color: T.cyan, marginBottom: 10 }}>{b.tag}</div>
                <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 19, fontWeight: 700, marginBottom: 8 }}>{b.name}</div>
                <div style={{ color: T.dim, fontSize: 14, lineHeight: 1.55 }}>{b.blurb}</div>
                <div style={{ ...S.mono, color: T.safety, marginTop: 14 }}>SELECT →</div>
              </button>
            ))}
          </div>
        </main>
      )}

      {/* STEP 2 — Configure + live spec sheet */}
      {step === 2 && bp && (
        <main style={S.main}>
          <div className="split" style={{ display: "grid", gridTemplateColumns: "minmax(320px, 440px) 1fr", gap: 28, alignItems: "start" }}>
            <section>
              <div style={{ ...S.mono, color: T.cyan, marginBottom: 6 }}>{bp.tag} / CONFIGURATION</div>
              <h2 style={S.h2}>{bp.name}</h2>
              {field("Agent name (optional)", "name", { placeholder: "e.g. Inbox Zero" })}
              {field("Who it works for", "audience", { placeholder: "e.g. a program manager juggling 3 product lines" })}
              {field("Tone", "tone", { select: true })}
              {field("Rules — the guardrails", "rules", { textarea: true })}
              {field("Output format — what it hands back", "format", { textarea: true })}
              <button style={S.primary} onClick={() => setStep(3)}>Send to test bay →</button>
            </section>

            {/* Signature: live spec sheet */}
            <section style={S.paper} aria-label="Live agent spec sheet">
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${T.paperInk}`, paddingBottom: 8, marginBottom: 16 }}>
                <span style={{ ...S.monoPaper, fontWeight: 600 }}>AGENT SPEC SHEET — ASSEMBLES AS YOU TYPE</span>
                <span style={S.monoPaper}>REV. A</span>
              </div>
              <SpecBlock label="ROLE" note={ANNOTATIONS.role}>
                You are {cfg.name ? <strong>{cfg.name}, </strong> : ""}{bp.role}.{cfg.audience ? ` You work for: ${cfg.audience}.` : ""}
              </SpecBlock>
              <SpecBlock label="TONE" note={ANNOTATIONS.tone}>{cfg.tone}.</SpecBlock>
              <SpecBlock label="RULES" note={ANNOTATIONS.rules}>
                {cfg.rules.trim() ? cfg.rules.split("\n").map((r, i) => <div key={i}>— {r}</div>) : <em style={{ color: T.paperDim }}>No rules yet. An agent without rules is a liability.</em>}
              </SpecBlock>
              <SpecBlock label="OUTPUT FORMAT" note={ANNOTATIONS.format}>
                {cfg.format.trim() || <em style={{ color: T.paperDim }}>Undefined. Define what it hands back, every time.</em>}
              </SpecBlock>
            </section>
          </div>
        </main>
      )}

      {/* STEP 3 — Test drive */}
      {step === 3 && bp && (
        <main style={S.main}>
          <div className="split" style={{ display: "grid", gridTemplateColumns: "1fr minmax(280px, 360px)", gap: 28, alignItems: "start" }}>
            <section style={{ display: "flex", flexDirection: "column", height: "min(68vh, 640px)", border: `1px solid ${T.line}`, background: T.panel, borderRadius: 4 }}>
              <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700 }}>{cfg.name || bp.name} — TEST BAY</span>
                <span style={{ ...S.mono, color: busy ? T.safety : T.cyan }}>{busy ? "● RUNNING" : "● READY"}</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
                {messages.length === 0 && (
                  <p style={{ color: T.dim, fontSize: 14, lineHeight: 1.6 }}>
                    Paste real work — an actual email, real meeting notes, a genuine question. Testing with real
                    input is the fastest way to find where your rules need tightening.
                  </p>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div style={{ ...S.mono, color: m.role === "user" ? T.safety : T.cyan, marginBottom: 4 }}>{m.role === "user" ? "YOU" : "AGENT"}</div>
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 14.5, lineHeight: 1.6, background: m.role === "user" ? "rgba(255,107,44,0.08)" : "rgba(127,209,232,0.06)", padding: "10px 14px", borderRadius: 4, border: `1px solid ${T.line}` }}>{m.content}</div>
                  </div>
                ))}
                {busy && <div style={{ ...S.mono, color: T.dim }}>agent is thinking…</div>}
                <div ref={chatEnd} />
              </div>
              <div style={{ display: "flex", gap: 10, padding: 14, borderTop: `1px solid ${T.line}` }}>
                <input style={{ ...S.input, marginBottom: 0, flex: 1 }} value={input} placeholder="Give your agent a real task…"
                  onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
                <button style={{ ...S.primary, padding: "0 22px" }} onClick={send} disabled={busy}>Run</button>
              </div>
            </section>

            <aside>
              <div style={{ ...S.card, cursor: "default", marginBottom: 16 }}>
                <div style={{ ...S.mono, color: T.cyan, marginBottom: 8 }}>WHAT TO TEST</div>
                <div style={{ fontSize: 14, color: T.dim, lineHeight: 1.7 }}>
                  1. A normal case — does the format hold?<br />
                  2. An edge case — does it follow your rules?<br />
                  3. Something off-topic — does it stay in its lane?<br /><br />
                  If any test fails, go back to <button onClick={() => setStep(2)} style={S.linkBtn}>Configure</button> and tighten the spec. That loop is agent building.
                </div>
              </div>
              <button style={{ ...S.primary, width: "100%", fontSize: 16 }} onClick={() => setShowExport(true)}>
                Export this agent ↗
              </button>
              <p style={{ ...S.mono, color: T.dim, marginTop: 10, textAlign: "center" }}>PROMPT + STARTER CODE + SETUP GUIDE</p>
            </aside>
          </div>
        </main>
      )}

      {/* Export modal */}
      {showExport && (
        <div style={S.overlay} onClick={() => setShowExport(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            {!unlocked ? (
              <>
                <div style={{ ...S.mono, color: T.cyan, marginBottom: 6 }}>TAKE IT WITH YOU</div>
                <h2 style={{ ...S.h2, marginBottom: 20 }}>Your agent is built. Own it.</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                  <Tier price="$29" name="Agent Export" items={["Complete system prompt", "Node.js starter code", "3 deployment paths guide", "Claude / API / Claude Code setup"]}
                    onBuy={() => payLinks.export ? window.open(payLinks.export, "_blank") : setUnlocked(true)} />
                  <Tier price="$99" name="Agent Starter Kit" featured items={["Everything in Export", "7-stage agent pipeline scaffold", "All 5 blueprint templates", "Walkthrough guide", "Security guardrail hook included"]}
                    onBuy={() => payLinks.kit ? window.open(payLinks.kit, "_blank") : setUnlocked(true)} />
                </div>
                {!payLinks.export && <p style={{ ...S.mono, color: T.dim, margin: 0 }}>DEMO MODE — SET STRIPE_LINK_EXPORT / STRIPE_LINK_KIT ENV VARS TO GO LIVE</p>}
              </>
            ) : (
              <>
                <div style={{ ...S.mono, color: T.safety, marginBottom: 6 }}>UNLOCKED ✓</div>
                <h2 style={{ ...S.h2, marginBottom: 16 }}>Your agent package</h2>
                <ExportBlock label="SYSTEM PROMPT" text={systemPrompt} copied={copied} onCopy={copy} />
                <ExportBlock label="STARTER CODE (NODE.JS)" text={STARTER_CODE(systemPrompt)} copied={copied} onCopy={copy} />
              </>
            )}
            <button style={{ ...S.linkBtn, marginTop: 16 }} onClick={() => setShowExport(false)}>Close</button>
          </div>
        </div>
      )}

      <footer style={{ padding: "18px 28px", borderTop: `1px solid ${T.line}`, ...S.mono, color: T.dim, display: "flex", justifyContent: "space-between" }}>
        <span>LAPE (RHYMES WITH TAPE) — LEARN BY SHIPPING</span>
        <span>SHEET 1 OF 1</span>
      </footer>
    </div>
  );
}

function SpecBlock({ label, note, children }) {
  return (
    <div style={{ marginBottom: 18, paddingLeft: 14, borderLeft: `3px solid #1B3560` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 1.5, fontWeight: 600, color: "#1B3560" }}>{label}</span>
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.55, color: "#22314A", whiteSpace: "pre-wrap" }}>{children}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8A97AD", marginTop: 6 }}>▸ {note}</div>
    </div>
  );
}

function Tier({ price, name, items, featured, onBuy }) {
  return (
    <div style={{ border: `1px solid ${featured ? T.safety : T.line}`, borderRadius: 4, padding: 18, background: featured ? "rgba(255,107,44,0.06)" : "transparent" }}>
      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 26, fontWeight: 700 }}>{price}</div>
      <div style={{ ...S.mono, color: featured ? T.safety : T.cyan, marginBottom: 12 }}>{name.toUpperCase()}</div>
      <ul style={{ margin: "0 0 16px", padding: 0, listStyle: "none", fontSize: 13.5, color: T.dim, lineHeight: 1.9 }}>
        {items.map((it) => <li key={it}>— {it}</li>)}
      </ul>
      <button style={{ ...S.primary, width: "100%", background: featured ? T.safety : "transparent", border: `1px solid ${T.safety}` }} onClick={onBuy}>
        Checkout with Stripe
      </button>
    </div>
  );
}

function ExportBlock({ label, text, copied, onCopy }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ ...S.mono, color: T.cyan }}>{label}</span>
        <button style={S.linkBtn} onClick={() => onCopy(label, text)}>{copied === label ? "Copied ✓" : "Copy"}</button>
      </div>
      <pre style={{ background: "#0E1E38", border: `1px solid ${T.line}`, borderRadius: 4, padding: 14, fontSize: 12, lineHeight: 1.55, color: T.ink, overflowX: "auto", maxHeight: 180, margin: 0, fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "pre-wrap" }}>{text}</pre>
    </div>
  );
}

const S = {
  root: {
    minHeight: "100vh", color: T.ink, fontFamily: "'IBM Plex Sans', sans-serif",
    background: `
      linear-gradient(rgba(127,209,232,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(127,209,232,0.05) 1px, transparent 1px),
      linear-gradient(rgba(127,209,232,0.09) 1px, transparent 1px),
      linear-gradient(90deg, rgba(127,209,232,0.09) 1px, transparent 1px),
      ${T.deep}`,
    backgroundSize: "24px 24px, 24px 24px, 120px 120px, 120px 120px, auto",
    display: "flex", flexDirection: "column",
  },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "16px 28px", borderBottom: `1px solid ${T.line}`, background: "rgba(20,42,74,0.85)", backdropFilter: "blur(6px)", position: "sticky", top: 0, zIndex: 5 },
  brand: { fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 17, letterSpacing: 2 },
  mono: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 1.2 },
  monoPaper: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 1.2, color: "#1B3560" },
  stepBtn: { border: "1px solid", borderRadius: 3, padding: "7px 14px", fontSize: 12, letterSpacing: 1, cursor: "pointer", background: "transparent", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600 },
  main: { flex: 1, padding: "40px 28px", maxWidth: 1180, width: "100%", margin: "0 auto" },
  h1: { fontFamily: "'Chakra Petch', sans-serif", fontSize: "clamp(30px, 5vw, 46px)", fontWeight: 700, lineHeight: 1.1, margin: "0 0 14px" },
  h2: { fontFamily: "'Chakra Petch', sans-serif", fontSize: 24, fontWeight: 700, margin: "0 0 20px" },
  card: { textAlign: "left", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 4, padding: 20, color: T.ink, cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif" },
  label: { display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 1.4, color: T.cyan, marginBottom: 6 },
  input: { width: "100%", background: "rgba(14,30,56,0.7)", border: `1px solid ${T.line}`, borderRadius: 3, color: T.ink, padding: "10px 12px", fontSize: 14, fontFamily: "'IBM Plex Sans', sans-serif" },
  primary: { background: T.safety, color: "#fff", border: "none", borderRadius: 3, padding: "12px 20px", fontSize: 14, fontWeight: 600, letterSpacing: 0.5, cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif" },
  linkBtn: { background: "none", border: "none", color: T.cyan, cursor: "pointer", fontSize: 13, padding: 0, fontFamily: "'IBM Plex Sans', sans-serif", textDecoration: "underline" },
  paper: { background: T.paper, borderRadius: 4, padding: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.35)", color: "#22314A", position: "sticky", top: 90 },
  overlay: { position: "fixed", inset: 0, background: "rgba(10,20,38,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20, padding: 20 },
  modal: { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 6, padding: 28, maxWidth: 620, width: "100%", maxHeight: "85vh", overflowY: "auto" },
};

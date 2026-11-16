// Turns a configured agent into things people can install:
// a Claude Skill (a folder with SKILL.md, zipped) and a ChatGPT custom GPT setup.

export function slugify(text) {
  const slug = String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "my-agent";
}

const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
const bullets = (s) =>
  String(s || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `- ${l.replace(/^[-—•]\s*/, "")}`)
    .join("\n");

export function agentName(bp, cfg) {
  return oneLine(cfg.name) || bp.name;
}

// Skill names are lowercase letters, digits and hyphens. The description is
// what Claude reads to decide when to load the skill, so it says what the
// skill does and when to use it.
export function skillDescription(bp) {
  return oneLine(`${bp.blurb} Use when the user ${bp.useWhen}.`).slice(0, 1024);
}

export function buildSkillMd(bp, cfg) {
  const name = agentName(bp, cfg);
  const description = skillDescription(bp).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const parts = [
    "---",
    `name: ${slugify(name)}`,
    `description: "${description}"`,
    "---",
    "",
    `# ${name}`,
    "",
    `Act as ${bp.role}.${cfg.audience ? ` You work for: ${oneLine(cfg.audience)}.` : ""}`,
    "",
    "## Tone",
    "",
    `${cfg.tone}.`,
  ];
  if (cfg.rules.trim()) parts.push("", "## Rules", "", bullets(cfg.rules));
  if (cfg.format.trim()) parts.push("", "## Output format", "", cfg.format.trim());
  parts.push(
    "",
    "## Scope",
    "",
    "If a request falls outside this job, say so briefly and steer back to what this skill does.",
    ""
  );
  return parts.join("\n");
}

export function buildGptSetup(bp, cfg, systemPrompt) {
  return [
    "NAME",
    agentName(bp, cfg),
    "",
    "DESCRIPTION",
    bp.blurb,
    "",
    "INSTRUCTIONS",
    systemPrompt,
    "",
    "CONVERSATION STARTERS",
    ...bp.starters.map((s) => `- ${s}`),
  ].join("\n");
}

// ── Minimal zip writer (stored, no compression) so there is no dependency ──
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ path, text }] → Uint8Array of a valid .zip
export function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.path);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true); // time
    local.setUint16(12, 0x21, true); // date: 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, 0, true);
    dir.setUint16(14, 0x21, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const c of all) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

export function buildSkillZip(bp, cfg) {
  const folder = slugify(agentName(bp, cfg));
  return { filename: `${folder}.zip`, bytes: makeZip([{ path: `${folder}/SKILL.md`, text: buildSkillMd(bp, cfg) }]) };
}

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

const MODEL = process.env.MODEL || "claude-sonnet-5";

// Resolve the bundled corpus (included via netlify.toml included_files).
const ROOT = process.env.LAMBDA_TASK_ROOT || process.cwd();
function readData(file) {
  for (const base of [ROOT, process.cwd(), path.join(ROOT, "..")]) {
    const p = path.join(base, "data", file);
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  throw new Error(`corpus file not found: data/${file}`);
}

let corpus = null;
function loadCorpus() {
  if (corpus) return corpus;
  const idx = JSON.parse(readData("docs.json"));
  corpus = {};
  for (const d of idx.documents) corpus[d.id] = { ...d, text: readData(d.file) };
  corpus.__order = idx.documents.map((d) => d.id);
  return corpus;
}

function clampText(text, maxChars) {
  return text.length <= maxChars ? text : text.slice(0, maxChars) + "\n[... document truncated for length ...]";
}

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "method not allowed" });
  try {
    const { question, docId } = JSON.parse(event.body || "{}");
    if (!question || !question.trim()) return json(400, { error: "question is required" });
    if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: "server missing ANTHROPIC_API_KEY" });

    // Optional shared passcode protects API spend on a public deploy.
    if (process.env.QUERY_PASSCODE) {
      const code = event.headers["x-access-code"] || event.headers["X-Access-Code"];
      if (code !== process.env.QUERY_PASSCODE) return json(401, { error: "access code required" });
    }

    const c = loadCorpus();
    const ids = docId && docId !== "both" ? [docId] : c.__order;
    const chosen = ids.filter((id) => c[id]);
    if (chosen.length === 0) return json(400, { error: "unknown docId" });

    const perDoc = Math.floor(320000 / chosen.length);
    const context = chosen
      .map((id) => `<document id="${id}" title="${c[id].title}">\n${clampText(c[id].text, perDoc)}\n</document>`)
      .join("\n\n");

    const system =
      "You are a precise technical-documentation assistant. Answer ONLY from the supplied document(s). " +
      "The documents are delimited by <document> tags; page boundaries are marked with '===== PAGE N ====='. " +
      "When you state a fact, cite the document title and page number(s) it came from, e.g. (Siemens SG-3528, p.13). " +
      "The Siemens manual was recovered by OCR, so tolerate minor character errors and part-number typos (e.g. 'paw!' = 'pawl'). " +
      "If the answer is not in the documents, say so plainly — do not invent specifications. " +
      "Be concise and concrete; prefer exact values, part numbers, and steps over generalities.";

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system,
      messages: [{ role: "user", content: `${context}\n\nQuestion: ${question.trim()}` }],
    });

    const answer = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return json(200, { answer, model: MODEL, docsSearched: chosen });
  } catch (err) {
    return json(500, { error: err?.message || "query failed" });
  }
}

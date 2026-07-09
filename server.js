import express from "express";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data");
const PORT = process.env.PORT || 4200;
const MODEL = process.env.MODEL || "claude-sonnet-5";

// ---- Load document corpus once at startup ----
const docsIndex = JSON.parse(fs.readFileSync(path.join(DATA, "docs.json"), "utf8"));
const corpus = {};
for (const d of docsIndex.documents) {
  corpus[d.id] = {
    ...d,
    text: fs.readFileSync(path.join(DATA, d.file), "utf8"),
  };
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Rough token budget guard: ~4 chars/token. Trim doc text if a request would be huge.
function clampText(text, maxChars) {
  return text.length <= maxChars ? text : text.slice(0, maxChars) + "\n[... document truncated for length ...]";
}

// Natural-language query over one or both documents
app.post("/api/query", async (req, res) => {
  try {
    const { question, docId } = req.body || {};
    if (!question || !question.trim()) return res.status(400).json({ error: "question is required" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set on the server. Add it to .env and restart." });
    // Optional shared passcode (protects API spend on public deploys)
    if (process.env.QUERY_PASSCODE && req.get("x-access-code") !== process.env.QUERY_PASSCODE) {
      return res.status(401).json({ error: "access code required" });
    }

    const ids = docId && docId !== "both" ? [docId] : docsIndex.documents.map((d) => d.id);
    const chosen = ids.filter((id) => corpus[id]);
    if (chosen.length === 0) return res.status(400).json({ error: "unknown docId" });

    // Budget the context across selected docs (keep well under the model window).
    const perDoc = Math.floor(320000 / chosen.length);
    const context = chosen
      .map((id) => {
        const d = corpus[id];
        return `<document id="${id}" title="${d.title}">\n${clampText(d.text, perDoc)}\n</document>`;
      })
      .join("\n\n");

    const system =
      "You are a precise technical-documentation assistant. Answer ONLY from the supplied document(s). " +
      "The documents are delimited by <document> tags; page boundaries are marked with '===== PAGE N ====='. " +
      "When you state a fact, cite the document title and page number(s) it came from, e.g. (Siemens SG-3528, p.13). " +
      "The Siemens manual was recovered by OCR, so tolerate minor character errors and part-number typos (e.g. 'paw!' = 'pawl'). " +
      "If the answer is not in the documents, say so plainly — do not invent specifications. " +
      "Be concise and concrete; prefer exact values, part numbers, and steps over generalities.";

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system,
      messages: [
        {
          role: "user",
          content: `${context}\n\nQuestion: ${question.trim()}`,
        },
      ],
    });

    const answer = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    res.json({ answer, model: MODEL, docsSearched: chosen });
  } catch (err) {
    console.error("query error:", err?.message || err);
    res.status(500).json({ error: err?.message || "query failed" });
  }
});

app.listen(PORT, () => {
  console.log(`spec-explorer running at http://localhost:${PORT}  (model: ${MODEL})`);
  console.log(`Loaded documents: ${docsIndex.documents.map((d) => d.id).join(", ")}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set" : "MISSING — /api/query will error"}`);
});

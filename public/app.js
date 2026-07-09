// ---------- Tab switching ----------
const tabs = document.querySelectorAll(".tab");
const panels = { ask: document.getElementById("tab-ask"), figure: document.getElementById("tab-figure") };
tabs.forEach((t) =>
  t.addEventListener("click", () => {
    tabs.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    Object.values(panels).forEach((p) => p.classList.remove("active"));
    panels[t.dataset.tab].classList.add("active");
  })
);
function switchTab(name) {
  document.querySelector(`.tab[data-tab="${name}"]`).click();
}

// ---------- Ask panel ----------
const docSelect = document.getElementById("docSelect");
const docMeta = document.getElementById("docMeta");
const questionEl = document.getElementById("question");
const askBtn = document.getElementById("askBtn");
const answerEl = document.getElementById("answer");
const suggestionsEl = document.getElementById("suggestions");

const SUGGESTIONS = {
  siemens: [
    "How do I manually charge the closing spring?",
    "What is trip-free operation and how does it work?",
    "What does the anti-pump relay 52Y do?",
    "How does the breaker open when the trip button is pressed?",
  ],
  ieee: [
    "What is the hottest-spot factor?",
    "How is the top-oil temperature rise measured?",
    "What loads beyond nameplate does this practice cover?",
    "What conditioning is required before a temperature-rise test?",
  ],
  both: [
    "How do I manually charge the closing spring?",
    "What is the hottest-spot factor?",
    "What is trip-free operation?",
    "How is top-oil temperature rise determined?",
  ],
};

let docsMeta = {};
async function loadDocs() {
  const r = await fetch("/data/docs-meta.json");
  const j = await r.json();
  j.documents.forEach((d) => {
    docsMeta[d.id] = d;
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.title;
    docSelect.appendChild(opt);
  });
  renderDocMeta();
  renderSuggestions();
}
function renderDocMeta() {
  const v = docSelect.value;
  if (v === "both") {
    const total = Object.values(docsMeta).reduce((s, d) => s + d.words, 0);
    docMeta.innerHTML = `Searching <b>${Object.keys(docsMeta).length} documents</b> · ${total.toLocaleString()} words indexed`;
  } else {
    const d = docsMeta[v];
    docMeta.innerHTML = `<b>${d.title}</b> · ${d.subtitle} · ${d.words.toLocaleString()} words`;
  }
}
function renderSuggestions() {
  const list = SUGGESTIONS[docSelect.value] || SUGGESTIONS.both;
  suggestionsEl.innerHTML = "";
  list.forEach((q) => {
    const c = document.createElement("button");
    c.className = "chip";
    c.textContent = q;
    c.onclick = () => {
      questionEl.value = q;
      ask();
    };
    suggestionsEl.appendChild(c);
  });
}
docSelect.addEventListener("change", () => {
  renderDocMeta();
  renderSuggestions();
});

async function ask() {
  const question = questionEl.value.trim();
  if (!question) return;
  askBtn.disabled = true;
  answerEl.className = "answer";
  answerEl.innerHTML = `<div class="spinner">Reading the document</div>`;
  answerEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    const headers = { "Content-Type": "application/json" };
    const code = localStorage.getItem("specExplorerCode");
    if (code) headers["x-access-code"] = code;
    let r = await fetch("/api/query", {
      method: "POST",
      headers,
      body: JSON.stringify({ question, docId: docSelect.value }),
    });
    if (r.status === 401) {
      const entered = prompt("This demo asks for an access code before running an AI query (it protects the API key). Enter the code:");
      if (!entered) throw new Error("An access code is required to run queries.");
      localStorage.setItem("specExplorerCode", entered.trim());
      headers["x-access-code"] = entered.trim();
      r = await fetch("/api/query", {
        method: "POST",
        headers,
        body: JSON.stringify({ question, docId: docSelect.value }),
      });
      if (r.status === 401) {
        localStorage.removeItem("specExplorerCode");
        throw new Error("That access code was not accepted.");
      }
    }
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "request failed");
    const names = j.docsSearched.map((id) => (docsMeta[id] ? docsMeta[id].title : id)).join(", ");
    answerEl.className = "answer";
    answerEl.innerHTML = `
      <div class="a-meta">
        <span class="pill">${j.model}</span>
        <span>searched: ${names}</span>
      </div>
      <div class="a-body">${formatAnswer(j.answer)}</div>`;
  } catch (e) {
    answerEl.className = "answer error";
    answerEl.innerHTML = `<div class="a-body">⚠ ${e.message}</div>`;
  } finally {
    askBtn.disabled = false;
  }
}
function formatAnswer(text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
askBtn.addEventListener("click", ask);
questionEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ask();
});

// ---------- Figure panel ----------
const FIGURES = [
  { key: "figure15", tab: "Figure 15", label: "Stored Energy Operating Mechanism", page: "p.12" },
  { key: "figure17", tab: "Figure 17", label: "Operator Sequential Operation Diagram", page: "p.15" },
];
const figureSwitch = document.getElementById("figureSwitch");
const figureImg = document.getElementById("figureImg");
const figureTitle = document.getElementById("figureTitle");
const figureCaption = document.getElementById("figureCaption");
const hotspotLayer = document.getElementById("hotspotLayer");
const legendList = document.getElementById("legendList");
const partDetail = document.getElementById("partDetail");
const askAboutPart = document.getElementById("askAboutPart");

let activeHotspot = null;
let currentPart = null;
let currentFigure = null;

function buildFigureSwitch() {
  FIGURES.forEach((f, i) => {
    const b = document.createElement("button");
    b.className = "fig-btn" + (i === 0 ? " active" : "");
    b.dataset.key = f.key;
    b.innerHTML = `<b>${f.tab}</b> <span>${f.label}</span> <em>${f.page}</em>`;
    b.onclick = () => {
      document.querySelectorAll(".fig-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      loadFigure(f.key);
    };
    figureSwitch.appendChild(b);
  });
}

async function loadFigure(key) {
  const fig = await (await fetch(`/data/${key}.json`)).json();
  currentFigure = fig;
  const meta = FIGURES.find((f) => f.key === key);
  figureImg.src = `/data/${fig.image}`;
  figureTitle.textContent = fig.title;
  figureCaption.textContent = fig.source;
  hotspotLayer.innerHTML = "";
  legendList.innerHTML = "";
  resetDetail();

  const isRect = fig.shape === "rect";
  hotspotLayer.classList.toggle("rects", isRect);

  fig.hotspots.forEach((h) => {
    const b = document.createElement("button");
    b.dataset.id = h.id;
    if (isRect) {
      b.className = "hotspot rect" + (h.undefined ? " undefined" : "");
      b.style.left = h.x + "%";
      b.style.top = h.y + "%";
      b.style.width = h.w + "%";
      b.style.height = h.h + "%";
      b.innerHTML = `<span class="rtip">${h.name}</span>`;
    } else {
      b.className = "hotspot" + (h.undefined ? " undefined" : "");
      b.style.left = h.x + "%";
      b.style.top = h.y + "%";
      b.innerHTML = `${h.id}<span class="htip">${h.id} · ${h.name}</span>`;
    }
    b.onclick = () => selectPart(h, b);
    hotspotLayer.appendChild(b);

    const li = document.createElement("li");
    if (h.undefined) li.className = "is-undefined";
    li.innerHTML = `<span class="lid">${h.id}</span><span>${h.name}</span>`;
    li.onclick = () => selectPart(h, b);
    legendList.appendChild(li);
  });
}

function resetDetail() {
  currentPart = null;
  activeHotspot = null;
  partDetail.className = "part-detail empty";
  partDetail.innerHTML = "<p>Nothing selected yet — click a region on the diagram or a row in the list.</p>";
  askAboutPart.classList.add("hidden");
}

function selectPart(h, btn) {
  currentPart = h;
  if (activeHotspot) activeHotspot.classList.remove("active");
  btn.classList.add("active");
  activeHotspot = btn;
  const idBadge = /^[A-Z]/.test(h.id) ? "" : `<span class="pd-id">${h.id}</span>`;
  partDetail.className = "part-detail";
  partDetail.innerHTML = `
    ${idBadge}
    <p class="pd-name">${h.name}</p>
    <p class="pd-desc">${h.desc}</p>
    ${h.undefined ? '<p class="pd-warn">⚠ Not verified against the printed legend.</p>' : ""}`;
  askAboutPart.classList.toggle("hidden", !!h.undefined);
  btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

askAboutPart.addEventListener("click", () => {
  if (!currentPart) return;
  switchTab("ask");
  docSelect.value = "siemens";
  renderDocMeta();
  renderSuggestions();
  const fig = currentFigure ? currentFigure.title : "the diagram";
  questionEl.value = `In the Type 38-3AF operating mechanism (${fig}), explain "${currentPart.name}" (${currentPart.id}) and how it fits into the sequence.`;
  ask();
});

loadDocs();
buildFigureSwitch();
loadFigure("figure15");

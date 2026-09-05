const STORAGE_KEY = "dea-c01-current-question";

const elements = {
  number: document.querySelector("#question-number"),
  count: document.querySelector("#question-count"),
  progress: document.querySelector("#progress-bar"),
  body: document.querySelector("#question-body"),
  loading: document.querySelector("#loading-state"),
  content: document.querySelector("#question-content"),
  stem: document.querySelector("#question-stem"),
  options: document.querySelector("#options-list"),
  answerPanel: document.querySelector("#answer-panel"),
  answerValue: document.querySelector("#answer-value"),
  answerNote: document.querySelector("#answer-note"),
  error: document.querySelector("#error-state"),
  errorMessage: document.querySelector("#error-message"),
  actions: document.querySelector("#question-actions"),
  reveal: document.querySelector("#reveal-button"),
  explanation: document.querySelector("#explanation-button"),
  next: document.querySelector("#next-button"),
  retry: document.querySelector("#retry-button"),
  dialog: document.querySelector("#explanation-dialog"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogAnswer: document.querySelector("#dialog-answer"),
  dialogContent: document.querySelector("#dialog-content"),
  closeDialog: document.querySelector("#close-dialog-button"),
  dialogDone: document.querySelector("#dialog-done-button"),
};

let manifest = [];
let currentIndex = 0;
let currentQuestion = null;
let loadController = null;

function readSavedQuestion() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveQuestion(id) {
  try {
    localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // The site still works when browser privacy settings disable localStorage.
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInline(source) {
  const codeTokens = [];
  let html = escapeHtml(source).replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });

  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  codeTokens.forEach((value, index) => {
    html = html.replace(`@@CODE${index}@@`, value);
  });
  return html;
}

function renderMarkdown(source) {
  const lines = source.trim().split(/\r?\n/);
  const output = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType) return;
    output.push(`<${listType}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const unordered = trimmed.match(/^[-*]\s+(.+)/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)/);
    const quote = trimmed.match(/^>\s?(.*)/);

    if (!trimmed) {
      flushParagraph();
      flushList();
    } else if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? "ul" : "ol";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((unordered || ordered)[1]);
    } else if (quote) {
      flushParagraph();
      flushList();
      output.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
    } else {
      flushList();
      paragraph.push(trimmed);
    }
  });

  flushParagraph();
  flushList();
  return output.join("");
}

function extractSection(markdown, heading, nextHeading) {
  const startMarker = `## ${heading}`;
  const start = markdown.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing “${heading}” section.`);

  const contentStart = start + startMarker.length;
  const end = nextHeading ? markdown.indexOf(`## ${nextHeading}`, contentStart) : markdown.length;
  return markdown.slice(contentStart, end === -1 ? markdown.length : end).trim();
}

function parseOptions(source) {
  const matches = [...source.matchAll(/(?:^|\n)\*\*([A-Z])\.\*\*\s*([\s\S]*?)(?=\n\s*\n\*\*[A-Z]\.\*\*|\s*$)/g)];
  if (!matches.length) throw new Error("No answer options were found.");
  return matches.map((match) => ({ letter: match[1], text: match[2].trim() }));
}

function parseQuestion(markdown, fallbackId) {
  const normalized = markdown.replaceAll("\r\n", "\n");
  const titleMatch = normalized.match(/^# Question\s+(\d+)\s*$/m);
  const titlePosition = titleMatch ? titleMatch.index : -1;
  const preamble = titlePosition > 0 ? normalized.slice(0, titlePosition).trim() : "";
  const answerRaw = extractSection(normalized, "答案", "讲解");
  const answer = answerRaw.replace(/[^A-Z]/g, "");

  return {
    id: titleMatch ? Number(titleMatch[1]) : fallbackId,
    stem: extractSection(normalized, "题目", "选项"),
    options: parseOptions(extractSection(normalized, "选项", "答案")),
    answer,
    explanation: extractSection(normalized, "讲解"),
    preamble,
  };
}

function getRequestedId() {
  const queryValue = new URLSearchParams(window.location.search).get("q");
  const storedValue = readSavedQuestion();
  const queryId = queryValue === null ? NaN : Number(queryValue);
  const storedId = storedValue === null ? NaN : Number(storedValue);
  if (Number.isInteger(queryId) && queryId > 0) return queryId;
  if (Number.isInteger(storedId) && storedId > 0) return storedId;
  return manifest[0]?.id ?? 1;
}

function setLoading(isLoading) {
  elements.loading.hidden = !isLoading;
  elements.content.hidden = isLoading;
  elements.actions.hidden = isLoading;
  elements.error.hidden = true;
}

function setError(error) {
  elements.loading.hidden = true;
  elements.content.hidden = true;
  elements.actions.hidden = true;
  elements.error.hidden = false;
  elements.errorMessage.textContent = error.message || "Please check that the site is being served by a web server.";
}

function renderOptions(options, answer) {
  elements.options.replaceChildren();
  options.forEach((option) => {
    const row = document.createElement("div");
    row.className = "option";
    row.dataset.letter = option.letter;
    row.setAttribute("role", "listitem");
    row.innerHTML = `
      <span class="option-letter">${option.letter}</span>
      <div class="option-text markdown">${renderMarkdown(option.text)}</div>
      <svg class="option-check" aria-hidden="true" viewBox="0 0 24 24"><path d="M9.2 16.2 4.8 11.8l-1.4 1.4L9.2 19 21 7.2l-1.4-1.4-10.4 10.4Z"/></svg>
    `;
    row.dataset.correct = answer.includes(option.letter) ? "true" : "false";
    elements.options.append(row);
  });
}

function revealAnswer() {
  if (!currentQuestion) return;
  elements.answerPanel.hidden = false;
  elements.reveal.disabled = true;
  elements.reveal.querySelector("span").textContent = "Answer revealed";
  elements.options.querySelectorAll('[data-correct="true"]').forEach((option) => option.classList.add("is-correct"));
  elements.answerPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function openExplanation() {
  if (!currentQuestion) return;
  elements.dialogTitle.textContent = `Question ${currentQuestion.id} explanation`;
  elements.dialogAnswer.textContent = `Reviewed answer: ${currentQuestion.answer.split("").join(" + ")}`;
  elements.dialogContent.innerHTML = renderMarkdown(currentQuestion.explanation);
  if (typeof elements.dialog.showModal === "function") {
    elements.dialog.showModal();
  } else {
    elements.dialog.setAttribute("open", "");
  }
}

function closeExplanation() {
  if (typeof elements.dialog.close === "function") elements.dialog.close();
  else elements.dialog.removeAttribute("open");
}

function updateUrl(id, method = "replaceState") {
  const url = new URL(window.location.href);
  url.searchParams.set("q", String(id));
  history[method]({ questionId: id }, "", url);
}

async function loadQuestion(id, options = {}) {
  const requestedIndex = manifest.findIndex((item) => item.id === id);
  currentIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const item = manifest[currentIndex];

  loadController?.abort();
  loadController = new AbortController();
  setLoading(true);
  closeExplanation();
  window.scrollTo({ top: 0, behavior: "instant" });

  try {
    const response = await fetch(`./${item.file}`, { signal: loadController.signal });
    if (!response.ok) throw new Error(`Question file returned HTTP ${response.status}.`);
    currentQuestion = parseQuestion(await response.text(), item.id);

    elements.number.textContent = `#${currentQuestion.id}`;
    elements.count.textContent = `${currentIndex + 1} / ${manifest.length}`;
    elements.progress.style.width = `${((currentIndex + 1) / manifest.length) * 100}%`;
    elements.stem.innerHTML = renderMarkdown(currentQuestion.stem);
    renderOptions(currentQuestion.options, currentQuestion.answer);
    elements.answerValue.textContent = currentQuestion.answer.split("").join(" + ");
    elements.answerPanel.hidden = true;
    elements.answerNote.hidden = !currentQuestion.preamble;
    elements.answerNote.innerHTML = currentQuestion.preamble ? renderMarkdown(currentQuestion.preamble) : "";
    elements.reveal.disabled = false;
    elements.reveal.querySelector("span").textContent = "Reveal answer";

    const isLast = currentIndex === manifest.length - 1;
    elements.next.disabled = isLast;
    elements.next.querySelector("span").textContent = isLast ? "All questions complete" : "Next question";

    saveQuestion(currentQuestion.id);
    if (!options.fromHistory) updateUrl(currentQuestion.id, options.pushHistory ? "pushState" : "replaceState");
    document.title = `Question ${currentQuestion.id} · DEA-C01 Study`;
    elements.loading.hidden = true;
    elements.content.hidden = false;
    elements.actions.hidden = false;
  } catch (error) {
    if (error.name !== "AbortError") setError(error);
  }
}

async function initialize() {
  try {
    const response = await fetch("./manifest.json");
    if (!response.ok) throw new Error(`Manifest returned HTTP ${response.status}.`);
    manifest = await response.json();
    if (!Array.isArray(manifest) || !manifest.length) throw new Error("The question manifest is empty.");
    await loadQuestion(getRequestedId());
  } catch (error) {
    setError(error);
  }
}

elements.reveal.addEventListener("click", revealAnswer);
elements.explanation.addEventListener("click", openExplanation);
elements.next.addEventListener("click", () => {
  const nextItem = manifest[currentIndex + 1];
  if (nextItem) loadQuestion(nextItem.id, { pushHistory: true });
});
elements.retry.addEventListener("click", () => {
  if (manifest.length) loadQuestion(manifest[currentIndex]?.id ?? manifest[0].id);
  else initialize();
});
elements.closeDialog.addEventListener("click", closeExplanation);
elements.dialogDone.addEventListener("click", closeExplanation);
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) closeExplanation();
});
window.addEventListener("popstate", () => {
  if (!manifest.length) return;
  loadQuestion(getRequestedId(), { fromHistory: true });
});

initialize();

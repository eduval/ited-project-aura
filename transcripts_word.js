// js/transcripts_word.js
// Grouped view for Word transcripts (one row per batch -> expand to see .doc/.docx files)

import { db } from "./firebase-config.js";
import { ref as dbRef, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/**
 * IMPORTANT: Word files live under the same web root as the Excel outputs.
 * RTDB stores relative paths like: "word_transcripts/CT1010001.docx"
 * So the correct base is the shared upload root:
 *   https://ited.org.ec/aura/excelfiles_upload/
 */
const CDN_BASE = "https://ited.org.ec/aura/excelfiles_upload/";

// ---------- CSS.escape fallback ----------
const cssEscape = (sel) => {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(sel);
  return String(sel).replace(/[^a-zA-Z0-9_\-]/g, (c) => `\\${c}`);
};

// ---------- DOM ----------
const el = {
  tbody: document.getElementById("tx-tbody"),
  empty: document.getElementById("tx-empty"),
  search: document.getElementById("tx-search"),
  sort: document.getElementById("tx-sort"),
  count: document.getElementById("tx-count"),
  pagination: document.getElementById("tx-pagination"),
};

if (!el.tbody || !el.count || !el.pagination) {
  console.warn("[transcripts_word] Required DOM nodes not found; abort.");
} else {
  main().catch((e) => {
    console.error("[transcripts_word] fatal init", e);
    showEmpty("⚠️ Couldn’t load transcripts module. Check console for details.");
  });
}

// ---------- State ----------
const PAGE_SIZE = 10;
let allGroups = [];   // [{batchId, dateProcessed, operatorIP, files:[{name,url,size}] , totalSize}]
let filteredGroups = [];
let currentPage = 1;

// ---------- Utils ----------
const esc = (s) =>
  (s ?? "").toString().replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));

function publicUrl(relPath) {
  // relPath expected like "word_transcripts/CT1010001.docx"
  const clean = String(relPath || "").replace(/^\/+/, "");
  // Avoid accidental double slashes if base already ends with /
  return (CDN_BASE.endsWith("/") ? CDN_BASE : CDN_BASE + "/") + encodeURI(clean);
}

// Prefer explicit ISO timestamp on the batch. If missing, fall back to batchId last part (epoch).
function dateFromBatch(batchId, batchVal) {
  const tsStr = batchVal?.timestamp; // e.g. "2025-08-14T10:05:00.784348-07:00"
  if (tsStr) {
    const d = new Date(tsStr);
    if (!isNaN(d)) return fmtDateTime(d);
  }
  // fallback: epoch suffix on batchId
  const parts = String(batchId).split("_");
  const last = parts[parts.length - 1];
  const ts = /^\d+$/.test(last) ? Number(last) : NaN;
  if (isFinite(ts)) return fmtDateTime(new Date(ts * 1000));
  // fallback2: if batchId looks like YYYY_MM_DD...
  if (parts.length >= 3 && /^\d{4}$/.test(parts[0])) return `${parts[0]}-${parts[1]}-${parts[2]} 00:00:00`;
  return "-";
}

function fmtDateTime(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function epochFromBatch(batchId, batchVal) {
  if (batchVal?.timestamp) {
    const d = new Date(batchVal.timestamp);
    if (!isNaN(d)) return Math.floor(d.getTime() / 1000);
  }
  const parts = String(batchId).split("_");
  const last = parts[parts.length - 1];
  const ts = /^\d+$/.test(last) ? Number(last) : NaN;
  return isFinite(ts) ? ts : 0;
}

function humanSize(n) {
  const b = Number(n) || 0;
  if (b <= 0) return "—";
  const units = ["B","KB","MB","GB","TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function showEmpty(msg) {
  if (!el.empty) return;
  el.tbody.innerHTML = "";
  el.empty.classList.remove("d-none");
  el.empty.textContent = msg;
  el.count.textContent = "0 items";
  el.pagination.innerHTML = "";
}

// ---------- Render ----------
function parentRowHTML(g) {
  const statusBadge = `<span class="badge bg-success-soft text-success">Completed</span>`;
  return `
    <tr class="tx-parent" data-batch="${esc(g.batchId)}">
      <td><div class="fw-medium">${esc(g.batchId)}</div></td>
      <td style="width:200px">${esc(g.dateProcessed)}</td>
      <td style="width:320px">${esc(g.operatorIP || "—")}</td>
      <td style="width:120px">${statusBadge}</td>
      <td class="text-end" style="width:120px">
        <button class="btn btn-sm btn-primary btn-toggle" data-batch="${esc(g.batchId)}">Expand</button>
      </td>
    </tr>
    <tr class="tx-child-row d-none" data-child-of="${esc(g.batchId)}">
      <td colspan="5">
        ${childBoxHTML(g)}
      </td>
    </tr>
  `;
}

function childBoxHTML(g) {
  if (!g.files?.length) return `<div class="text-muted">No files in this batch.</div>`;

  const items = g.files.map((f, idx) => {
    const shownName = f.name?.split("/").pop() || f.name || `File ${idx + 1}`;
    const sizeTxt = humanSize(f.size);
    return `
      <div class="d-flex align-items-center justify-content-between py-2 border-bottom">
        <div class="d-flex align-items-center gap-2">
          <input class="form-check-input tx-file-check" type="checkbox" data-batch="${esc(g.batchId)}" data-index="${idx}">
          <div class="fw-medium">${esc(shownName)}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <a class="btn btn-sm btn-outline-primary" href="${esc(f.url)}" download>Download</a>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="p-3 rounded border">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="fw-medium">Files in ${esc(g.batchId)}</div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-primary tx-download-selected" data-batch="${esc(g.batchId)}">Download Selected</button>
        </div>
      </div>
      <div class="border rounded">
        ${items}
      </div>
    </div>
  `;
}

function render() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredGroups.slice(start, start + PAGE_SIZE);

  el.tbody.innerHTML = pageItems.map(parentRowHTML).join("");
  el.count.textContent = `${filteredGroups.length} item${filteredGroups.length !== 1 ? "s" : ""}`;
  if (el.empty) el.empty.classList.toggle("d-none", filteredGroups.length > 0);

  const pages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  let html = "";
  if (pages > 1 && currentPage > 1) {
    html += `<li class="page-item"><a class="page-link" href="#" data-page="${currentPage - 1}">&laquo;</a></li>`;
  }
  const windowSize = 5;
  const half = Math.floor(windowSize / 2);
  let startPage = Math.max(1, currentPage - half);
  let endPage = Math.min(pages, startPage + windowSize - 1);
  if (endPage - startPage + 1 < windowSize) startPage = Math.max(1, endPage - windowSize + 1);
  for (let i = startPage; i <= endPage; i++) {
    html += `<li class="page-item ${i === currentPage ? "active" : ""}">
      <a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
  }
  if (pages > 1 && currentPage < pages) {
    html += `<li class="page-item"><a class="page-link" href="#" data-page="${currentPage + 1}">&raquo;</a></li>`;
  }
  el.pagination.innerHTML = html;
}

// ---------- Search + Sort ----------
function filterAndSort() {
  const q = (el.search?.value || "").toLowerCase().trim();
  const sortVal = el.sort?.value || "date_desc";

  filteredGroups = allGroups.filter((g) => {
    if (!q) return true;
    const inBatch = g.batchId.toLowerCase().includes(q)
      || (g.operatorIP || "").toLowerCase().includes(q)
      || (g.dateProcessed || "").toLowerCase().includes(q);
    const inFiles = g.files?.some((f) => (f.name || "").toLowerCase().includes(q));
    return inBatch || inFiles;
  });

  if (sortVal === "date_asc") {
    filteredGroups.sort((a, b) => epochFromBatch(a.batchId, a._raw) - epochFromBatch(b.batchId, b._raw));
  } else {
    filteredGroups.sort((a, b) => epochFromBatch(b.batchId, b._raw) - epochFromBatch(a.batchId, a._raw));
  }

  currentPage = 1;
  render();
}

// ---------- Pagination click ----------
function paginateClick(e) {
  const a = e.target.closest?.("a[data-page]");
  if (!a) return;
  e.preventDefault();
  const p = parseInt(a.dataset.page, 10);
  const pages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  if (p >= 1 && p <= pages) {
    currentPage = p;
    render();
  }
}

// ---------- Expand / Collapse / Batch downloads ----------
function onTbodyClick(e) {
  const toggleBtn = e.target.closest(".btn-toggle");
  if (toggleBtn) {
    const batch = toggleBtn.dataset.batch;
    const childRow = el.tbody.querySelector(`.tx-child-row[data-child-of="${cssEscape(batch)}"]`);
    if (!childRow) return;
    const isCollapsed = childRow.classList.contains("d-none");
    childRow.classList.toggle("d-none", !isCollapsed);
    toggleBtn.textContent = isCollapsed ? "Collapse" : "Expand";
  }

  const dlSelBtn = e.target.closest(".tx-download-selected");
  if (dlSelBtn) {
    const batch = dlSelBtn.dataset.batch;
    const childRow = el.tbody.querySelector(`.tx-child-row[data-child-of="${cssEscape(batch)}"]`);
    if (!childRow) return;
    const checks = childRow.querySelectorAll(".tx-file-check:checked");
    if (!checks.length) { alert("Select at least one file."); return; }

    let delay = 0;
    checks.forEach((cb) => {
      const idx = Number(cb.dataset.index);
      const group = allGroups.find((g) => g.batchId === batch);
      const file = group?.files?.[idx];
      if (!file?.url) return;

      setTimeout(() => {
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = file.url;
        document.body.appendChild(iframe);
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch(_) {}
        }, 8000);
      }, delay);

      // uncheck after triggering download
      cb.checked = false;

      delay += 350;
    });
  }
}

// ---------- Data load ----------
async function buildGroups() {
  try {
    const snap = await get(dbRef(db, "transcripts"));
    if (!snap.exists()) { showEmpty("📂 No transcripts found."); return; }
    const data = snap.val();

    // newest first using timestamp/epoch
    const batchEntries = Object.entries(data).sort((a, b) =>
      epochFromBatch(b[0], b[1]) - epochFromBatch(a[0], a[1])
    );

    const groups = [];
    for (const [batchId, batchVal] of batchEntries) {
      const operatorIP = batchVal?.operatorIP || "";
      const dateProcessed = dateFromBatch(batchId, batchVal);

      const wordFiles = batchVal?.wordFiles || {};
      const wfEntries = Object.entries(wordFiles).sort((a, b) => a[0].localeCompare(b[0]));

      const files = wfEntries.map(([k, file]) => {
        const name = file?.name || `File ${k}`;
        const rel = (file?.path || "").replace(/^\/+/, "");
        const url = rel ? publicUrl(rel) : "";
        const size = Number(file?.size || 0);
        return { name, url, size };
      });

      const totalSize = files.reduce((acc, f) => acc + (Number(f.size) || 0), 0);
      groups.push({ batchId, dateProcessed, operatorIP, files, totalSize, _raw: batchVal });
    }

    allGroups = groups;
    if (!allGroups.length) { showEmpty("📂 No transcripts found."); return; }
    filterAndSort();
  } catch (err) {
    console.error("[transcripts_word] buildGroups error", err);
    showEmpty("⚠️ Error loading transcripts. See console.");
  }
}

// ---------- Init ----------
async function main() {
  el.search?.addEventListener("input", filterAndSort);
  el.sort?.addEventListener("change", filterAndSort);
  el.pagination?.addEventListener("click", paginateClick);
  el.tbody?.addEventListener("click", onTbodyClick);
  await buildGroups();
}

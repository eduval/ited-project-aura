// js/transcripts_excel.js
// Grouped view: one row per batch (expand to see processed files inside).
// Data from RTDB; file downloads are served by your web host (not Firebase Storage).

import { db } from "./firebase-config.js";
import { ref as dbRef, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ====== server folder for processed files ======
const CDN_BASE = "https://ited.org.ec/aura/excelfiles_upload/transcripts_output/";

// ---------- CSS.escape fallback (just in case) ----------
const cssEscape = (sel) => {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(sel);
  return String(sel).replace(/[^a-zA-Z0-9_\-]/g, (c) => `\\${c}`);
};

// ---------- DOM ----------
const el = {
  tbody: document.getElementById("tx-tbody"),
  empty: document.getElementById("tx-empty"),
  search: document.getElementById("tx-search"),
  sort: document.getElementById("tx-sort"), // may be null – handled
  count: document.getElementById("tx-count"),
  pagination: document.getElementById("tx-pagination"),
};

if (!el.tbody || !el.count || !el.pagination) {
  console.warn("[transcripts_excel] Required DOM nodes not found; abort.");
} else {
  main().catch((e) => {
    console.error("[transcripts_excel] fatal init", e);
    showEmpty("⚠️ Couldn’t load transcripts module. Check console for details.");
  });
}

// ---------- State ----------
const PAGE_SIZE = 10; // batches per page
let allGroups = [];   // [{batchId, dateProcessed, operatorIP, files:[...], totalSize}]
let filteredGroups = [];
let currentPage = 1;

// ---------- Utils ----------
const esc = (s) =>
  (s ?? "").toString().replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));

function publicUrl(relPath) {
  const clean = String(relPath || "").replace(/^\/+/, "");
  return CDN_BASE + encodeURI(clean);
}

function parseBatchDate(batchId) {
  const parts = String(batchId).split("_");
  const last = parts[parts.length - 1];
  const ts = /^\d+$/.test(last) ? Number(last) : NaN;

  if (isFinite(ts)) {
    const d = new Date(ts * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }
  if (parts.length >= 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
  return "-";
}

function byEpoch(batchId) {
  const parts = String(batchId).split("_");
  const last = parts[parts.length - 1];
  const ts = /^\d+$/.test(last) ? Number(last) : NaN;
  return isFinite(ts) ? ts : 0;
}

function humanSize(n) {
  const b = Number(n) || 0;
  if (b <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
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
      <td style="width:180px">${esc(g.dateProcessed)}</td>
      <td style="width:320px">${esc(g.operatorIP || "—")}</td>
      <td style="width:120px">${statusBadge}</td>
      <td class="text-end" style="width:130px">
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
  if (!g.files?.length) {
    return `<div class="text-muted">No files in this batch.</div>`;
  }

  const items = g.files.map((f, idx) => {
    const shownName = f.name?.split("/").pop() || f.name || `File ${idx + 1}`;
    const sizeTxt = humanSize(f.size);
    return `
      <div class="d-flex align-items-center justify-content-between py-2 border-bottom">
        <label class="d-flex align-items-center gap-3 mb-0">
          <input class="form-check-input tx-file-check" type="checkbox"
                 data-batch="${esc(g.batchId)}" data-index="${idx}">
          <span class="fw-medium">${esc(shownName)}</span>
        </label>
        <div class="small text-muted me-3">${sizeTxt}</div>
        <a class="btn btn-sm btn-outline-primary" href="${esc(f.url)}" download>Download</a>
      </div>
    `;
  }).join("");

  return `
    <div class="p-3 rounded border">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="fw-medium">Files in ${esc(g.batchId)}</div>
        <button class="btn btn-sm btn-primary tx-download-selected" data-batch="${esc(g.batchId)}">
          Download Selected
        </button>
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
  const chunkSize = 5;
  const chunkStart = Math.floor((currentPage - 1) / chunkSize) * chunkSize + 1;
  const chunkEnd = Math.min(chunkStart + chunkSize - 1, pages);

  let html = "";

  // Show << only if not on the first chunk
  if (chunkStart > 1) {
    html += `
      <li class="page-item">
        <a class="page-link fw-bold text-dark" style="color:#333 !important;" 
           href="#" data-page="${Math.max(1, chunkStart - chunkSize)}">&laquo;</a>
      </li>
    `;
  }

  // Page numbers
  for (let i = chunkStart; i <= chunkEnd; i++) {
    html += `
      <li class="page-item ${i === currentPage ? "active" : ""}">
        <a class="page-link fw-bold" href="#" data-page="${i}">${i}</a>
      </li>
    `;
  }

  // Show >> only if there are more chunks ahead
  if (chunkEnd < pages) {
    html += `
      <li class="page-item">
        <a class="page-link fw-bold text-dark" style="color:#333 !important;" 
           href="#" data-page="${Math.min(pages, chunkStart + chunkSize)}">&raquo;</a>
      </li>
    `;
  }

  el.pagination.innerHTML = html;
}



// ---------- Search + Sort ----------
function filterAndSort() {
  const q = (el.search?.value || "").toLowerCase().trim();
  const sortVal = el.sort?.value || "date_desc"; // only date_asc/desc in UI

  filteredGroups = allGroups.filter((g) => {
    if (!q) return true;
    const inBatch =
      g.batchId.toLowerCase().includes(q) ||
      (g.operatorIP || "").toLowerCase().includes(q) ||
      (g.dateProcessed || "").toLowerCase().includes(q);
    const inFiles = g.files?.some((f) => (f.name || "").toLowerCase().includes(q));
    return inBatch || inFiles;
  });

  if (sortVal === "date_asc") {
    filteredGroups.sort((a, b) => byEpoch(a.batchId) - byEpoch(b.batchId));
  } else {
    filteredGroups.sort((a, b) => byEpoch(b.batchId) - byEpoch(a.batchId));
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

// ---------- Expand/Collapse + Batch downloads ----------
function onTbodyClick(e) {
  // single toggle (Expand <-> Collapse)
  const toggleBtn = e.target.closest(".btn-toggle");
  if (toggleBtn) {
    const batch = toggleBtn.dataset.batch;
    const childRow = el.tbody.querySelector(
      `.tx-child-row[data-child-of="${cssEscape(batch)}"]`
    );
    if (!childRow) return;

    const willExpand = childRow.classList.contains("d-none");
    childRow.classList.toggle("d-none", !willExpand);

    // keep consistent styling (always primary/blue)
    toggleBtn.classList.add("btn-primary");
    toggleBtn.classList.remove("btn-secondary");
    toggleBtn.textContent = willExpand ? "Collapse" : "Expand";
    return;
  }

  // download selected within an expanded batch
  const dlSelBtn = e.target.closest(".tx-download-selected");
  if (dlSelBtn) {
    const batch = dlSelBtn.dataset.batch;
    const childRow = el.tbody.querySelector(
      `.tx-child-row[data-child-of="${cssEscape(batch)}"]`
    );
    if (!childRow) return;

    const checks = childRow.querySelectorAll(".tx-file-check:checked");
    if (!checks.length) {
      alert("Select at least one file.");
      return;
    }
    
      // Optional: visual feedback while queuing downloads
    const oldText = dlSelBtn.textContent;
    dlSelBtn.disabled = true;
    dlSelBtn.textContent = "Downloading...";



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
          try { document.body.removeChild(iframe); } catch (_) {}
        }, 8000);
      }, delay);

      delay += 350;
    });
    // ✅ Immediately return UI to normal: uncheck all selected boxes
    checks.forEach((cb) => { cb.checked = false; });

  // Restore button after a short moment
    setTimeout(() => {
      dlSelBtn.disabled = false;
      dlSelBtn.textContent = oldText;
    }, 800);
    return;
  }
}

// ---------- Data load ----------
async function buildGroups() {
  try {
    const snap = await get(dbRef(db, "transcripts"));
    if (!snap.exists()) {
      showEmpty("📂 No transcripts found.");
      return;
    }
    const data = snap.val();

    // newest-first by epoch
    const batchEntries = Object.entries(data).sort((a, b) => byEpoch(b[0]) - byEpoch(a[0]));
    const groups = [];

    for (const [batchId, batchVal] of batchEntries) {
      const operatorIP = batchVal?.operatorIP || "";
      const dateProcessed = parseBatchDate(batchId);

      const excelFiles = batchVal?.excelFiles || {};
      const efEntries = Object.entries(excelFiles).sort((a, b) => a[0].localeCompare(b[0]));

      const files = efEntries.map(([k, file]) => {
        const name = file?.name || `File ${k}`;
        const rel = (file?.path || "").replace(/^\/+/, "");
        const url = rel ? publicUrl(rel) : "";
        const size = Number(file?.size || 0); // optional
        return { name, url, size };
      });

      const totalSize = files.reduce((acc, f) => acc + (Number(f.size) || 0), 0);
      groups.push({ batchId, dateProcessed, operatorIP, files, totalSize });
    }

    allGroups = groups;
    filterAndSort();
  } catch (err) {
    console.error("[transcripts_excel] buildGroups error", err);
    showEmpty("⚠️ Error loading transcripts. See console.");
  }
}

// ---------- Init ----------
async function main() {
  el.search?.addEventListener("input", filterAndSort);
  el.sort?.addEventListener("change", filterAndSort); // safe if control is null
  el.pagination?.addEventListener("click", paginateClick);
  el.tbody?.addEventListener("click", onTbodyClick);

  await buildGroups();
}

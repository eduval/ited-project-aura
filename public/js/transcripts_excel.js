// js/transcripts_excel.js
// Build the Transcripts (Excel) table from RTDB and link to server files (no Firebase Storage).

import { db } from "./firebase-config.js";
import { ref as dbRef, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// === change this to match your server folder for processed files ===
const CDN_BASE = "https://ited.org.ec/aura/excelfiles_upload/transcripts_output/";
// If later you move it back to "outputs", just switch the line above.

// ---------- DOM ----------
const el = {
    tbody: document.getElementById("tx-tbody"),
    empty: document.getElementById("tx-empty"),
    search: document.getElementById("tx-search"),
    filterStatus: document.getElementById("tx-filter-status"),
    selectAll: document.getElementById("tx-select-all"),
    downloadSelected: document.getElementById("btn-download-selected"),
    count: document.getElementById("tx-count"),
    pagination: document.getElementById("tx-pagination"),
};

// Guard
if (!el.tbody || !el.count || !el.pagination) {
    console.warn("[transcripts_excel] Required DOM nodes not found; abort.");
} else {
    main().catch((e) => {
        console.error("[transcripts_excel] fatal init", e);
        showEmpty("⚠️ Couldn’t load transcripts module. Check console for details.");
    });
}

// ---------- State ----------
const PAGE_SIZE = 10;
let allRows = [];
let filtered = [];
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

// Build a public URL under your web host
function publicUrl(relPath) {
    const clean = String(relPath || "").replace(/^\/+/, ""); // trim leading slash
    return CDN_BASE + encodeURI(clean);
}

function parseBatchDate(batchId) {
    const parts = String(batchId).split("_");
    const last = parts[parts.length - 1];
    const ts = /^\d+$/.test(last) ? Number(last) : NaN;
    if (isFinite(ts)) return new Date(ts * 1000).toISOString().slice(0, 10);
    if (parts.length >= 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
    return "-";
}

function showEmpty(msg) {
    if (!el.empty) return;
    el.tbody.innerHTML = "";
    el.empty.classList.remove("d-none");
    el.empty.textContent = msg;
    el.count.textContent = "0 items";
    el.pagination.innerHTML = "";
}

function rowHTML(r) {
    const statusBadge = `<span class="badge bg-success-soft text-success">Completed</span>`;
    const dl = r.downloadURL
        ? `<a class="btn btn-sm btn-primary btn-dl" href="${esc(r.downloadURL)}" download>Download</a>`
        : `<button class="btn btn-sm btn-secondary" disabled>Download</button>`;

    // show only filename (last segment)
    const shownName = r.name?.split("/").pop() || r.name || "";

    return `
    <tr data-id="${esc(r.id)}">
      <td><input type="checkbox" class="form-check-input row-check"></td>
      <td class="fw-medium">${esc(shownName)}</td>
      <td class="text-muted">${esc(r.origin)}</td>
      <td>${esc(r.dateProcessed)}</td>
      <td>${statusBadge}</td>
      <td class="text-end">${dl}</td>
    </tr>
  `;
}

function render() {
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    el.tbody.innerHTML = pageItems.map(rowHTML).join("");
    el.count.textContent = `${filtered.length} item${filtered.length !== 1 ? "s" : ""}`;
    el.empty?.classList.toggle("d-none", filtered.length > 0);

    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    let html = `
    <li class="page-item ${currentPage === 1 ? "disabled" : ""}">
      <a class="page-link" href="#" data-page="${currentPage - 1}">&laquo;</a>
    </li>`;
    for (let i = 1; i <= pages; i++) {
        html += `<li class="page-item ${i === currentPage ? "active" : ""}">
      <a class="page-link" href="#" data-page="${i}">${i}</a>
    </li>`;
    }
    html += `
    <li class="page-item ${currentPage === pages ? "disabled" : ""}">
      <a class="page-link" href="#" data-page="${currentPage + 1}">&raquo;</a>
    </li>`;
    el.pagination.innerHTML = html;
}

function filterNow() {
    const q = (el.search?.value || "").toLowerCase().trim();
    const s = (el.filterStatus?.value || "").toLowerCase();

    filtered = allRows.filter((r) => {
        const hay = `${r.name} ${r.origin} ${r.operatorIP}`.toLowerCase();
        const okText = !q || hay.includes(q);
        const okStatus = !s || s === "completed";
        return okText && okStatus;
    });

    currentPage = 1;
    render();
}

function paginateClick(e) {
    const a = e.target.closest?.("a[data-page]");
    if (!a) return;
    e.preventDefault();
    const p = parseInt(a.dataset.page, 10);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (p >= 1 && p <= pages) {
        currentPage = p;
        render();
    }
}

function getSelectedRows() {
    const ids = [];
    el.tbody.querySelectorAll("tr").forEach((tr) => {
        const cb = tr.querySelector(".row-check");
        if (cb && cb.checked) ids.push(tr.dataset.id);
    });
    return ids.map((id) => filtered.find((r) => r.id === id)).filter(Boolean);
}

// ----- Multi-download (hidden iframes to avoid popup blockers) -----
function downloadSelected() {
    const rows = getSelectedRows();
    if (rows.length === 0) {
        alert("Select at least one file.");
        return;
    }

    let delay = 0; // stagger the downloads to keep things smooth

    rows.forEach((r) => {
        if (!r?.downloadURL) return;

        setTimeout(() => {
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            iframe.src = r.downloadURL; // server should send Content-Disposition for nice filename
            document.body.appendChild(iframe);

            // Clean up after download starts
            setTimeout(() => {
                try { document.body.removeChild(iframe); } catch (_) { }
            }, 8000);
        }, delay);

        delay += 350; // 300–500ms is a good range
    });
}

// ---------- Data load ----------
async function buildRows() {
    const snap = await get(dbRef(db, "transcripts"));
    if (!snap.exists()) return showEmpty("📂 No transcripts found.");

    const batches = snap.val();
    const rows = [];

    // Newest-first by epoch suffix if present
    const batchEntries = Object.entries(batches).sort((a, b) => {
        const ta = Number(String(a[0]).split("_").pop()) || 0;
        const tb = Number(String(b[0]).split("_").pop()) || 0;
        return tb - ta;
    });

    for (const [batchId, batchVal] of batchEntries) {
        const operatorIP = batchVal?.operatorIP || "";
        const dateProcessed = parseBatchDate(batchId);
        const origin =
            batchVal?.sourceFileName ||
            batchVal?.originalFile ||
            batchVal?.source ||
            batchId;

        const excelFiles = batchVal?.excelFiles || {};
        const efEntries = Object.entries(excelFiles).sort((a, b) =>
            a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0
        );

        for (const [key, file] of efEntries) {
            const name = file?.name || `File ${key}`;
            const rel = (file?.path || "").replace(/^\/+/, "");
            const downloadURL = rel ? publicUrl(rel) : "";

            rows.push({
                id: `${batchId}::${key}`,
                name,
                origin,
                dateProcessed,
                operatorIP,
                downloadURL,
            });
        }
    }

    allRows = rows;
    filterNow();
}

// ---------- Init ----------
async function main() {
    el.search?.addEventListener("input", filterNow);
    el.filterStatus?.addEventListener("change", filterNow);
    el.pagination?.addEventListener("click", paginateClick);
    el.downloadSelected?.addEventListener("click", downloadSelected);
    el.selectAll?.addEventListener("change", () => {
        const checked = el.selectAll.checked;
        el.tbody.querySelectorAll(".row-check").forEach((cb) => (cb.checked = checked));
    });

    await buildRows();
}

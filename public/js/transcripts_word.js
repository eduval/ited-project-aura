// js/transcripts_word.js
// Grouped + expandable, same UX as the Excel page (with per-batch child pagination)

import { db } from "./firebase-config.js";
import { ref as dbRef, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// DO NOT CHANGE: you said this path works for Word downloads
const CDN_BASE = "https://ited.org.ec/aura/excelfiles_upload/transcripts_output/";

// ---------- small helpers ----------
const cssEscape = (sel) => {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(sel);
  return String(sel).replace(/[^a-zA-Z0-9_\-]/g, (c) => `\\${c}`);
};
const esc = (s) =>
  (s ?? "").toString().replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

// This matches your working build: base + originFolder + relPath
function publicUrl(originFolder, relPath) {
  const cleanRel = String(relPath || "").replace(/^\/+/, "");
  const cleanOrigin = String(originFolder || "").replace(/^\/+/, "");
  const base = CDN_BASE.endsWith("/") ? CDN_BASE : CDN_BASE + "/";
  return base + encodeURI(cleanOrigin) + "/" + encodeURI(cleanRel);
}

function two(n){ return String(n).padStart(2,"0"); }
function fmtDate(d){
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}
function parseBatchDate(batchId) {
  const parts = String(batchId).split("_");
  const last = parts[parts.length - 1];
  const ts = /^\d+$/.test(last) ? Number(last) : NaN;
  if (isFinite(ts)) {
    return fmtDate(new Date(ts * 1000));
  }
  if (parts.length >= 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
  return "—";
}
function byEpoch(batchId){
  const last = String(batchId).split("_").pop();
  const ts = /^\d+$/.test(last) ? Number(last) : NaN;
  return isFinite(ts) ? ts : 0;
}
function humanSize(n){
  const b = Number(n)||0;
  if (b<=0) return "—";
  const u=["B","KB","MB","GB","TB"];
  const i=Math.floor(Math.log(b)/Math.log(1024));
  return `${(b/Math.pow(1024,i)).toFixed(i?1:0)} ${u[i]}`;
}

// Try to coerce a per-file timestamp to a formatted string; fall back provided
function fileDateString(fileLike, fallbackStr){
  const v = fileLike?.time ?? fileLike?.timestamp ?? fileLike?.ts ?? fileLike?.date ?? fileLike?.dateProcessed ?? null;
  if (v == null) return fallbackStr;

  // Numeric epoch (seconds or ms)
  if (typeof v === "number") {
    const ms = v > 1e12 ? v : v * 1000;
    return fmtDate(new Date(ms));
  }
  // Digits in string -> epoch
  if (typeof v === "string" && /^\d+$/.test(v)) {
    const num = Number(v);
    const ms = num > 1e12 ? num : num * 1000;
    return fmtDate(new Date(ms));
  }
  // ISO-like string
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return fmtDate(d);

  return fallbackStr;
}

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
    console.error("[transcripts_word] init error", e);
    showEmpty("⚠️ Couldn’t load transcripts. Check console.");
  });
}

// ---------- state ----------
const PAGE_SIZE = 10;      // batches per page
const CHILD_PAGE_SIZE = 8; // files per expanded list page
let allGroups = [];   // [{batchId,dateProcessed,operatorIP,files:[{name,url,size,dateProcessed}], origin, _raw}]
let filteredGroups = [];
let currentPage = 1;
// remember each batch's child page
const childPageMap = new Map(); // batchId -> page number

// ---------- UI builders ----------
function showEmpty(msg){
  if(!el.empty) return;
  el.tbody.innerHTML = "";
  el.empty.classList.remove("d-none");
  el.empty.textContent = msg;
  el.count.textContent = "0 items";
  el.pagination.innerHTML = "";
}

function parentRowHTML(g) {
  // Status column removed
  return `
    <tr class="tx-parent" data-batch="${esc(g.batchId)}">
      <td><div class="fw-medium">${esc(g.batchId)}</div></td>
      <td style="width:180px">${esc(g.dateProcessed)}</td>
      <td style="width:360px">${esc(g.operatorIP || "—")}</td>
      <td class="text-end" style="width:130px">
        <button class="btn btn-sm btn-primary btn-toggle" data-batch="${esc(g.batchId)}">Expand</button>
      </td>
    </tr>
    <tr class="tx-child-row d-none" data-child-of="${esc(g.batchId)}">
      <td colspan="4">
        ${childBoxHTML(g)}
      </td>
    </tr>
  `;
}

function childBoxHTML(g){
  const page = childPageMap.get(g.batchId) || 1;
  const total = g.files.length;
  if (!total) return `<div class="text-muted">No files in this batch.</div>`;

  const pages = Math.max(1, Math.ceil(total / CHILD_PAGE_SIZE));
  const startIdx = (page - 1) * CHILD_PAGE_SIZE;
  const slice = g.files.slice(startIdx, startIdx + CHILD_PAGE_SIZE);

  const items = slice.map((f, idx) => {
    const shownName = f.name?.split("/").pop() || f.name || `File`;
    const sizeTxt = humanSize(f.size);
    const fileDate = f.dateProcessed || g.dateProcessed || "—"; // per-file if available else batch date
    const absoluteIndex = startIdx + idx; // index in g.files
    return `
      <div class="d-flex align-items-center justify-content-between py-2 border-bottom">
        <label class="d-flex align-items-center gap-3 mb-0">
          <input class="form-check-input tx-file-check" type="checkbox" data-batch="${esc(g.batchId)}" data-index="${absoluteIndex}">
          <span class="fw-medium">${esc(shownName)}</span>
        </label>
        <div class="small text-muted me-3">${sizeTxt}</div>
        <div class="small text-muted me-3">${esc(fileDate)}</div>
        <a class="btn btn-sm btn-outline-primary" href="${esc(f.url)}" download>Download</a>
      </div>
    `;
  }).join("");

  // child pager
  let pager = "";
  if (pages > 1){
    let html = "";
    if (page > 1){
      html += `<li class="page-item"><a class="page-link" href="#" data-child-page="${page-1}" data-batch="${esc(g.batchId)}">&laquo;</a></li>`;
    }
    // keep compact (up to 5 buttons window)
    const win = 5;
    let sp = Math.max(1, page - Math.floor(win/2));
    let ep = Math.min(pages, sp + win - 1);
    if (ep - sp + 1 < win) sp = Math.max(1, ep - win + 1);
    for(let i=sp;i<=ep;i++){
      html += `<li class="page-item ${i===page?"active":""}">
        <a class="page-link" href="#" data-child-page="${i}" data-batch="${esc(g.batchId)}">${i}</a>
      </li>`;
    }
    if (page < pages){
      html += `<li class="page-item"><a class="page-link" href="#" data-child-page="${page+1}" data-batch="${esc(g.batchId)}">&raquo;</a></li>`;
    }
    pager = `<ul class="pagination pagination-sm tx-child-pager mb-0">${html}</ul>`;
  }

  return `
    <div class="p-3 rounded border">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="fw-medium">Files in ${esc(g.batchId)} <span class="text-muted small">(${startIdx+1}-${Math.min(total,startIdx+CHILD_PAGE_SIZE)} of ${total})</span></div>
        <div class="d-flex align-items-center gap-3">
          ${pager}
          <button class="btn btn-sm btn-primary tx-download-selected" data-batch="${esc(g.batchId)}">Download Selected</button>
        </div>
      </div>
      <div class="border rounded">
        ${items}
      </div>
    </div>
  `;
}

function render(){
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredGroups.slice(start, start + PAGE_SIZE);
  el.tbody.innerHTML = pageItems.map(parentRowHTML).join("");
  el.count.textContent = `${filteredGroups.length} item${filteredGroups.length !== 1 ? "s" : ""}`;
  if (el.empty) el.empty.classList.toggle("d-none", filteredGroups.length > 0);

  // top pager
  const pages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const chunk = 5;
  const chunkStart = Math.floor((currentPage - 1) / chunk) * chunk + 1;
  const chunkEnd = Math.min(chunkStart + chunk - 1, pages);
  let html = "";
  if (chunkStart > 1) {
    html += `<li class="page-item"><a class="page-link fw-bold text-dark" href="#" data-page="${Math.max(1,chunkStart-chunk)}">&laquo;</a></li>`;
  }
  for(let i=chunkStart;i<=chunkEnd;i++){
    html += `<li class="page-item ${i===currentPage?"active":""}"><a class="page-link fw-bold" href="#" data-page="${i}">${i}</a></li>`;
  }
  if (chunkEnd < pages) {
    html += `<li class="page-item"><a class="page-link fw-bold text-dark" href="#" data-page="${Math.min(pages,chunkStart+chunk)}">&raquo;</a></li>`;
  }
  el.pagination.innerHTML = html;
}

// ---------- interactions ----------
function filterAndSort(){
  const q = (el.search?.value || "").toLowerCase().trim();
  const sortVal = el.sort?.value || "date_desc";

  filteredGroups = allGroups.filter((g)=>{
    if (!q) return true;
    const inBatch = g.batchId.toLowerCase().includes(q)
      || (g.operatorIP||"").toLowerCase().includes(q)
      || (g.dateProcessed||"").toLowerCase().includes(q);
    const inFiles = g.files?.some((f)=>(f.name||"").toLowerCase().includes(q));
    return inBatch || inFiles;
  });

  if (sortVal === "date_asc") filteredGroups.sort((a,b)=> byEpoch(a.batchId) - byEpoch(b.batchId));
  else                        filteredGroups.sort((a,b)=> byEpoch(b.batchId) - byEpoch(a.batchId));

  currentPage = 1;
  render();
}

function paginateClick(e){
  const a = e.target.closest?.("a[data-page]");
  if (!a) return;
  e.preventDefault();
  const p = parseInt(a.dataset.page,10);
  const pages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  if (p>=1 && p<=pages){ currentPage = p; render(); }
}

function onTbodyClick(e){
  // expand/collapse
  const toggleBtn = e.target.closest(".btn-toggle");
  if (toggleBtn){
    const batch = toggleBtn.dataset.batch;
    const childRow = el.tbody.querySelector(`.tx-child-row[data-child-of="${cssEscape(batch)}"]`);
    if (!childRow) return;
    const willExpand = childRow.classList.contains("d-none");
    // ensure a default child page
    if (!childPageMap.get(batch)) childPageMap.set(batch, 1);
    childRow.classList.toggle("d-none", !willExpand);
    toggleBtn.textContent = willExpand ? "Collapse" : "Expand";
    // re-render the child box when expanding (to make sure pager is correct)
    if (willExpand){
      const g = allGroups.find(x=>x.batchId===batch);
      if (g) childRow.querySelector("td").innerHTML = childBoxHTML(g);
    }
    return;
  }

  // per-batch download selected
  const dlSel = e.target.closest(".tx-download-selected");
  if (dlSel){
    const batch = dlSel.dataset.batch;
    const childRow = el.tbody.querySelector(`.tx-child-row[data-child-of="${cssEscape(batch)}"]`);
    if (!childRow) return;
    const checks = childRow.querySelectorAll(".tx-file-check:checked");
    if (!checks.length){ alert("Select at least one file."); return; }

    const group = allGroups.find(g=>g.batchId===batch);
    if (!group) return;

    let delay = 0;
    checks.forEach((cb)=>{
      const idx = Number(cb.dataset.index);
      const file = group.files[idx];
      if (!file?.url) return;
      setTimeout(()=>{
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = file.url;
        document.body.appendChild(iframe);
        setTimeout(()=>{ try{ document.body.removeChild(iframe) }catch(_){ } }, 8000);
      }, delay);
      cb.checked = false;
      delay += 350;
    });
    return;
  }

  // child pager click
  const cp = e.target.closest?.("a[data-child-page]");
  if (cp){
    e.preventDefault();
    const page = parseInt(cp.dataset.childPage,10);
    const batch = cp.dataset.batch;
    if (page && batch){
      childPageMap.set(batch, page);
      const g = allGroups.find(x=>x.batchId===batch);
      const childRow = el.tbody.querySelector(`.tx-child-row[data-child-of="${cssEscape(batch)}"]`);
      if (g && childRow){
        childRow.querySelector("td").innerHTML = childBoxHTML(g);
      }
    }
  }
}

// ---------- data ----------
async function buildGroups(){
  const snap = await get(dbRef(db, "transcripts"));
  if (!snap.exists()) { showEmpty("📂 No transcripts found."); return; }
  const data = snap.val();

  const entries = Object.entries(data).sort((a,b)=> byEpoch(b[0]) - byEpoch(a[0]));
  const groups = [];

  for (const [batchId, batchVal] of entries){
    const operatorIP = batchVal?.operatorIP || "";
    const dateProcessed = parseBatchDate(batchId);
    const origin =
      batchVal?.sourceFileName || batchVal?.originalFile || batchVal?.source || batchId;

    const wordFiles = batchVal?.wordFiles || {};
    const wfEntries = Object.entries(wordFiles).sort((a,b)=> a[0].localeCompare(b[0]));

    const files = wfEntries.map(([k,file])=>{
      const name = file?.name || `File ${k}`;
      const rel  = (file?.path || "").replace(/^\/+/, "");
      const url  = rel ? publicUrl(origin, rel) : ""; // KEEPING your working pattern
      const size = Number(file?.size || 0);
      // Prefer a per-file timestamp if present; else fallback to batch date
      const perFileDate = fileDateString(file, dateProcessed);
      return { name, url, size, dateProcessed: perFileDate };
    });

    const totalSize = files.reduce((acc,f)=> acc + (Number(f.size)||0), 0);
    groups.push({ batchId, dateProcessed, operatorIP, origin, files, totalSize, _raw: batchVal });
  }

  allGroups = groups;
  filterAndSort();
}

// ---------- init ----------
async function main(){
  el.search?.addEventListener("input", filterAndSort);
  el.sort?.addEventListener("change", filterAndSort);
  el.pagination?.addEventListener("click", paginateClick);
  el.tbody?.addEventListener("click", onTbodyClick);
  await buildGroups();
}

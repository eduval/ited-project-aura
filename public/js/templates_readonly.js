// js/templates_readonly.js

// ===== One-time override (no new file) =====
const OV_KEY = (section) => `AURA_ONE_TIME_TEMPLATE_${section}`;

function setOneTimeOverride(section, payload) {
  // payload: { id, url, name, expiresAt?:unix }
  const data = {
    id: payload.id,
    url: payload.url,
    name: payload.name || "template.docx",
    // expire in 1h by default
    expiresAt:
      typeof payload.expiresAt === "number"
        ? payload.expiresAt
        : Math.floor(Date.now() / 1000) + 3600,
  };
  try { sessionStorage.setItem(OV_KEY(section), JSON.stringify(data)); } catch {}
}

// Call this in your generator BEFORE reading the DB "active" template.
// Example:
//   const once = consumeOneTimeOverride(section);
//   const url = once?.url ?? await resolveActiveUrlFromDB(section);
export function consumeOneTimeOverride(section) {
  try {
    const raw = sessionStorage.getItem(OV_KEY(section));
    if (!raw) return null;
    sessionStorage.removeItem(OV_KEY(section)); // one-time
    const obj = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    if (obj?.expiresAt && obj.expiresAt < now) return null;
    return obj;
  } catch {
    return null;
  }
}

// ===== Firebase list/render logic =====
import { db } from "./firebase-config.js";
import {
  ref as dbRef,
  onValue,
  set,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Include all sections here
const SECTIONS = ["coursefailure", "lowattendance", "atriskstatus", "lowtermaverage", "alerttemplate"];

const elList = (s) => document.querySelector(`#list-${s}`);
const elSpinner = (s) => document.querySelector(`#spinner-${s}`);

function showSpinner(s, show) {
  const sp = elSpinner(s);
  if (!sp) return;
  sp.classList.toggle("d-none", !show);
}

function renderEmpty(s) {
  const list = elList(s);
  if (!list) return;
  list.innerHTML = `
    <div class="text-muted small">
      No templates uploaded yet.
      <span class="d-block">Use the <b>Upload</b> button above to add a .doc/.docx file.</span>
    </div>
  `;
}

function renderError(s, msg = "Couldn’t load templates. Check your permissions or connection.") {
  const list = elList(s);
  if (!list) return;
  list.innerHTML = `<div class="text-danger small">${msg}</div>`;
}

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatTime(ts) {
  try {
    const d = new Date((String(ts).length > 10 ? ts : ts * 1000));
    return d.toLocaleString();
  } catch { return ""; }
}

function renderList(section, filesObj = {}, activeId = null) {
  const list = elList(section);
  if (!list) return;

  const entries = Object.entries(filesObj);
  if (entries.length === 0) {
    renderEmpty(section);
    return;
  }

  // newest first by uploadedAt
  entries.sort(([, a], [, b]) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
  const newestId = entries[0][0];

  list.innerHTML = entries.map(([id, f]) => {
    const safeName = f?.name || "template.docx";
    const url = f?.url || "#";
    const size = formatSize(f?.size || 0);
    const when = formatTime(f?.uploadedAt || 0);

    const checked = id === activeId ? "checked" : "";
    const latestBadge = id === newestId ? `<span class="badge bg-success-soft ms-2">Latest</span>` : "";

    return `
      <div class="d-flex align-items-center justify-content-between py-2 border-bottom">
        <div class="me-3">
          <div class="fw-medium">
            ${safeName} ${latestBadge}
          </div>
          <div class="text-muted small">${size} · ${when}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <a class="btn btn-light btn-sm" href="${url}" target="_blank" rel="noopener">Download</a>
          <button class="btn btn-outline-secondary btn-sm use-once"
                  data-id="${id}" data-url="${url}" data-name="${safeName}">
            Use once
          </button>
          <label class="small m-0 d-flex align-items-center gap-2" title="Set this template as the default until changed">
            <input type="radio" name="active-${section}" value="${id}" ${checked} />
            Active
          </label>
        </div>
      </div>
    `;
  }).join("");

  // "Active" = persistent default (any file allowed)
  list.querySelectorAll(`input[name="active-${section}"]`).forEach((input) => {
    input.addEventListener("change", async (e) => {
      const chosenId = e.target.value;
      try {
        await set(dbRef(db, `templates/${section}/active`), chosenId);
      } catch (err) {
        console.error("[templates_readonly] set active failed", err);
        alert("Failed to set active template. Check database rules.");
      }
    });
  });

  // "Use once" = one-time override (no DB writes)
  list.querySelectorAll(".use-once").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const url = btn.getAttribute("data-url");
      const name = btn.getAttribute("data-name") || "template.docx";
      setOneTimeOverride(section, { id, url, name });
      alert(`“${name}” will be used ONCE for ${section}.\n(Default Active remains whatever you selected.)`);
    });
  });
}

function bindSection(section) {
  showSpinner(section, true);

  const sectionRef = dbRef(db, `templates/${section}`);
  onValue(sectionRef, (snap) => {
    showSpinner(section, false);

    if (!snap.exists()) {
      renderEmpty(section);
      return;
    }

    const data = snap.val() || {};
    const files = data.files || {};
    const active = data.active || null;

    if (!files || Object.keys(files).length === 0) {
      renderEmpty(section);
      return;
    }

    renderList(section, files, active);
  }, (err) => {
    console.error(`[templates_readonly] onValue error for ${section}`, err);
    showSpinner(section, false);
    renderError(section);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  SECTIONS.forEach(bindSection);
});

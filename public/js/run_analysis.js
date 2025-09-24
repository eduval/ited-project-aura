// js/run_analysis.js  (admin-only + shared-flag lock)
import { db } from "./firebase-config.js";
import {
  ref as dbRef,
  onValue,
  runTransaction,
  set,
  onDisconnect,
  serverTimestamp,
  get as dbGet,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ===== Admin-only guard =====
const FORBIDDEN_URL = "dashboard.html";

// Hide page until we verify role
const guardStyle = document.createElement("style");
guardStyle.textContent = "html.guard{visibility:hidden}";
document.head.appendChild(guardStyle);
document.documentElement.classList.add("guard");

const auth = getAuth();

// ===== Config =====
const PATH_FLAG = "studentriskprocess/processing/isRunning";
const PATH_META = "studentriskprocess/processing/meta";
const FLAG_REF = dbRef(db, PATH_FLAG);
const META_REF = dbRef(db, PATH_META);
const AUTO_RELEASE_MS = 15 * 60_000;

console.info("[run_analysis] FLAG path:", PATH_FLAG);
try { console.info("[run_analysis] FLAG url:", FLAG_REF.toString()); } catch {}

// ===== Guard then init =====
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.replace(`${LOGIN_URL}?reason=auth_required`);
    return;
  }
  try {
    const snap = await dbGet(dbRef(db, `users/${user.uid}/role`));
    const role = snap.val();
    if (role !== "admin") {
      location.replace(`${FORBIDDEN_URL}?reason=admin_only`);
      return;
    }
    // Allowed
    document.documentElement.classList.remove("guard");
    init();
  } catch (e) {
    location.replace(`${LOGIN_URL}?reason=role_check_failed`);
  }
});

// ===== App logic (only runs for admins) =====
function init() {
  // DOM
  const proceedBtn = document.getElementById("proceed-btn");
  const statusMsg  = document.getElementById("status-message");

  // Overlay (only for the clicker)
  const overlay = document.createElement("div");
  overlay.id = "page-lock-overlay";
  overlay.className = "d-none";
  overlay.innerHTML = `
    <div class="position-fixed top-0 start-0 w-100 h-100"
         style="z-index:9999; backdrop-filter: blur(6px); background: rgba(255,255,255,0.6);">
      <div class="position-absolute top-50 start-50 translate-middle text-center p-4 rounded-4 shadow"
           style="min-width:320px; background:#fff;">
        <div class="spinner-border mb-3" role="status" aria-hidden="true"></div>
        <h5 class="mb-1">Processing…</h5>
        <p class="text-muted mb-0">This can take several minutes. Don’t close this tab.</p>
        <small id="lock-subtext" class="text-muted d-block mt-2"></small>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  function showOverlay(sub = "") {
    overlay.classList.remove("d-none");
    const el = document.getElementById("lock-subtext");
    if (el) el.textContent = sub;
    hideProceed();
  }
  function hideOverlay() { overlay.classList.add("d-none"); }
  function setStatus(type, text) {
    if (!statusMsg) return;
    statusMsg.className = `alert alert-${type} mb-4`;
    statusMsg.textContent = text;
  }
  function hideProceed() {
    if (!proceedBtn) return;
    proceedBtn.classList.add("d-none");
    proceedBtn.setAttribute("disabled", "true");
  }
  function showProceed() {
    if (!proceedBtn) return;
    proceedBtn.classList.remove("d-none");
    proceedBtn.removeAttribute("disabled");
  }

  let releaseTimer = null;
  function startAutoRelease() {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { set(FLAG_REF, false).catch(() => {}); }, AUTO_RELEASE_MS);
  }

  // Live UI
  onValue(
    FLAG_REF,
    (snap) => {
      const running = !!snap.val();
      if (running) {
        hideProceed();
        setStatus("warning", "Processing is in progress. Please come back later.");
      } else {
        showProceed();
        hideOverlay();
        setStatus("info", "Idle — you can start a new analysis.");
      }
    },
    (err) => {
      console.warn("[run_analysis] read failed:", err?.code, err?.message);
      setStatus("danger", "Cannot read status. Check database rules.");
    }
  );

  // Click
  proceedBtn?.addEventListener("click", async () => {
    try {
      hideProceed();
      setStatus("info", "Starting…");
      showOverlay("Starting…");

      let txn;
      try {
        txn = await runTransaction(
          FLAG_REF,
          (curr) => (curr === true ? undefined : true),
          { applyLocally: false }
        );
      } catch (e) {
        console.error("[run_analysis] transaction error:", e?.code, e?.message);
        hideOverlay(); showProceed();
        const msg = (e?.code || e?.message || "").toString().toLowerCase();
        if (msg.includes("permission") || msg.includes("denied")) {
          setStatus(
            "danger",
            `Database denied write to ${PATH_FLAG}. Make sure rules allow it and you are signed in (if rules require auth).`
          );
        } else {
          setStatus("danger", "Failed to start: " + (e?.message || "unknown error"));
        }
        return;
      }

      if (!txn?.committed) {
        hideOverlay();
        setStatus("warning", "Someone already started the process (or rules blocked the write).");
        return;
      }

      await set(META_REF, { startedAt: serverTimestamp() }).catch(() => {});
      try { onDisconnect(FLAG_REF).set(false); } catch {}

      setStatus("warning", "Processing started. Keep this tab open.");
      startAutoRelease();

      // TODO: when done early, call: await set(FLAG_REF, false);
    } catch (e) {
      console.error("[run_analysis] start failed:", e);
      hideOverlay(); showProceed();
      setStatus("danger", e?.message || "Failed to start.");
    }
  });
}

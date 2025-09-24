// js/settings-page.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    ref as dbRef,
    onValue,
    update,
    get,
    set
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const DEFAULT_LOGO = "assets/images/logo-placeholder.png";
const $ = (id) => document.getElementById(id);

let IS_ADMIN = false;


/* ---------- Hide org name in sidebar (logo-only), keep footer name ---------- */

function hideSidebarOrgNames() {
    document.querySelectorAll("#aside-main [data-org-name]").forEach((el) => {
        el.style.display = "none"; // do not show org name in the sidebar anywhere
    });
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideSidebarOrgNames);
} else {
    hideSidebarOrgNames();
}
/* ---------- Brand helpers (apply across page) ---------- */


function setBrandInDOM({ name, logo }) {
    // logos everywhere
    document.querySelectorAll("[data-org-logo]").forEach((el) => {
        if (el.tagName === "IMG") el.src = logo || DEFAULT_LOGO;
        else el.style.backgroundImage = `url(${logo || DEFAULT_LOGO})`;
    });

    // name everywhere EXCEPT inside the sidebar
    document.querySelectorAll("[data-org-name]").forEach((el) => {
        if (el.closest("#aside-main")) {
            el.style.display = "none"; // enforce hidden in sidebar
        } else {
            el.textContent = name || "";
        }
    });

    // settings page local preview
    const prev = $("org-logo-preview");
    if (prev) prev.src = logo || DEFAULT_LOGO;
}
/* Live brand listener for everyone (read is allowed for all) */
(function listenOrgBrand() {
    onValue(dbRef(db, "org"), (snap) => {
        const org = snap.val() || {};
        setBrandInDOM({ name: org.name || "", logo: org.logo || DEFAULT_LOGO });
    });
})();

/* ---------- Show/hide admin-only UI ---------- */
function toggleAdminUI(isAdmin) {
    document.querySelectorAll("[data-admin-only]").forEach((el) => {
        el.classList.toggle("d-none", !isAdmin);
    });
}

/* ---------- Org logo (admin only) ---------- */
function wireOrgLogo() {
    const file = $("org-logo-file");
    const save = $("org-logo-save");
    const prev = $("org-logo-preview");
    const pbWrap = $("org-progress-wrap");
    const pb = $("org-progress");
    const status = $("org-status");

    const setStatus = (m, ok = true) => {
        if (status) {
            status.textContent = m || "";
            status.classList.toggle("text-danger", !ok);
        }
    };
    const setProgress = (pct) => {
        if (pbWrap && pb) {
            pbWrap.classList.remove("d-none");
            pb.style.width = `${pct}%`;
            if (pct >= 100) setTimeout(() => pbWrap.classList.add("d-none"), 600);
        }
    };

    // local preview
    file?.addEventListener("change", () => {
        const f = file.files?.[0];
        if (!f) return;
        if (!/^image\//.test(f.type)) {
            setStatus("Unsupported file type.", false);
            file.value = "";
            return;
        }
        if (f.size > 5 * 1024 * 1024) {
            setStatus("Max size 5 MB.", false);
            file.value = "";
            return;
        }
        const r = new FileReader();
        r.onload = () => { if (prev) prev.src = r.result; };
        r.readAsDataURL(f);
        setStatus("");
    });

    save?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!IS_ADMIN) return; // extra safety

        const f = file?.files?.[0];
        if (!f) {
            setStatus("Choose an image first.", false);
            return;
        }

        try {
            setStatus("Processing…");
            setProgress(20);

            // downscale in-browser, store as data URL in RTDB (no Storage needed)
            const dataURL = await fileToDataURLResized(f, 500, "image/png", 0.92);

            setProgress(70);
            await update(dbRef(db, "org"), { logo: dataURL, logoUpdatedAt: Date.now() });
            setProgress(100);
            setStatus("Logo saved!");
            file.value = "";
        } catch (err) {
            console.error(err);
            setStatus(`Save failed: ${err?.message || "permission"}`, false);
        }
    });
}

/* ---------- Org name (admin only) ---------- */
function wireOrgName() {
    const input = $("org-name-input");
    const save = $("org-name-save");
    const status = $("org-name-status");
    const setStatus = (m, ok = true) => {
        if (status) {
            status.textContent = m || "";
            status.classList.toggle("text-danger", !ok);
        }
    };

    onValue(dbRef(db, "org/name"), (snap) => {
        const name = snap.val() || "";
        if (input && !input.matches(":focus")) input.value = name;
    });

    save?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!IS_ADMIN) return; // extra safety

        const name = (input?.value || "").trim();
        if (!name) return setStatus("Enter a name.", false);

        try {
            await update(dbRef(db, "org"), { name, updatedAt: Date.now() });
            setStatus("Name saved!");
        } catch (err) {
            console.error(err);
            setStatus(`Save failed: ${err?.message || "permission"}`, false);
        }
    });
}

/* ---------- Utility: image resize to dataURL ---------- */
function fileToDataURLResized(file, maxSide = 500, mime = "image/png", quality = 0.92) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = reject;
        r.onload = () => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(maxSide / img.width, maxSide / img.height, 1);
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const c = document.createElement("canvas");
                c.width = w;
                c.height = h;
                c.getContext("2d").drawImage(img, 0, 0, w, h);
                resolve(c.toDataURL(mime, quality));
            };
            img.onerror = reject;
            img.src = r.result;
        };
        r.readAsDataURL(file);
    });
}

/* ---------- Role gate: only admin can see/wire org cards ---------- */
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        toggleAdminUI(false);
        return;
    }

    try {
        // ⬅️ use dbRef here (not raw ref)
        const roleSnap = await get(dbRef(db, `users/${user.uid}/role`));
        const role = roleSnap.exists() ? roleSnap.val() : null;
        IS_ADMIN = role === "admin";

        toggleAdminUI(IS_ADMIN);

        if (IS_ADMIN) {
            wireOrgLogo();
            wireOrgName();
        }
    } catch (e) {
        console.warn("Could not read role; hiding admin-only UI.", e);
        IS_ADMIN = false;
        toggleAdminUI(false);
    }

    const dd = document.getElementById("account-dropdown");
    if (dd) dd.style.display = "block";
});

/* ----------------- Academic criteria (admin/operator) ----------------- */
const form = document.getElementById("criteria-form");
const statusEl = document.getElementById("criteria-save-status");

const fields = {
    minGrade: document.getElementById("minGrade"),
    minAttendance: document.getElementById("minAttendance"),
    minGPA: document.getElementById("minGPA"),
    passingCredits: document.getElementById("passingCredits"),
    graceAssignments: document.getElementById("graceAssignments"),
    policyNotes: document.getElementById("policyNotes"),
};

function setStatus(msg, ok = true) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle("text-success", ok);
    statusEl.classList.toggle("text-danger", !ok);
}

onAuthStateChanged(auth, async (user) => {
    if (!user) return;



    try {
        // ⬅️ use dbRef here (not raw ref)
        const roleSnap = await get(dbRef(db, `users/${user.uid}/role`));
        const role = roleSnap.exists() ? roleSnap.val() : "unknown";
        //const canEdit = role === "admin" || role === "operator";


        const currentPage = window.location.pathname.split("/").pop();
        if (currentPage === "settings.html" && role !== "admin") {
            window.location.href = "dashboard.html";
            return;
        }

        if (role !== "admin") return;

        const canEdit = role === "admin";

        if (!canEdit && form) {
            Array.from(form.elements).forEach(el => (el.disabled = true));
            setStatus("You don't have permission to edit these settings.", false);
        }

        // Load existing criteria (path consistent with your rules: /settings/criteria)
        const critRef = dbRef(db, "settings/criteria");  // ⬅️ use dbRef
        const snap = await get(critRef);

        const defaults = {
            minGrade: 50,
            minAttendance: 60,
            minGPA: 2.0,
            passingCredits: 12,
            graceAssignments: 1,
            policyNotes: "",
        };

        const data = snap.exists() ? snap.val() : defaults;

        // Fill UI
        if (fields.minGrade) fields.minGrade.value = data.minGrade ?? defaults.minGrade;
        if (fields.minAttendance) fields.minAttendance.value = data.minAttendance ?? defaults.minAttendance;
        if (fields.minGPA) fields.minGPA.value = data.minGPA ?? defaults.minGPA;
        if (fields.passingCredits) fields.passingCredits.value = data.passingCredits ?? defaults.passingCredits;
        if (fields.graceAssignments) fields.graceAssignments.value = data.graceAssignments ?? defaults.graceAssignments;
        if (fields.policyNotes) fields.policyNotes.value = data.policyNotes ?? defaults.policyNotes;

        // Save
        form?.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!canEdit) return;

            const payload = {
                minGrade: Math.max(Number(fields.minGrade?.value || 50), 1),
                minAttendance: Math.max(Number(fields.minAttendance?.value || 60), 1),
                minGPA: Number(fields.minGPA?.value || 2.0),
                passingCredits: Number(fields.passingCredits?.value || 12),
                graceAssignments: Number(fields.graceAssignments?.value || 1),
                policyNotes: String(fields.policyNotes?.value || ""),
                updatedBy: user.uid,
                updatedAt: Date.now(),
            };

            try {
                if (snap.exists()) {
                    await update(critRef, payload);
                } else {
                    await set(critRef, payload);   // ⬅️ set is now imported
                }
                setStatus("Saved ✔");
            } catch (err) {
                console.error(err);
                setStatus("Save failed. Try again.", false);
            }
        });
    } catch (err) {
        console.error("Failed to load criteria:", err);
        setStatus("Failed to load.", false);
    }
});
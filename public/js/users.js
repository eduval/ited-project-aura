// js/users.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { ref, onValue, get, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const functions = getFunctions(undefined, "us-central1");
const createUserAccountFn = httpsCallable(functions, "createUserAccount");

// DOM
const tbody = document.getElementById("usersTbody");
const searchInput = document.getElementById("searchInput");
const roleFilter = document.getElementById("roleFilter");
const countLabel = document.getElementById("countLabel");

const prevBtn = document.getElementById("prevPage");
const nextBtn = document.getElementById("nextPage");
const PAGE_SIZE = 12;

const addUserBtn = document.getElementById("addUserBtn");
const addUserForm = document.getElementById("addUserForm");
const addUserStatus = document.getElementById("addUserStatus");
const addUserEmailEl = document.getElementById("addUserEmail");
const addUserNameEl = document.getElementById("addUserName");
const addUserRoleEl = document.getElementById("addUserRole");

// State
let currentUserRole = "unknown";
let rawUsers = [];
let filtered = [];
let page = 0;

// Helpers
const badgeClass = (role) => {
    const r = String(role || "unknown").toLowerCase();
    if (r === "admin") return "role-badge role-admin";
    if (r === "operator") return "role-badge role-operator";
    if (r === "student") return "role-badge role-student";
    return "role-badge role-unknown";
};

function fmtTime(ts) {
    if (!ts) return "";
    try {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
            return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        }
        const d2 = new Date(String(ts));
        if (!isNaN(d2.getTime())) {
            return d2.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        }
    } catch { }
    return "";
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
}

function toArrayFromUsersNode(obj) {
    return Object.entries(obj || {}).map(([uid, val]) => ({
        uid,
        name: val?.name || "",
        email: val?.email || "",
        role: val?.role || "",
        enabled: val?.enabled !== false,
        logins: val?.logins || {},
        lastLogin: val?.lastLogin || null,
    }));
}

function setAddUserStatus(message, type = "muted") {
    if (!addUserStatus) return;
    addUserStatus.className = "";
    addUserStatus.classList.add(`text-${type}`);
    addUserStatus.textContent = message;
}

// Filtering + Rendering
function applyFilters() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const role = (roleFilter?.value || "").trim().toLowerCase();

    filtered = rawUsers.filter((u) => {
        const name = (u.name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        const roleOk = role ? String(u.role || "").toLowerCase() === role : true;
        const textOk = q ? name.includes(q) || email.includes(q) : true;
        return roleOk && textOk;
    });

    page = 0;
    render();
}

function render() {
    if (!tbody) return;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-muted small">No users found.</td></tr>`;
        countLabel && (countLabel.textContent = "0 users");
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }

    const start = page * PAGE_SIZE;
    const items = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = items.map((u, idx) => {
        const n = start + idx + 1;
        const role = u.role || "unknown";
        const lastLogin = u.logins?.lastLogin || u.lastLogin || null;
        const enabled = u.enabled !== false;

        const statusCell = `
      <button class="btn btn-sm ${enabled ? "btn-success" : "btn-danger"} user-status-btn"
              style="padding:2px 8px;font-size:12px;"
              data-uid="${u.uid || ""}"
              data-status="${enabled ? "enabled" : "disabled"}">
        ${enabled ? "Enabled" : "Disabled"}
      </button>`;

        return `
      <tr data-uid="${u.uid || ""}">
        <td class="text-muted">${n}</td>
        <td>${u.name ? escapeHtml(u.name) : "—"}</td>
        <td>${u.email ? escapeHtml(u.email) : "—"}</td>
        <td><span class="${badgeClass(role)}">${escapeHtml(role)}</span></td>
        <td class="small text-muted">${fmtTime(lastLogin)}</td>
        <td>${statusCell}</td>
      </tr>`;
    }).join("");

    countLabel.textContent = `${filtered.length} user${filtered.length === 1 ? "" : "s"}`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = (page + 1) * PAGE_SIZE >= filtered.length;
}

// Status Button Click
document.addEventListener("click", async (e) => {
    const btn = e.target;
    if (!btn.classList?.contains("user-status-btn")) return;

    const uid = btn.getAttribute("data-uid");
    if (!uid) return;

    const currentStatus = btn.getAttribute("data-status") === "enabled";
    const newStatus = !currentStatus;

    try {
        await update(ref(db, `users/${uid}`), {
            enabled: newStatus,
            enabledUpdatedAt: Date.now(),
            enabledUpdatedBy: auth.currentUser?.uid || null,
        });

        btn.setAttribute("data-status", newStatus ? "enabled" : "disabled");
        btn.textContent = newStatus ? "Enabled" : "Disabled";
        btn.classList.toggle("btn-success", newStatus);
        btn.classList.toggle("btn-danger", !newStatus);
    } catch (err) {
        console.error("Failed to change status:", err);
        alert("Could not change status. Check permissions or database rules.");
    }
});

// Auth + Admin Gate
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    try {
        const roleSnap = await get(ref(db, `users/${user.uid}/role`));
        currentUserRole = roleSnap.exists() ? String(roleSnap.val()).toLowerCase() : "unknown";

        const usersMenuLink = document.querySelector('a[href$="users.html"]');
        if (usersMenuLink && currentUserRole !== "admin") {
            usersMenuLink.closest("li")?.remove();
        }

        const currentPage = window.location.pathname.split("/").pop();
        if (currentPage === "users.html" && currentUserRole !== "admin") {
            window.location.href = "dashboard.html";
            return;
        }

        if (currentUserRole !== "admin") return;

        if (addUserBtn) addUserBtn.style.display = "";
        if (addUserForm) addUserForm.closest?.(".add-user-wrap")?.classList?.remove("d-none");

        onValue(ref(db, "users"), (snap) => {
            rawUsers = snap.exists() ? toArrayFromUsersNode(snap.val()) : [];
            applyFilters();
        });
    } catch (e) {
        console.error("Init users page error:", e);
    }
});

// Filters & Pagination
searchInput?.addEventListener("input", applyFilters);
roleFilter?.addEventListener("change", applyFilters);
prevBtn?.addEventListener("click", () => { if (page > 0) { page--; render(); } });
nextBtn?.addEventListener("click", () => { if ((page + 1) * PAGE_SIZE < filtered.length) { page++; render(); } });

// Add User
addUserBtn?.addEventListener("click", () => {
    const wrap = addUserForm?.closest?.(".add-user-wrap");
    if (wrap) wrap.classList.toggle("d-none");
});

if (addUserForm) {
    addUserForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (currentUserRole !== "admin") return;

        setAddUserStatus("Creating user...", "muted");

        const email = (addUserEmailEl?.value || "").trim().toLowerCase();
        const name = (addUserNameEl?.value || "").trim();
        const role = (addUserRoleEl?.value || "operator").trim().toLowerCase();

        if (!email) return setAddUserStatus("Please enter an email.", "danger");
        if (!["admin", "operator", "student"].includes(role)) {
            return setAddUserStatus("Invalid role. Choose admin, operator, or student.", "danger");
        }

        try {
            const res = await createUserAccountFn({ email, name, role });
            const data = res?.data || {};
            if (data?.ok) {
                setAddUserStatus("✅ User created.", "success");
                addUserForm.reset();
            } else {
                setAddUserStatus("Failed to create user. Check logs.", "danger");
            }
        } catch (err) {
            console.error(err);
            setAddUserStatus(`Error: ${err?.message || err}`, "danger");
        }
    });
}

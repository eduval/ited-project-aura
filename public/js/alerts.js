// js/alerts.js
import { db } from "./firebase-config.js";
import {
    ref as dbRef,
    onValue,
    update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const $ = (sel, root = document) => root.querySelector(sel);

const ddToggle = $("#dropdownNotificationOptions");
const ddList = $(".dropdown-menu .scrollable-vertical");
const ddHead = $(".dropdown-menu .dropdown-header");
const notifDot = $(".notification-count");

// "My Alerts" little green badge inside the account dropdown
const myAlertsBadge = $("#account-dropdown small.badge.bg-success-soft");

// robust read-check (handles boolean, "true", status:"read")
const isRead = (a) => a?.read === true || a?.read === "true" || a?.status === "read";

onValue(dbRef(db, "alerts"), (snap) => {
    const all = snap.exists() ? snap.val() : {};

    // flatten + keep keys
    const unread = [];
    for (const uploadKey in all) {
        const group = all[uploadKey] || {};
        for (const alertKey in group) {
            const a = group[alertKey] || {};
            if (!isRead(a)) {
                unread.push({ ...a, uploadKey, alertKey });
            }
        }
    }

    // newest first
    unread.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // header + list
    if (!unread.length) {
        if (ddHead) ddHead.textContent = "No notifications";
        if (ddList) ddList.innerHTML =
            `<div class="py-5 text-gray-400 text-center">No unread alerts</div>`;
    } else {
        if (ddHead) ddHead.textContent =
            `${unread.length} new notification${unread.length > 1 ? "s" : ""}`;

        if (ddList) {
            ddList.innerHTML = unread.map(renderItem).join("");
            // wire clicks: mark read, close dropdown, then navigate
            ddList.querySelectorAll("a[data-upload][data-key]").forEach(a => {
                a.addEventListener("click", async (e) => {
                    e.preventDefault();
                    const uploadKey = a.getAttribute("data-upload");
                    const alertKey = a.getAttribute("data-key");
                    const href = a.getAttribute("href");

                    // best-effort mark-as-read (ignore errors)
                    try {
                        await update(dbRef(db, `alerts/${uploadKey}/${alertKey}`), {
                            read: true, readAt: Date.now()
                        });
                    } catch { }

                    // close dropdown (Bootstrap)
                    try {
                        const inst = window.bootstrap?.Dropdown.getInstance(ddToggle)
                            || new window.bootstrap.Dropdown(ddToggle);
                        inst?.hide();
                    } catch { }

                    // navigate to that alert anchor
                    setTimeout(() => { window.location.href = href; }, 30);
                });
            });
        }
    }

    // bubble count on bell
    if (notifDot) {
        notifDot.textContent = unread.length;
        notifDot.style.display = unread.length ? "inline-block" : "none";
    }

    // update "My Alerts" badge in account dropdown so it matches the bell
    if (myAlertsBadge) myAlertsBadge.textContent = `${unread.length} new`;

    // optional: dashboard header text if present
    const dashHdr = document.getElementById("alertText");
    if (dashHdr) dashHdr.textContent =
        `You've got ${unread.length} new alert${unread.length !== 1 ? "s" : ""} today`;
}, (err) => console.error("alerts listener failed:", err));

function renderItem(a) {
    const when = formatTS(a.timestamp);
    // give each link a unique anchor to jump on alerts.html
    const anchor = encodeURIComponent(`${a.uploadKey}__${a.alertKey}`);
    return `
    <a
      href="alerts.html#${anchor}"
      class="clearfix dropdown-item fw-medium p-3 border-bottom border-light overflow-hidden"
      data-upload="${a.uploadKey}"
      data-key="${a.alertKey}"
    >
      <span class="badge bg-success float-end fw-normal mt-1">new</span>
      <div class="float-start avatar avatar-sm rounded-circle bg-gray-200 fs-5">
        <i class="fi fi-shield-ok"></i>
      </div>
      <p class="small fw-bold m-0 text-truncate">${a.title || "Alert"}</p>
      <p class="small m-0 text-truncate">${a.message || ""}</p>
      <small class="d-block smaller fw-normal text-muted">${when}</small>
    </a>
  `;
}

function formatTS(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return isNaN(d) ? "" : d.toLocaleString();
}
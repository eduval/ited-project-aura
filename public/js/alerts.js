import { db } from './firebase-config.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const alertsRef = ref(db, 'alerts');

onValue(alertsRef, snapshot => {
    if (snapshot.exists()) {
        const alerts = snapshot.val();

        let alertList = [];

        for (const uploadKey in alerts) {
            const group = alerts[uploadKey];
            for (const alertKey in group) {
                const alert = group[alertKey];
                if (!alert.read) {
                    alertList.push(alert); // ✅ Only push unread alerts
                }
            }
        }

        // Sort alerts by timestamp (most recent first)
        alertList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const alertContainer = document.querySelector('.dropdown-menu .scrollable-vertical');
        const alertHeader = document.querySelector('.dropdown-menu .dropdown-header');

        if (alertList.length === 0) {
            alertContainer.innerHTML = `<div class="py-5 text-gray-400 text-center">NO ITEMS!</div>`;
            alertHeader.textContent = `No notifications`;
        } else {
            alertHeader.textContent = `${alertList.length} new notification${alertList.length > 1 ? 's' : ''}`;
            alertContainer.innerHTML = alertList.map(renderAlertItem).join('');
        }

        // 🔵 Update notification badge
        const notifCountElem = document.querySelector('.notification-count');
        if (notifCountElem) notifCountElem.textContent = alertList.length;

        // 🔵 Update header ("You've got X new alerts today")
        const alertText = document.getElementById("alertText");
        if (alertText) {
            alertText.textContent = `You've got ${alertList.length} new alert${alertList.length !== 1 ? 's' : ''} today`;
        }

    } else {
        console.warn('No alerts found.');
    }
}, error => {
    console.error("Error listening for alerts:", error);
});

function renderAlertItem(alert) {
    return `
    <a href="#" class="clearfix dropdown-item fw-medium p-3 border-bottom border-light overflow-hidden">
      <span class="badge ${alert.read ? 'bg-secondary' : 'bg-success'} float-end fw-normal mt-1">${alert.read ? 'read' : 'new'}</span>
      <div class="float-start avatar avatar-sm rounded-circle bg-gray-200 fs-5">
        <i class="fi fi-shield-ok"></i>
      </div>
      <p class="small fw-bold m-0 text-truncate">${alert.title || 'Alert'}</p>
      <p class="small m-0 text-truncate">${alert.message || ''}</p>
      <small class="d-block smaller fw-normal text-muted">${formatTimestamp(alert.timestamp)}</small>
    </a>
  `;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Invalid Date';
    const d = new Date(timestamp);
    return isNaN(d) ? 'Invalid Date' : d.toLocaleString();
}

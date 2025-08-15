import { db } from './firebase-config.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const alertsRef = ref(db, 'alerts');

onValue(alertsRef, snapshot => {
    const allAlertsContainer = document.getElementById('all-alerts-container');
    if (snapshot.exists()) {
        const alerts = snapshot.val();
        let allAlertsList = [];

        for (const uploadKey in alerts) {
            const group = alerts[uploadKey];
            for (const alertKey in group) {
                allAlertsList.push(group[alertKey]);
            }
        }

        allAlertsList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (allAlertsList.length === 0) {
            allAlertsContainer.innerHTML = '<div class="py-5 text-gray-400 text-center">No Alerts Found</div>';
        } else {
            allAlertsContainer.innerHTML = allAlertsList.map(renderFullAlertItem).join('');
        }
    } else {
        allAlertsContainer.innerHTML = '<div class="py-5 text-gray-400 text-center">No Alerts Found</div>';
        console.warn('No alerts found.');
    }
}, error => {
    console.error("Error listening for alerts:", error);
    const allAlertsContainer = document.getElementById('all-alerts-container');
    allAlertsContainer.innerHTML = '<div class="py-5 text-danger text-center">Error loading alerts</div>';
});

function renderFullAlertItem(alert) {
    return `
        <div class="card mb-3">
            <div class="card-body">
                <h5 class="card-title">${alert.title || 'Alert'}</h5>
                <p class="card-text">${alert.message || ''}</p>
                <p class="card-text"><small class="text-muted">${formatTimestamp(alert.timestamp)}</small></p>
            </div>
        </div>
    `;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Invalid Date';
    const d = new Date(timestamp);
    return isNaN(d) ? 'Invalid Date' : d.toLocaleString();
}
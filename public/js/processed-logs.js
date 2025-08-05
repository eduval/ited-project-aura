import { db } from './firebase-config.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('checkall-list');
    const loadingDiv = document.getElementById('logs-loading');
    const tableWrapper = document.getElementById('logs-table-wrapper');

    if (!tbody || !loadingDiv || !tableWrapper) {
        console.error("❌ Missing required DOM elements for logs table or spinner.");
        return;
    }

    const logsRef = ref(db, 'ProcessingLogs');

    // Initially show spinner
    loadingDiv.classList.remove('d-none');
    tableWrapper.classList.add('d-none');

    onValue(logsRef, snapshot => {
        // Show spinner while processing update
        loadingDiv.classList.remove('d-none');
        tableWrapper.classList.add('d-none');
        tbody.innerHTML = '';

        if (snapshot.exists()) {
            const logs = snapshot.val();

            // Sort logs by timestamp (most recent first)
            const logList = Object.values(logs).sort((a, b) =>
                new Date(b.timestamp) - new Date(a.timestamp)
            );

            logList.forEach((log, index) => {
                tbody.innerHTML += renderLogRow(log, index + 1);
            });
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-4">
                        No processing logs found
                    </td>
                </tr>
            `;
        }

        // Hide spinner, show table
        loadingDiv.classList.add('d-none');
        tableWrapper.classList.remove('d-none');
    }, error => {
        console.error("Error loading processing logs:", error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger py-4">
                    Error loading logs
                </td>
            </tr>
        `;
        loadingDiv.classList.add('d-none');
        tableWrapper.classList.remove('d-none');
    });
});

function renderLogRow(log, rowNumber) {
    const { filename, alerts, lowAttendance, lowGrades, minAttendance, minGrade, timestamp } = log;

    const formattedDate = new Date(timestamp).toLocaleString();
    const daysAgo = calcDaysAgo(timestamp);
    const downloadUrl = `https://ited.org.ec/aura/excelfiles_upload/uploads/${filename}`;

    return `
        <tr>
            <th>
                <div class="form-check">
                    <input class="form-check-input form-check-input-primary" type="checkbox" value="">
                </div>
            </th>
            <td class="position-relative">
                <a href="${downloadUrl}" class="link-normal fw-medium stretched-link d-block" download>
                    ${filename}
                </a>
                <span class="d-block smaller text-muted">
                    ${alerts} alerts | Min Attendance: ${minAttendance} | Min Grade: ${minGrade}
                </span>
            </td>
            <td>
                <span class="d-block text-success">${lowAttendance} Low Attendance</span>
                <span class="d-block text-danger">${lowGrades} Low Grades</span>
            </td>
            <td>
                <span class="d-block text-muted small">${formattedDate}</span>
                <span class="d-block text-muted small">${daysAgo} ago</span>
            </td>
            <td>
                <span class="d-block text-info">Completed</span>
                <span class="badge bg-secondary rounded-pill">Processing Log</span>
            </td>
        </tr>
    `;
}

function calcDaysAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays === 0 ? 'Today' : `${diffDays} day${diffDays > 1 ? 's' : ''}`;
}

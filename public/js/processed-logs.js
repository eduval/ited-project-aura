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
                <span class="d-block text-muted small">${daysAgo}</span>
            </td>
            <td>
        
                <div class="flex-none ms-2 small text-muted text-align-end dropdown">
        <a href="#" class="dropdown-toggle btn btn-sm btn-light px-2 py-1 mt-n1"
           data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false" aria-label="options">
          <span>
            <svg width="18px" height="18px" xmlns="http://www.w3.org/2000/svg" fill="currentColor"
              class="bi bi-three-dots-vertical" viewBox="0 0 16 16">
              <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
            </svg>
          </span>
        </a>
        <div class="prefix-link-icon prefix-icon-dot dropdown-menu mt-2">
          <a href="#" class="dropdown-item">Transcripts (Excel)</a>
          <a href="#" class="dropdown-item">Transcripts (Word)</a>
          <a href="${downloadUrl}" class="dropdown-item" download>Download raw</a>
        </div>
      </div>
            </td>
        </tr>
    `;
}

function calcDaysAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();

    // Get only year, month, day (ignore hours) to avoid timezone rounding errors
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffMs = nowOnly - dateOnly;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
}



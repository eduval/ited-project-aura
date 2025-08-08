import { db } from './firebase-config.js';
import { ref, onValue, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const logsRef = query(ref(db, 'ProcessingLogs'), limitToLast(3));

onValue(logsRef, snapshot => {
  const logsContainer = document.getElementById('processing-log-list');
  logsContainer.innerHTML = '';

  if (snapshot.exists()) {
    const logs = snapshot.val();

    // Firebase returns objects, not arrays – we convert to array first
    const logItems = Object.values(logs)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // newest first

    logItems.forEach(log => {
      logsContainer.innerHTML += renderLogItem(log);
    });
  } else {
    logsContainer.innerHTML = `<div class="text-muted p-3">No logs found.</div>`;
  }
});

function renderLogItem(log) {
  const {
    filename = "unknown.xlsx",
    alerts = 0,
    lowAttendance = 0,
    lowGrades = 0,
    timestamp = ""
  } = log;

  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleString('en-US', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
    : "No timestamp";

  const downloadUrl = `https://ited.org.ec/aura/excelfiles_upload/uploads/${filename}`;

  return `
    <div class="d-flex align-items-center p-3 border-bottom border-light">
      <div class="flex-none">
        <img width="40" height="40" class="img-fluid" src="assets/images/logo/excel.svg" alt="Excel Icon">
      </div>
      <div class="flex-fill text-truncate px-3">
        <span class="text-muted">${alerts} alerts detected, ${lowAttendance} low attendance, ${lowGrades} low grade</span> <br>
        <span class="text-danger"><em>Thresholds values | Attendance < ${log.minAttendance}, Grades < ${log.minGrade}</em></span>

        <span class="small d-block text-muted">${formattedTime}</span>
      </div>
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
    </div>`;
}



import { db } from './firebase-config.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Pagination configuration
const config = {
    itemsPerPage: 10,
    currentPage: 1,
    totalPages: 1,
    allLogs: []
};

document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        tbody: document.getElementById('checkall-list'),
        loadingDiv: document.getElementById('logs-loading'),
        tableWrapper: document.getElementById('logs-table-wrapper'),
        paginationContainer: document.querySelector('.pagination-container'),
        mobilePageInfo: document.getElementById('mobile-page-info')
    };

    // Validate required elements
    if (!elements.tbody || !elements.loadingDiv || !elements.tableWrapper || !elements.paginationContainer) {
        console.error("Missing required DOM elements");
        return;
    }

    const logsRef = ref(db, 'ProcessingLogs');

    // Show initial loading state
    elements.loadingDiv.classList.remove('d-none');
    elements.tableWrapper.classList.add('d-none');

    onValue(logsRef, snapshot => {
        elements.loadingDiv.classList.remove('d-none');
        elements.tableWrapper.classList.add('d-none');
        elements.tbody.innerHTML = '';

        if (snapshot.exists()) {
            const logs = snapshot.val();

            // Process and sort logs
            config.allLogs = Object.values(logs).sort((a, b) =>
                new Date(b.timestamp) - new Date(a.timestamp)
            );

            config.totalPages = Math.ceil(config.allLogs.length / config.itemsPerPage);
            updatePaginationControls(elements, config);
            renderPage(elements, config);

        } else {
            elements.tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-4">
                        No processing logs found
                    </td>
                </tr>
            `;
            elements.paginationContainer.style.display = 'none';
        }

        elements.loadingDiv.classList.add('d-none');
        elements.tableWrapper.classList.remove('d-none');
    }, error => {
        console.error("Error loading logs:", error);
        elements.tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger py-4">
                    Error loading logs
                </td>
            </tr>
        `;
        elements.loadingDiv.classList.add('d-none');
        elements.tableWrapper.classList.remove('d-none');
    });

    // Event delegation for pagination
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('page-link')) {
            e.preventDefault();
            const page = parseInt(e.target.dataset.page);
            if (!isNaN(page)) {
                config.currentPage = page;
                renderPage(elements, config);
                updatePaginationControls(elements, config);
            }
        }

        if (e.target.closest('.prev-page')) {
            e.preventDefault();
            if (config.currentPage > 1) {
                config.currentPage--;
                renderPage(elements, config);
                updatePaginationControls(elements, config);
            }
        }

        if (e.target.closest('.next-page')) {
            e.preventDefault();
            if (config.currentPage < config.totalPages) {
                config.currentPage++;
                renderPage(elements, config);
                updatePaginationControls(elements, config);
            }
        }
    });
});

function renderPage(elements, config) {
    const startIndex = (config.currentPage - 1) * config.itemsPerPage;
    const endIndex = Math.min(startIndex + config.itemsPerPage, config.allLogs.length);
    const pageLogs = config.allLogs.slice(startIndex, endIndex);

    elements.tbody.innerHTML = '';

    if (pageLogs.length === 0) {
        elements.tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-4">
                    No logs found for this page
                </td>
            </tr>
        `;
        return;
    }

    pageLogs.forEach((log, index) => {
        const rowNumber = startIndex + index + 1;
        elements.tbody.innerHTML += renderLogRow(log, rowNumber);
    });

    if (elements.mobilePageInfo) {
        elements.mobilePageInfo.textContent =
            `Showing ${startIndex + 1} to ${endIndex} of ${config.allLogs.length} results`;
    }
}

function updatePaginationControls(elements, config) {
    if (config.totalPages <= 1) {
        elements.paginationContainer.style.display = 'none';
        return;
    }

    elements.paginationContainer.style.display = 'block';
    elements.paginationContainer.innerHTML = generatePaginationHTML(config);
}

function generatePaginationHTML(config) {
    const maxVisiblePages = 5;
    let startPage = 1;
    let endPage = config.totalPages;

    if (config.totalPages > maxVisiblePages) {
        const maxPagesBeforeCurrent = Math.floor(maxVisiblePages / 2);
        const maxPagesAfterCurrent = Math.ceil(maxVisiblePages / 2) - 1;

        if (config.currentPage <= maxPagesBeforeCurrent) {
            endPage = maxVisiblePages;
        } else if (config.currentPage + maxPagesAfterCurrent >= config.totalPages) {
            startPage = config.totalPages - maxVisiblePages + 1;
        } else {
            startPage = config.currentPage - maxPagesBeforeCurrent;
            endPage = config.currentPage + maxPagesAfterCurrent;
        }
    }

    let paginationHTML = `
        <nav aria-label="Pagination">
            <ul class="pagination justify-content-center">
                <li class="page-item ${config.currentPage === 1 ? 'disabled' : ''}">
                    <a class="page-link prev-page" href="#" aria-label="Previous">
                        <span aria-hidden="true">&laquo;</span>
                    </a>
                </li>
    `;

    // First page
    if (startPage > 1) {
        paginationHTML += `
            <li class="page-item">
                <a class="page-link" href="#" data-page="1">1</a>
            </li>
        `;
        if (startPage > 2) {
            paginationHTML += `
                <li class="page-item disabled">
                    <span class="page-link">...</span>
                </li>
            `;
        }
    }

    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <li class="page-item ${i === config.currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `;
    }

    // Last page
    if (endPage < config.totalPages) {
        if (endPage < config.totalPages - 1) {
            paginationHTML += `
                <li class="page-item disabled">
                    <span class="page-link">...</span>
                </li>
            `;
        }
        paginationHTML += `
            <li class="page-item">
                <a class="page-link" href="#" data-page="${config.totalPages}">${config.totalPages}</a>
            </li>
        `;
    }

    // Next button
    paginationHTML += `
                <li class="page-item ${config.currentPage === config.totalPages ? 'disabled' : ''}">
                    <a class="page-link next-page" href="#" aria-label="Next">
                        <span aria-hidden="true">&raquo;</span>
                    </a>
                </li>
            </ul>
        </nav>
        <div class="text-muted small text-center mt-2">
            Showing ${((config.currentPage - 1) * config.itemsPerPage) + 1} to 
            ${Math.min(config.currentPage * config.itemsPerPage, config.allLogs.length)} of 
            ${config.allLogs.length} results
        </div>
    `;

    return paginationHTML;
}

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
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
}
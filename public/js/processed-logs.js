import { db } from './firebase-config.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Pagination + state
const config = {
    itemsPerPage: 10,
    currentPage: 1,
    totalPages: 1,
    allLogs: [],
    filteredLogs: []
};

document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        tbody: document.getElementById('checkall-list'),
        loadingDiv: document.getElementById('logs-loading'),
        tableWrapper: document.getElementById('logs-table-wrapper'),
        paginationContainer: document.querySelector('.pagination-container'),
        mobilePageInfo: document.getElementById('mobile-page-info'),
        searchInput: document.getElementById('logs-search')
    };

    // Ensure required DOM elements exist
    if (Object.values(elements).some(el => el === null)) {
        console.error("Missing required DOM elements");
        return;
    }

    const logsRef = ref(db, 'ProcessingLogs');

    showLoading(elements, true);

    onValue(logsRef, snapshot => {
        showLoading(elements, true);
        elements.tbody.innerHTML = '';

        if (snapshot.exists()) {
            const logs = snapshot.val();

            // Sort logs by timestamp descending
            config.allLogs = Object.values(logs).sort((a, b) =>
                new Date(b.timestamp) - new Date(a.timestamp)
            );

            // Start with all logs visible
            config.filteredLogs = [...config.allLogs];
            config.totalPages = Math.ceil(config.filteredLogs.length / config.itemsPerPage);

            renderPage(elements, config);
            updatePaginationControls(elements, config);
        } else {
            showEmptyState(elements.tbody, "No processing logs found");
            elements.paginationContainer.style.display = 'none';
        }

        showLoading(elements, false);
    }, error => {
        console.error("Error loading logs:", error);
        showEmptyState(elements.tbody, "Error loading logs", true);
        showLoading(elements, false);
    });

    // Pagination click handlers
    document.addEventListener('click', e => {
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

    // Search handler
    elements.searchInput.addEventListener('input', () => {
        const term = elements.searchInput.value.trim().toLowerCase();
        config.filteredLogs = config.allLogs.filter(log =>
            log.filename.toLowerCase().includes(term) ||
            new Date(log.timestamp).toLocaleString().toLowerCase().includes(term)
        );

        config.currentPage = 1;
        config.totalPages = Math.ceil(config.filteredLogs.length / config.itemsPerPage);

        renderPage(elements, config);
        updatePaginationControls(elements, config);
    });
});

/**
 * Show or hide loading state
 */
function showLoading(elements, isLoading) {
    elements.loadingDiv.classList.toggle('d-none', !isLoading);
    elements.tableWrapper.classList.toggle('d-none', isLoading);
}

/**
 * Show empty/error state in the table
 */
function showEmptyState(tbody, message, isError = false) {
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center ${isError ? 'text-danger' : 'text-muted'} py-4">
                ${message}
            </td>
        </tr>
    `;
}

/**
 * Render the current page of logs
 */
function renderPage(elements, config) {
    const startIndex = (config.currentPage - 1) * config.itemsPerPage;
    const endIndex = Math.min(startIndex + config.itemsPerPage, config.filteredLogs.length);
    const pageLogs = config.filteredLogs.slice(startIndex, endIndex);

    if (pageLogs.length === 0) {
        showEmptyState(elements.tbody, "No logs found for this page");
        return;
    }

    elements.tbody.innerHTML = pageLogs
        .map((log, index) => renderLogRow(log, startIndex + index + 1))
        .join('');

    if (elements.mobilePageInfo) {
        elements.mobilePageInfo.textContent =
            `Showing ${startIndex + 1} to ${endIndex} of ${config.filteredLogs.length} results`;
    }
}

/**
 * Update pagination controls
 */
function updatePaginationControls(elements, config) {
    if (config.totalPages <= 1) {
        elements.paginationContainer.style.display = 'none';
        return;
    }

    elements.paginationContainer.style.display = 'block';
    elements.paginationContainer.innerHTML = generatePaginationHTML(config);
}

/**
 * Generate pagination HTML
 */
function generatePaginationHTML(config) {
    const maxVisiblePages = 5;
    let startPage = 1;
    let endPage = config.totalPages;

    if (config.totalPages > maxVisiblePages) {
        const half = Math.floor(maxVisiblePages / 2);

        if (config.currentPage <= half) {
            endPage = maxVisiblePages;
        } else if (config.currentPage + half >= config.totalPages) {
            startPage = config.totalPages - maxVisiblePages + 1;
        } else {
            startPage = config.currentPage - half;
            endPage = config.currentPage + half;
        }
    }

    let html = `
        <nav aria-label="Pagination">
            <ul class="pagination justify-content-center">
                <li class="page-item ${config.currentPage === 1 ? 'disabled' : ''}">
                    <a class="page-link prev-page" href="#" aria-label="Previous">
                        &laquo;
                    </a>
                </li>
    `;

    // First page + ellipsis
    if (startPage > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
        if (startPage > 2) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }

    // Main pages
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === config.currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `;
    }

    // Last page + ellipsis
    if (endPage < config.totalPages) {
        if (endPage < config.totalPages - 1) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        html += `<li class="page-item"><a class="page-link" href="#" data-page="${config.totalPages}">${config.totalPages}</a></li>`;
    }

    // Next button
    html += `
                <li class="page-item ${config.currentPage === config.totalPages ? 'disabled' : ''}">
                    <a class="page-link next-page" href="#" aria-label="Next">
                        &raquo;
                    </a>
                </li>
            </ul>
        </nav>
        <div class="text-muted small text-center mt-2">
            Showing ${(config.currentPage - 1) * config.itemsPerPage + 1} to 
            ${Math.min(config.currentPage * config.itemsPerPage, config.filteredLogs.length)} of 
            ${config.filteredLogs.length} results
        </div>
    `;

    return html;
}

/**
 * Render a single log row
 */
function renderLogRow(log, rowNumber) {
    const { filename, alerts, lowAttendance, lowGrades, minAttendance, minGrade, timestamp } = log;
    const formattedDate = new Date(timestamp).toLocaleString();
    const daysAgo = calcDaysAgo(timestamp);
    const downloadUrl = `https://ited.org.ec/aura/excelfiles_upload/uploads/${filename}`;

    return `
        <tr>
            <th>${rowNumber}</th>
            <td>
                <a href="${downloadUrl}" class="link-normal fw-medium d-block" download>${filename}</a>
                <span class="smaller text-muted d-block">
                    ${alerts} alerts | Min Attendance: ${minAttendance} | Min Grade: ${minGrade}
                </span>
            </td>
            <td>
                <span class="text-success d-block">${lowAttendance} Low Attendance</span>
                <span class="text-danger d-block">${lowGrades} Low Grades</span>
            </td>
            <td>
                <span class="small text-muted d-block">${formattedDate}</span>
                <span class="small text-muted d-block">${daysAgo}</span>
            </td>
            <td>
                <div class="dropdown text-muted small">
                    <a href="#" class="dropdown-toggle btn btn-sm btn-light" data-bs-toggle="dropdown">
                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M9.5 13a1.5 1.5 0 1 1-3 0 
                                     1.5 1.5 0 0 1 3 0zm0-5a1.5 
                                     1.5 0 1 1-3 0 1.5 1.5 
                                     0 0 1 3 0zm0-5a1.5 1.5 
                                     0 1 1-3 0 1.5 1.5 
                                     0 0 1 3 0z"></path>
                        </svg>
                    </a>
                    <div class="dropdown-menu">
                        <a href="transcripts_xls.html" class="dropdown-item">Transcripts (Excel)</a>
                        <a href="transcripts_word.html" class="dropdown-item">Transcripts (Word)</a>
                        <a href="${downloadUrl}" class="dropdown-item" download>Download raw</a>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

/**
 * Calculate how many days ago a date was
 */
function calcDaysAgo(dateString) {
    const diffDays = Math.floor((Date.now() - new Date(dateString)) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
}

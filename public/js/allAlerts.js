import { db } from './firebase-config.js';
import { ref, onValue, update, push, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// First, define all the functions that will be used. These don't interact with the page yet.
function renderFullAlertItem(alert) {
    const readButtonText = alert.read ? 'Mark as Unread' : 'Mark as Read';
    const readButtonClass = alert.read ? 'btn-secondary' : 'btn-success';
    let commentsHTML = '';
    if (alert.comments) {
        commentsHTML += '<div class="mt-2 border-top pt-2">';
        for (const commentKey in alert.comments) {
            commentsHTML += `<div class="d-flex justify-content-between align-items-start mb-1 p-1 bg-light rounded"><em class="smaller text-break">${alert.comments[commentKey].text}</em><button type="button" class="btn-close btn-close-sm remove-comment-btn ms-2" aria-label="Remove" data-alert-key="${alert.key}" data-comment-key="${commentKey}"></button></div>`;
        }
        commentsHTML += '</div>';
    }
    return `<div class="card mb-2 alert-card"><div class="card-body p-2"><div class="d-flex justify-content-between"><h6 class="card-title mb-1">${alert.title || 'Alert'}</h6><span class="badge ${alert.read ? 'bg-secondary-soft text-secondary' : 'bg-primary-soft text-primary'}">${alert.read ? 'Read' : 'New'}</span></div><p class="card-text small mb-1">${alert.message || ''}</p><div class="d-flex align-items-center text-muted smaller mt-1"><i class="fi fi-robot me-1"></i><span>Issued by: <strong>${alert.issuedBy || 'System'}</strong> &bull; ${formatTimestamp(alert.timestamp)}</span></div>${commentsHTML}<div class="mt-2 d-flex flex-wrap gap-1 align-items-center border-top pt-2"><button class="btn btn-sm ${readButtonClass} mark-as-read-btn" data-key="${alert.key}" data-read="${alert.read}">${readButtonText}</button><button class="btn btn-primary btn-sm add-comment-btn" data-bs-toggle="modal" data-bs-target="#commentModal" data-key="${alert.key}">Add Comment</button></div></div></div>`;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Invalid Date';
    const d = new Date(timestamp);
    if (isNaN(d)) return 'Invalid Date';
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month} ${day} ${year}, ${hours}:${minutes}`;
}

function updateReadStatus(key, newStatus) {
    update(ref(db, `alerts/${key}`), { read: newStatus }).catch(console.error);
}

function addCommentToAlert(key, text) {
    push(ref(db, `alerts/${key}/comments`), { text: text, timestamp: new Date().toISOString() }).catch(console.error);
}

function removeComment(alertKey, commentKey) {
    remove(ref(db, `alerts/${alertKey}/comments/${commentKey}`)).catch(console.error);
}


// This is the main script that runs AFTER the page is fully loaded
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. SETUP & STATE ---
    const animationCSS = `.alert-card { transition: opacity 1s ease-out, transform 1s ease-out; } .alert-card-fading { opacity: 0; transform: scale(0.95); }`;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = animationCSS;
    document.head.appendChild(styleSheet);
    
    // HTML Injection
    const sectionContainer = document.querySelector('#middle .section');
    if (sectionContainer) {
        // ** BUTTON COLORS REVERTED TO ORIGINAL GREEN AND PURPLE/PRIMARY **
        const bulkActionButtonsHTML = `<div class="d-flex justify-content-end gap-2 mb-3"><button id="mark-all-read-btn" class="btn btn-success btn-sm">Mark All as Read</button><button id="mark-all-unread-btn" class="btn btn-primary btn-sm">Mark All as Unread</button></div>`;
        const searchHTML = `<div class="mb-3"><input type="text" id="alert-search-bar" class="form-control" placeholder="Search alerts..."></div>`;
        const paginationHTML = `<nav id="pagination-container" class="d-flex justify-content-center mt-4"></nav>`;
        sectionContainer.insertAdjacentHTML('afterbegin', bulkActionButtonsHTML);
        sectionContainer.insertAdjacentHTML('afterbegin', searchHTML);
        sectionContainer.insertAdjacentHTML('beforeend', paginationHTML);
    }
    const modalHTML = `<div class="modal fade" id="commentModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog"><div class="modal-content"><div class="modal-header py-2"><h5 class="modal-title fs-6">Add a Comment</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body py-2"><form id="commentModalForm"><input type="hidden" id="commentAlertKey"><div class="mb-2"><label for="commentText" class="form-label small">Comment</label><textarea class="form-control form-control-sm" id="commentText" rows="4" required></textarea></div></form></div><div class="modal-footer py-2"><button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button><button type="submit" class="btn btn-primary btn-sm" form="commentModalForm">Save Comment</button></div></div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Now that the HTML is injected, we can safely get references to the elements
    const searchInput = document.getElementById('alert-search-bar');
    const paginationContainer = document.getElementById('pagination-container');
    const allAlertsContainer = document.getElementById('all-alerts-container');
    const commentModal = document.getElementById('commentModal');

    let masterAlertList = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    let isAnimating = false;
    const alertsRef = ref(db, 'alerts');
    
    // --- 2. CORE RENDERING LOGIC ---
    function filterAndRenderAlerts() {
        // ** THE FIX IS HERE: These lines are now INSIDE this function, so they run correctly **
        const searchTerm = searchInput.value.toLowerCase();
        
        const filteredAlerts = searchTerm ? masterAlertList.filter(alert => {
            const title = (alert.title || '').toLowerCase();
            const message = (alert.message || '').toLowerCase();
            const commentsMatch = alert.comments ? Object.values(alert.comments).some(c => (c.text || '').toLowerCase().includes(searchTerm)) : false;
            return title.includes(searchTerm) || message.includes(searchTerm) || commentsMatch;
        }) : [...masterAlertList];
        
        filteredAlerts.sort((a, b) => (a.read - b.read) || (new Date(b.timestamp) - new Date(a.timestamp)));
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedAlerts = filteredAlerts.slice(startIndex, endIndex);
        
        allAlertsContainer.innerHTML = paginatedAlerts.length ? paginatedAlerts.map(renderFullAlertItem).join('') : '<div class="py-5 text-gray-400 text-center">No Alerts Found</div>';
        renderPagination(filteredAlerts.length);
    }

    function renderPagination(totalItems) {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (totalPages <= 1) { paginationContainer.innerHTML = ''; return; }
        let paginationHTML = `<ul class="pagination pagination-sm">`;
        paginationHTML += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="first">&laquo; First</a></li>`;
        paginationHTML += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="prev">&lsaquo;</a></li>`;

        const maxPagesToShow = 7;
        let startPage, endPage;
        if (totalPages <= maxPagesToShow) {
            startPage = 1; endPage = totalPages;
        } else {
            const pageBuffer = Math.floor((maxPagesToShow - 2) / 2);
            startPage = Math.max(2, currentPage - pageBuffer);
            endPage = Math.min(totalPages - 1, currentPage + pageBuffer);
        }

        if (startPage > 1) {
            paginationHTML += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
            if (startPage > 2) paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            paginationHTML += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
        }
        
        paginationHTML += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" data-page="next">&rsaquo;</a></li>`;
        paginationHTML += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" data-page="last">Last &raquo;</a></li>`;
        paginationHTML += `</ul>`;
        paginationContainer.innerHTML = paginationHTML;
    }

    // --- 3. EVENT HANDLING ---
    searchInput.addEventListener('input', () => { currentPage = 1; filterAndRenderAlerts(); });
    
    paginationContainer.addEventListener('click', (event) => {
        event.preventDefault();
        const target = event.target;
        if (target.tagName !== 'A') return;
        const totalItems = searchInput.value ? masterAlertList.filter(alert => (alert.title || '').toLowerCase().includes(searchInput.value.toLowerCase())).length : masterAlertList.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const pageAction = target.dataset.page;
        if (pageAction === 'first') currentPage = 1;
        else if (pageAction === 'last') currentPage = totalPages;
        else if (pageAction === 'prev' && currentPage > 1) currentPage--;
        else if (pageAction === 'next' && currentPage < totalPages) currentPage++;
        else if (!isNaN(pageAction)) currentPage = parseInt(pageAction);
        filterAndRenderAlerts();
    });

    allAlertsContainer.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('mark-as-read-btn')) {
            const alertKey = target.dataset.key;
            const currentReadStatus = target.dataset.read === 'true';
            isAnimating = true;
            updateReadStatus(alertKey, !currentReadStatus);
            const alertCard = target.closest('.alert-card');
            if (alertCard) {
                alertCard.classList.add('alert-card-fading');
                setTimeout(() => {
                    const alertToUpdate = masterAlertList.find(a => a.key === alertKey);
                    if (alertToUpdate) alertToUpdate.read = !currentReadStatus;
                    filterAndRenderAlerts();
                    isAnimating = false;
                }, 1000);
            } else {
                isAnimating = false;
            }
        } 
        else if (target.classList.contains('remove-comment-btn')) {
            removeComment(target.dataset.alertKey, target.dataset.commentKey);
        }
        else if (target.classList.contains('add-comment-btn')) {
            document.getElementById('commentAlertKey').value = target.dataset.key;
            const modalInstance = bootstrap.Modal.getOrCreateInstance(commentModal);
            modalInstance.show();
        }
    });

    document.getElementById('mark-all-read-btn').addEventListener('click', () => {
        const unreadAlerts = masterAlertList.filter(alert => !alert.read);
        if (unreadAlerts.length === 0) return alert("All alerts are already marked as read.");
        const updates = {};
        unreadAlerts.forEach(alert => { updates[`alerts/${alert.key}/read`] = true; });
        update(ref(db), updates).catch(console.error);
    });

    document.getElementById('mark-all-unread-btn').addEventListener('click', () => {
        const readAlerts = masterAlertList.filter(alert => alert.read);
        if (readAlerts.length === 0) return alert("All alerts are already marked as unread.");
        const updates = {};
        readAlerts.forEach(alert => { updates[`alerts/${alert.key}/read`] = false; });
        update(ref(db), updates).catch(console.error);
    });

    document.getElementById('commentModalForm').addEventListener('submit', (event) => {
        event.preventDefault();
        const alertKey = document.getElementById('commentAlertKey').value;
        const text = document.getElementById('commentText').value.trim();
        if (alertKey && text) {
            addCommentToAlert(alertKey, text);
            const modalInstance = bootstrap.Modal.getInstance(commentModal);
            if (modalInstance) modalInstance.hide();
        }
    });

    commentModal.addEventListener('hidden.bs.modal', () => {
        document.getElementById('commentModalForm').reset();
    });

    // --- 4. FIREBASE LISTENER ---
    onValue(alertsRef, snapshot => {
        if (isAnimating) return;
        masterAlertList = [];
        if (snapshot.exists()) {
            const alerts = snapshot.val();
            for (const uploadKey in alerts) {
                for (const alertKey in alerts[uploadKey]) {
                    masterAlertList.push({ key: `${uploadKey}/${alertKey}`, ...alerts[uploadKey][alertKey] });
                }
            }
        }
        filterAndRenderAlerts(); 
    }, console.error);
});
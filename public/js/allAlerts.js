import { db } from './firebase-config.js';
import { ref, onValue, update, push, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {


    const modalHTML = `
    <div class="modal fade" id="commentModal" tabindex="-1" aria-labelledby="commentModalLabel" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="commentModalLabel">Add a Comment</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <form id="commentModalForm">
              <input type="hidden" id="commentAlertKey" name="alertKey">
              <div class="mb-3">
                <label for="commentAuthor" class="form-label">Your Name</label>
                <input type="text" class="form-control" id="commentAuthor" required>
              </div>
              <div class="mb-3">
                <label for="commentText" class="form-label">Comment</label>
                <textarea class="form-control" id="commentText" rows="3" required></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            <button type="submit" class="btn btn-primary" form="commentModalForm">Save Comment</button>
          </div>
        </div>
      </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const alertsRef = ref(db, 'alerts');
    const allAlertsContainer = document.getElementById('all-alerts-container');
    const commentModalElement = document.getElementById('commentModal');
    const commentModal = new bootstrap.Modal(commentModalElement);


    onValue(alertsRef, snapshot => {
        if (snapshot.exists()) {
            const alerts = snapshot.val();
            let allAlertsList = [];
            for (const uploadKey in alerts) {
                for (const alertKey in alerts[uploadKey]) {
                    allAlertsList.push({
                        key: `${uploadKey}/${alertKey}`,
                        ...alerts[uploadKey][alertKey]
                    });
                }
            }
            allAlertsList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            allAlertsContainer.innerHTML = allAlertsList.length ? allAlertsList.map(renderFullAlertItem).join('') : '<div class="py-5 text-gray-400 text-center">No Alerts Found</div>';
        } else {
            allAlertsContainer.innerHTML = '<div class="py-5 text-gray-400 text-center">No Alerts Found</div>';
        }
    }, error => {
        console.error("Error listening for alerts:", error);
        allAlertsContainer.innerHTML = '<div class="py-5 text-danger text-center">Error loading alerts.</div>';
    });

    allAlertsContainer.addEventListener('click', (event) => {
        const target = event.target;

        if (target.classList.contains('mark-as-read-btn')) {
            updateReadStatus(target.dataset.key, !(target.dataset.read === 'true'));
        }
        else if (target.classList.contains('remove-comment-btn')) {
            removeComment(target.dataset.alertKey, target.dataset.commentKey);
        }
        else if (target.classList.contains('add-comment-btn')) {
            const alertKey = target.dataset.key;
            document.getElementById('commentAlertKey').value = alertKey;
            commentModal.show();
        }
    });

    document.getElementById('commentModalForm').addEventListener('submit', (event) => {
        event.preventDefault();
        const alertKey = document.getElementById('commentAlertKey').value;
        const author = document.getElementById('commentAuthor').value.trim();
        const text = document.getElementById('commentText').value.trim();
        if (alertKey && author && text) {
            addCommentToAlert(alertKey, author, text);
            commentModal.hide();
        }
    });

    commentModalElement.addEventListener('hidden.bs.modal', () => {
        document.getElementById('commentModalForm').reset();
        document.getElementById('commentAlertKey').value = '';
    });

});

function renderFullAlertItem(alert) {
    const readButtonText = alert.read ? 'Mark as Unread' : 'Mark as Read';
    const readButtonClass = alert.read ? 'btn-secondary' : 'btn-success';

    let commentsHTML = '';
    if (alert.comments) {
        commentsHTML += '<div class="mt-3 border-top pt-3">';
        for (const commentKey in alert.comments) {
            const comment = alert.comments[commentKey];
            commentsHTML += `
                <div class="d-flex justify-content-between align-items-start mb-1 p-2 bg-light rounded">
                    <div>
                        <strong class="d-block">${comment.author || 'Anonymous'}</strong>
                        <em class="small text-break">${comment.text}</em>
                    </div>
                    <button type="button" class="btn-close remove-comment-btn ms-2" aria-label="Remove" data-alert-key="${alert.key}" data-comment-key="${commentKey}"></button>
                </div>
            `;
        }
        commentsHTML += '</div>';
    }

    return `
        <div class="card mb-3 ${alert.read ? '' : 'border-primary'}">
            <div class="card-body">
                <div class="d-flex justify-content-between">
                    <h5 class="card-title">${alert.title || 'Alert'}</h5>
                    <span class="badge ${alert.read ? 'bg-secondary-soft text-secondary' : 'bg-primary-soft text-primary'}">${alert.read ? 'Read' : 'New'}</span>
                </div>
                <p class="card-text">${alert.message || ''}</p>
                <p class="card-text"><small class="text-muted">${formatTimestamp(alert.timestamp)}</small></p>
                ${commentsHTML}
                <div class="mt-3 d-flex flex-wrap gap-2 align-items-center border-top pt-3">
                    <button class="btn btn-sm ${readButtonClass} mark-as-read-btn" data-key="${alert.key}" data-read="${alert.read}">
                        ${readButtonText}
                    </button>
                    <button class="btn btn-primary btn-sm add-comment-btn" data-key="${alert.key}">
                        Add Comment
                    </button>
                </div>
            </div>
        </div>
    `;
}

function formatTimestamp(timestamp) {
    return timestamp ? new Date(timestamp).toLocaleString() : 'Invalid Date';
}

function updateReadStatus(key, newStatus) {
    update(ref(db, `alerts/${key}`), { read: newStatus }).catch(console.error);
}

function addCommentToAlert(key, author, text) {
    push(ref(db, `alerts/${key}/comments`), {
        author: author,
        text: text,
        timestamp: new Date().toISOString()
    }).catch(console.error);
}

function removeComment(alertKey, commentKey) {
    remove(ref(db, `alerts/${alertKey}/comments/${commentKey}`)).catch(console.error);
}
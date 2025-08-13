import { auth } from "./firebase-config.js";

let allCourses = []; // store fetched courses for search

async function loadInstructorCourses(instructorId) {
    const user = auth.currentUser;
    if (!user) {
        showError("Authentication required");
        return;
    }

    try {
        showLoading();

        const apiUrl = `https://ited.org.ec/aura/canvas_api/get_instructor_courses.php?instructor_id=${instructorId}&user_uid=${encodeURIComponent(user.uid)}`;
        console.log("Fetching:", apiUrl);

        const response = await fetch(apiUrl);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || "Request failed");
        }

        allCourses = data.courses; // save for search filtering
        updateUI(data);

    } catch (error) {
        console.error("Error:", error);
        showError(error.message.includes("JSON")
            ? "Data processing error"
            : error.message);
    } finally {
        hideLoading();
    }
}

function updateUI(data) {
    // Update statistics cards
    document.getElementById("total-courses").textContent = data.stats.total_courses;
    document.getElementById("active-courses").textContent = data.stats.active_courses;
    document.getElementById("total-students").textContent = data.stats.total_students;
    document.getElementById("active-students").textContent = data.stats.active_students;

    // Calculate percentages
    const activePercent = Math.round((data.stats.active_courses / data.stats.total_courses) * 100);
    document.getElementById("active-percent").textContent = `${activePercent}%`;

    // Render full course list initially
    renderCoursesTable(allCourses);
}

function renderCoursesTable(courses) {
    const tbody = document.getElementById("instructor-course-list");
    tbody.innerHTML = "";

    if (!courses.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No courses found</td></tr>`;
        return;
    }

    courses.forEach((course, index) => {
        const isActive = course.status === 'available';
        const startDate = course.start_at
            ? new Date(course.start_at).toLocaleDateString()
            : 'Not scheduled';

        const row = document.createElement("tr");
        if (!isActive) row.classList.add("table-warning");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>
                ${course.name}
                <small class="text-muted d-block">${startDate}</small>
            </td>
            <td>${course.course_code || course.id}</td>
            <td>${course.total_students}</td>
            <td>
                <span class="badge ${isActive ? 'bg-success' : 'bg-warning'}">
                    ${isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="flex-none ms-2 small text-muted text-align-end dropdown">
                    <a href="#" class="dropdown-toggle btn btn-sm btn-light px-2 py-1 mt-n1" 
                       data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false" aria-label="options">
                        <svg width="18px" height="18px" xmlns="http://www.w3.org/2000/svg" 
                             fill="currentColor" class="bi bi-three-dots-vertical" 
                             viewBox="0 0 16 16">
                          <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
                        </svg>
                    </a>
                    <div class="dropdown-menu mt-2">
                        <a href="#" class="dropdown-item">View Details</a>
                        <a href="#" class="dropdown-item">Students</a>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Helper functions
function showLoading() {
    document.getElementById("logs-loading").classList.remove("d-none");
    document.getElementById("logs-table-wrapper").classList.add("d-none");
}

function hideLoading() {
    document.getElementById("logs-loading").classList.add("d-none");
    document.getElementById("logs-table-wrapper").classList.remove("d-none");
}

function showError(message) {
    const errorEl = document.getElementById("instructor-course-list");
    errorEl.innerHTML = `<tr><td colspan="6" class="text-danger">${message}</td></tr>`;
    hideLoading();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const instructorId = urlParams.get('instructor_id');

    // Search box listener
    const searchInput = document.getElementById("course-search");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            const term = searchInput.value.toLowerCase();
            const filtered = allCourses.filter(course =>
                course.name.toLowerCase().includes(term) ||
                (course.course_code && course.course_code.toLowerCase().includes(term)) ||
                String(course.id).toLowerCase().includes(term)
            );
            renderCoursesTable(filtered);
        });
    }

    if (instructorId) {
        auth.onAuthStateChanged((user) => {
            if (user) loadInstructorCourses(instructorId);
        });
    }
});

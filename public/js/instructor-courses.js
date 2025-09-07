import { auth } from "./firebase-config.js";

let allCourses = []; // store fetched courses for search
let loadingInterval;
let loadingDotsInterval;
let instructorName;

const messages = [
    "Fetching from Canvas",
    "Processing enrollments",
    "Processing assignments",
    "Processing grades",
    "Finalizing data"
];

function setLoadingMessage(message) {
    const el = document.getElementById("loading-text");
    let dots = 0;
    if (loadingDotsInterval) clearInterval(loadingDotsInterval);
    loadingDotsInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        el.textContent = message + '.'.repeat(dots);
    }, 500);
}

async function loadInstructorCourses(instructorId) {
    const user = auth.currentUser;
    if (!user) {
        showError("Authentication required");
        return;
    }
    try {
        showLoading();
        setLoadingMessage("Fetching from Canvas");
        const apiUrl = `https://ited.org.ec/aura/canvas_api/get_instructor_courses.php?instructor_id=${instructorId}&user_uid=${encodeURIComponent(user.uid)}`;
        const response = await fetch(apiUrl);
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Request failed");
        }
        setLoadingMessage("Finalizing data");
        allCourses = data.courses;
        updateUI(data);
    } catch (error) {
        console.error("Error:", error);
        showError(error.message.includes("JSON") ? "Data processing error" : error.message);
    } finally {
        hideLoading();
    }
}

function updateUI(data) {
    document.getElementById("total-courses").textContent = data.stats.total_courses;
    document.getElementById("active-courses").textContent = data.stats.active_courses;
    document.getElementById("total-students").textContent = data.stats.total_students;
    document.getElementById("active-students").textContent = data.stats.active_students;
    document.getElementById("total-ungraded").textContent = data.stats.total_ungraded_assignments;
    const activePercent = data.stats.total_courses > 0 ? Math.round((data.stats.active_courses / data.stats.total_courses) * 100) : 0;
    document.getElementById("active-percent").textContent = `${activePercent}%`;
    const totalStudentsProblems = allCourses.reduce((sum, course) => sum + (course.students_with_problems || 0), 0);
    document.getElementById("total-students-problems").textContent = totalStudentsProblems;
    renderCoursesTable(allCourses);
}

function renderCoursesTable(courses) {
    const tbody = document.getElementById("instructor-course-list");
    tbody.innerHTML = "";
    if (!courses.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center">No courses found</td></tr>`;
        return;
    }
    courses.sort((a, b) => b.ungraded_assignments - a.ungraded_assignments);

    const urlParams = new URLSearchParams(window.location.search);
    const instructorId = urlParams.get('instructor_id');

    courses.forEach((course, index) => {
        const isActive = course.status === 'available';
        const startDate = course.start_at ? new Date(course.start_at).toLocaleDateString() : 'Not scheduled';
        const row = document.createElement("tr");
        if (!isActive) row.classList.add("table-warning");

        const ungradedBadge = course.ungraded_assignments > 0
            ? `<span class="notification-count-alerts" style="position: relative; display: inline-block; background: orange; color: white; border-radius: 50%; padding: 10px 8px; font-size: 12px; margin-left: 5px; text-align: center;">
                ${course.ungraded_assignments}
                <div style="font-size: 8px; color: #fff; line-height: 1; margin-top: 2px;">To Grade</div>
               </span>`
            : '';

        const courseId = course.id;
        const problemsBadge = course.students_with_problems && course.students_with_problems > 0
            ? `<a href="student-risks.html?instructor_id=${instructorId}&course_id=${courseId}&instructor_name=${instructorName}" class="notification-count-alerts" style="position: relative; display: inline-block; background: red; color: white; border-radius: 50%; padding: 10px 8px; font-size: 12px; margin-left: 5px; text-align: center; text-decoration: none;">
                ${course.students_with_problems}
                <div style="font-size: 8px; color: #fff; line-height: 1; margin-top: 2px;">Problems</div>
               </a>`
            : '';

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${course.name}<small class="text-muted d-block">${startDate}</small></td>
            <td>${course.course_code || course.id}</td>
            <td>${course.total_students}</td>
            <td>
                <span class="badge ${isActive ? 'bg-success' : 'bg-warning'}">${isActive ? 'Active' : 'Inactive'}</span>
                ${ungradedBadge}
                ${problemsBadge}
            </td>
            <td>
                <div class="flex-none ms-2 small text-muted text-align-end dropdown">
                    <a href="#" class="dropdown-toggle btn btn-sm btn-light px-2 py-1 mt-n1" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false" aria-label="options">
                        <svg width="18px" height="18px" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-three-dots-vertical" viewBox="0 0 16 16"><path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path></svg>
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

function showLoading() {
    document.getElementById("logs-loading").classList.remove("d-none");
    document.getElementById("logs-table-wrapper").classList.add("d-none");
    const loadingTextEl = document.getElementById("loading-text");
    let msgIndex = 0;
    let dots = 0;
    loadingInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        loadingTextEl.textContent = messages[msgIndex] + '.'.repeat(dots);
        if (dots === 0) {
            msgIndex = (msgIndex + 1) % messages.length;
        }
    }, 500);
}

function hideLoading() {
    document.getElementById("logs-loading").classList.add("d-none");
    document.getElementById("logs-table-wrapper").classList.remove("d-none");
    if (loadingInterval) {
        clearInterval(loadingInterval);
        loadingInterval = null;
    }
}

function showError(message) {
    const errorEl = document.getElementById("instructor-course-list");
    errorEl.innerHTML = `<tr><td colspan="5" class="text-danger">${message}</td></tr>`;
    hideLoading();
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const instructorId = urlParams.get('instructor_id');
    instructorName = urlParams.get('instructor_name');

    if (instructorName) {
        const header = document.querySelector("h2.mb-5.fw-bold");
        if (header) {
            header.textContent = decodeURIComponent(instructorName);
        }
    }

    const dashboardTitle = document.getElementById("instructor_name_dashboard");
    if (dashboardTitle && instructorName) {
        dashboardTitle.textContent = `${decodeURIComponent(instructorName)} Courses Dashboard`;
    }

    const instructor_name_dashboard_small = document.getElementById("instructor_name_dashboard_small");
    if (instructor_name_dashboard_small && instructorName) {
        instructor_name_dashboard_small.textContent = `${decodeURIComponent(instructorName)} Courses Dashboard`;
    }



    const searchInput = document.getElementById("course-search");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            const term = searchInput.value.toLowerCase();
            const filtered = allCourses.filter(course =>
                course.name.toLowerCase().includes(term) ||
                (course.course_code && course.course_code.toLowerCase().includes(term)) ||
                String(course.id).toLowerCase().includes(term)
            );
            // This was the source of the error in the last version.
            // By putting it back to the original, it will now work.
            renderCoursesTable(filtered);
        });
    }

    if (instructorId) {
        auth.onAuthStateChanged((user) => {
            if (user) loadInstructorCourses(instructorId);
        });
    }
});
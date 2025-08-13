import { auth } from "./firebase-config.js";

let allInstructors = []; // Store all instructors for filtering

async function loadInstructors() {
    const courseId = 108; // your Canvas course ID

    const user = auth.currentUser;
    if (!user) {
        console.error("User not signed in");
        document.getElementById("instructors-list").innerHTML =
            `<tr><td colspan="5" style="color:red;">Error: You must be signed in to view instructors.</td></tr>`;
        return;
    }

    const userUid = encodeURIComponent(user.uid);

    try {
        const response = await fetch(`https://ited.org.ec/aura/canvas_api/get_instructors.php?course_id=${courseId}&user_uid=${userUid}`);
        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch (err) {
            console.error("Invalid JSON received:", text);
            document.getElementById("instructors-list").innerHTML =
                `<tr><td colspan="5" style="color:red;">Error: Server returned invalid JSON</td></tr>`;
            return;
        }

        if (!data.success) {
            console.error("API error:", data.error);
            document.getElementById("instructors-list").innerHTML =
                `<tr><td colspan="5" style="color:red;">Error: ${data.error || "Unknown error"}</td></tr>`;
            document.getElementById("logs-loading").classList.add("d-none");
            document.getElementById("logs-table-wrapper").classList.remove("d-none");
            return;
        }

        allInstructors = data.teachers;
        displayInstructors(allInstructors);

        document.getElementById("logs-loading").classList.add("d-none");
        document.getElementById("logs-table-wrapper").classList.remove("d-none");

    } catch (error) {
        console.error("Fetch error:", error);
        document.getElementById("instructors-list").innerHTML =
            `<tr><td colspan="5" style="color:red;">Network or server error: ${error.message}</td></tr>`;
    }
}

function displayInstructors(instructors) {
    const tbody = document.getElementById("instructors-list");
    tbody.innerHTML = "";

    if (instructors.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">No instructors found</td></tr>`;
        return;
    }

    instructors.forEach((t, index) => {
        // Add instructor_id parameter to the link
        const row = `
            <tr>
                <td><a href="teacher-course-list.html?instructor_id=${t.id}">${index + 1}</a></td>
                <td><a href="teacher-course-list.html?instructor_id=${t.id}">${t.name}</a></td>
                <td>${t.login_id || "N/A"}</td>
                <td>${t.last_activity || "No activity"}</td>
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
                          <a href="teacher-course-list.html?instructor_id=${t.id}" class="dropdown-item">View Courses</a>
                          <a href="#" class="dropdown-item">Other Option</a>
                        </div>
                    </div>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function filterInstructors(searchTerm) {
    if (!searchTerm) {
        displayInstructors(allInstructors);
        return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = allInstructors.filter(instructor => {
        return (instructor.name && instructor.name.toLowerCase().includes(term)) ||
            (instructor.login_id && instructor.login_id.toLowerCase().includes(term));
    });

    displayInstructors(filtered);
}

// Single auth state listener
document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged((user) => {
        if (user) {
            loadInstructors();

            // Add search input listener
            const searchInput = document.getElementById('instructor-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    filterInstructors(e.target.value);
                });
            }
        } else {
            console.log("User not signed in");
            document.getElementById("instructors-list").innerHTML =
                `<tr><td colspan="5" style="color:red;">Error: You must be signed in to view instructors.</td></tr>`;
        }
    });
});
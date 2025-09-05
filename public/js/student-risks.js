import { auth } from './firebase-config.js';

let loadingInterval;

// Helper functions (these are correct, no changes needed here)
function showLoading() {
    document.getElementById("loading-spinner").classList.remove("d-none");
    document.getElementById("risk-table-wrapper").classList.add("d-none");
}

function hideLoading() {
    document.getElementById("loading-spinner").classList.add("d-none");
    document.getElementById("risk-table-wrapper").classList.remove("d-none");
}

// ** FIX: Added backticks around the HTML string **
function showError(message) {
    const errorEl = document.getElementById("student-risk-list");
    errorEl.innerHTML = `<tr><td colspan="3" class="text-danger text-center">${message}</td></tr>`;
    hideLoading();
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const instructorId = urlParams.get('instructor_id');
    const courseId = urlParams.get('course_id');

    const instructorBreadcrumb = document.getElementById('instructor-breadcrumb');
    const courseNameDisplay = document.getElementById('course-name-display');
    const totalStudentsDisplay = document.getElementById('total-students-display');

    if (!instructorId || !courseId) {
        showError("Instructor or Course ID is missing from URL.");
        return;
    }

    async function loadCourseAndStudentData() {
        const user = auth.currentUser;
        if (!user) {
            showError("Authentication is required to view this page.");
            return;
        }

        try {
            showLoading();

            // ** FIX: Added backticks around the URL string **
            const apiUrl = `https://ited.org.ec/aura/canvas_api/get_students_problems.php?instructor_id=${instructorId}&user_uid=${encodeURIComponent(user.uid)}&course_id=${courseId}`;

            const response = await fetch(apiUrl);

            if (!response.ok) {
                // ** FIX: Added backticks around the error message string **
                throw new Error(`The server returned an error: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                // ** FIX: Added backticks around the error message string **
                throw new Error(data.error || "The API returned a failure response.");
            }

            const course = data.course;

            if (!course) {
                throw new Error("Course data not found in API response.");
            }

            // Update course info
            courseNameDisplay.textContent = course.name || 'Unknown Course';
            totalStudentsDisplay.textContent = course.students_with_problems_count || 0;

            // Render students with problems
            const tableBody = document.getElementById("student-risk-list");
            tableBody.innerHTML = "";

            if (Array.isArray(data.students_with_problems) && data.students_with_problems.length > 0) {
                data.students_with_problems.forEach(stu => {
                    let type = '';
                    let value = '';

                    // Logic to determine problem type (this logic is good)
                    if (stu.current_score < 40) {
                        type = 'low_grade';
                        value = stu.current_score;
                    } else if (stu.attendance_score < 60) {
                        type = 'low_attendance';
                        value = stu.attendance_score;
                    }

                    tableBody.insertAdjacentHTML("beforeend", renderStudentRiskRow({
                        studentId: stu.student_id,
                        studentName: stu.student_name,
                        type: type,
                        value: value
                    }));
                });
            } else {
                // ** FIX: Added backticks around the HTML string **
                tableBody.innerHTML = `<tr><td colspan="3" class="text-center text-success">No students with problems 🎉</td></tr>`;
            }

            hideLoading();
        } catch (error) {
            console.error("Error loading page data:", error);
            showError(error.message);
        }
    }

    // ** FIX: Added backticks around the HTML string **
    instructorBreadcrumb.innerHTML = `<a href="teacher-course-list.html?instructor_id=${instructorId}">Instructor Courses</a>`;

    auth.onAuthStateChanged((user) => {
        if (user) {
            loadCourseAndStudentData();
        } else {
            showError("Please log in to view this information.");
        }
    });
});

function renderStudentRiskRow(studentData) {
    let problemDescription = '';
    const value = studentData.value || 'N/A';

    switch (studentData.type) {
        case 'low_grade':
            // ** FIX: Added backticks around the HTML string **
            problemDescription = `Low Grade: <span class="badge bg-danger">${value}</span>`;
            break;
        case 'low_attendance':
            // ** FIX: Added backticks around the HTML string **
            problemDescription = `Low Attendance: <span class="badge bg-warning text-dark">${value}</span>`;
            break;
        default:
            problemDescription = 'General Concern';
    }

    const downloadActions = `
        <a href="#" class="btn btn-sm btn-icon btn-light" title="Download First Notice"><i class="fi fi-file-word text-primary"></i></a>
        <a href="#" class="btn btn-sm btn-icon btn-light" title="Download Second Notice"><i class="fi fi-file-word text-primary"></i></a>
        <a href="#" class="btn btn-sm btn-icon btn-light" title="Download Final Notice"><i class="fi fi-file-word text-primary"></i></a>
    `;

    return `
        <tr>
            <td>${studentData.studentId || 'Unknown ID'}</td>
            <td>${studentData.studentName || 'Unknown Name'}</td>
            <td>
                <div class="d-flex justify-content-between align-items-center">
                    <span>${problemDescription}</span>
                    <div class="d-flex gap-1">${downloadActions}</div>
                </div>
            </td>
        </tr>
    `;
}
import { auth } from './firebase-config.js';

let loadingInterval;
let instructorName;

// Helper functions
function showLoading() {
    document.getElementById("loading-spinner").classList.remove("d-none");
    document.getElementById("risk-table-wrapper").classList.add("d-none");
}

function hideLoading() {
    document.getElementById("loading-spinner").classList.add("d-none");
    document.getElementById("risk-table-wrapper").classList.remove("d-none");
}

function showError(message) {
    const errorEl = document.getElementById("student-risk-list");
    errorEl.innerHTML = `<tr><td colspan="4" class="text-danger text-center">${message}</td></tr>`;
    hideLoading();
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const instructorId = urlParams.get('instructor_id');
    const courseId = urlParams.get('course_id');
    instructorName = urlParams.get('instructor_name');

    const instructorBreadcrumb = document.getElementById('instructor_name_dashboard_small');
    const courseNameDisplay = document.getElementById('course-name-display');
    const totalStudentsDisplay = document.getElementById('total-students-display');

    if (!instructorId || !courseId) {
        showError("Instructor or Course ID is missing from URL.");
        return;
    }




    if (instructorName) {
        const header = document.querySelector("h2.mb-5.fw-bold");
        if (header) {
            header.textContent = "Instructor: " + decodeURIComponent(instructorName);
        }
    }






    const dashboardTitle = document.getElementById("instructor_name_title");
    if (dashboardTitle && instructorName) {
        const url = `teacher-course-list.html?instructor_id=${instructorId}&instructor_name=${encodeURIComponent(instructorName)}`;
        dashboardTitle.innerHTML = `<a href="${url}" class="text-decoration-none">${decodeURIComponent(instructorName)} Courses Dashboard</a>`;
    }

    async function loadCourseAndStudentData() {
        const user = auth.currentUser;
        if (!user) {
            showError("Authentication is required to view this page.");
            return;
        }

        try {
            showLoading();

            const apiUrl = `https://ited.org.ec/aura/canvas_api/get_students_problems.php?instructor_id=${instructorId}&user_uid=${encodeURIComponent(user.uid)}&course_id=${courseId}`;

            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error(`The server returned an error: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || "The API returned a failure response.");
            }

            const course = data.course;

            if (!course) {
                throw new Error("Course data not found in API response.");
            }

            // Update course info
            courseNameDisplay.textContent = course.name || 'Unknown Course';
            totalStudentsDisplay.textContent = course.students_with_problems_count || 0;

            const tableBody = document.getElementById("student-risk-list");
            tableBody.innerHTML = "";

            if (Array.isArray(data.students_with_problems) && data.students_with_problems.length > 0) {
                data.students_with_problems.forEach(stu => {
                    tableBody.insertAdjacentHTML("beforeend", renderStudentRiskRow({
                        studentId: stu.student_id,
                        studentName: stu.student_name,
                        program: stu.program || "Unknown Program",
                        problems: stu.problems || []
                    }));
                });
            } else {
                tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-success">No students with problems 🎉</td></tr>`;
            }

            hideLoading();
        } catch (error) {
            console.error("Error loading page data:", error);
            showError(error.message);
        }
    }

    //instructorBreadcrumb.innerHTML = `>Instructor Courses</a>`;

    auth.onAuthStateChanged((user) => {
        if (user) {
            loadCourseAndStudentData();
        } else {
            showError("Please log in to view this information.");
        }
    });
});

function renderStudentRiskRow(studentData) {
    let problemsHtml = '';

    if (Array.isArray(studentData.problems) && studentData.problems.length > 0) {
        problemsHtml = studentData.problems.map(p => {
            switch (p.type) {
                case 'low_grade':
                    return `<div>Low Grade: <span class="badge bg-danger">${p.value}%</span></div>`;
                case 'low_attendance':
                    return `<div>Low Attendance: <span class="badge bg-warning text-dark">${p.value}%</span></div>`;
                default:
                    return `<div>General Concern</div>`;
            }
        }).join('');
    }

    const downloadActions = `
        <a href="#" class="btn btn-light text-primary" title="Download First Notice"><svg width="28px" height="28px" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-file-earmark-word" viewBox="0 0 16 16">  
  <path d="M5.485 6.879a.5.5 0 1 0-.97.242l1.5 6a.5.5 0 0 0 .967.01L8 9.402l1.018 3.73a.5.5 0 0 0 .967-.01l1.5-6a.5.5 0 0 0-.97-.242l-1.036 4.144-.997-3.655a.5.5 0 0 0-.964 0l-.997 3.655L5.485 6.88z"></path>  
  <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"></path>
</svg></a>
        <a href="#" class="btn btn-light text-secondary" title="Download First Notice"><svg width="28px" height="28px" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-file-earmark-word" viewBox="0 0 16 16">  
  <path d="M5.485 6.879a.5.5 0 1 0-.97.242l1.5 6a.5.5 0 0 0 .967.01L8 9.402l1.018 3.73a.5.5 0 0 0 .967-.01l1.5-6a.5.5 0 0 0-.97-.242l-1.036 4.144-.997-3.655a.5.5 0 0 0-.964 0l-.997 3.655L5.485 6.88z"></path>  
  <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"></path>
</svg></a>
 <a href="#" class="btn btn-light text-primary" title="Download First Notice"><svg width="28px" height="28px" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-file-earmark-word" viewBox="0 0 16 16">  
  <path d="M5.485 6.879a.5.5 0 1 0-.97.242l1.5 6a.5.5 0 0 0 .967.01L8 9.402l1.018 3.73a.5.5 0 0 0 .967-.01l1.5-6a.5.5 0 0 0-.97-.242l-1.036 4.144-.997-3.655a.5.5 0 0 0-.964 0l-.997 3.655L5.485 6.88z"></path>  
  <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"></path>
</svg></a>
 <a href="#" class="btn btn-light text-dark" title="Download First Notice"><svg width="28px" height="28px" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-file-earmark-word" viewBox="0 0 16 16">  
  <path d="M5.485 6.879a.5.5 0 1 0-.97.242l1.5 6a.5.5 0 0 0 .967.01L8 9.402l1.018 3.73a.5.5 0 0 0 .967-.01l1.5-6a.5.5 0 0 0-.97-.242l-1.036 4.144-.997-3.655a.5.5 0 0 0-.964 0l-.997 3.655L5.485 6.88z"></path>  
  <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"></path>
</svg></a>
    `;

    return `
        <tr>
            <td>${studentData.studentId || 'Unknown ID'}</td>
            <td>${studentData.studentName || 'Unknown Name'}</td>
            <td>${studentData.program || 'Unknown Program'}</td>
            <td>
                <div class="d-flex justify-content-between align-items-start">
                    <div>${problemsHtml}</div>
                    <div class="d-flex gap-1">${downloadActions}</div>
                </div>
            </td>
        </tr>
    `;
}

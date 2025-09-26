import { auth, db } from './firebase-config.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. SETUP & ELEMENT REFERENCES ---
    const totalRiskCount = document.getElementById('total-risk-count');
    const analysisTbody = document.getElementById('analysis-tbody');
    const searchInput = document.getElementById('course-search');
    const noResultsMessage = document.getElementById('no-results-message');
    const reportTimestamp = document.getElementById('report-timestamp');
    const minGradeDisplay = document.getElementById('min-grade-display');
    const minAttendanceDisplay = document.getElementById('min-attendance-display');

    let masterCourseData = [];

    // --- 2. THE MAIN DATA FETCH FUNCTION ---
    async function loadLatestReport() {
        try {
            const latestRef = ref(db, 'risk_reports/latest');
            const latestSnapshot = await get(latestRef);
            if (!latestSnapshot.exists()) throw new Error("The 'latest' report pointer was not found.");

            const latestData = latestSnapshot.val();
            const reportFolderName = latestData.timestamp;
            if (!reportFolderName) throw new Error("The 'latest' pointer is missing a timestamp.");

            const reportRef = ref(db, `risk_reports/${reportFolderName}`);
            const reportSnapshot = await get(reportRef);
            if (!reportSnapshot.exists()) throw new Error(`The report folder "${reportFolderName}" was not found.`);

            const data = reportSnapshot.val();

            if (data && data.courses && data.students) {
                const allCourses = data.courses;
                const allStudents = data.students;
                const studentsByCourse = {};
                for (const studentKey in allStudents) {
                    const student = allStudents[studentKey];
                    const courseId = student.course_id;
                    if (courseId) {
                        if (!studentsByCourse[courseId]) studentsByCourse[courseId] = [];
                        studentsByCourse[courseId].push(student);
                    }
                }

                const processedCourses = [];
                for (const courseId in allCourses) {
                    const course = allCourses[courseId];
                    const atRiskStudents = (studentsByCourse[course.id] || []).filter(s => s.problems);
                    processedCourses.push({
                        course: course,
                        students_with_problems: atRiskStudents,
                        instructors: [...new Set(atRiskStudents.map(s => s.instructor_names))].map(name => ({ name }))
                    });
                }

                masterCourseData = processedCourses;

                if (reportTimestamp && data.generated_at) reportTimestamp.textContent = `Displaying latest report generated on: ${new Date(data.generated_at).toLocaleString()}`;
                if (minGradeDisplay) minGradeDisplay.textContent = `${data.min_grade || 0}%`;
                if (minAttendanceDisplay) minAttendanceDisplay.textContent = `${data.min_attendance || 0}%`;

                render(masterCourseData);
            } else {
                throw new Error("The final report data is missing 'courses' or 'students'.");
            }
        } catch (error) {
            console.error("Error loading student risk analysis:", error);
            showError(error.message);
        }
    }

    // --- 3. RENDERING AND EVENT HANDLING ---
    function render(coursesToRender) {
        analysisTbody.innerHTML = "";
        let totalRisk = 0;
        noResultsMessage.classList.toggle('d-none', coursesToRender.length === 0);

        coursesToRender.forEach(courseData => {
            const course = courseData.course;
            const atRiskStudents = courseData.students_with_problems || [];
            const instructors = courseData.instructors || [];
            totalRisk += atRiskStudents.length;

            const courseRow = document.createElement('tr');
            courseRow.innerHTML = `<td>${course.name || 'N/A'}</td><td>${course.total_students || 0}</td><td>${atRiskStudents.length}</td><td class="text-end"><button class="btn btn-sm btn-light expand-btn" ${atRiskStudents.length === 0 ? 'disabled' : ''}><i class="fi fi-arrow-down expand-icon"></i></button></td>`;

            const detailsRow = document.createElement('tr');
            detailsRow.classList.add('d-none');
            detailsRow.innerHTML = `<td colspan="4" class="p-2" style="background-color: #FDEDEC;">${renderStudentDetails(atRiskStudents, course.name, instructors)}</td>`;

            analysisTbody.appendChild(courseRow);
            analysisTbody.appendChild(detailsRow);
        });
        totalRiskCount.textContent = totalRisk;
    }

    function renderStudentDetails(students, courseName, instructors) {
        if (!students || students.length === 0) return '';
        const instructorNames = instructors.map(inst => inst.name).join(', ');
        let tableRowsHTML = students.map(student => {
            let problemDescription = '';
            const problem = student.problems;
            if (problem) {
                switch (problem.type) {
                    case 'low_grade': problemDescription = `Low Grade: <span class="badge bg-danger">${problem.value}%</span>`; break;
                    case 'low_attendance': problemDescription = `Low Attendance: <span class="badge bg-warning text-dark">${problem.value}%</span>`; break;
                    default: problemDescription = `At-Risk: <span class="badge bg-secondary">${problem.value || ''}</span>`;
                }
            } else { problemDescription = 'N/A'; }
            const downloadActions = `<div class="actions"><button class="docbtn risk" title="Generate At-Risk Notice"><span class="icon">W</span><span class="label">At-Risk</span></button><button class="docbtn attn" title="Generate Attendance Notice"><span class="icon">W</span><span class="label">Attendance</span></button><button class="docbtn fail" title="Generate Failure Notice"><span class="icon">W</span><span class="label">Failure</span></button><button class="docbtn avg" title="Generate Term Average Notice"><span class="icon">W</span><span class="label">Term Avg</span></button></div>`;
            return `<tr><td>${student.student_id || 'N/A'}</td><td>${student.student_name || 'N/A'}</td><td>${student.program || 'N/A'}</td><td>${student.course_name || 'N/A'}</td><td>${student.instructor_names || 'N/A'}</td><td>${student.term || 'N/A'}</td><td><div class="d-flex justify-content-between align-items-center"><span>${problemDescription}</span>${downloadActions}</div></td></tr>`;
        }).join('');
        return `<table class="table table-sm small mb-0" style="background-color: #FDEDEC;"><thead class="text-muted"><tr><th>STUDENT ID</th><th>NAME</th><th>PROGRAM</th><th>COURSE</th><th>INSTRUCTORS</th><th>TERM</th><th>PROBLEM & ACTIONS</th></tr></thead><tbody>${tableRowsHTML}</tbody></table>`;
    }

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredData = masterCourseData.filter(courseData => {
            const courseNameMatch = (courseData.course.name || '').toLowerCase().includes(searchTerm);
            const studentMatch = (courseData.students_with_problems || []).some(student => (student.student_name || '').toLowerCase().includes(searchTerm) || (student.program || '').toLowerCase().includes(searchTerm));
            return courseNameMatch || studentMatch;
        });
        render(filteredData);
    });

    analysisTbody.addEventListener('click', (event) => {
        const expandBtn = event.target.closest('.expand-btn');
        if (expandBtn) {
            const icon = expandBtn.querySelector('.expand-icon');
            const mainRow = expandBtn.closest('tr');
            const detailsRow = mainRow.nextElementSibling;
            icon.classList.toggle('rotated');
            detailsRow.classList.toggle('d-none');
        }
    });

    // --- 4. INITIALIZATION ---
    auth.onAuthStateChanged((user) => {
        if (user) {
            loadLatestReport();
        } else {
            console.error("No user logged in. Analysis cannot run.");
            showError("Authentication Error: You must be logged in to view this page.");
        }
    });

    function showError(message) {
        analysisTbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center p-5">${message}</td></tr>`;
    }
});
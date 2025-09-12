import { auth } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- ELEMENT REFERENCES ---
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingMessage = document.getElementById('loading-message');
    const resultsCard = document.getElementById('results-card');
    const totalRiskCount = document.getElementById('total-risk-count');
    const analysisTbody = document.getElementById('analysis-tbody');
    const searchInput = document.getElementById('course-search');
    const noResultsMessage = document.getElementById('no-results-message');

    let masterCourseData = [];

    // --- RUN STUDENT ANALYSIS ---
    async function runStudentAnalysis(userId) {
        loadingIndicator.classList.remove('d-none');
        resultsCard.classList.add('d-none');

        const messages = [
            "Initializing risk assessment models...",
            "Analyzing student grades and progress...",
            "Evaluating attendance records...",
            "Compiling final risk profiles...",
            "Almost there, finalizing report..."
        ];
        let messageIndex = 0;
        const loadingInterval = setInterval(() => {
            loadingMessage.textContent = messages[messageIndex % messages.length];
            messageIndex++;
        }, 3000);

        try {
            const apiUrl = `https://ited.org.ec/aura/canvas_api/student_risk_analysis.php?user_uid=${userId}`;
            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error(`Server returned an error: ${response.statusText}`);
            }

            const data = await response.json();
            masterCourseData = Array.isArray(data) ? data : [data]; // wrap object in array

            render(masterCourseData);

        } catch (error) {
            console.error("Error during student risk analysis:", error);
            analysisTbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">An error occurred: ${error.message}</td></tr>`;
        } finally {
            clearInterval(loadingInterval);
            loadingIndicator.classList.add('d-none');
            resultsCard.classList.remove('d-none');
        }
    }

    // --- RENDER COURSES ---
    function render(coursesToRender) {
        analysisTbody.innerHTML = "";
        let totalRisk = 0;

        if (!coursesToRender || coursesToRender.length === 0) {
            noResultsMessage.classList.remove('d-none');
            totalRiskCount.textContent = totalRisk;
            return;
        } else {
            noResultsMessage.classList.add('d-none');
        }

        coursesToRender.forEach(course => {
            const atRiskStudents = course.students_at_risk || [];
            totalRisk += atRiskStudents.length;

            const courseRow = document.createElement('tr');
            courseRow.innerHTML = `
                <td>${course.course_name || 'N/A'}</td>
                <td>${course.total_students || 0}</td>
                <td>${atRiskStudents.length}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-light expand-btn" ${atRiskStudents.length === 0 ? 'disabled' : ''}>
                        <i class="fi fi-arrow-down expand-icon"></i>
                    </button>
                </td>
            `;

            const detailsRow = document.createElement('tr');
            detailsRow.classList.add('d-none');
            detailsRow.innerHTML = `<td colspan="4">${renderStudentDetails(atRiskStudents)}</td>`;

            analysisTbody.appendChild(courseRow);
            analysisTbody.appendChild(detailsRow);
        });

        totalRiskCount.textContent = totalRisk;
    }

    function renderStudentDetails(students) {
        if (!students || students.length === 0) return '';
        let table = '<table class="table table-sm table-striped small">';
        table += '<thead class="text-muted"><tr><th>Student ID</th><th>Name</th><th>Program</th><th>Problem</th></tr></thead><tbody>';
        students.forEach(student => {
            table += `<tr>
                        <td>${student.student_id || 'N/A'}</td>
                        <td>${student.student_name || 'N/A'}</td>
                        <td>${student.program_name || 'N/A'}</td>
                        <td>${student.problem || 'N/A'}</td>
                      </tr>`;
        });
        table += '</tbody></table>';
        return table;
    }

    // --- SEARCH FILTER ---
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredData = masterCourseData.filter(course => {
            const courseNameMatch = (course.course_name || '').toLowerCase().includes(searchTerm);
            const studentMatch = (course.students_at_risk || []).some(student =>
                (student.student_name || '').toLowerCase().includes(searchTerm) ||
                (student.program_name || '').toLowerCase().includes(searchTerm)
            );
            return courseNameMatch || studentMatch;
        });
        render(filteredData);
    });

    // --- EXPAND BUTTON ---
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

    // --- AUTH & INITIALIZATION ---
    auth.onAuthStateChanged((user) => {
        if (user) {
            runStudentAnalysis(user.uid);
        } else {
            console.log("No user logged in, redirecting to index.html");
            window.location.href = 'index.html';
        }
    });

});

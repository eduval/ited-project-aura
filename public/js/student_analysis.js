import { auth } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. SETUP & ELEMENT REFERENCES ---
    const loadingIndicator = document.getElementById('screen-lock');
    const loadingMessage = document.getElementById('loading-message');
    const resultsCard = document.getElementById('results-card');
    const totalRiskCount = document.getElementById('total-risk-count');
    const analysisTbody = document.getElementById('analysis-tbody');
    const searchInput = document.getElementById('course-search');
    const noResultsMessage = document.getElementById('no-results-message');

    let masterCourseData = [];

    // --- 2. THE MAIN API CALL FUNCTION ---
    async function runStudentAnalysis(userId) {
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
        // The results card is now part of the main HTML, so we just hide it.
        if (resultsCard) resultsCard.classList.add('d-none');

        const messages = [
            "Initializing risk assessment models...",
            "Analyzing student grades and progress...",
            "Evaluating attendance records...",
            "Compiling final risk profiles...",
            "Almost there, finalizing report..."
        ];
        let messageIndex = 0;
        loadingMessage.textContent = messages[0];
        const loadingInterval = setInterval(() => {
            messageIndex++;
            loadingMessage.textContent = messages[messageIndex % messages.length];
        }, 30000);

        try {
            // ** THIS IS NOW USING THE REAL API ENDPOINT **
            const apiUrl = `https://ited.org.ec/aura/canvas_api/student_risk_analysis.php?user_uid=${userId}`;
            const response = await fetch(apiUrl);

            if (!response.ok) {
                // This will catch server errors like 500, 404 etc.
                throw new Error(`The server returned an error: ${response.statusText}`);
            }

            const data = await response.json();

            // Check for the success flag from the API response
            if (!data.success) {
                throw new Error(data.error || "The API returned a failure response, but did not specify an error.");
            }

            // The data we want is in the 'courses' array
            if (Array.isArray(data.courses)) {
                masterCourseData = data.courses;
                render(masterCourseData);
            } else {
                throw new Error("API response was successful, but the 'courses' data is missing or not in the correct format.");
            }

        } catch (error) {
            console.error("Error during student risk analysis:", error);
            showError(error.message);
        } finally {
            clearInterval(loadingInterval);
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (resultsCard) resultsCard.classList.remove('d-none');
        }
    }

    // --- 3. RENDERING FUNCTIONS ---
    function render(coursesToRender) {
        analysisTbody.innerHTML = "";
        let totalRisk = 0;
        
        noResultsMessage.classList.toggle('d-none', coursesToRender.length === 0);

        coursesToRender.forEach(courseData => {
            const course = courseData.course;
            const atRiskStudents = courseData.students_with_problems || [];
            totalRisk += atRiskStudents.length;
            
            const courseRow = document.createElement('tr');
            courseRow.innerHTML = `
                <td>${course.name || 'N/A'}</td>
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
            detailsRow.innerHTML = `<td colspan="4" class="p-2" style="background-color: #FFF8E1;">${renderStudentDetails(atRiskStudents)}</td>`;
            
            analysisTbody.appendChild(courseRow);
            analysisTbody.appendChild(detailsRow);
        });
        totalRiskCount.textContent = totalRisk;
    }

    function renderStudentDetails(students) {
        if (!students || students.length === 0) return '';
        
        let tableRowsHTML = students.map(student => {
            let problemDescription = '';
            const problem = student.problems && student.problems[0];

            if (problem) {
                switch (problem.type) {
                    case 'low_grade':
                        problemDescription = `Low Grade: <span class="badge bg-danger">${problem.value}%</span>`;
                        break;
                    case 'low_attendance':
                        problemDescription = `Low Attendance: <span class="badge bg-warning text-dark">${problem.value}%</span>`;
                        break;
                    default:
                        problemDescription = `At-Risk: <span class="badge bg-secondary">${problem.value || ''}</span>`;
                }
            } else {
                problemDescription = 'N/A';
            }

            const downloadActions = `
                <div class="actions">
                    <button class="docbtn risk" title="Generate At-Risk Notice"><span class="icon">W</span><span class="label">At-Risk</span></button>
                    <button class="docbtn attn" title="Generate Attendance Notice"><span class="icon">W</span><span class="label">Attendance</span></button>
                    <button class="docbtn fail" title="Generate Failure Notice"><span class="icon">W</span><span class="label">Failure</span></button>
                    <button class="docbtn avg" title="Generate Term Average Notice"><span class="icon">W</span><span class="label">Term Avg</span></button>
                </div>
            `;
            
            return `
                <tr>
                    <td>${student.student_id || 'N/A'}</td>
                    <td>${student.student_name || 'N/A'}</td>
                    <td>${student.program_name || 'N/A'}</td>
                    <td>${instructorNames || 'N/A'}</td> 
                    <td>
                        <div class="d-flex justify-content-between align-items-center">
                            <span>${problemDescription}</span>
                            ${downloadActions}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <table class="table table-sm small mb-0">
                <thead class="text-muted" style="background-color: #FDEDEC;">
                    <tr>
                        <th style="width:15%">STUDENT ID</th>
                        <th style="width:25%">NAME</th>
                        <th style="width:25%">PROGRAM</th>
                        <th style="width:35%">PROBLEM</th>
                        <th style="width:35%">INSTRUCTORS</th>
                    </tr>
                </thead>
                <tbody>${tableRowsHTML}</tbody>
            </table>
        `;
    }
    
    // --- 4. EVENT HANDLING ---
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredData = masterCourseData.filter(courseData => {
            const courseNameMatch = (courseData.course.name || '').toLowerCase().includes(searchTerm);
            const studentMatch = (courseData.students_with_problems || []).some(student => (student.student_name || '').toLowerCase().includes(searchTerm) || (student.program_name || '').toLowerCase().includes(searchTerm));
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

    // --- 5. INITIALIZATION ---
    auth.onAuthStateChanged((user) => {
        if (user) {
            runStudentAnalysis(user.uid);
        } else {
            console.error("No user logged in. Analysis cannot run.");
            showError("Authentication Error: You must be logged in to view this page.");
        }
    });
    
    function showError(message) {
        analysisTbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">${message}</td></tr>`;
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (resultsCard) resultsCard.classList.remove('d-none');
    }
});
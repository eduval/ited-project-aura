import { auth } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. SETUP & ELEMENT REFERENCES ---
    const screenLock = document.getElementById('screen-lock'); // The new full-screen overlay
    const loadingMessage = document.getElementById('loading-message');
    const resultsCard = document.getElementById('results-card');
    const totalRiskCount = document.getElementById('total-risk-count');
    const analysisTbody = document.getElementById('analysis-tbody');
    const searchInput = document.getElementById('course-search');
    const noResultsMessage = document.getElementById('no-results-message');

    let masterCourseData = [];

    // --- 2. THE MAIN API CALL FUNCTION ---
    async function runStudentAnalysis(userId) {
        // Show the full-screen loading overlay
        screenLock.style.display = 'flex'; 

        const messages = [
            "Initializing risk assessment models...",
            "Analyzing student grades and progress...",
            "Evaluating attendance records...",
            "Compiling final risk profiles...",
            "Almost there, finalizing report..."
        ];
        let messageIndex = 0;
        // Set the initial message immediately
        loadingMessage.textContent = messages[0];
        const loadingInterval = setInterval(() => {
            messageIndex++;
            loadingMessage.textContent = messages[messageIndex % messages.length];
        }, 30000); // Change message every 30 seconds

        try {
            const apiUrl = `http://ited.org.ec/aura/canvas_api/student_risk_analysis.py?userID=${userId}`;
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`Server returned an error: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                 throw new Error("API did not return the expected data format.");
            }
            
            masterCourseData = data;
            render(masterCourseData);

        } catch (error) {
            console.error("Error during student risk analysis:", error);
            analysisTbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">An error occurred: ${error.message}</td></tr>`;
        } finally {
            // Clean up and hide the overlay
            clearInterval(loadingInterval);
            screenLock.style.display = 'none';
        }
    }
    
    // --- 3. RENDERING AND EVENT HANDLING (Unchanged from your working version) ---
    function render(coursesToRender) {
        analysisTbody.innerHTML = "";
        let totalRisk = 0;
        
        noResultsMessage.classList.toggle('d-none', coursesToRender.length > 0);

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
            runStudentAnalysis(user.uid);
        } else {
            console.log("No user logged in, redirecting to index.html");
            window.location.href = 'index.html';
        }
    });

});


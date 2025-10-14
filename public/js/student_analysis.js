import { auth, db } from "./firebase-config.js";
import {
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

document.addEventListener("DOMContentLoaded", () => {
  const totalRiskCount = document.getElementById("total-risk-count");
  const analysisTbody = document.getElementById("analysis-tbody");
  const searchInput = document.getElementById("course-search");
  const noResultsMessage = document.getElementById("no-results-message");
  const reportTimestamp = document.getElementById("report-timestamp");
  const minGradeDisplay = document.getElementById("min-grade-display");
  const minAttendanceDisplay = document.getElementById(
    "min-attendance-display"
  );

  let masterCourseData = [];

  async function loadLatestReport() {
    try {
      const latestRef = ref(db, "risk_reports/latest");
      const latestSnapshot = await get(latestRef);
      if (!latestSnapshot.exists())
        throw new Error("The 'latest' report pointer was not found.");

      const reportFolderName = latestSnapshot.val().timestamp;
      if (!reportFolderName)
        throw new Error("The 'latest' pointer is missing a timestamp.");

      const reportRef = ref(db, `risk_reports/${reportFolderName}`);
      const reportSnapshot = await get(reportRef);
      if (!reportSnapshot.exists())
        throw new Error(
          `The report folder "${reportFolderName}" was not found.`
        );

      const data = reportSnapshot.val();

      const settingsRef = ref(db, "settings/criteria");
      const settingsSnapshot = await get(settingsRef);
      const settingsData = settingsSnapshot.exists()
        ? settingsSnapshot.val()
        : {};

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

        masterCourseData = Object.values(allCourses).map((course) => ({
          course: course,
          students_with_problems: studentsByCourse[course.id] || [],
        }));

        if (reportTimestamp && data.generated_at)
          reportTimestamp.textContent = `Displaying latest report generated on: ${new Date(
            data.generated_at
          ).toLocaleString()}`;
        if (minGradeDisplay)
          minGradeDisplay.textContent = `${settingsData.minGrade || 0}%`;
        if (minAttendanceDisplay)
          minAttendanceDisplay.textContent = `${
            settingsData.minAttendance || 0
          }%`;

        render(masterCourseData);
      } else {
        throw new Error(
          "The final report data is missing 'courses' or 'students'."
        );
      }
    } catch (error) {
      console.error("Error loading student risk analysis:", error);
      showError(error.message);
    }
  }

  function render(coursesToRender) {
    analysisTbody.innerHTML = "";
    let totalRiskInView = 0;
    noResultsMessage.classList.toggle("d-none", coursesToRender.length === 0);

    coursesToRender.forEach((courseData) => {
      const course = courseData.course;
      const atRiskStudents = courseData.students_with_problems;
      totalRiskInView += atRiskStudents.length;

      const courseRow = document.createElement("tr");
      courseRow.innerHTML = `<td>${course.name || "N/A"}</td><td>${
        course.total_students || 0
      }</td><td>${
        atRiskStudents.length
      }</td><td class="text-end"><button class="btn btn-sm btn-light expand-btn" ${
        atRiskStudents.length === 0 ? "disabled" : ""
      }><i class="fi fi-arrow-down expand-icon"></i></button></td>`;

      const detailsRow = document.createElement("tr");
      detailsRow.classList.add("d-none");
      detailsRow.innerHTML = `<td colspan="4" class="p-2" style="background-color: white;">${renderStudentDetails(
        atRiskStudents
      )}</td>`;

      analysisTbody.appendChild(courseRow);
      analysisTbody.appendChild(detailsRow);
    });
    totalRiskCount.textContent = totalRiskInView;
  }

  function renderStudentDetails(students) {
    if (!students || students.length === 0) return '';
    
    let tableRowsHTML = students.map(student => {
        let problemDescriptionHTML = 'N/A';
        const problems = student.problems || [];

        if (Array.isArray(problems) && problems.length > 0) {
            problemDescriptionHTML = problems.map(problem => {
                if (problem && problem.type) {
                    const problemText = problem.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    let badgeClass = 'bg-secondary';
                    if (problem.type === 'low_grade') badgeClass = 'bg-danger';
                    if (problem.type === 'low_attendance') badgeClass = 'bg-warning text-dark';
                    return `<span class="badge ${badgeClass}">${problemText}: ${problem.value || 0}%</span>`;
                }
                return '';
            }).join(' ');
        }

        // define possible buttons
        const buttonTypes = [
            { key: 'low_grade', css: 'risk', label: 'At-Risk' },
            { key: 'low_attendance', css: 'attn', label: 'Attendance' },
            { key: 'course_failure', css: 'fail', label: 'Failure' },
            { key: 'low_term_avg', css: 'avg', label: 'Term Avg' }
        ];

        // check which problems this student has
        const problemKeys = problems.map(p => p.type);

        const downloadActions = `
            <div class="actions">
                ${buttonTypes.map(bt => {
                    const isActive = problemKeys.includes(bt.key);
                    return `
                        <button 
                            class="docbtn ${bt.css} ${isActive ? '' : 'disabled'}" 
                            title="${isActive ? 'Generate ' + bt.label + ' Notice' : 'Not applicable'}"
                            ${isActive ? '' : 'disabled'}
                        >
                            <span class="icon">W</span>
                            <span class="label">${bt.label}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        `;

        return `
            <tr>
                <td>${student.student_id || 'N/A'}</td>
                <td>${student.student_name || 'N/A'}</td>
                <td>${student.program || 'N/A'}</td>
                <td>${student.course_name || 'N/A'}</td>
                <td>${student.instructor_names || 'N/A'}</td>
                <td>${student.term || 'N/A'}</td>
                <td>
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex flex-wrap gap-1">${problemDescriptionHTML}</div>
                        ${downloadActions}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <table class="table table-sm small mb-0" style="background-color: white;">
            <thead class="text-muted">
                <tr>
                    <th>STUDENT ID</th>
                    <th>NAME</th>
                    <th>PROGRAM</th>
                    <th>COURSE</th>
                    <th>INSTRUCTORS</th>
                    <th>TERM</th>
                    <th>PROBLEM & ACTIONS</th>
                </tr>
            </thead>
            <tbody>${tableRowsHTML}</tbody>
        </table>
    `;
}


  searchInput.addEventListener("input", () => {
    const searchTerm = searchInput.value.toLowerCase();
    if (!searchTerm) {
      render(masterCourseData);
      return;
    }

    const filteredCourses = [];
    const coursesToSearch = JSON.parse(JSON.stringify(masterCourseData));

    coursesToSearch.forEach((courseData) => {
      const course = courseData.course;
      const students = courseData.students_with_problems;

      const studentMatches = (student) => {
        const searchableStudentString = [
          student.student_name,
          student.student_id,
          student.program,
          student.course_name,
          student.instructor_names,
          student.term,
        ]
          .join(" ")
          .toLowerCase();
        return searchableStudentString.includes(searchTerm);
      };

      const courseNameMatches = (course.name || "")
        .toLowerCase()
        .includes(searchTerm);

      if (courseNameMatches) {
        filteredCourses.push(courseData);
      } else {
        const matchingStudents = students.filter(studentMatches);
        if (matchingStudents.length > 0) {
          courseData.students_with_problems = matchingStudents;
          filteredCourses.push(courseData);
        }
      }
    });
    render(filteredCourses);
  });

  analysisTbody.addEventListener("click", (event) => {
    const expandBtn = event.target.closest(".expand-btn");
    if (expandBtn) {
      const icon = expandBtn.querySelector(".expand-icon");
      const mainRow = expandBtn.closest("tr");
      const detailsRow = mainRow.nextElementSibling;
      icon.classList.toggle("rotated");
      detailsRow.classList.toggle("d-none");
    }
  });
  
  analysisTbody.addEventListener("click", async (event) => {
  const btn = event.target.closest(".docbtn");
  if (btn && !btn.disabled) {
    const studentRow = btn.closest("tr");
    const studentId = studentRow.querySelector("td").textContent;
    const docType = btn.querySelector(".label").textContent.toLowerCase();

    try {
      document.getElementById("screen-lock").style.display = "flex";
      document.getElementById("loading-message").textContent = `Generating ${docType} template...`;

      const response = await fetch(`/api/generate_template?type=${docType}&id=${studentId}`);
      if (!response.ok) throw new Error("Failed to generate file");
      const blob = await response.blob();

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${studentId}_${docType}_template.pdf`;
      link.click();
    } catch (error) {
      console.error(error);
      alert("Error generating template: " + error.message);
    } finally {
      document.getElementById("screen-lock").style.display = "none";
    }
  }
});

  auth.onAuthStateChanged((user) => {
    if (user) {
      loadLatestReport();
    } else {
      console.error("No user logged in. Analysis cannot run.");
      showError(
        "Authentication Error: You must be logged in to view this page."
      );
    }
  });

  function showError(message) {
    analysisTbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center p-5">${message}</td></tr>`;
  }
});

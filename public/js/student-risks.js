// student-risks.js
import { auth } from './firebase-config.js';

const GENERATE_ENDPOINT = '/api/generate_notice.php'; // uses active templates

let instructorName = '';
let courseId = '';
let courseName = '';
let minGrade = 0;
let minAttendance = 0;

function showLoading() {
    document.getElementById("loading-spinner")?.classList.remove("d-none");
    document.getElementById("risk-table-wrapper")?.classList.add("d-none");
}
function hideLoading() {
    document.getElementById("loading-spinner")?.classList.add("d-none");
    document.getElementById("risk-table-wrapper")?.classList.remove("d-none");
}
function showError(message) {
    const errorEl = document.getElementById("student-risk-list");
    if (errorEl) errorEl.innerHTML = `<tr><td colspan="4" class="text-danger text-center">${message}</td></tr>`;
    hideLoading();
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const instructorId = urlParams.get('instructor_id');
    courseId = urlParams.get('course_id');
    instructorName = urlParams.get('instructor_name') || '';

    if (!instructorId || !courseId) {
        showError("Instructor or Course ID is missing from URL.");
        return;
    }

    // Heading + breadcrumb
    if (instructorName) {
        const header = document.getElementById("instructor-heading");
        if (header) header.textContent = "Instructor: " + decodeURIComponent(instructorName);
        const dashboardTitle = document.getElementById("instructor_name_title");
        if (dashboardTitle) {
            const url = `teacher-course-list.html?instructor_id=${instructorId}&instructor_name=${encodeURIComponent(instructorName)}`;
            dashboardTitle.innerHTML = `<a href="${url}" class="text-decoration-none">${decodeURIComponent(instructorName)} Courses Dashboard</a>`;
        }
    }

    auth.onAuthStateChanged((user) => {
        if (user) {
            loadCourseAndStudentData(instructorId, user.uid);
        } else {
            showError("Please log in to view this information.");
        }
    });
});

async function loadCourseAndStudentData(instructorId, userUid) {
    showLoading();
    try {
        const apiUrl = `https://ited.org.ec/aura/canvas_api/get_students_problems.php?instructor_id=${instructorId}&user_uid=${encodeURIComponent(userUid)}&course_id=${courseId}`;
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

        const data = await response.json();
        if (!data.success) throw new Error(data.error || "The API returned a failure response.");

        // Course info
        const course = data.course;
        if (!course) throw new Error("Course data missing in API response.");

        courseName = course.name || 'Unknown Course';
        document.getElementById('course-name-display').textContent = courseName;
        document.getElementById('total-students-display').textContent = course.total_students ?? 0;
        document.getElementById('problems-count-display').textContent = course.students_with_problems_count ?? 0;

        // thresholds (if included)
        minGrade = course.min_grade ?? 0;
        minAttendance = course.min_attendance ?? 0;
        const mg = document.getElementById('min-grade-display');
        const ma = document.getElementById('min-attendance-display');
        if (mg) mg.textContent = minGrade;
        if (ma) ma.textContent = minAttendance;

        // Table
        const tbody = document.getElementById("student-risk-list");
        tbody.innerHTML = "";
        const arr = Array.isArray(data.students_with_problems) ? data.students_with_problems : [];

        if (!arr.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-success">No students with problems 🎉</td></tr>`;
            hideLoading();
            await hydrateActiveStates(); // still run to set tooltips on any buttons
            return;
        }

        for (const stu of arr) {
            tbody.insertAdjacentHTML("beforeend", renderStudentRiskRow({
                studentId: stu.student_id,
                studentName: stu.student_name,
                program: stu.program || "Unknown Program",
                problems: stu.problems || []
            }));
        }

        hideLoading();
        await hydrateActiveStates(); // disable buttons if no active template for a type
    } catch (err) {
        console.error(err);
        showError(err.message);
    }
}

/** Build problem badges and four labeled icon buttons (Option A) */
function renderStudentRiskRow(student) {
    // Extract last seen grade/attendance values from problems list (if present)
    let gradeVal = null, attnVal = null;
    if (Array.isArray(student.problems)) {
        for (const p of student.problems) {
            if (p.type === 'low_grade') gradeVal = p.value;
            if (p.type === 'low_attendance') attnVal = p.value;
        }
    }

    const problemsHtml = (student.problems || []).map(p => {
        if (p.type === 'low_grade') return `<div>Low Grade: <span class="badge bg-danger">${p.value}%</span></div>`;
        if (p.type === 'low_attendance') return `<div>Low Attendance: <span class="badge bg-warning text-dark">${p.value}%</span></div>`;
        return `<div>General Concern</div>`;
    }).join('') || '<div>No flagged issues</div>';

    // Buttons: encoded row context via data-* attributes; single handler builds JSON
    const actionsHtml = `
    <div class="actions" role="group" aria-label="Generate notices">
      <button class="docbtn risk"
              title="Generate At-Risk Notice"
              aria-label="Generate At-Risk Notice"
              data-student-id="${enc(student.studentId)}"
              data-student-name="${enc(student.studentName)}"
              data-program="${enc(student.program)}"
              data-grade="${gradeVal ?? ''}"
              data-attendance="${attnVal ?? ''}"
              onclick="window.genNoticeFromButton(this,'atriskstatus')">
        <div class="icon">W</div><div class="label">At-Risk</div>
      </button>

      <button class="docbtn attn"
              title="Generate Low Attendance Notice"
              aria-label="Generate Low Attendance Notice"
              data-student-id="${enc(student.studentId)}"
              data-student-name="${enc(student.studentName)}"
              data-program="${enc(student.program)}"
              data-grade="${gradeVal ?? ''}"
              data-attendance="${attnVal ?? ''}"
              onclick="window.genNoticeFromButton(this,'lowattendance')">
        <div class="icon">W</div><div class="label">Attendance</div>
      </button>

      <button class="docbtn fail"
              title="Generate Course Failure Notice"
              aria-label="Generate Course Failure Notice"
              data-student-id="${enc(student.studentId)}"
              data-student-name="${enc(student.studentName)}"
              data-program="${enc(student.program)}"
              data-grade="${gradeVal ?? ''}"
              data-attendance="${attnVal ?? ''}"
              onclick="window.genNoticeFromButton(this,'coursefailure')">
        <div class="icon">W</div><div class="label">Failure</div>
      </button>

      <button class="docbtn avg"
              title="Generate Low Term Average Notice"
              aria-label="Generate Low Term Average Notice"
              data-student-id="${enc(student.studentId)}"
              data-student-name="${enc(student.studentName)}"
              data-program="${enc(student.program)}"
              data-grade="${gradeVal ?? ''}"
              data-attendance="${attnVal ?? ''}"
              onclick="window.genNoticeFromButton(this,'lowtermaverage')">
        <div class="icon">W</div><div class="label">Term Avg</div>
      </button>
    </div>`;

    return `
    <tr>
      <td>${escapeHtml(student.studentId ?? 'Unknown ID')}</td>
      <td>${escapeHtml(student.studentName ?? 'Unknown Name')}</td>
      <td>${escapeHtml(student.program ?? 'Unknown Program')}</td>
      <td>
        <div class="d-flex justify-content-between align-items-start">
          <div>${problemsHtml}</div>
          ${actionsHtml}
        </div>
      </td>
    </tr>
  `;
}

// === Active-template awareness (disable when none selected) ===
async function hydrateActiveStates() {
    try {
        const res = await fetch('/api/get_active_templates.php');
        if (!res.ok) return;
        const j = await res.json();
        const active = j.active || {};

        const map = {
            atriskstatus: '.docbtn.risk',
            lowattendance: '.docbtn.attn',
            coursefailure: '.docbtn.fail',
            lowtermaverage: '.docbtn.avg'
        };

        Object.entries(map).forEach(([type, sel]) => {
            document.querySelectorAll(sel).forEach(btn => {
                if (!active[type]) btn.setAttribute('disabled', 'disabled');
                const using = active[type] ? ` • Using: ${active[type]}` : ' • No active template selected';
                btn.title = btn.title + using;
            });
        });
    } catch (e) { /* no-op */ }
}

// === Generate handler ===
window.genNoticeFromButton = async function (btn, alertType) {
    const ctx = {
        student_name: btn.dataset.studentName,
        student_id: btn.dataset.studentId,
        program: btn.dataset.program,
        course_id: courseId,
        course_name: courseName,
        instructor_name: instructorName ? decodeURIComponent(instructorName) : 'Instructor',
        current_score: btn.dataset.grade ? Number(btn.dataset.grade) : undefined,
        attendance: btn.dataset.attendance ? Number(btn.dataset.attendance) : undefined,
        min_grade: minGrade,
        min_attendance: minAttendance
    };

    try {
        btn.disabled = true;
        const res = await fetch(GENERATE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alert_type: alertType, context: ctx })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to generate');

        // trigger download
        const a = document.createElement('a');
        a.href = data.output; a.download = '';
        document.body.appendChild(a); a.click(); a.remove();
    } catch (err) {
        alert(err.message || 'Generation failed');
    } finally {
        btn.disabled = false;
    }
};

// === small helpers ===
function enc(v) { return String(v ?? '').replaceAll('"', '&quot;'); }
function escapeHtml(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
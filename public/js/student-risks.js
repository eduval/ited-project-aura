// ===============================
// Student Risks: table + docx gen
// ===============================

// ===== Imports =====
import { auth, db } from './firebase-config.js';
import {
    ref as dbRef,
    get as dbGet,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

import {
    getStorage,
    ref as stRef,
    getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const storage = getStorage();

// ===== Config =====
const CANVAS_API_BASE = 'https://ited.org.ec/aura/canvas_api';
const API_ENDPOINT = `${CANVAS_API_BASE}/get_students_problems.php`;

// ===== Page state (also exposed on window for debug) =====
let instructorName = '';
let courseId = '';
let courseName = '';
let minGrade = 0;
let minAttendance = 0;
// NEW: track if we already loaded thresholds from Firebase
let thresholdsFromFirebase = false;

window.instructorName = instructorName;
window.courseId = courseId;
window.courseName = courseName;
window.minGrade = minGrade;
window.minAttendance = minAttendance;

// Active templates cache (per bucket)
const ACTIVE_TEMPLATES = {
    atriskstatus: null,
    lowattendance: null,
    coursefailure: null,
    lowtermaverage: null,
};

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
function showLoading() {
    $('#loading-spinner')?.classList.remove('d-none');
    $('#risk-table-wrapper')?.classList.add('d-none');
}
function hideLoading() {
    $('#loading-spinner')?.classList.add('d-none');
    $('#risk-table-wrapper')?.classList.remove('d-none');
}
function showError(message) {
    const el = $('#student-risk-list');
    if (el) el.innerHTML = `<tr><td colspan="4" class="text-danger text-center">${message}</td></tr>`;
    hideLoading();
}
function enc(v) { return String(v ?? '').replaceAll('"', '&quot;'); }
function escapeHtml(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
const safeName = (s) => String(s || '').replace(/[^\w\-.]+/g, '_').slice(0, 80);
const cleanNum = (v) => { if (v === null || v === undefined) return ''; const t = String(v).replace('%', '').trim(); const n = Number(t); return Number.isFinite(n) ? n : t; };

// ---------- URL / CORS utilities ----------
function isMixedContentBlocked(u) {
    if (!u) return true;
    try {
        const x = new URL(u, location.href);
        return location.protocol === 'https:' && x.protocol === 'http:';
    } catch { return true; }
}
function resolveFetchableUrl(u) {
    if (!u) return '';
    try {
        const url = new URL(u, location.href);
        if (url.origin === location.origin) return url.href;
        if (!isMixedContentBlocked(url.href)) return url.href;
        return '';
    } catch { return ''; }
}
async function fetchDocxBytes(url) {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`Template HTTP error ${res.status} ${res.statusText} (${url})`);
    const buf = await res.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const isZip =
        u8.length >= 4 &&
        u8[0] === 0x50 && u8[1] === 0x4b &&
        (u8[2] === 0x03 || u8[2] === 0x05 || u8[2] === 0x07);
    if (!isZip) {
        let preview = '';
        try { preview = new TextDecoder().decode(u8.slice(0, 200)); } catch { }
        throw new Error(`The response is not a DOCX/ZIP. Preview: ${preview.replace(/\s+/g, ' ').slice(0, 180)}`);
    }
    return u8;
}

// Prefer Storage signed URL when available
async function preferredUrlFromMeta(meta) {
    if (meta?.storagePath) {
        try { return await getDownloadURL(stRef(storage, meta.storagePath)); }
        catch (e) { console.warn('getDownloadURL failed for', meta.storagePath, e); }
    }
    return meta?.url || '';
}

// ---------- Tag extraction & report ----------
function extractTemplateTags(zip) {
    const xmlParts = [
        "word/document.xml",
        "word/header1.xml", "word/header2.xml", "word/header3.xml",
        "word/footer1.xml", "word/footer2.xml", "word/footer3.xml",
    ];
    const found = new Set();
    for (const p of xmlParts) {
        const f = zip.file(p);
        if (!f) continue;
        const text = f.asText();
        const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
        let m;
        while ((m = re.exec(text))) found.add(m[1]);
    }
    return Array.from(found).sort();
}
function diffTags(templateTags, dataObj) {
    const dataKeys = Object.keys(dataObj);
    const missing = templateTags.filter(t => !dataKeys.includes(t));
    const unused = dataKeys.filter(k => !templateTags.includes(k));
    return { missing, unused, templateTags, dataKeys };
}
function showTagReport({ missing, unused, templateTags }, templateName) {
    const lines = [];
    lines.push(`Template: ${templateName || "(unnamed)"}`);
    lines.push(`Tags in DOCX: ${templateTags.length ? templateTags.join(", ") : "(none)"}`);
    if (missing.length) {
        lines.push("");
        lines.push(`❌ Missing data for: ${missing.join(", ")}`);
    } else {
        lines.push("");
        lines.push("✅ All tags satisfied.");
    }
    if (unused.length) {
        lines.push("");
        lines.push(`ℹ️ Unused data keys: ${unused.join(", ")}`);
    }
    alert(lines.join("\n"));
}

// ---------- robust type normalization ----------
function normType(x) {
    return String(x || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

// ===== Mapping: which buttons enable for which problems =====
function flagsFromProblems(problems) {
    const f = { atriskstatus: false, lowattendance: false, coursefailure: false, lowtermaverage: false };
    if (!Array.isArray(problems)) return f;
    for (const raw of problems) {
        const t = normType(raw?.type);
        if (t === 'low_attendance' || t === 'attendance' || t === 'attendance_warning' || t === 'attendance_low' || t === 'lowattendance') {
            f.lowattendance = true; // attendance letter only
        }
        if (t === 'low_grade' || t === 'course_failure' || t === 'failing_course' || t === 'grade_low') {
            // low grade -> enable all except attendance (your earlier rule)
            f.atriskstatus = true;
            f.coursefailure = true;
            f.lowtermaverage = true;
        }
        if (t === 'low_term_average' || t === 'low_term_avg' || t === 'term_average_low' || t === 'lowtermaverage' || t === 'term_avg_low') {
            f.lowtermaverage = true;
        }
        if (t === 'at_risk' || t === 'atriskstatus' || t === 'at_risk_status') {
            f.atriskstatus = true;
        }
    }
    return f;
}

/* ===============================
   NEW: Fetch min grade/attendance
   =============================== */
async function fetchThresholdsFromFirebase() {
    try {
        const snap = await dbGet(dbRef(db, 'settings/criteria')); // path holding the thresholds
        if (snap.exists()) {
            const val = snap.val() || {};
            // Update state
            minGrade = Number(val.minGrade ?? minGrade ?? 0);
            minAttendance = Number(val.minAttendance ?? minAttendance ?? 0);
            thresholdsFromFirebase = true;

            // Expose + update UI
            window.minGrade = minGrade;
            window.minAttendance = minAttendance;
            const gradeEl = $('#min-grade-display');
            const attnEl = $('#min-attendance-display');
            if (gradeEl) gradeEl.textContent = minGrade;
            if (attnEl) attnEl.textContent = minAttendance;
        }
    } catch (e) {
        console.warn('Failed to load thresholds from Firebase, will use API values instead.', e);
        thresholdsFromFirebase = false;
    }
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const instructorId = urlParams.get('instructor_id');
    courseId = urlParams.get('course_id');
    instructorName = urlParams.get('instructor_name') || '';

    // expose for debug
    window.instructorName = instructorName;
    window.courseId = courseId;

    if (!instructorId || !courseId) {
        showError('Instructor or Course ID is missing from URL.');
        return;
    }

    if (instructorName) {
        const header = $('#instructor-heading');
        if (header) header.textContent = 'Instructor: ' + decodeURIComponent(instructorName);
        const dashboardTitle = $('#instructor_name_title');
        if (dashboardTitle) {
            const url = `teacher-course-list.html?instructor_id=${instructorId}&instructor_name=${encodeURIComponent(instructorName)}`;
            dashboardTitle.innerHTML = `<a href="${url}" class="text-decoration-none">${decodeURIComponent(instructorName)} Courses Dashboard</a>`;
        }
    }

    // NEW: Load thresholds from Firebase right away
    fetchThresholdsFromFirebase().finally(() => {
        // Proceed with normal flow (if Firebase failed, API will fill them later)
        auth.onAuthStateChanged((user) => {
            if (user) loadCourseAndStudentData(instructorId, user.uid);
            else showError('Please log in to view this information.');
        });
    });
});

// ===== Data load =====
async function loadCourseAndStudentData(instructorId, userUid) {
    showLoading();
    try {
        const apiUrl = `${API_ENDPOINT}?instructor_id=${instructorId}&user_uid=${encodeURIComponent(userUid)}&course_id=${courseId}`;
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'The API returned a failure response.');

        const course = data.course;
        if (!course) throw new Error('Course data missing in API response.');

        courseName = course.name || 'Unknown Course';
        window.courseName = courseName;
        $('#course-name-display').textContent = courseName;
        $('#total-students-display').textContent = course.total_students ?? 0;
        $('#problems-count-display').textContent = course.students_with_problems_count ?? 0;

        // Only use API thresholds if Firebase didn't already set them
        if (!thresholdsFromFirebase) {
            minGrade = course.min_grade ?? 0;
            minAttendance = course.min_attendance ?? 0;
            window.minGrade = minGrade;
            window.minAttendance = minAttendance;
            $('#min-grade-display').textContent = minGrade;
            $('#min-attendance-display').textContent = minAttendance;
        }

        if (course.semester_label) document.body.dataset.semester = course.semester_label;

        const tbody = $('#student-risk-list');
        tbody.innerHTML = '';
        const arr = Array.isArray(data.students_with_problems) ? data.students_with_problems : [];

        if (!arr.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-success">No students with problems 🎉</td></tr>`;
            hideLoading();
            await hydrateActiveStates();
            return;
        }

        // Build rows
        for (const stu of arr) {
            tbody.insertAdjacentHTML('beforeend', renderStudentRiskRow({
                studentId: stu.student_id,
                studentName: stu.student_name,
                program: stu.program || 'Unknown Program',
                problems: stu.problems || []
            }));
        }

        hideLoading();
        await hydrateActiveStates();
    } catch (err) {
        console.error(err);
        showError(err.message);
    }
}

// ===== Row render =====
function renderStudentRiskRow(student) {
    let gradeVal = null, attnVal = null, termAvgVal = null;

    // Extract numeric values from problems array
    (student.problems || []).forEach(p => {
        const t = normType(p.type);
        if (t === 'low_grade') {
            gradeVal = cleanNum(p.value);
        }
        if (t === 'low_attendance') {
            attnVal = cleanNum(p.value);
        }
        if (t === 'low_term_average' || t === 'low_term_avg') {
            termAvgVal = cleanNum(p.value);
        }
    });

    const flags = flagsFromProblems(student.problems);

    const problemsHtml = (student.problems || []).map(p => {
        const t = normType(p.type);
        if (t === 'low_grade') return `<div>Low Grade: <span class="badge bg-danger">${escapeHtml(p.value)}%</span></div>`;
        if (t === 'low_attendance') return `<div>Low Attendance: <span class="badge bg-warning text-dark">${escapeHtml(p.value)}%</span></div>`;
        if (t === 'low_term_average' || t === 'low_term_avg')
            return `<div>Low Term Avg: <span class="badge bg-primary">${escapeHtml(p.value)}%</span></div>`;
        if (t === 'course_failure') return `<div>Course Failure</div>`;
        if (t === 'at_risk' || t === 'atriskstatus' || t === 'at_risk_status')
            return `<div>At-Risk</div>`;
        return `<div>General Concern</div>`;
    }).join('') || '<div>No flagged issues</div>';

    const gateAttr = (ok) => ok ? 'data-row-allowed="1"' : 'data-row-allowed="0" disabled title="Not applicable for this student"';

    const actionsHtml = `
    <div class="actions" role="group" aria-label="Generate notices" data-row-problems="${enc(JSON.stringify(student.problems || []))}">
      <button class="docbtn risk"
        ${gateAttr(flags.atriskstatus)}
        aria-label="Generate At-Risk Notice"
        data-student-id="${enc(student.studentId)}"
        data-student-name="${enc(student.studentName)}"
        data-program="${enc(student.program)}"
        data-grade="${gradeVal ?? ''}"
        data-attendance="${attnVal ?? ''}"
        data-termavg="${termAvgVal ?? ''}"
        onclick="window.genNoticeFromButton(this,'atriskstatus')">
        <div class="icon">W</div><div class="label">At-Risk</div>
      </button>

      <button class="docbtn attn"
        ${gateAttr(flags.lowattendance)}
        aria-label="Generate Low Attendance Notice"
        data-student-id="${enc(student.studentId)}"
        data-student-name="${enc(student.studentName)}"
        data-program="${enc(student.program)}"
        data-grade="${gradeVal ?? ''}"
        data-attendance="${attnVal ?? ''}"
        data-termavg="${termAvgVal ?? ''}"
        onclick="window.genNoticeFromButton(this,'lowattendance')">
        <div class="icon">W</div><div class="label">Attendance</div>
      </button>

      <button class="docbtn fail"
        ${gateAttr(flags.coursefailure)}
        aria-label="Generate Course Failure Notice"
        data-student-id="${enc(student.studentId)}"
        data-student-name="${enc(student.studentName)}"
        data-program="${enc(student.program)}"
        data-grade="${gradeVal ?? ''}"
        data-attendance="${attnVal ?? ''}"
        data-termavg="${termAvgVal ?? ''}"
        onclick="window.genNoticeFromButton(this,'coursefailure')">
        <div class="icon">W</div><div class="label">Failure</div>
      </button>

      <button class="docbtn avg"
        ${gateAttr(flags.lowtermaverage)}
        aria-label="Generate Low Term Average Notice"
        data-student-id="${enc(student.studentId)}"
        data-student-name="${enc(student.studentName)}"
        data-program="${enc(student.program)}"
        data-grade="${gradeVal ?? ''}"
        data-attendance="${attnVal ?? ''}"
        data-termavg="${termAvgVal ?? ''}"
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
    </tr>`;
}

// ===== Active template resolver (per bucket; no cross-bucket fallback) =====
async function loadActiveTemplateFor(type) {
    // 1) read active pointer
    const activeSnap = await dbGet(dbRef(db, `templates/${type}/active`));
    let result = null;

    if (activeSnap.exists()) {
        const activeVal = activeSnap.val();
        if (typeof activeVal === 'string') {
            const fileSnap = await dbGet(dbRef(db, `templates/${type}/files/${activeVal}`));
            if (fileSnap.exists()) result = normalizeFileMeta(fileSnap.val(), activeVal);
        } else if (activeVal && typeof activeVal === 'object') {
            result = normalizeFileMeta(activeVal, undefined);
        }
    }

    // 2) fallback: first file under SAME bucket
    if (!result) {
        const filesSnap = await dbGet(dbRef(db, `templates/${type}/files`));
        if (filesSnap.exists()) {
            const files = filesSnap.val();
            const firstKey = Object.keys(files)[0];
            if (firstKey) result = normalizeFileMeta(files[firstKey], firstKey);
        }
    }

    // 3) resolve to Storage signed URL if needed
    if (result && (!result.url || isMixedContentBlocked(result.url))) {
        if (result.storagePath) {
            try {
                result.url = await getDownloadURL(stRef(storage, result.storagePath));
            } catch (e) {
                console.warn('getDownloadURL failed for', result.storagePath, e);
            }
        }
    }

    return result;
}
function normalizeFileMeta(v, key) {
    return {
        key,
        name: v?.name || '',
        url: v?.url || '',
        storagePath: v?.storagePath || v?.gspath || '',
        size: v?.size,
        uploadedAt: v?.uploadedAt,
    };
}

// ===== Enable/disable by template availability =====
async function hydrateActiveStates() {
    try {
        const types = Object.keys(ACTIVE_TEMPLATES);
        const resolved = await Promise.all(types.map(loadActiveTemplateFor));
        resolved.forEach((res, idx) => { ACTIVE_TEMPLATES[types[idx]] = res; });

        const map = {
            atriskstatus: '.docbtn.risk',
            lowattendance: '.docbtn.attn',
            coursefailure: '.docbtn.fail',
            lowtermaverage: '.docbtn.avg',
        };

        // For each button of each type, compute usable URL and enable/disable
        await Promise.all(Object.entries(map).map(async ([type, sel]) => {
            const tmpl = ACTIVE_TEMPLATES[type];
            const finalUrl = tmpl ? await preferredUrlFromMeta(tmpl) : '';
            const rurl = resolveFetchableUrl(finalUrl);

            document.querySelectorAll(sel).forEach(btn => {
                const rowAllowed = btn.getAttribute('data-row-allowed') === '1';
                btn.dataset.templateUrl = rurl || '';
                const unusable = !rowAllowed || !rurl || isMixedContentBlocked(rurl);
                btn.toggleAttribute('disabled', unusable);

                let title = btn.title || '';
                title += tmpl?.name ? ` • Using: ${tmpl.name}` : ' • No active template selected';
                if (unusable && rowAllowed) {
                    const why = (!tmpl) ? 'no active template' :
                        (!tmpl.url && !tmpl.storagePath) ? 'no url/storagePath' :
                            (tmpl.url && isMixedContentBlocked(tmpl.url)) ? 'blocked mixed content (HTTPS->HTTP)' :
                                (!rurl) ? 'URL not fetchable' : '';
                    if (why) title += ` • ${why}`;
                }
                btn.title = title;
            });
        }));

        // Optional: console debug
        window.debugTemplates = function () {
            console.table({
                atriskstatus: ACTIVE_TEMPLATES.atriskstatus || null,
                lowattendance: ACTIVE_TEMPLATES.lowattendance || null,
                coursefailure: ACTIVE_TEMPLATES.coursefailure || null,
                lowtermaverage: ACTIVE_TEMPLATES.lowtermaverage || null,
            });
        };
    } catch (e) {
        console.warn('Active template check failed:', e);
    }
}

// ===== Diagnostics helpers (visible in console) =====
function _debugCtxFrom(btn, extras) {
    const ctx = {
        student_name: btn.dataset.studentName,
        student_number: btn.dataset.studentId,
        program: btn.dataset.program,
        course_name: window.courseName,
        grade: btn.dataset.grade !== '' ? cleanNum(btn.dataset.grade) : '',
        attendance: btn.dataset.attendance !== '' ? cleanNum(btn.dataset.attendance) : '',
        current_date: extras.today,
    };
    console.log('[DOC DEBUG] ctx →', ctx);
    window._lastCtx = ctx;
    return ctx;
}
function _debugReportTags(zip, ctx, templateName) {
    const tags = extractTemplateTags(zip);
    const report = diffTags(tags, ctx);
    console.table({ templateName, templateTags: report.templateTags, dataKeys: report.dataKeys, missing: report.missing, unused: report.unused });
    if (report.missing.length) {
        showTagReport(report, templateName);
        return false;
    }
    return true;
}

// ===== Generate click =====
window.genNoticeFromButton = async function (btn, alertType) {
    if (btn.hasAttribute('disabled')) return;

    const today = new Date();
    const fmt = (d) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const plusDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

    const extras = {
        today: fmt(today),
        deadline: fmt(plusDays(7)),
        semester: document.body.dataset.semester || (window.CURRENT_SEMESTER_LABEL ?? '') || 'FALL 2024',
    };

    // Build + log the exact data we’ll inject
    const ctx = _debugCtxFrom(btn, extras);

    try {
        btn.disabled = true;

        const tmpl = ACTIVE_TEMPLATES[alertType];
        if (!tmpl) throw new Error('No active template is selected for this type.');

        // Prefer storage signed URL
        let url = btn.dataset.templateUrl;
        if (!url) {
            const finalUrl = await preferredUrlFromMeta(tmpl);
            url = resolveFetchableUrl(finalUrl);
        }
        if (!url) throw new Error('Template URL is not fetchable from this page.');

        // Fetch .docx and verify
        const u8 = await fetchDocxBytes(url);
        const zip = new PizZip(u8);

        // Check tags before rendering (alerts if mismatch)
        if (!_debugReportTags(zip, ctx, tmpl.name || alertType)) return;

        // Render with Docxtemplater
        const doc = new window.docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '[[', end: ']]' }   // <— add this
        });

        doc.setData(ctx);
        try { doc.render(); }
        catch (e) {
            console.error('Docxtemplater render error:', e);
            throw new Error('Template placeholders mismatch. Ensure {{tags}} match JS keys exactly.');
        }

        const out = doc.getZip().generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });

        const fname = `${alertType}-${safeName(ctx.student_id)}-${safeName(ctx.student_name)}-${safeName(ctx.course_id)}.docx`;
        saveAs(out, fname);
    } catch (err) {
        console.error(err);
        alert(err.message || 'Failed to generate the document');
    } finally {
        btn.disabled = false;
    }
};
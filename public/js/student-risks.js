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

// ===== Page state =====
let instructorName = '';
let courseId = '';
let courseName = '';
let minGrade = 0;
let minAttendance = 0;
let thresholdsFromFirebase = false;

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
function enc(v) { return String(v ?? '').replaceAll('"','&quot;'); }
function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
const safeName = (s) => String(s||'').replace(/[^\w\-.]+/g,'_').slice(0,80);

// ---------- URL / CORS utilities ----------
function isMixedContentBlocked(u){
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
async function fetchDocxBytes(url){
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) {
    throw new Error(`Template HTTP error ${res.status} ${res.statusText} (${url})`);
  }
  const buf = await res.arrayBuffer();
  const u8 = new Uint8Array(buf);
  const isZip =
    u8.length >= 4 &&
    u8[0] === 0x50 && u8[1] === 0x4b &&
    (u8[2] === 0x03 || u8[2] === 0x05 || u8[2] === 0x07);
  if (!isZip) {
    let preview = '';
    try { preview = new TextDecoder().decode(u8.slice(0, 200)); } catch {}
    throw new Error(`The response is not a DOCX/ZIP. Preview: ${preview.replace(/\s+/g,' ').slice(0,180)}`);
  }
  return u8;
}

// ===== Firebase thresholds (settings/criteria/…) =====
async function fetchThresholds() {
  try {
    const snap = await dbGet(dbRef(db, 'settings/criteria'));
    if (snap.exists()) {
      const data = snap.val();
      minGrade = Number(data.minGrade ?? 0);
      minAttendance = Number(data.minAttendance ?? 0);
      thresholdsFromFirebase = true;

      // Update UI counters present in student-risks.html
      $('#min-grade-display').textContent = minGrade;
      $('#min-attendance-display').textContent = minAttendance;
    } else {
      console.warn('⚠️ settings/criteria node not found in Firebase');
      thresholdsFromFirebase = false;
    }
  } catch (err) {
    console.error('Failed to fetch thresholds:', err);
    thresholdsFromFirebase = false;
  }
}

// ---------- robust type normalization ----------
function normType(x){
  return String(x || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

// ===== Problem → button mapping =====
function flagsFromProblems(problems){
  const f = { atriskstatus:false, lowattendance:false, coursefailure:false, lowtermaverage:false };
  if (!Array.isArray(problems)) return f;

  for (const raw of problems) {
    const t = normType(raw?.type);
    if (t === 'low_attendance' || t === 'attendance' || t === 'attendance_warning' || t === 'attendance_low' || t === 'lowattendance') {
      f.lowattendance = true; // only attendance letter
    }
    if (t === 'low_grade' || t === 'course_failure' || t === 'failing_course' || t === 'grade_low') {
      // low grade => enable all EXCEPT attendance (your rule)
      f.atriskstatus   = true;
      f.coursefailure  = true;
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

// ===== Boot (single) =====
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const instructorId = urlParams.get('instructor_id');
  courseId = urlParams.get('course_id');
  instructorName = urlParams.get('instructor_name') || '';

  if (!instructorId || !courseId) {
    showError('Instructor or Course ID is missing from URL.');
    return;
  }

  // Heading (optional polish)
  if (instructorName) {
    const header = $('#instructor-heading');
    if (header) header.textContent = 'Instructor: ' + decodeURIComponent(instructorName);
    const dashboardTitle = $('#instructor_name_title');
    if (dashboardTitle) {
      const url = `teacher-course-list.html?instructor_id=${instructorId}&instructor_name=${encodeURIComponent(instructorName)}`;
      dashboardTitle.innerHTML = `<a href="${url}" class="text-decoration-none">${decodeURIComponent(instructorName)} Courses Dashboard</a>`;
    }
  }

  // 1) Fetch Firebase thresholds first
  await fetchThresholds();

  // 2) Then load the rest once authed
  auth.onAuthStateChanged((user) => {
    if (user) loadCourseAndStudentData(instructorId, user.uid);
    else showError('Please log in to view this information.');
  });
});

// ===== Data load =====
async function loadCourseAndStudentData(instructorId, userUid){
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
    $('#course-name-display').textContent = courseName;
    $('#total-students-display').textContent = course.total_students ?? 0;
    $('#problems-count-display').textContent = course.students_with_problems_count ?? 0;

    // Only override if Firebase didn't provide values
    if (!thresholdsFromFirebase) {
      minGrade = course.min_grade ?? 0;
      minAttendance = course.min_attendance ?? 0;
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
function renderStudentRiskRow(student){
  let gradeVal = null, attnVal = null, termAvgVal = null;
  if (Array.isArray(student.problems)) {
    for (const p of student.problems) {
      const t = normType(p.type);
      if (t === 'low_grade') gradeVal = p.value;
      if (t === 'low_attendance') attnVal = p.value;
      if (t === 'low_term_average' || t === 'low_term_avg') termAvgVal = p.value;
    }
  }

  const flags = flagsFromProblems(student.problems);

  const problemsHtml = (student.problems || []).map(p => {
    const t = normType(p.type);
    if (t === 'low_grade') return `<div>Low Grade: <span class="badge bg-danger">${p.value}%</span></div>`;
    if (t === 'low_attendance') return `<div>Low Attendance: <span class="badge bg-warning text-dark">${p.value}%</span></div>`;
    if (t === 'low_term_average' || t === 'low_term_avg') return `<div>Low Term Avg: <span class="badge bg-primary">${p.value}%</span></div>`;
    if (t === 'course_failure') return `<div>Course Failure</div>`;
    if (t === 'at_risk' || t === 'atriskstatus' || t === 'at_risk_status') return `<div>At-Risk</div>`;
    return `<div>General Concern</div>`;
  }).join('') || '<div>No flagged issues</div>';

  const gateAttr = (ok) => ok ? 'data-row-allowed="1"' : 'data-row-allowed="0" disabled title="Not applicable for this student"';

  const actionsHtml = `
    <div class="actions" role="group" aria-label="Generate notices" data-row-problems="${enc(JSON.stringify(student.problems||[]))}">
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

  // 3) optional: resolve storage path if current URL is not fetchable
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
async function hydrateActiveStates(){
  try {
    const types = Object.keys(ACTIVE_TEMPLATES);
    const resolved = await Promise.all(types.map(loadActiveTemplateFor));
    resolved.forEach((res, idx) => { ACTIVE_TEMPLATES[types[idx]] = res; });

    const map = {
      atriskstatus: '.docbtn.risk',
      lowattendance: '.docbtn.attn',
      coursefailure:  '.docbtn.fail',
      lowtermaverage: '.docbtn.avg',
    };

    Object.entries(map).forEach(([type, sel]) => {
      document.querySelectorAll(sel).forEach(btn => {
        const tmpl = ACTIVE_TEMPLATES[type];
        const rowAllowed = btn.getAttribute('data-row-allowed') === '1';

        const rurl = tmpl?.url ? resolveFetchableUrl(tmpl.url) : '';
        btn.dataset.templateUrl = rurl;

        const unusable = !rowAllowed || !rurl || isMixedContentBlocked(rurl);
        btn.toggleAttribute('disabled', unusable);

        const using = tmpl?.name ? ` • Using: ${tmpl.name}` : ' • No active template selected';
        btn.title = (btn.title || '') + using;
        if (unusable && rowAllowed) {
          const why = (!tmpl) ? 'no active template' :
            (!tmpl.url && !tmpl.storagePath) ? 'no url/storagePath' :
            (tmpl.url && isMixedContentBlocked(tmpl.url)) ? 'blocked mixed content (HTTPS->HTTP)' : '';
          if (why) btn.title += ` • ${why}`;
        }
      });
    });

    // Optional: quick console debug
    console.table({
      atriskstatus: ACTIVE_TEMPLATES.atriskstatus || null,
      lowattendance: ACTIVE_TEMPLATES.lowattendance || null,
      coursefailure: ACTIVE_TEMPLATES.coursefailure || null,
      lowtermaverage: ACTIVE_TEMPLATES.lowtermaverage || null,
    });
  } catch (e) {
    console.warn('Active template check failed:', e);
  }
}

// ---------- Tag extraction & report for DOCX ----------
function extractTemplateTags(zip){
  const xmlParts = [
    "word/document.xml",
    "word/header1.xml","word/header2.xml","word/header3.xml",
    "word/footer1.xml","word/footer2.xml","word/footer3.xml",
  ];
  const found = new Set();
  for (const p of xmlParts){
    const f = zip.file(p);
    if (!f) continue;
    const text = f.asText();
    const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
    let m;
    while ((m = re.exec(text))) found.add(m[1]);
  }
  return Array.from(found).sort();
}
function diffTags(templateTags, dataObj){
  const dataKeys = Object.keys(dataObj);
  const missing = templateTags.filter(t => !dataKeys.includes(t));
  const unused  = dataKeys.filter(k => !templateTags.includes(k));
  return {missing, unused, templateTags, dataKeys};
}
function showTagReport({missing, unused, templateTags}, templateName){
  const lines = [];
  lines.push(`Template: ${templateName || "(unnamed)"}`);
  lines.push(`Tags in DOCX: ${templateTags.length ? templateTags.join(", ") : "(none)"}`);
  if (missing.length){
    lines.push("");
    lines.push(`❌ Missing data for: ${missing.join(", ")}`);
  } else {
    lines.push("");
    lines.push("✅ All tags satisfied.");
  }
  if (unused.length){
    lines.push("");
    lines.push(`ℹ️ Unused data keys: ${unused.join(", ")}`);
  }
  alert(lines.join("\n"));
}

// ===== Generate click =====
window.genNoticeFromButton = async function(btn, alertType){
  if (btn.hasAttribute('disabled')) return;

  const today = new Date();
  const fmt = (d) => d.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
  const plusDays = (n) => { const d=new Date(today); d.setDate(d.getDate()+n); return d; };

  const semesterLabel =
    document.body.dataset.semester ||
    (window.CURRENT_SEMESTER_LABEL ?? '') ||
    'FALL 2024';

  // === Data keys exactly matching your templates ===
  const ctx = {
    student_name   : btn.dataset.studentName,
    student_id     : btn.dataset.studentId,
    program        : btn.dataset.program,
    course_id      : courseId,
    course_name    : courseName,
    instructor_name: instructorName ? decodeURIComponent(instructorName) : 'Instructor',
    current_score  : btn.dataset.grade ? Number(btn.dataset.grade) : '',
    attendance     : btn.dataset.attendance ? Number(btn.dataset.attendance) : '',
    term_average   : btn.dataset.termavg ? Number(btn.dataset.termavg) : '',
    min_grade      : minGrade,
    min_attendance : minAttendance,
    today          : fmt(today),
    deadline_date  : fmt(plusDays(7)),
    semester_label : semesterLabel,
    class_name     : courseName
  };

  try {
    btn.disabled = true;

    const tmpl = ACTIVE_TEMPLATES[alertType];
    if (!tmpl) throw new Error('No active template is selected for this type.');

    const url = btn.dataset.templateUrl || resolveFetchableUrl(tmpl.url);
    if (!url) throw new Error('Template URL is not fetchable from this page (mixed content or empty).');

    // Fetch and verify DOCX
    const u8 = await fetchDocxBytes(url);

    // Load zip & run a tag check BEFORE rendering
    const zip = new PizZip(u8);
    const templateTags = extractTemplateTags(zip);
    const report = diffTags(templateTags, ctx);

    if (report.missing.length){
      // Show what's wrong and abort render (fix template or ctx)
      showTagReport(report, tmpl.name || alertType);
      return;
    }

    // Render with Docxtemplater
    const doc = new window.docxtemplater(zip, { paragraphLoop:true, linebreaks:true });
    doc.setData(ctx);
    try { doc.render(); }
    catch (e) {
      console.error('Docxtemplater render error:', e);
      throw new Error('Template placeholders mismatch. Ensure {{tags}} match JS keys exactly.');
    }

    const out = doc.getZip().generate({
      type:'blob',
      mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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
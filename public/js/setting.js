// js/settings.js
import { auth, db } from "./firebase-config.js";
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const form = document.getElementById("criteria-form");
const statusEl = document.getElementById("criteria-save-status");

const fields = {
    minGrade: document.getElementById("minGrade"),
    minAttendance: document.getElementById("minAttendance"),
    minGPA: document.getElementById("minGPA"),
    passingCredits: document.getElementById("passingCredits"),
    graceAssignments: document.getElementById("graceAssignments"),
    policyNotes: document.getElementById("policyNotes"),
};

function setStatus(msg, ok = true) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle("text-success", ok);
    statusEl.classList.toggle("text-danger", !ok);
}

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
        // Optional role gate
        const roleSnap = await get(ref(db, `users/${user.uid}/role`));
        const role = roleSnap.exists() ? roleSnap.val() : "unknown";
        const canEdit = role === "admin" || role === "operator";

        if (!canEdit && form) {
            Array.from(form.elements).forEach(el => (el.disabled = true));
            setStatus("You don't have permission to edit these settings.", false);
        }

        // Load existing criteria
        const critRef = ref(db, "settings/criteria");
        const snap = await get(critRef);

        const defaults = {
            minGrade: 50,
            minAttendance: 75,
            minGPA: 2.0,
            passingCredits: 12,
            graceAssignments: 1,
            policyNotes: "",
        };

        const data = snap.exists() ? snap.val() : defaults;

        // Fill UI
        fields.minGrade.value = data.minGrade ?? defaults.minGrade;
        fields.minAttendance.value = data.minAttendance ?? defaults.minAttendance;
        fields.minGPA.value = data.minGPA ?? defaults.minGPA;
        fields.passingCredits.value = data.passingCredits ?? defaults.passingCredits;
        fields.graceAssignments.value = data.graceAssignments ?? defaults.graceAssignments;
        fields.policyNotes.value = data.policyNotes ?? defaults.policyNotes;

        // Save
        form?.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!canEdit) return;

            const payload = {
                minGrade: Number(fields.minGrade.value || 0),
                minAttendance: Number(fields.minAttendance.value || 0),
                minGPA: Number(fields.minGPA.value || 0),
                passingCredits: Number(fields.passingCredits.value || 0),
                graceAssignments: Number(fields.graceAssignments.value || 0),
                policyNotes: String(fields.policyNotes.value || ""),
                updatedBy: user.uid,
                updatedAt: Date.now(),
            };

            try {
                if (snap.exists()) {
                    await update(critRef, payload);
                } else {
                    await set(critRef, payload);
                }
                setStatus("Saved ✔");
            } catch (err) {
                console.error(err);
                setStatus("Save failed. Try again.", false);
            }
        });
    } catch (err) {
        console.error("Failed to load criteria:", err);
        setStatus("Failed to load.", false);
    }
});

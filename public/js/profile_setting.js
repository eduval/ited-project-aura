import { auth, db } from "./firebase-config.js";
import {
    onAuthStateChanged,
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updateEmail,
    updatePassword,
    sendEmailVerification,
    verifyBeforeUpdateEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { ref as dbRef, get, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const DEFAULT_AVATAR = "assets/images/users_img/user.jpg";
const $ = (id) => document.getElementById(id);

function setText(id, v) { const el = $(id); if (el) el.textContent = v ?? ""; }
function setHeaderAvatar(url) {
    const btn = $("dropdownAccountOptions");
    if (!btn) return;
    btn.style.backgroundImage = `url(${url || DEFAULT_AVATAR})`;
    btn.textContent = "";
    btn.classList.remove("fw-bold", "small");
}

// Resize to a small avatar and return dataURL
function fileToDataURLResized(file, maxSide = 256, mime = "image/jpeg", quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(maxSide / img.width, maxSide / img.height, 1);
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement("canvas");
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, w, h);
                try { resolve(canvas.toDataURL(mime, quality)); }
                catch (e) { reject(e); }
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

async function loadProfile(user) {
    const snap = await get(dbRef(db, `users/${user.uid}`));
    const data = snap.exists() ? snap.val() : {};
    const name = data.name || user.displayName || "—";
    const phone = data.phone || "";
    const role = data.role || "—";
    const photoURL = data.photoURL || user.photoURL || DEFAULT_AVATAR;

    setText("profile-name", name);
    setText("profile-role", role);
    setText("account-name", `Name: ${name}`);
    setText("account-phone", `Phone: ${phone || "—"}`);
    setText("current-email", user.email || "—");

    setText("user-name", name);
    setText("user-email", user.email || "—");
    setRolePill(role); // ADDED

    const preview = $("avatarPreview");
    if (preview) preview.src = photoURL;
    setHeaderAvatar(photoURL);

    const dd = $("account-dropdown");
    if (dd) dd.style.display = "block";


    function setRolePill(roleValue) {
        const roleText = (roleValue || "user").toString();
        let roleElem = document.getElementById("user-role");
        if (!roleElem) {
            roleElem = document.createElement("span");
            roleElem.id = "user-role";
            roleElem.className = "d-block smaller fw-medium text-truncate";
            const emailSpan = document.getElementById("user-email");
            if (emailSpan) emailSpan.insertAdjacentElement("afterend", roleElem);
        }
        roleElem.textContent = `Role: ${roleText}`;
    }
    // preload inputs (your IDs are swapped: user-lname = First, user-fname = Last)
    const firstInput = $("user-lname");
    const lastInput = $("user-fname");
    const ph = $("user-phone");

    const parts = (name || "").trim().split(/\s+/);
    const firstGuess = parts.length > 1 ? parts.slice(0, -1).join(" ") : name;
    const lastGuess = parts.length > 1 ? parts.slice(-1).join(" ") : "";

    if (firstInput) firstInput.value = firstGuess;
    if (lastInput) lastInput.value = lastGuess;
    if (ph) ph.value = phone;
}

function wireAccountForm(user) {
    const form = document.querySelector("#modal-account-edit form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const first = $("user-lname")?.value.trim() || ""; // First name
        const last = $("user-fname")?.value.trim() || ""; // Last name
        const phone = $("user-phone")?.value.trim() || "";

        const fullName = [first, last].filter(Boolean).join(" ").trim() || user.displayName || user.email;

        try {
            await update(dbRef(db, `users/${user.uid}`), { name: fullName, phone });
            try { await updateProfile(user, { displayName: fullName }); } catch { }

            setText("profile-name", fullName);
            setText("account-name", `Name: ${fullName}`);
            setText("account-phone", `Phone: ${phone || "—"}`);

            const modalEl = document.getElementById("modal-account-edit");
            if (modalEl && window.bootstrap) {
                const inst = window.bootstrap.Modal.getInstance(modalEl) || new window.bootstrap.Modal(modalEl);
                inst.hide();
            }
        } catch (err) {
            console.error(err);
            alert("Could not save profile. Please try again.");
        }
    }, { once: true });
}

function wireEmailForm(user) {
    const form = document.querySelector("#modal-email-edit form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const newEmail = $("user-newemail")?.value.trim();
        const pass = $("user-emailpassconfirm")?.value.trim();
        if (!newEmail || !pass) return alert("Enter email & password.");

        try {
            const cred = EmailAuthProvider.credential(user.email, pass);
            await reauthenticateWithCredential(user, cred);
            await updateEmail(user, newEmail);
            await update(dbRef(db, `users/${user.uid}`), { email: newEmail });
            await sendEmailVerification(user);

            setText("current-email", newEmail);
            setText("user-email", newEmail);

            const modalEl = document.getElementById("modal-email-edit");
            if (modalEl && window.bootstrap) {
                const inst = window.bootstrap.Modal.getInstance(modalEl) || new window.bootstrap.Modal(modalEl);
                inst.hide();
            }
            alert("Email updated. Verification sent.");
        } catch (err) {
            console.error(err);
            alert(err?.message || "Email update failed.");
        }
    }, { once: true });
}

function wireAvatar(user) {
    const file = $("avatarFile");
    const save = $("avatarSaveBtn");
    const preview = $("avatarPreview");
    const pbWrap = $("avatarProgressWrap");
    const pb = $("avatarProgress");
    const status = $("avatarStatus");

    const setStatus = (m, ok = true) => {
        if (!status) return;
        status.textContent = m || "";
        status.classList.toggle("text-danger", !ok);
    };
    const setProgress = (pct) => {
        if (!pbWrap || !pb) return;
        pbWrap.classList.remove("d-none");
        pb.style.width = `${pct}%`;
        if (pct >= 100) setTimeout(() => pbWrap.classList.add("d-none"), 500);
    };
    const enableSave = (flag) => { if (save) save.disabled = !flag; };

    if (!file || !preview) return;

    file.addEventListener("change", () => {
        const f = file.files?.[0];
        if (!f) return enableSave(false);
        if (!/^image\//.test(f.type)) { setStatus("Unsupported file type.", false); return enableSave(false); }
        if (f.size > 5 * 1024 * 1024) { setStatus("Max size 5 MB.", false); return enableSave(false); }

        const r = new FileReader();
        r.onload = () => { preview.src = r.result; };
        r.readAsDataURL(f);
        setStatus("");
        enableSave(true);
    });

    // Save to RTDB as a small data URL
    save?.addEventListener("click", async (e) => {
        e.preventDefault();
        const f = file.files?.[0];
        if (!f) return;

        try {
            enableSave(false);
            setStatus("Saving…");
            setProgress(30);

            const dataURL = await fileToDataURLResized(f, 256, "image/jpeg", 0.85);
            setProgress(80);

            await update(dbRef(db, `users/${user.uid}`), { photoURL: dataURL });
            try { await updateProfile(user, { photoURL: dataURL }); } catch { }

            preview.src = dataURL;
            setHeaderAvatar(dataURL);
            setProgress(100);
            setStatus("Saved!");
        } catch (err) {
            console.error(err);
            setStatus(`Save failed: ${err?.message || "Unknown error"}`, false);
            enableSave(true);
        }
    });
}

/* boot */
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; } // ADDED
    try { await loadProfile(user); } catch (e) { console.warn(e); }
    wireAccountForm(user);
    wireEmailForm(user);
    wireAvatar(user);

    const lastLoginElem = document.getElementById("last-login") || document.getElementById("profile-last-login");
    if (lastLoginElem && user.metadata?.lastSignInTime) {
        lastLoginElem.textContent = new Date(user.metadata.lastSignInTime).toLocaleString();
    }
});



// Password change

document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("#modal-passwd-edit form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const currentPassword = document.getElementById("user-currpass-new").value.trim();
        const newPassword = document.getElementById("user-newpass").value.trim();

        if (!currentPassword || !newPassword) {
            alert("❌ Please fill both fields.");
            return;
        }

        const user = auth.currentUser;

        if (!user || !user.email) {
            alert("❌ No user logged in.");
            return;
        }

        try {
            // Step 1: Re-authenticate the user
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            // Step 2: Update password
            await updatePassword(user, newPassword);

            alert("✅ Password updated successfully.");
            form.reset();
            const modal = bootstrap.Modal.getInstance(document.getElementById("modal-passwd-edit"));
            modal.hide();
        } catch (error) {
            console.error("Error:", error.code, error.message);
            if (error.code === "auth/wrong-password") {
                alert("❌ Incorrect current password.");
            } else if (error.code === "auth/weak-password") {
                alert("❌ New password is too weak. Use at least 6 characters.");
            } else {
                alert("❌ Failed to update password. Please try again.");
            }
        }
    });
});


//email change

document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("#modal-email-edit form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const newEmail = document.getElementById("user-newemail").value.trim();
        const password = document.getElementById("user-emailpassconfirm").value.trim();
        const user = auth.currentUser;

        if (!user || !user.email) {
            alert("❌ No user is logged in.");
            return;
        }

        if (!newEmail) {
            alert("❌ Please enter a new email.");
            return;
        }

        // ✅ Step 1: Check if current email is verified
        if (!user.emailVerified) {
            try {
                await sendEmailVerification(user);
                alert("📩 Please verify your current email before changing it. A verification link has been sent.");
                return;
            } catch (error) {
                console.error("❌ Failed to send verification email:", error);
                alert("❌ Unable to send verification email. Try again later.");
                return;
            }
        }

        // ✅ Step 2: Reauthenticate
        try {
            const credential = EmailAuthProvider.credential(user.email, password);
            await reauthenticateWithCredential(user, credential);
            console.log("✅ Reauthenticated.");
        } catch (error) {
            console.error("❌ Reauthentication failed:", error.code);
            alert("❌ Incorrect password. Please try again.");
            return;
        }

        // ✅ Step 3: Send verification to new email
        try {
            await verifyBeforeUpdateEmail(user, newEmail);
            alert("📩 A verification link has been sent to your new email. Click it to confirm the change.");
            form.reset();

            const modal = bootstrap.Modal.getInstance(document.getElementById("modal-email-edit"));
            modal.hide();
        } catch (error) {
            console.error("❌ verifyBeforeUpdateEmail failed:", error.code);

            switch (error.code) {
                case "auth/invalid-email":
                    alert("❌ Invalid email format.");
                    break;
                case "auth/email-already-in-use":
                    alert("❌ This email is already in use.");
                    break;
                case "auth/requires-recent-login":
                    alert("🔒 Session expired. Please log in again.");
                    await signOut(auth);
                    window.location.href = "index.html";
                    break;
                case "auth/user-not-verified":
                    alert("📩 Please verify your current email first.");
                    break;
                default:
                    alert("❌ Email change is disabled or failed. Check Firebase settings.");
            }
        }
    });
});
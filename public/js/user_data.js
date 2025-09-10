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

import { getDatabase, ref as dbRef, get, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";


function updateUserHeader() {
    const db = getDatabase();
    const user = auth.currentUser;

    if (!user) return;

    const uid = user.uid;
    const userRef = dbRef(db, `users/${uid}`);  // ✅ use dbRef here

    get(userRef).then(snapshot => {
        if (snapshot.exists()) {
            const userData = snapshot.val();
            const email = userData.email || "user@example.com";
            const name = email.split('@')[0];

            const logins = userData.logins || {};
            const today = new Date().toISOString().slice(0, 10);
            let loginCount = 0;

            for (const ts of Object.values(logins)) {
                const tsString = new Date(ts).toISOString().slice(0, 10);
                if (tsString === today) loginCount++;
            }

            document.getElementById("greeting").textContent = `Good morning, ${name}!`;
        }
    });
}

// Wait a bit in case auth takes a moment to populate
setTimeout(updateUserHeader, 500);

import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { auth } from "./firebase-config.js"; // assuming you export `auth` from firebase-config.js

function updateUserHeader() {
    const db = getDatabase();
    const user = auth.currentUser;

    if (!user) return;

    const uid = user.uid;
    const userRef = ref(db, `users/${uid}`);

    get(userRef).then(snapshot => {
        if (snapshot.exists()) {
            const userData = snapshot.val();
            const email = userData.email || "user@example.com";
            const name = email.split('@')[0];

            const logins = userData.logins || {};
            const today = new Date().toISOString().slice(0, 10);
            let loginCount = 0;

            for (const ts of Object.values(logins)) {
                if (ts.startsWith(today)) loginCount++;
            }

            // Update DOM
            document.getElementById("greeting").textContent = `Good morning, ${name}!`;
            //          document.getElementById("alertText").textContent = `You've got ${loginCount} login${loginCount === 1 ? '' : 's'} today`;
        }
    });
}

// Wait a bit in case auth takes a moment to populate
setTimeout(updateUserHeader, 500);


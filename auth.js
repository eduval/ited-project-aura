import { auth, db } from "./firebase-config.js";
import { ref, set, get } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const uid = user.uid;
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    if (!snapshot.exists()) {
      await set(userRef, {
        name: user.displayName || "New User",
        email: user.email,
        role: "student",
        lastLogin: new Date().toISOString()
      });
    } else {
      await set(userRef, {
        ...snapshot.val(),
        lastLogin: new Date().toISOString()
      });
    }
  }
});

import { db } from "./firebase-config.js";
import { ref, update } from "firebase/database";
import { auth } from "./firebase-config.js";

export function logLogout() {
  const user = auth.currentUser;
  if (user) {
    update(ref(db, `users/${user.uid}`), {
      lastLogout: new Date().toISOString()
    });
  }
}

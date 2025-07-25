import { db } from "./firebase-config.js";
import { ref, set, push, update } from "firebase/database";

export function pushAlert(fileName, userId, title, message) {
  const alertRef = push(ref(db, `alerts/${fileName}`));
  set(alertRef, {
    id: alertRef.key,
    user: userId,
    title,
    message,
    timestamp: new Date().toISOString(),
    read: false
  });
}

export function markAlertAsRead(fileName, alertId) {
  const alertRef = ref(db, `alerts/${fileName}/${alertId}`);
  update(alertRef, { read: true });
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCL7UWbm_1-1PtjYPRJq8tAW46O8Nyple0",
  authDomain: "aura-cctb-testing.firebaseapp.com",
  databaseURL: "https://aura-cctb-testing-default-rtdb.firebaseio.com",
  projectId: "aura-cctb-testing",
  storageBucket: "aura-cctb-testing.firebasestorage.app",
  messagingSenderId: "97157656782",
  appId: "1:97157656782:web:ea9972a9d4dc0190cae09f",
  measurementId: "G-8MZR7TQKM1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
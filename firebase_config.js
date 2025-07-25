// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";

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
const analytics = getAnalytics(app);

// Initialize Realtime Database
const database = getDatabase(app);

// Example usage: Write data
set(ref(database, 'test/path'), {
  message: "Hello Firebase"
});

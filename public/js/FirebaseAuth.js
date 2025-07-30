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
firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();

import { auth } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const proceedBtn = document.getElementById('proceed-btn');


    proceedBtn.addEventListener('click', (event) => {
        event.preventDefault(); 

        const user = auth.currentUser;
        if (!user) {
            alert("Authentication Error. Please refresh and log in again before proceeding.");
            return;
        }

        console.log(`User confirmed. Navigating to analysis page for user: ${user.uid}`);
        window.location.href = `student_analysis.html?userID=${user.uid}`;
    });
});
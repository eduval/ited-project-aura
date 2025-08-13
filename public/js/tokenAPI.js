import { db } from './firebase-config.js'; // your initialized db export
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const auth = getAuth();

const form = document.getElementById("criteria-form");
const input = document.getElementById("token_api");
const statusSpan = document.getElementById("criteria-save-status");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        statusSpan.textContent = "You must be logged in to update the API token.";
        return;
    }

    const uid = user.uid;
    const newKey = input.value.trim();

    if (!newKey) {
        statusSpan.textContent = "Please enter a valid API token.";
        return;
    }

    statusSpan.textContent = "Saving...";

    try {
        const timestamp = new Date().toISOString();
        const safeTimestamp = timestamp.replace(/[.#$\/\[\]]/g, '-').replace(/:/g, '-');

        const userApiKeyRef = ref(db, `apiKeys/${uid}`);

        // Get current data (history + others)
        const snapshot = await get(userApiKeyRef);
        const data = snapshot.exists() ? snapshot.val() : {};

        // Prepare updated history object
        const updatedHistory = data.history || {};
        updatedHistory[safeTimestamp] = {
            key: newKey,
            updatedBy: uid,
        };

        // Write the updated fields atomically with update()
        await update(userApiKeyRef, {
            currentKey: newKey,
            lastUpdated: timestamp,
            updatedBy: uid,
            history: updatedHistory
        });

        statusSpan.textContent = "API token saved successfully!";
        input.value = ""; // optional clear
    } catch (error) {
        console.error("Error saving API token:", error);
        statusSpan.textContent = "Failed to save API token. Please try again.";
    }
});


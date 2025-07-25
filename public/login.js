import { auth } from './firebase.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.querySelector('#account_email').value;
  const password = document.querySelector('#account_passwd').value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    alert('Login successful!');
    window.location.href = 'dashboard.html'; // Redirige al dashboard
  } catch (error) {
    alert('Invalid email or password!');
    console.error(error.message);
  }
});

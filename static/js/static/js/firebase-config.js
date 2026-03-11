// Import Firebase modules (v9 modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBs2E6onYHaoyH7Lek8uY8dEg20XYwZN3g",
  authDomain: "superkeeper-2b7f6.firebaseapp.com",
  projectId: "superkeeper-2b7f6",
  storageBucket: "superkeeper-2b7f6.firebasestorage.app",
  messagingSenderId: "921700961073",
  appId: "1:921700961073:web:5c64083b845bd0e752fe10",
  measurementId: "G-971GJRVCE5"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

// Export modules for other scripts
export { app, auth, provider, db };

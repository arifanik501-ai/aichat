// ============================================================
//  FIREBASE CONFIGURATION — INSERT YOUR CREDENTIALS HERE
//  Firebase Console → Project settings → General → Your apps → Web app
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyBcjbR7Qu7M-RnHUtLJ9zeehILqQHYLw4E",
  authDomain: "whatsapp-c10ef.firebaseapp.com",
  databaseURL: "https://whatsapp-c10ef-default-rtdb.firebaseio.com",
  projectId: "whatsapp-c10ef",
  storageBucket: "whatsapp-c10ef.firebasestorage.app",
  messagingSenderId: "675053106773",
  appId: "1:675053106773:web:b7078468691a07ecfec6dc"
};

// ============================================================
//  AUTHENTICATION
//  false = profile picker only (NOT secure — testing only).
//  true  = each user must sign in with Firebase Email/Password.
//          Create these two accounts in Firebase Console → Authentication.
// ============================================================
export const USE_AUTH = false;

export const authEmails = {
  anik: "anik@example.com",
  priya: "priya@example.com"
};

// Number of recent messages loaded on open (keeps reads low).
export const MESSAGE_LIMIT = 100;

// Code asked after the coin toss to open the messenger.
// Note: this hides the app from casual eyes; it is not real security
// (anyone can read it in the page source). Real protection = USE_AUTH.
export const ACCESS_CODE = "2645";

// If the app stays in the background (other tab/app, screen off) this many
// seconds, it returns to the coin toss game. 0 = never auto-lock.
export const AUTO_LOCK_SECONDS = 60;

# Secure Vault — HTML/CSS/JavaScript + Firebase

This version removes React, Node/Express, Passport, MongoDB and the custom JWT/CSRF backend. It is a static web app using Firebase Authentication and Cloud Firestore.

## Features
- Email/password sign up
- Firebase email verification
- Google sign in
- User profile stored in Firestore
- Create, edit, list and delete notes
- Firestore security rules isolate each user's data
- 5-minute inactivity auto-lock for the note editor
- Responsive liquid-glass UI

## 1. Create Firebase project
Open https://console.firebase.google.com/ and create/select a project.

Enable:
- Authentication → Sign-in method → Email/Password
- Authentication → Sign-in method → Google
- Firestore Database → Create database

In Authentication → Settings → Authorized domains, add your local and production domains, for example `localhost`, `127.0.0.1`, and your Vercel/Firebase Hosting domain.

## 2. Add Firebase Web App
Firebase Console → Project settings → Your apps → Web → register the app.
Copy its config into `firebase-config.js`.

## 3. Run in VS Code
This is a static site. You do not need `npm install`.

Recommended local server:
```powershell
python -m http.server 5500
```
Then open `http://127.0.0.1:5500`.

Or use VS Code Live Server.

## 4. Firestore rules
Publish `firestore.rules` from Firebase Console, or use Firebase CLI:
```powershell
npm install -g firebase-tools
firebase login
firebase init
firebase deploy --only firestore:rules,hosting
```
When asked for the public directory, use `.` and enable SPA rewrites.

## 5. Google sign-in
Google authentication is handled directly by Firebase. You no longer need a Google OAuth callback URL or Render backend.

## Important security note
This migration uses Firebase Authentication and Firestore Security Rules. Note bodies are stored in Firestore as application data and are protected by per-user rules. If you need end-to-end encryption where Firebase cannot read note contents, add a Web Crypto encryption layer with a user-held key before storing notes.

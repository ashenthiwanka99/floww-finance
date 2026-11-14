// Your own Firebase project's web config.
// These values identify a project. They are not secrets: access is controlled by
// firestore.rules. Create a project, enable Google sign-in and Firestore, then paste
// the config from Project settings > Your apps > Web app.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: 'YOUR_APP_ID'
}

// The OAuth "Web client" ID of the same project, used for native Google sign-in.
// The same value goes in src-capacitor/capacitor.config.json (GoogleAuth.serverClientId)
// and src-capacitor/android/app/src/main/res/values/strings.xml (server_client_id).
export const googleWebClientId = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com'

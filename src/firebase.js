import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { firebaseConfig } from './firebase.config'

// The config lives in firebase.config.js. Its values are public identifiers, not secrets:
// security is enforced by the Firestore rules in firestore.rules.
const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export default app

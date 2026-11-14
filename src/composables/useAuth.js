import { ref } from 'vue'
import { googleWebClientId } from '../firebase.config'
import { auth } from '../firebase'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential
} from 'firebase/auth'

const currentUser = ref(null)
const isLoading = ref(true)
const authError = ref(null)

// Listen to auth state globally
let initialized = false

function initAuthListener() {
  if (initialized) return
  initialized = true
  onAuthStateChanged(auth, (user) => {
    currentUser.value = user
    isLoading.value = false
  })
}

export function useAuth() {
  initAuthListener()

  async function signIn(email, password) {
    authError.value = null
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      currentUser.value = cred.user
      return cred.user
    } catch (e) {
      authError.value = e.message.replace('Firebase: ', '').replace(/\(auth\/.*\)/, '').trim()
      throw e
    }
  }

  async function signUp(email, password) {
    authError.value = null
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      currentUser.value = cred.user
      return cred.user
    } catch (e) {
      authError.value = e.message.replace('Firebase: ', '').replace(/\(auth\/.*\)/, '').trim()
      throw e
    }
  }

  async function signInWithGoogle() {
    authError.value = null
    try {
      // Try native Google Sign-In (Capacitor plugin) first
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
      await GoogleAuth.initialize({
        clientId: googleWebClientId,
        scopes: ['profile', 'email']
      })
      const googleUser = await GoogleAuth.signIn()
      // Use the ID token to sign into Firebase
      const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken)
      const cred = await signInWithCredential(auth, credential)
      currentUser.value = cred.user
      return cred.user
    } catch (nativeError) {
      // Fallback to popup (works in browser dev mode)
      try {
        const provider = new GoogleAuthProvider()
        const cred = await signInWithPopup(auth, provider)
        currentUser.value = cred.user
        return cred.user
      } catch (popupError) {
        authError.value = popupError.message.replace('Firebase: ', '').replace(/\(auth\/.*\)/, '').trim()
        throw popupError
      }
    }
  }

  async function signOut() {
    try {
      // Sign out from native Google too
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
      await GoogleAuth.signOut()
    } catch {}
    await firebaseSignOut(auth)
    currentUser.value = null
  }

  return {
    currentUser,
    isLoading,
    authError,
    signIn,
    signUp,
    signInWithGoogle,
    signOut
  }
}

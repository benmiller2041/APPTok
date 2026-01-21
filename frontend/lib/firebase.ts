import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"] as const;
const missingKeys = requiredKeys.filter((key) => !firebaseConfig[key]);
if (missingKeys.length > 0) {
  console.warn("⚠️ Firebase config incomplete. Missing keys:", missingKeys);
}

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;
let authReadyPromise: Promise<void> | undefined;

// Initialize Firebase only on the client side
if (typeof window !== "undefined") {
  try {
    // Check if all required config values are present
    const hasConfig = firebaseConfig.apiKey && 
                      firebaseConfig.authDomain && 
                      firebaseConfig.projectId;
    
    if (hasConfig) {
      console.log("🔥 Initializing Firebase with config:", {
        apiKey: firebaseConfig.apiKey?.substring(0, 10) + "...",
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
      });
      
      app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      db = getFirestore(app);
      auth = getAuth(app);
      authReadyPromise = new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth!, () => {
          unsubscribe();
          resolve();
        });
      });

      signInAnonymously(auth).catch((error) => {
        console.error("❌ Firebase anonymous auth error:", error);
      });
      
      console.log("✅ Firebase initialized successfully");
    } else {
      console.warn("⚠️ Firebase config missing. Current values:", {
        hasApiKey: !!firebaseConfig.apiKey,
        hasAuthDomain: !!firebaseConfig.authDomain,
        hasProjectId: !!firebaseConfig.projectId,
      });
    }
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
  }
}

export { db };
export { auth, authReadyPromise };

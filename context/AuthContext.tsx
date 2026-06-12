import { 
  onAuthStateChanged, 
  signInWithCredential, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile as updateProfileFirebase,
  User as FirebaseUser,
  sendPasswordResetEmail
} from "firebase/auth";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";

function getGoogleSigninModule() {
  if (Constants.appOwnership === "expo") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@react-native-google-signin/google-signin");
    return mod?.GoogleSignin || null;
  } catch {
    return null;
  }
}

interface User {
  uid: string;
  name: string;
  email: string;
  avatarUri?: string;
  username?: string;
  bio?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthReady: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, pass: string, name: string, email: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<Omit<User, "uid" | "email">>) => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const isSigningOutRef = useRef(false);

  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    // 1. Optimistic Bootstrap: Pre-load the last active user session from cache instantly
    AsyncStorage.getItem("@last_active_user_session")
      .then((cachedUserStr) => {
        clearTimeout(safetyTimer);
        if (cachedUserStr) {
          const cachedUser = JSON.parse(cachedUserStr);
          setUser(cachedUser);
        }
        setIsLoading(false); // Instantly ready, no startup delay!
      })
      .catch(() => {
        clearTimeout(safetyTimer);
        setIsLoading(false);
      });

    const GoogleSignin = getGoogleSigninModule();
    if (GoogleSignin) {
      GoogleSignin.configure({
        webClientId: "1064792050841-amo41uudlpvmuoou362ijcktfe198hdr.apps.googleusercontent.com",
        offlineAccess: true,
      });
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsAuthReady(true);
      if (firebaseUser) {
        let cachedProfile: Partial<User> = {};
        try {
          const cached = await AsyncStorage.getItem(`@user_profile_${firebaseUser.uid}`);
          if (cached) cachedProfile = JSON.parse(cached);
        } catch (e) {
          console.error("Failed to load cached user profile:", e);
        }

        const updatedUser = {
          uid: firebaseUser.uid,
          name: cachedProfile.name || firebaseUser.displayName || "User",
          email: firebaseUser.email || "",
          avatarUri: cachedProfile.avatarUri || firebaseUser.photoURL || undefined,
          username: cachedProfile.username || firebaseUser.email?.split("@")[0] || "user",
          bio: cachedProfile.bio || "",
        };

        setUser(updatedUser);
        setIsLoading(false);

        // Cache this as the last active session
        AsyncStorage.setItem("@last_active_user_session", JSON.stringify(updatedUser)).catch(() => null);

        // Background user profile fetch from Firestore to restore on clean install
        const { getDoc, doc: fsDoc } = require("firebase/firestore");
        getDoc(fsDoc(db, `users/${firebaseUser.uid}`))
          .then((docSnap: any) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const mergedUser = {
                uid: firebaseUser.uid,
                name: data.name || updatedUser.name,
                email: firebaseUser.email || "",
                avatarUri: data.avatarUri || updatedUser.avatarUri,
                username: data.username || updatedUser.username,
                bio: data.bio || updatedUser.bio,
              };
              
              setUser(mergedUser);
              AsyncStorage.setItem(`@user_profile_${firebaseUser.uid}`, JSON.stringify(mergedUser)).catch(() => null);
              AsyncStorage.setItem("@last_active_user_session", JSON.stringify(mergedUser)).catch(() => null);
            }
          })
          .catch((err: any) => {
            console.warn("⚠️ Background user profile fetch from Firestore failed:", err);
          });

        // Background user Firestore metadata sync (non-blocking)
        setDoc(doc(db, `users/${firebaseUser.uid}`), {
          uid: updatedUser.uid,
          name: updatedUser.name,
          email: updatedUser.email,
          username: updatedUser.username,
          bio: updatedUser.bio,
          lastActive: Date.now(),
        }, { merge: true }).catch((err) => {
          console.warn("⚠️ Background user Firestore metadata sync skipped:", err);
        });
      } else {
        if (isSigningOutRef.current) {
          setIsLoading(false);
          return;
        }
        setUser(null);
        setIsLoading(false);
        AsyncStorage.removeItem("@last_active_user_session").catch(() => null);
      }
    });

    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, pass: string) => {
    console.log("🔑 [AuthContext] Login flow started for:", email);
    try {
      console.log("📡 [AuthContext] Calling signInWithEmailAndPassword...");
      const credential = await signInWithEmailAndPassword(auth, email, pass);
      console.log("✅ [AuthContext] signInWithEmailAndPassword succeeded!");

      // Pre-seed temporary user cache so boot is instant next time
      const tempUser = {
        uid: credential.user.uid,
        name: credential.user.displayName || "User",
        email: credential.user.email || "",
      };
      await AsyncStorage.setItem("@last_active_user_session", JSON.stringify(tempUser)).catch(() => null);

      return { success: true };
    } catch (error: any) {
      console.warn("❌ [AuthContext] Login Error caught:", error);
      return { success: false, error: error.message };
    }
  }, []);

  const register = useCallback(async (username: string, pass: string, name: string, email: string) => {
    console.log("📝 [AuthContext] Register flow started for:", email);
    try {
      console.log("📡 [AuthContext] Calling createUserWithEmailAndPassword...");
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      console.log("✅ [AuthContext] createUserWithEmailAndPassword succeeded! Calling updateProfile...");
      await updateProfileFirebase(userCredential.user, { displayName: name });
      
      console.log("📡 [AuthContext] Saving user record to Firestore...");
      await setDoc(doc(db, `users/${userCredential.user.uid}`), {
        uid: userCredential.user.uid,
        name: name,
        email: email,
        username: username,
        createdAt: Date.now(),
      }, { merge: true });

      console.log("✅ [AuthContext] updateProfile succeeded! Setting user state...");
      const newUser = {
        uid: userCredential.user.uid,
        name: name,
        email: email,
        username: username,
        bio: "",
      };
      await AsyncStorage.setItem(`@user_profile_${userCredential.user.uid}`, JSON.stringify(newUser)).catch(() => null);
      await AsyncStorage.setItem("@last_active_user_session", JSON.stringify(newUser)).catch(() => null);
      setUser(newUser);
      console.log("🎉 [AuthContext] Register flow completed successfully!");
      return { success: true };
    } catch (error: any) {
      console.warn("❌ [AuthContext] Registration Error caught:", error);
      return { success: false, error: error.message };
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const GoogleSignin = getGoogleSigninModule();
    if (!GoogleSignin) {
      return { success: false, error: "Google Sign-In needs a development/production build (not Expo Go)." };
    }
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.type !== "success") {
        return { success: false, error: "Google Sign-In was cancelled or failed." };
      }
      const idToken = response.data?.idToken;
      if (!idToken) {
        throw new Error("No Google ID token returned. Ensure your OAuth Client configuration is correct.");
      }
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
      return { success: true };
    } catch (error: any) {
      console.warn("Google Login Error:", error);
      return { success: false, error: error.message };
    }
  }, []);

  const logout = useCallback(async () => {
    const GoogleSignin = getGoogleSigninModule();
    isSigningOutRef.current = true;
    let signedOut = false;
    try {
      await signOut(auth);
      if (GoogleSignin) await GoogleSignin.signOut();
      signedOut = true;
    } catch (e) {
      console.error("Logout Error:", e);
    } finally {
      isSigningOutRef.current = false;
      if (signedOut) {
        setUser(null);
        setIsLoading(false);
        AsyncStorage.removeItem("@last_active_user_session").catch(() => null);
      }
    }
  }, []);

  const updateProfile = useCallback(async (updates: Partial<Omit<User, "uid" | "email">>) => {
    if (!user) return;
    
    setUser((prev) => prev ? { ...prev, ...updates } : null);
    
    if (updates.name && auth.currentUser) {
      await updateProfileFirebase(auth.currentUser, { displayName: updates.name }).catch(() => null);
    }
    
    try {
      const cachedKey = `@user_profile_${user.uid}`;
      const cached = await AsyncStorage.getItem(cachedKey);
      const currentProfile = cached ? JSON.parse(cached) : {};
      await AsyncStorage.setItem(cachedKey, JSON.stringify({ ...currentProfile, ...updates }));
    } catch (err) {
      console.error("Local storage user save failed:", err);
    }

    try {
      await setDoc(doc(db, `users/${user.uid}`), updates, { merge: true });
    } catch (err) {
      console.warn("⚠️ Background user profile Firestore sync failed:", err);
    }
  }, [user]);

  const forgotPassword = useCallback(async (email: string) => {
    console.log("🔒 [AuthContext] Forgot password request for:", email);
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error: any) {
      console.error("❌ [AuthContext] Forgot Password Error:", error);
      return { success: false, error: error.message };
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthReady, login, register, loginWithGoogle, logout, updateProfile, forgotPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

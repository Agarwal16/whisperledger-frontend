import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// On web, SecureStore is unavailable — fall back to AsyncStorage
const isSecureStoreAvailable = Platform.OS !== "web";

/**
 * Secure storage wrapper — uses expo-secure-store on native (hardware-backed Secure Enclave)
 * and falls back to AsyncStorage on web.
 */
export const SecureSession = {
  async setItem(key: string, value: string): Promise<void> {
    if (isSecureStoreAvailable) {
      try {
        await SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        return;
      } catch (e) {
        console.warn("[SecureStore] Falling back to AsyncStorage for key:", key, e);
      }
    }
    await AsyncStorage.setItem(key, value);
  },

  async getItem(key: string): Promise<string | null> {
    if (isSecureStoreAvailable) {
      try {
        return await SecureStore.getItemAsync(key);
      } catch (e) {
        console.warn("[SecureStore] Read failed, trying AsyncStorage for key:", key, e);
      }
    }
    return AsyncStorage.getItem(key);
  },

  async removeItem(key: string): Promise<void> {
    if (isSecureStoreAvailable) {
      try {
        await SecureStore.deleteItemAsync(key);
        return;
      } catch (e) {
        console.warn("[SecureStore] Delete failed, trying AsyncStorage for key:", key, e);
      }
    }
    await AsyncStorage.removeItem(key);
  },
};

// Key constants for secure storage
export const SECURE_KEYS = {
  USER_SESSION: "@secure_user_session",
  AUTH_TOKEN: "@secure_auth_token",
  FIREBASE_REFRESH: "@secure_firebase_refresh",
} as const;

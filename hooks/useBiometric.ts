import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

export interface BiometricResult {
  success: boolean;
  error?: string;
}

/**
 * Check if the device supports biometric authentication and has enrolled biometrics.
 */
export async function checkBiometricAvailable(): Promise<{
  available: boolean;
  biometricType: "fingerprint" | "faceId" | "iris" | "none";
}> {
  if (Platform.OS === "web") {
    return { available: false, biometricType: "none" };
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return { available: false, biometricType: "none" };

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return { available: false, biometricType: "none" };

    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let biometricType: "fingerprint" | "faceId" | "iris" | "none" = "none";
    if (
      supportedTypes.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
      )
    ) {
      biometricType = "faceId";
    } else if (
      supportedTypes.includes(
        LocalAuthentication.AuthenticationType.FINGERPRINT
      )
    ) {
      biometricType = "fingerprint";
    } else if (
      supportedTypes.includes(
        LocalAuthentication.AuthenticationType.IRIS
      )
    ) {
      biometricType = "iris";
    }

    return { available: true, biometricType };
  } catch (e) {
    console.warn("[Biometric] Hardware check failed:", e);
    return { available: false, biometricType: "none" };
  }
}

/**
 * Prompt the user for biometric authentication.
 * Falls back to device PIN/Pattern/Password if biometrics fail.
 */
export async function authenticateWithBiometrics(
  reason = "Unlock WhisperLedger to access your finances"
): Promise<BiometricResult> {
  if (Platform.OS === "web") {
    return { success: true }; // Always pass on web
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Cancel",
      disableDeviceFallback: false, // Allow PIN fallback
      fallbackLabel: "Use PIN",
    });

    if (result.success) {
      return { success: true };
    } else {
      return {
        success: false,
        error:
          result.error === "user_cancel"
            ? "Authentication cancelled"
            : result.error === "not_enrolled"
            ? "No biometrics enrolled"
            : "Authentication failed",
      };
    }
  } catch (e: any) {
    console.warn("[Biometric] Authentication error:", e);
    return { success: false, error: e?.message || "Authentication error" };
  }
}

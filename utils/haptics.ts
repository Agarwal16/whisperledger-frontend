import * as Haptics from "expo-haptics";

export const safeHaptics = {
  impactAsync: (style: Haptics.ImpactFeedbackStyle) => {
    try {
      Haptics.impactAsync(style).catch((e) => {
        console.warn("Haptics impactAsync failed:", e);
      });
    } catch (err) {
      console.warn("Haptics impactAsync call failed:", err);
    }
  },
  selectionAsync: () => {
    try {
      Haptics.selectionAsync().catch((e) => {
        console.warn("Haptics selectionAsync failed:", e);
      });
    } catch (err) {
      console.warn("Haptics selectionAsync call failed:", err);
    }
  },
  notificationAsync: (type: Haptics.NotificationFeedbackType) => {
    try {
      Haptics.notificationAsync(type).catch((e) => {
        console.warn("Haptics notificationAsync failed:", e);
      });
    } catch (err) {
      console.warn("Haptics notificationAsync call failed:", err);
    }
  },
};

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { collection, doc, setDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

export const SMS_APPROVAL_CATEGORY = "sms_approval";
export const DAILY_REMINDER_TYPE = "daily_reminder";
export const SMS_APPROVAL_TYPE = "sms_approval";
const DAILY_REMINDER_NOTIFICATION_ID_KEY = "@daily_reminder_notification_id";

export enum SMSAction {
  APPROVE = "approve",
  DISCARD = "discard",
}

function getNotificationsModule() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-notifications");
  } catch {
    return null;
  }
}

export async function setupNotifications() {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  await Notifications.setNotificationCategoryAsync(SMS_APPROVAL_CATEGORY, [
    {
      identifier: SMSAction.APPROVE,
      buttonTitle: "Approve",
      options: { opensAppToForeground: false },
    },
    {
      identifier: SMSAction.DISCARD,
      buttonTitle: "Discard",
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4f46e5",
    });
    await Notifications.setNotificationChannelAsync("budget_alerts", {
      name: "Budget Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
      lightColor: "#f59e0b",
      description: "Alerts when you approach or exceed a category budget limit",
    });
  }
}

export async function requestNotificationPermissions() {
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === "granted";
}

export async function scheduleSMSApprovalNotification(amount: number, merchant: string, smsId: string) {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "New Transaction Detected",
      body: `Spent Rs ${amount} at ${merchant}. Approve?`,
      categoryIdentifier: SMS_APPROVAL_CATEGORY,
      data: { smsId, amount, merchant, notificationType: SMS_APPROVAL_TYPE },
    },
    trigger: null,
  });
}

export async function scheduleDailyExpenseReminder(hour: number, minute: number) {
  const Notifications = getNotificationsModule();
  if (!Notifications) return null;

  const existingId = await AsyncStorage.getItem(DAILY_REMINDER_NOTIFICATION_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => null);
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time to log your expenses",
      body: "Tap to quickly add today's spends.",
      data: {
        notificationType: DAILY_REMINDER_TYPE,
        deepLink: "/(tabs)/index?openAdd=1",
        openAdd: true,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });

  await AsyncStorage.setItem(DAILY_REMINDER_NOTIFICATION_ID_KEY, id);
  return id;
}

export async function logUserNotification(params: {
  userId: string;
  notificationId: string;
  title: string;
  body: string;
  notificationType: string;
  data?: Record<string, any>;
  read?: boolean;
}) {
  const ref = doc(collection(db, `users/${params.userId}/notifications`), params.notificationId);
  await setDoc(
    ref,
    {
      title: params.title,
      body: params.body,
      notificationType: params.notificationType,
      data: params.data || {},
      read: params.read ?? false,
      createdAt: Date.now(),
    },
    { merge: true }
  );
}

/**
 * Sends a push notification when a budget threshold is crossed.
 * Called automatically by BudgetContext when spending hits 50%, 80%, or 100%.
 */
export async function sendBudgetAlert(
  categoryName: string,
  percentage: number,
  remaining: number,
  limit: number
): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  const emoji = percentage >= 100 ? "🚨" : percentage >= 80 ? "⚠️" : "💡";
  const title =
    percentage >= 100
      ? `${emoji} Budget Exceeded: ${categoryName}`
      : `${emoji} Budget Alert: ${categoryName}`;

  const body =
    percentage >= 100
      ? `You have exceeded your ₹${limit.toLocaleString("en-IN")} budget for ${categoryName}.`
      : `You've used ${Math.round(percentage)}% of your ${categoryName} budget. ₹${remaining.toLocaleString("en-IN")} remaining.`;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          notificationType: "budget_alert",
          deepLink: "/(tabs)/analytics?tab=budgets",
          category: categoryName,
          percentage,
          remaining,
          limit,
        },
        sound: true,
        priority: "high",
        channelId: "budget_alerts",
      },
      trigger: null,
    });
  } catch (e) {
    console.warn("[Notifications] Budget alert failed:", e);
  }
}

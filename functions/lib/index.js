"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onStatementRequested = exports.onSupportCaseCreated = exports.onNotificationCreated = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
admin.initializeApp();
function getLocalParts(timeZone) {
    const now = new Date();
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
    const parts = Object.fromEntries(dtf.formatToParts(now).map((p) => [p.type, p.value]));
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
    };
}
async function sendExpoPush(token, title, body, data) {
    const payload = {
        to: token,
        sound: "default",
        title,
        body,
        data,
        channelId: "default",
    };
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Expo push failed: ${res.status} ${text}`);
    }
}
/**
 * onNotificationCreated — fires whenever ANY notification doc is written to
 * users/{userId}/notifications/{notifId}.
 *
 * This is the universal push bridge: admin broadcasts, support replies,
 * statement emails, etc. all write to this subcollection. This function
 * reads the user's stored pushToken and calls the Expo Push API, so the
 * notification is delivered even when the app is fully closed.
 */
exports.onNotificationCreated = (0, firestore_1.onDocumentCreated)({
    document: "users/{userId}/notifications/{notifId}",
    region: "asia-south1",
    memory: "256MiB",
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const userId = event.params.userId;
    const notifId = event.params.notifId;
    const data = snap.data();
    // Skip if already read (e.g., written as read:true by the app itself)
    if (data.read === true)
        return;
    const title = data.title || "WhisperLedger";
    const body = data.body || "";
    const notifData = data.data || {};
    try {
        // Look up the user's push token
        const userDoc = await admin.firestore().doc(`users/${userId}`).get();
        if (!userDoc.exists) {
            firebase_functions_1.logger.warn("onNotificationCreated: user doc not found", { userId, notifId });
            return;
        }
        const pushToken = userDoc.data()?.pushToken;
        // Only send if we have a real Expo push token
        if (!pushToken ||
            pushToken.startsWith("mock_") ||
            (!pushToken.startsWith("ExponentPushToken") && !pushToken.startsWith("ExpoPushToken"))) {
            firebase_functions_1.logger.info("onNotificationCreated: no valid push token, skipping push", { userId, pushToken });
            return;
        }
        await sendExpoPush(pushToken, title, body, {
            ...notifData,
            firestoreNotifId: notifId,
            isCloudTriggered: true,
        });
        firebase_functions_1.logger.info("onNotificationCreated: push sent", { userId, notifId, pushToken });
    }
    catch (error) {
        firebase_functions_1.logger.error("onNotificationCreated: push failed", { userId, notifId, error });
        // Don't rethrow — we don't want to retry infinitely for bad tokens
    }
});
exports.onSupportCaseCreated = (0, firestore_1.onDocumentCreated)({
    document: "support_cases/{caseId}",
    region: "asia-south1",
    memory: "256MiB",
}, async (event) => {
    const db = admin.firestore();
    const snap = event.data;
    if (!snap)
        return;
    const caseId = event.params.caseId;
    const data = snap.data();
    const userId = data.userId || "";
    const userEmail = data.userEmail || "";
    const userName = data.userName || "there";
    const subject = data.subject || "WhisperLedger Support Request";
    const ackSubject = `We received your message – WhisperLedger Support`;
    const ackText = `Hi ${userName},\n\n` +
        `Thanks for reaching out! We've received your support request and will get back to you shortly.\n\n` +
        `If you have more details to share, just reply to this email.\n\n` +
        `– The WhisperLedger Team`;
    try {
        if (userId) {
            await db.doc(`users/${userId}/notifications/support_ack_${caseId}`).set({
                title: "We received your support request",
                body: `Thanks for reaching out! We'll get back to you soon.`,
                notificationType: "support_ack",
                read: false,
                data: { caseId, source: data.source || "app" },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        // Send ack to user + copy to support inbox
        const toAddresses = [userEmail].filter(Boolean);
        if (toAddresses.length > 0) {
            await db.collection("mail").add({
                to: toAddresses,
                cc: ["whisperledger.support@gmail.com"],
                replyTo: "whisperledger.support@gmail.com",
                message: {
                    subject: ackSubject,
                    text: ackText,
                },
            });
        }
        else {
            // No user email – still notify support inbox
            await db.collection("mail").add({
                to: ["whisperledger.support@gmail.com"],
                message: {
                    subject: `New support request (no user email) – ${caseId}`,
                    text: `A support case was created but no user email was captured.\n\nCase ID: ${caseId}\nUser ID: ${userId || "guest"}`,
                },
            });
        }
        await snap.ref.set({
            ackSentAt: admin.firestore.FieldValue.serverTimestamp(),
            ackChannel: userEmail ? "email+in_app" : "in_app_only",
        }, { merge: true });
    }
    catch (error) {
        firebase_functions_1.logger.error("Support case auto-ack failed", { caseId, error });
        await snap.ref.set({
            ackError: String(error?.message || error),
        }, { merge: true });
    }
});
function esc(input) {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function inr(value) {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value || 0);
}
function buildStatementHtml(req, requestId) {
    const monthLabel = req.monthLabel || "Monthly Statement";
    const total = req.totalSpend || 0;
    const txCount = req.transactionCount || 0;
    const categories = (req.categoryTotals || [])
        .sort((a, b) => (b.amount || 0) - (a.amount || 0))
        .map((c) => `<tr><td>${esc(c.label || "Other")}</td><td style="text-align:right;">Rs ${inr(c.amount || 0)}</td></tr>`)
        .join("");
    const expenses = (req.expenses || [])
        .map((e) => {
        const note = esc(e.note || "Expense");
        const category = esc(e.categoryLabel || "Other");
        const mode = esc((e.paymentMode || "none").toUpperCase());
        const date = esc(e.date || "");
        return `<tr><td>${date}</td><td>${note}</td><td>${category}</td><td>${mode}</td><td style="text-align:right;">Rs ${inr(e.amount || 0)}</td></tr>`;
    })
        .join("");
    return `
  <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;color:#0f172a;">
    <div style="background:#0f172a;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
      <div style="font-size:22px;font-weight:700;">WhisperLedger Monthly Expense Statement</div>
      <div style="font-size:14px;opacity:.9;margin-top:4px;">${esc(monthLabel)} | Ticket: ${esc(requestId)}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;padding:20px 24px;border-radius:0 0 12px 12px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <tr>
          <td style="padding:8px 0;font-weight:600;">Account</td>
          <td style="padding:8px 0;text-align:right;">${esc(req.userEmail || "")}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:600;">Total Spent</td>
          <td style="padding:8px 0;text-align:right;">Rs ${inr(total)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:600;">Transactions</td>
          <td style="padding:8px 0;text-align:right;">${txCount}</td>
        </tr>
      </table>

      <h3 style="margin:0 0 8px 0;">Category Summary</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tbody>${categories || "<tr><td>No data</td><td></td></tr>"}</tbody>
      </table>

      <h3 style="margin:0 0 8px 0;">Transaction Details</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">Date</th>
            <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">Note</th>
            <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">Category</th>
            <th style="text-align:left;padding:8px;border:1px solid #e2e8f0;">Mode</th>
            <th style="text-align:right;padding:8px;border:1px solid #e2e8f0;">Amount</th>
          </tr>
        </thead>
        <tbody>${expenses || "<tr><td colspan='5' style='padding:8px;border:1px solid #e2e8f0;'>No expenses</td></tr>"}</tbody>
      </table>

      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;color:#475569;">
        Generated by WhisperLedger App | Support: whisperledger.support@gmail.com
      </div>
    </div>
  </div>`;
}
exports.onStatementRequested = (0, firestore_1.onDocumentCreated)({
    document: "statement_requests/{requestId}",
    region: "asia-south1",
    memory: "256MiB",
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const req = snap.data();
    const requestId = event.params.requestId;
    if (!req.userId || !req.userEmail)
        return;
    try {
        const html = buildStatementHtml(req, requestId);
        await admin.firestore().collection("mail").add({
            to: [req.userEmail],
            replyTo: "whisperledger.support@gmail.com",
            message: {
                subject: `Your WhisperLedger Statement - ${req.monthLabel || "Monthly"}`,
                text: `Your monthly expense statement is attached below in this email body. Request ID: ${requestId}`,
                html,
            },
            meta: {
                kind: "monthly_statement",
                requestId,
                userId: req.userId,
            },
        });
        await admin.firestore().doc(`users/${req.userId}/notifications/statement_${requestId}`).set({
            title: "Monthly statement sent",
            body: `Your ${req.monthLabel || "monthly"} statement was sent to ${req.userEmail}.`,
            notificationType: "statement_email",
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            data: { requestId, monthLabel: req.monthLabel || "" },
        }, { merge: true });
        await snap.ref.set({
            status: "queued",
            queuedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    catch (error) {
        firebase_functions_1.logger.error("Monthly statement email queue failed", { requestId, error });
        await snap.ref.set({
            status: "error",
            errorMessage: String(error?.message || error),
        }, { merge: true });
    }
});

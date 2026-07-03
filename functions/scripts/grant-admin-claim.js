const admin = require("firebase-admin");

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((arg) => arg !== "--revoke");

if (!email) {
  console.error(`Usage: npm run ${revoke ? "admin:revoke" : "admin:grant"} -- admin@example.com`);
  process.exit(1);
}

function getCredential() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawServiceAccount) {
    return admin.credential.applicationDefault();
  }

  const serviceAccount = JSON.parse(rawServiceAccount);
  return admin.credential.cert(serviceAccount);
}

admin.initializeApp({
  credential: getCredential(),
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "whisperledger-94715",
});

async function main() {
  const user = await admin.auth().getUserByEmail(email);
  const existingClaims = user.customClaims || {};
  const nextClaims = { ...existingClaims };

  if (revoke) {
    delete nextClaims.admin;
  } else {
    nextClaims.admin = true;
  }

  await admin.auth().setCustomUserClaims(user.uid, nextClaims);

  console.log(`${revoke ? "Revoked" : "Granted"} admin access for ${email} (${user.uid}).`);
  console.log("Ask the user to sign out and sign in again so Firebase refreshes the ID token.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

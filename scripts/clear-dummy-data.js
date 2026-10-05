// clear-dummy-data.js — ONE-TIME utility: wipes all Firestore demo/test data
// Keeps ONLY the `users` collection (your Owner login stays safe).
//
// HOW TO RUN (in the Safardesk1 folder):
//   1. Firebase Console > safardesk-abusultan > Project Settings > Service accounts
//      > "Generate new private key" > save as serviceAccountKey.json in Safardesk1 folder
//   2. npm install --no-save firebase-admin
//   3. node scripts/clear-dummy-data.js
//   4. DELETE serviceAccountKey.json when done (never commit it).

const admin = require('firebase-admin');
const path = require('path');

const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
let serviceAccount;
try {
  serviceAccount = require(keyPath);
} catch (e) {
  console.error('ERROR: serviceAccountKey.json not found in project root.');
  console.error('Generate it from Firebase Console > Project Settings > Service accounts.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Collections to wipe (everything except users)
const CLEAR = [
  'accounts_invoices', 'agents', 'airlines', 'auditLog', 'banks',
  'customers', 'exchangeRates', 'hotels', 'journal_vouchers',
  'ledgerAccounts', 'ledgerEntries', 'ledger_accounts', 'ledger_entries',
  'payments', 'settings', 'tickets', 'visaRequests', 'visa_distributions',
  'visa_imports', 'visa_invoices', 'visas', 'voucherEditRequests', 'vouchers',
];

async function clearCollection(name) {
  const col = db.collection(name);
  let total = 0;
  for (;;) {
    const snap = await col.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
  }
  return total;
}

(async () => {
  console.log('Wiping dummy data (keeping: users)...');
  for (const name of CLEAR) {
    try {
      const n = await clearCollection(name);
      console.log('  ' + name + ': ' + n + ' deleted');
    } catch (e) {
      console.log('  ' + name + ': skipped (' + e.message + ')');
    }
  }
  console.log('Done. Refresh the dashboard — everything should be zero.');
  process.exit(0);
})();

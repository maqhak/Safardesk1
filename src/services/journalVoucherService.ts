import { 
  JournalVoucherDoc, 
  JournalVoucherLine, 
  JournalVoucherTag, 
  JournalVoucherAttachment, 
  AiVoiceCheckResult 
} from '../types/journalVoucher';
import { LedgerAccountDoc, LedgerEntryDoc } from '../types/accounting';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { fetchLedgerAccounts, fetchLedgerEntries, voidLedgerEntry } from './accountingService';
import { uploadReceiptToDrive } from './driveService';
import { getCurrentRate } from './exchangeRateService';

const JV_COLLECTION = 'journal_vouchers';
const LOCAL_STORAGE_JV_KEY = 'safardesk_journal_vouchers_v1';
const ENTRIES_COLLECTION = 'ledger_entries';
const LOCAL_STORAGE_ENTRIES_KEY = 'safardesk_ledger_entries_v3';

// Seed demo Journal Vouchers showing Adjustment, Netting, and Direct Settlement with voice proof
export const INITIAL_JOURNAL_VOUCHERS: JournalVoucherDoc[] = [
  {
    id: 'jv-00101',
    jvNo: 'JV-00101',
    date: '2026-09-28',
    tag: 'Adjustment',
    exchangeRate: 74.50,
    detailsBox: 'Reconciliation of flight cancellation waiver fee for Falcon Travels group seats.',
    totalDebitSAR: 1200,
    totalCreditSAR: 1200,
    lines: [
      {
        id: 'line-1',
        accountId: 'acc-sys-003', // Commission Expense
        accountCode: 'SYS-003',
        accountTitle: 'Commission Expense',
        debitSAR: 1200,
        creditSAR: 0,
      },
      {
        id: 'line-2',
        accountId: 'acc-agt-002', // Falcon Travels
        accountCode: 'AGT-002',
        accountTitle: 'Falcon International Travels Lahore',
        debitSAR: 0,
        creditSAR: 1200,
      },
    ],
    status: 'Active',
    createdBy: 'Agency Owner',
    createdAt: '2026-09-28T10:00:00Z',
    isVoid: false,
    auditTrail: [
      {
        action: 'create',
        by: 'Agency Owner',
        at: '2026-09-28T10:00:00Z',
        notes: 'Created initial flight cancellation fee adjustment.',
      },
    ],
  },
  {
    id: 'jv-00102',
    jvNo: 'JV-00102',
    date: '2026-09-30',
    tag: 'Netting',
    exchangeRate: 74.50,
    detailsBox: 'Bilateral netting: offsetting Al-Barakah visa receivable against Fairmont Makkah hotel reservation credit.',
    totalDebitSAR: 2600,
    totalCreditSAR: 2600,
    lines: [
      {
        id: 'line-1',
        accountId: 'acc-htl-001', // Fairmont Hotel
        accountCode: 'HTL-001',
        accountTitle: 'Fairmont Makkah Clock Royal Tower',
        debitSAR: 2600,
        creditSAR: 0,
      },
      {
        id: 'line-2',
        accountId: 'acc-agt-001', // Al-Barakah
        accountCode: 'AGT-001',
        accountTitle: 'Al-Barakah Travel & Tours Karachi',
        debitSAR: 0,
        creditSAR: 2600,
      },
    ],
    status: 'Active',
    createdBy: 'Accounts Executive',
    createdAt: '2026-09-30T15:30:00Z',
    isVoid: false,
    auditTrail: [
      {
        action: 'create',
        by: 'Accounts Executive',
        at: '2026-09-30T15:30:00Z',
        notes: 'Approved bilateral netting of hotel credit with agent receivable.',
      },
    ],
  },
  {
    id: 'jv-00103',
    jvNo: 'JV-00103',
    date: '2026-10-01',
    tag: 'Direct Settlement',
    exchangeRate: 74.50,
    detailsBox: 'Direct settlement: Al-Barakah representative in Makkah handed 5,000 SAR directly to Al-Haramain Shirka for transport buses.',
    totalDebitSAR: 5000,
    totalCreditSAR: 5000,
    lines: [
      {
        id: 'line-1',
        accountId: 'acc-vnd-001', // Al-Haramain Group
        accountCode: 'VND-001',
        accountTitle: 'Al-Haramain Ground Transport Group',
        debitSAR: 5000,
        creditSAR: 0,
      },
      {
        id: 'line-2',
        accountId: 'acc-agt-001', // Al-Barakah
        accountCode: 'AGT-001',
        accountTitle: 'Al-Barakah Travel & Tours Karachi',
        debitSAR: 0,
        creditSAR: 5000,
      },
    ],
    attachment: {
      fileUrl: 'https://actions.google.com/sounds/v1/conversations/greetings.ogg',
      fileName: 'JV-00103.ogg',
      fileType: 'audio',
      mimeType: 'audio/ogg',
    },
    aiVoiceCheck: {
      transcription: 'السلام علیکم بھائی جان، میں نے مکہ مکرمہ میں الحرمین کے دفتر جا کر 5000 ریال کیش ادا کر دیے ہیں۔ پلیز ہمارے اکاؤنٹ میں کریڈٹ ڈال دیں۔ (Assalam o alaikum brother, I visited Al-Haramain office in Makkah and paid 5,000 SAR cash directly. Please credit our account).',
      extractedAmount: 5000,
      extractedDate: '2026-10-01',
      extractedPayer: 'Al-Barakah Travel',
      amountMatches: true,
      dateMatches: true,
      status: 'Verified',
      notes: 'AI speech-to-text verified: 5,000 SAR settlement matches exactly with JV lines and date.',
    },
    status: 'Active',
    createdBy: 'Accounts Executive',
    createdAt: '2026-10-01T16:45:00Z',
    isVoid: false,
    needsOwnerReview: false,
    ownerApproved: true,
    auditTrail: [
      {
        action: 'create',
        by: 'Accounts Executive',
        at: '2026-10-01T16:45:00Z',
        notes: 'Attached WhatsApp voice note and verified via AI transcription.',
      },
    ],
  },
];

export async function fetchJournalVouchers(): Promise<JournalVoucherDoc[]> {
  let list: JournalVoucherDoc[] = INITIAL_JOURNAL_VOUCHERS;

  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, JV_COLLECTION));
      if (!snap.empty) {
        list = snap.docs.map((d) => d.data() as JournalVoucherDoc);
      }
    }
  } catch (err) {
    console.warn('Could not read journal vouchers from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_JV_KEY);
  if (stored) {
    try {
      list = JSON.parse(stored);
    } catch {
      list = INITIAL_JOURNAL_VOUCHERS;
    }
  } else {
    localStorage.setItem(LOCAL_STORAGE_JV_KEY, JSON.stringify(INITIAL_JOURNAL_VOUCHERS));
  }

  return list;
}

export async function getNextJVNumber(): Promise<string> {
  const current = await fetchJournalVouchers();
  let maxSeq = 100;
  current.forEach((jv) => {
    const match = jv.jvNo.match(/JV-(\d+)/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > maxSeq) maxSeq = val;
    }
  });
  return `JV-${String(maxSeq + 1).padStart(5, '0')}`;
}

/**
 * Server-Side AI Speech-to-Text & Financial Extraction for Urdu WhatsApp Voice Notes
 */
export async function verifyVoiceNoteWithAI(params: {
  audioDataUrl: string;
  mimeType?: string;
  expectedDate: string;
  expectedAmountSAR: number;
  staffDetails: string;
}): Promise<AiVoiceCheckResult> {
  try {
    const res = await fetch('/api/verify-voice-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioDataUrl: params.audioDataUrl,
        mimeType: params.mimeType,
        expectedDate: params.expectedDate,
        expectedAmountSAR: params.expectedAmountSAR,
        staffDetails: params.staffDetails,
      }),
    });

    if (!res.ok) {
      throw new Error(`AI transcription server returned status ${res.status}`);
    }

    const data: AiVoiceCheckResult = await res.json();
    return data;
  } catch (err: any) {
    console.warn('AI voice note verification fallback:', err);
    return {
      transcription: 'Voice note received. Audio analysis offline.',
      extractedAmount: null,
      extractedDate: null,
      extractedPayer: null,
      amountMatches: false,
      dateMatches: false,
      status: 'Needs Review',
      notes: `Audio analysis offline notice: ${err.message || 'Inspection pending'}. Flagged for Owner review.`,
    };
  }
}

/**
 * Requirement 4: NETTING Guard
 * When tag = "Netting", validate the offset does not exceed either side's current outstanding balance.
 */
export function validateNettingLines(
  lines: JournalVoucherLine[],
  accounts: LedgerAccountDoc[],
  entries: LedgerEntryDoc[]
): { isValid: boolean; error?: string } {
  const activeEntries = entries.filter((e) => !e.isVoid);

  for (const line of lines) {
    const acc = accounts.find((a) => a.id === line.accountId);
    if (!acc) continue;

    // Calculate current net balance for this account
    const accEntries = activeEntries.filter((e) => e.accountId === acc.id);
    let currentBalanceSAR = acc.openingBalanceSAR || 0;
    accEntries.forEach((e) => {
      currentBalanceSAR += (e.debitSAR || 0) - (e.creditSAR || 0);
    });

    // Check if line would push an account past its outstanding balance in the wrong direction
    // If account has a debit balance (receivable from agent > 0), netting credit cannot exceed currentBalanceSAR
    if (currentBalanceSAR > 0 && line.creditSAR > currentBalanceSAR + 0.01) {
      return {
        isValid: false,
        error: `NETTING VIOLATION: Offset credit of SAR ${line.creditSAR.toLocaleString()} exceeds ${acc.title}'s current outstanding receivable balance of SAR ${currentBalanceSAR.toLocaleString()}.`,
      };
    }

    // If account has a credit balance (payable to hotel/vendor < 0), netting debit cannot exceed absolute payable
    const payableSAR = Math.abs(currentBalanceSAR < 0 ? currentBalanceSAR : 0);
    if (currentBalanceSAR < 0 && line.debitSAR > payableSAR + 0.01) {
      return {
        isValid: false,
        error: `NETTING VIOLATION: Offset debit of SAR ${line.debitSAR.toLocaleString()} exceeds ${acc.title}'s current payable balance of SAR ${payableSAR.toLocaleString()}.`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Create a new Journal Voucher and post lines to ledgerEntries
 */
export async function createJournalVoucher(params: {
  date: string;
  tag: JournalVoucherTag;
  lines: JournalVoucherLine[];
  exchangeRate: number;
  detailsBox: string;
  attachment?: {
    fileDataUrl: string;
    fileName: string;
    fileType: 'image' | 'pdf' | 'audio';
    mimeType?: string;
  } | null;
  createdBy: string;
}): Promise<JournalVoucherDoc> {
  // Validate Lines
  if (!params.lines || params.lines.length < 2) {
    throw new Error('A Journal Voucher requires at least two account lines.');
  }

  // Validate Difference = 0
  let totalDebitSAR = 0;
  let totalCreditSAR = 0;

  for (const line of params.lines) {
    if (line.debitSAR > 0 && line.creditSAR > 0) {
      throw new Error(`A single line cannot have both Debit and Credit > 0 (Account: ${line.accountTitle}).`);
    }
    totalDebitSAR += line.debitSAR || 0;
    totalCreditSAR += line.creditSAR || 0;
  }

  const diff = Math.abs(totalDebitSAR - totalCreditSAR);
  if (diff > 0.01) {
    throw new Error(`LIVE BALANCE ERROR: Total Debit (SAR ${totalDebitSAR.toFixed(2)}) must equal Total Credit (SAR ${totalCreditSAR.toFixed(2)}). Difference is SAR ${diff.toFixed(2)}.`);
  }

  if (totalDebitSAR <= 0) {
    throw new Error('Journal Voucher total must be greater than zero.');
  }

  // Requirement 4: Netting Guard Check
  if (params.tag === 'Netting') {
    const [accs, ents] = await Promise.all([fetchLedgerAccounts(), fetchLedgerEntries()]);
    const nettingCheck = validateNettingLines(params.lines, accs, ents);
    if (!nettingCheck.isValid) {
      throw new Error(nettingCheck.error || 'Netting balance validation failed.');
    }
  }

  // Requirement 5: Direct Settlement Attachment Guard
  if (params.tag === 'Direct Settlement' && (!params.attachment || !params.attachment.fileDataUrl)) {
    throw new Error('DIRECT SETTLEMENT RULE: An attachment (image/PDF receipt OR WhatsApp voice note) is mandatory.');
  }

  const jvNo = await getNextJVNumber();
  const now = new Date().toISOString();

  // Handle attachment & Drive upload
  let finalAttachment: JournalVoucherAttachment | null = null;
  let aiVoiceCheck: AiVoiceCheckResult | null = null;
  let needsOwnerReview = false;

  if (params.attachment && params.attachment.fileDataUrl) {
    let driveFileId: string | null = null;
    let webViewLink: string | null = null;

    try {
      // Save attachment to Drive under Receipt/Sent renamed to the JV No
      const driveUpload = await uploadReceiptToDrive({
        paymentNo: jvNo,
        fileDataUrl: params.attachment.fileDataUrl,
        fileType: params.attachment.fileType === 'pdf' ? 'pdf' : 'image',
        isReceived: false, // Sent / Settlement
      });

      if (driveUpload.success) {
        driveFileId = driveUpload.driveFileId || null;
        webViewLink = driveUpload.webViewLink || null;
      }
    } catch (e) {
      console.warn('Drive upload error for JV:', e);
    }

    finalAttachment = {
      fileUrl: params.attachment.fileDataUrl,
      fileName: params.attachment.fileName || `${jvNo}.${params.attachment.fileType === 'audio' ? 'ogg' : 'pdf'}`,
      fileType: params.attachment.fileType,
      mimeType: params.attachment.mimeType,
      driveFileId,
      webViewLink,
    };

    // If attachment is audio, run AI Speech-to-Text check
    if (params.attachment.fileType === 'audio') {
      try {
        aiVoiceCheck = await verifyVoiceNoteWithAI({
          audioDataUrl: params.attachment.fileDataUrl,
          mimeType: params.attachment.mimeType || 'audio/ogg',
          expectedDate: params.date,
          expectedAmountSAR: totalDebitSAR,
          staffDetails: params.detailsBox,
        });

        if (aiVoiceCheck.status === 'Needs Review' || !aiVoiceCheck.amountMatches) {
          needsOwnerReview = true;
        }
      } catch (err) {
        console.warn('AI voice check error:', err);
        needsOwnerReview = true;
      }
    }
  }

  // Requirement 3: Posting - each line becomes a ledgerEntries row
  // Particulars = Details Box text verbatim, PKR mirrors at the JV rate
  const currentEntries = await fetchLedgerEntries();
  const createdEntryIds: string[] = [];
  const newLedgerEntries: LedgerEntryDoc[] = [];

  params.lines.forEach((line, index) => {
    const entrySeq = currentEntries.length + index + 10001;
    const debitPKR = Math.round((line.debitSAR || 0) * params.exchangeRate * 100) / 100;
    const creditPKR = Math.round((line.creditSAR || 0) * params.exchangeRate * 100) / 100;

    const entry: LedgerEntryDoc = {
      id: `le-${entrySeq}`,
      entryNo: `LE-${entrySeq}`,
      date: params.date,
      accountId: line.accountId,
      entryType: 'Journal Voucher',
      transNo: jvNo,
      particulars: params.detailsBox, // VERBATIM in Particulars column
      invoiceRef: null,
      voucherNo: null,
      rate: params.exchangeRate,
      debitSAR: line.debitSAR || 0,
      creditSAR: line.creditSAR || 0,
      debitPKR,
      creditPKR,
      driveFileUrl: finalAttachment?.webViewLink || finalAttachment?.fileUrl || null,
      proofType: finalAttachment?.fileType === 'audio' ? 'voice' : finalAttachment ? 'receipt' : null,
      createdBy: params.createdBy,
      createdAt: now,
      isVoid: false,
    };

    createdEntryIds.push(entry.id);
    newLedgerEntries.push(entry);
  });

  const updatedEntries = [...newLedgerEntries, ...currentEntries];
  localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(updatedEntries));

  if (!isConfigPlaceholder) {
    try {
      await Promise.all(
        newLedgerEntries.map((e) => setDoc(doc(db, ENTRIES_COLLECTION, e.id), e))
      );
    } catch (e) {
      console.warn('Could not sync JV ledger entries to Firestore:', e);
    }
  }

  // Create JV Document with Audit Trail
  const newJV: JournalVoucherDoc = {
    id: `jv-${Date.now()}`,
    jvNo,
    date: params.date,
    tag: params.tag,
    lines: params.lines,
    exchangeRate: params.exchangeRate,
    detailsBox: params.detailsBox,
    totalDebitSAR,
    totalCreditSAR,
    attachment: finalAttachment,
    aiVoiceCheck,
    status: 'Active',
    createdBy: params.createdBy,
    createdAt: now,
    isVoid: false,
    needsOwnerReview,
    ownerApproved: !needsOwnerReview,
    createdEntryIds,
    auditTrail: [
      {
        action: 'create',
        by: params.createdBy,
        at: now,
        notes: `Created ${params.tag} Journal Voucher for SAR ${totalDebitSAR.toFixed(2)} @ ${params.exchangeRate}.`,
      },
    ],
  };

  const currentJVs = await fetchJournalVouchers();
  const updatedJVs = [newJV, ...currentJVs];
  localStorage.setItem(LOCAL_STORAGE_JV_KEY, JSON.stringify(updatedJVs));

  if (!isConfigPlaceholder) {
    try {
      await setDoc(doc(db, JV_COLLECTION, newJV.id), newJV);
    } catch (e) {
      console.warn('Could not sync JV to Firestore:', e);
    }
  }

  return newJV;
}

/**
 * Void a Journal Voucher (Owner only, with audit trail and reversals)
 */
export async function voidJournalVoucher(
  jvId: string,
  voidReason: string,
  voidedBy: string
): Promise<JournalVoucherDoc> {
  const currentJVs = await fetchJournalVouchers();
  const index = currentJVs.findIndex((j) => j.id === jvId);
  if (index === -1) {
    throw new Error('Journal Voucher not found');
  }

  const jv = currentJVs[index];
  const now = new Date().toISOString();

  // Void all linked ledger entries
  if (jv.createdEntryIds && jv.createdEntryIds.length > 0) {
    for (const entryId of jv.createdEntryIds) {
      try {
        await voidLedgerEntry(entryId, `Voided via JV ${jv.jvNo}: ${voidReason}`, voidedBy);
      } catch (e) {
        console.warn('Could not void linked ledger entry:', e);
      }
    }
  }

  const updatedJV: JournalVoucherDoc = {
    ...jv,
    status: 'Voided',
    isVoid: true,
    voidReason,
    voidedAt: now,
    voidedBy,
    needsOwnerReview: false,
    auditTrail: [
      ...jv.auditTrail,
      {
        action: 'void',
        by: voidedBy,
        at: now,
        notes: `Voided with reason: ${voidReason}`,
      },
    ],
  };

  currentJVs[index] = updatedJV;
  localStorage.setItem(LOCAL_STORAGE_JV_KEY, JSON.stringify(currentJVs));

  if (!isConfigPlaceholder) {
    try {
      await setDoc(doc(db, JV_COLLECTION, jvId), updatedJV);
    } catch (e) {
      console.warn('Could not sync voided JV to Firestore:', e);
    }
  }

  return updatedJV;
}

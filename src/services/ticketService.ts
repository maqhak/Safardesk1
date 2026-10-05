import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { TicketDoc } from '../types/ticket';
import { UserProfile } from '../types/auth';
import { LedgerEntryDoc } from '../types/agent';
import { logAuditEvent } from './userService';
import { getCurrentRate } from './exchangeRateService';
import { fetchLedgerAccounts, postBalancedTransaction } from './accountingService';

const TICKETS_COLLECTION = 'tickets';
const LEDGER_ENTRIES_COLLECTION = 'ledgerEntries';
const LOCAL_STORAGE_TICKETS_KEY = 'safardesk_tickets_directory';

const INITIAL_TICKETS: TicketDoc[] = [
  {
    id: 'tkt-001',
    pnr: 'SV982X',
    airline: { id: 'al-sv', iataCode: 'SV', name: 'Saudia', country: 'Saudi Arabia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
    flightNo: 'SV-734',
    sectorFrom: { iata: 'ISB', city: 'Islamabad', name: 'Islamabad International Airport', country: 'Pakistan' },
    sectorTo: { iata: 'JED', city: 'Jeddah', name: 'King Abdulaziz International Airport', country: 'Saudi Arabia' },
    flightDate: '2026-10-10',
    departureTime: '04:30',
    arrivalTime: '08:15',
    passengers: [
      { name: 'Muhammad Ahmed Khan', passportNumber: 'AB1234567', ageType: 'Adult', ticketNo: '06529384721' }
    ],
    purchaseCostSAR: 1450,
    salePriceSAR: 1750,
    marginSAR: 300,
    supplierName: 'Saudia Direct GDS',
    buyerType: 'customer',
    buyerId: 'cust-001',
    buyerName: 'Muhammad Ahmed Khan',
    status: 'Issued',
    exchangeRateSARPKR: getCurrentRate('SAR-PKR'),
    purchaseCostPKR: 108025,
    salePricePKR: 130375,
    commission: { enabled: false, recipientName: '', contact: '', amountSAR: 0, isPaid: false },
    createdBy: 'demo-owner-001',
    createdByName: 'Agency Owner',
    createdAt: '2026-10-01T11:00:00Z',
  }
];

export async function fetchTickets(): Promise<TicketDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, TICKETS_COLLECTION));
      return snap.docs.map((d) => d.data() as TicketDoc);
    }
  } catch (err) {
    console.warn('Could not read tickets from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_TICKETS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  return [];
}

function findBuyerAccount(accounts: any[], buyerId: string): any | undefined {
  return accounts.find((a: any) => a.linkedId === buyerId || (a as any).linkedAgentId === buyerId);
}

/** Fix #20: post the ticket sale to the ledger — Dr buyer receivable / Cr Ticket Income. */
async function postTicketSaleToLedger(actor: UserProfile, ticket: TicketDoc): Promise<void> {
  const accounts = await fetchLedgerAccounts();
  const receivable = findBuyerAccount(accounts, ticket.buyerId);
  if (!receivable) {
    throw new Error(
      'Ticket ledger posting failed: no ledger account found for the buyer. Create it in Masters first.'
    );
  }
  const ticketIncome = accounts.find((a: any) => a.id === 'acc-sys-002');
  if (!ticketIncome) {
    throw new Error('Ticket ledger posting failed: Ticket Income account (acc-sys-002) not found.');
  }
  await postBalancedTransaction({
    date: new Date().toISOString().split('T')[0],
    entryType: 'Invoice',
    transNo: ticket.pnr,
    particulars: `Ticket sale — PNR ${ticket.pnr} (${ticket.sectorFrom?.iata || ''}→${ticket.sectorTo?.iata || ''}, ${ticket.flightDate})`,
    invoiceRef: ticket.pnr,
    rate: ticket.exchangeRateSARPKR || getCurrentRate('SAR-PKR'),
    debitAccountId: (receivable as any).id,
    creditAccountId: 'acc-sys-002',
    amountSAR: ticket.salePriceSAR,
    createdBy: actor.uid,
  });
}

/** Fix #20: post a REFUND reversal for the ticket sale — Dr Ticket Income / Cr buyer receivable. */
async function postTicketRefundReversal(actor: UserProfile, ticket: TicketDoc, refundReason: string): Promise<void> {
  const accounts = await fetchLedgerAccounts();
  const receivable = findBuyerAccount(accounts, ticket.buyerId);
  if (!receivable) return; // sale was never posted; nothing to reverse
  await postBalancedTransaction({
    date: new Date().toISOString().split('T')[0],
    entryType: 'Refund',
    transNo: ticket.pnr,
    particulars: `REFUND (ticket ${ticket.pnr}): ${refundReason}`,
    invoiceRef: ticket.pnr,
    rate: ticket.exchangeRateSARPKR || getCurrentRate('SAR-PKR'),
    debitAccountId: 'acc-sys-002',
    creditAccountId: (receivable as any).id,
    amountSAR: ticket.salePriceSAR,
    createdBy: actor.uid,
  });
}

export async function createTicket(
  actor: UserProfile,
  data: Omit<TicketDoc, 'id' | 'marginSAR' | 'purchaseCostPKR' | 'salePricePKR' | 'createdAt' | 'createdBy' | 'createdByName'>
): Promise<TicketDoc> {
  const marginSAR = data.salePriceSAR - data.purchaseCostSAR;
  const rate = data.exchangeRateSARPKR || getCurrentRate('SAR-PKR');
  const purchaseCostPKR = Math.round(data.purchaseCostSAR * rate * 100) / 100;
  const salePricePKR = Math.round(data.salePriceSAR * rate * 100) / 100;

  const ticketId = `tkt-${Date.now()}`;
  const newTicket: TicketDoc = {
    ...data,
    exchangeRateSARPKR: rate,
    id: ticketId,
    marginSAR,
    purchaseCostPKR,
    salePricePKR,
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
    createdByName: actor.name || actor.email,
  };

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, TICKETS_COLLECTION, ticketId), newTicket);
    }
  } catch (err) {
    console.warn('Firestore write failed for ticket:', err);
  }

  const existing = await fetchTickets();
  localStorage.setItem(LOCAL_STORAGE_TICKETS_KEY, JSON.stringify([newTicket, ...existing]));

  await postTicketSaleToLedger(actor, newTicket);

  await logAuditEvent({
    action: 'CREATE_TICKET',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: ticketId,
    targetUserName: newTicket.pnr,
    details: { pnr: newTicket.pnr, salePriceSAR: newTicket.salePriceSAR, exchangeRate: rate },
  });

  return newTicket;
}

export async function refundTicket(
  actor: UserProfile,
  ticketId: string,
  refundReason: string
): Promise<TicketDoc> {
  const tickets = await fetchTickets();
  const index = tickets.findIndex((t) => t.id === ticketId);
  if (index === -1) {
    throw new Error('Ticket not found');
  }

  const updated: TicketDoc = {
    ...tickets[index],
    status: 'Refunded',
    updatedAt: new Date().toISOString(),
  };

  tickets[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_TICKETS_KEY, JSON.stringify(tickets));

  await postTicketRefundReversal(actor, updated, refundReason);

  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, TICKETS_COLLECTION, ticketId), {
        status: 'Refunded',
        updatedAt: updated.updatedAt,
      });
    }
  } catch (err) {
    console.warn('Could not update refunded ticket in Firestore:', err);
  }

  await logAuditEvent({
    action: 'REFUND_TICKET',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: ticketId,
    targetUserName: updated.pnr,
    details: { refundReason },
  });

  return updated;
}

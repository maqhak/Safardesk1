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
    exchangeRateSARPKR: 74.50,
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
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as TicketDoc);
      }
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

  localStorage.setItem(LOCAL_STORAGE_TICKETS_KEY, JSON.stringify(INITIAL_TICKETS));
  return INITIAL_TICKETS;
}

export async function createTicket(
  actor: UserProfile,
  data: Omit<TicketDoc, 'id' | 'marginSAR' | 'purchaseCostPKR' | 'salePricePKR' | 'createdAt' | 'createdBy' | 'createdByName'>
): Promise<TicketDoc> {
  const marginSAR = data.salePriceSAR - data.purchaseCostSAR;
  const rate = data.exchangeRateSARPKR || 74.50;
  const purchaseCostPKR = Math.round(data.purchaseCostSAR * rate * 100) / 100;
  const salePricePKR = Math.round(data.salePriceSAR * rate * 100) / 100;

  const ticketId = `tkt-${Date.now()}`;
  const newTicket: TicketDoc = {
    ...data,
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

  // Post to ledger: Debit buyer = salePriceSAR, Credit Income = marginSAR, Credit Supplier Payable = purchaseCostSAR
  await postTicketToLedger(actor, newTicket);

  await logAuditEvent({
    action: 'CREATE_TICKET',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: ticketId,
    targetUserName: newTicket.pnr,
    details: { salePriceSAR: newTicket.salePriceSAR, marginSAR: newTicket.marginSAR, passengersCount: newTicket.passengers.length },
  });

  return newTicket;
}

async function postTicketToLedger(actor: UserProfile, ticket: TicketDoc): Promise<void> {
  const entryId = `entry-tkt-${ticket.id}-${Date.now()}`;
  const ledgerEntry: LedgerEntryDoc = {
    id: entryId,
    ledgerAccountId: ticket.buyerId,
    voucherNo: `PNR-${ticket.pnr}`,
    entryDate: ticket.flightDate,
    description: `Ticket PNR ${ticket.pnr} (${ticket.airline?.iataCode || 'FL'} ${ticket.flightNo}) - ${ticket.passengers.length} Pax`,
    debitSAR: ticket.salePriceSAR,
    creditSAR: 0,
    balanceSAR: ticket.salePriceSAR,
    currency: 'SAR',
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, LEDGER_ENTRIES_COLLECTION, entryId), ledgerEntry);
    }
  } catch (err) {
    console.warn('Ledger posting failed for ticket:', err);
  }
}

export async function refundTicket(actor: UserProfile, ticketId: string, penaltySAR: number = 0): Promise<void> {
  const tickets = await fetchTickets();
  const index = tickets.findIndex((t) => t.id === ticketId);
  if (index === -1) throw new Error('Ticket not found.');

  const ticket = tickets[index];
  const updated: TicketDoc = {
    ...ticket,
    status: 'Refunded',
    refundedAt: new Date().toISOString(),
    refundedBy: actor.name || actor.email,
    refundPenaltySAR: penaltySAR,
  };

  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, TICKETS_COLLECTION, ticketId), updated as any);
    }
  } catch (err) {
    console.warn('Firestore refund ticket failed:', err);
  }

  tickets[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_TICKETS_KEY, JSON.stringify(tickets));

  await logAuditEvent({
    action: 'REFUND_TICKET',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: ticketId,
    targetUserName: ticket.pnr,
    details: { penaltySAR },
  });
}

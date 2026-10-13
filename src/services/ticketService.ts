import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { TicketDoc, TicketSector } from '../types/ticket';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';
import { UserProfile } from '../types/auth';
import { LedgerEntryDoc } from '../types/agent';
import { logAuditEvent } from './userService';
import { getCurrentRate } from './exchangeRateService';
import { fetchLedgerAccounts, postBalancedTransaction } from './accountingService';

const TICKETS_COLLECTION = 'tickets';
const LEDGER_ENTRIES_COLLECTION = 'ledgerEntries';
const LOCAL_STORAGE_TICKETS_KEY = 'safardesk_tickets_directory';

/**
 * Sectors for a ticket, with back-compat for old single-sector docs:
 * new docs carry `sectors[]`; old docs only have sectorFrom/sectorTo/
 * flightNo/flightDate, which are read back as one sector.
 */
export function getTicketSectors(ticket: TicketDoc): TicketSector[] {
  if (ticket.sectors && ticket.sectors.length > 0) return ticket.sectors;
  if (ticket.sectorFrom || ticket.sectorTo) {
    return [{
      from: ticket.sectorFrom || null,
      to: ticket.sectorTo || null,
      flightDate: ticket.flightDate || '',
      flightNo: ticket.flightNo || '',
    }];
  }
  return [];
}

/** Full route label for a ticket: "ISB → DXB → JED → ISB" (multi-leg) or "ISB → JED". */
export function getTicketRouteLabel(ticket: TicketDoc): string {
  const sectors = getTicketSectors(ticket);
  if (sectors.length === 0) return '';
  const stops = [sectors[0].from?.iata || ''];
  for (const s of sectors) stops.push(s.to?.iata || '');
  return stops.filter(Boolean).join(' → ');
}

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
  let firestoreTickets: TicketDoc[] = [];
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, TICKETS_COLLECTION));
      firestoreTickets = snap.docs.map((d) => {
        const data = d.data() as TicketDoc;
        return { ...data, id: data.id || d.id };
      });
    }
  } catch (err) {
    console.warn('Could not read tickets from Firestore:', err);
  }

  // Merge local-only tickets (e.g. saved before the Firestore fix) — Firestore wins on conflict.
  let localTickets: TicketDoc[] = [];
  const stored = localStorage.getItem(LOCAL_STORAGE_TICKETS_KEY);
  if (stored) {
    try {
      localTickets = JSON.parse(stored);
    } catch {
      localTickets = [];
    }
  }
  const byId = new Map<string, TicketDoc>();
  for (const tk of localTickets) if (tk?.id) byId.set(tk.id, tk);
  for (const tk of firestoreTickets) if (tk?.id) byId.set(tk.id, tk);
  return Array.from(byId.values());
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
    particulars: `Ticket sale — PNR ${ticket.pnr} (${getTicketRouteLabel(ticket) || `${ticket.sectorFrom?.iata || ''}→${ticket.sectorTo?.iata || ''}`}, ${ticket.flightDate})`,
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
  data: Omit<TicketDoc, 'id' | 'marginSAR' | 'purchaseCostSAR' | 'salePriceSAR' | 'createdAt' | 'createdBy' | 'createdByName'>
): Promise<TicketDoc> {
  const rate = data.exchangeRateSARPKR || getCurrentRate('SAR-PKR');
  // User enters both purchase & sale in PKR → derive SAR for ledger
  const purchaseCostSAR = Math.round((data.purchaseCostPKR / rate) * 100) / 100;
  const salePriceSAR = Math.round((data.salePricePKR / rate) * 100) / 100;
  const marginSAR = Math.round((salePriceSAR - purchaseCostSAR) * 100) / 100;

  // Keep the legacy single-sector fields in sync with sectors[0] so older
  // views, reports and ledger particulars keep working on multi-sector docs.
  const sectors = (data.sectors && data.sectors.length > 0) ? data.sectors : undefined;
  const legacy = sectors ? {
    sectorFrom: sectors[0].from,
    sectorTo: sectors[0].to,
    flightNo: sectors[0].flightNo,
    flightDate: sectors[0].flightDate || data.flightDate,
  } : {};

  // Validate the ledger prerequisite BEFORE writing anything: previously the
  // ticket was saved to Firestore first and the ledger posting threw after,
  // leaving an orphan ticket in Firestore while the user saw an error —
  // and a retry created a duplicate ticket.
  {
    const accounts = await fetchLedgerAccounts();
    if (!findBuyerAccount(accounts, data.buyerId)) {
      throw new Error(
        'Ticket ledger posting failed: no ledger account found for the buyer. Create it in Masters first.'
      );
    }
  }

  const ticketId = `tkt-${Date.now()}`;
  const newTicket: TicketDoc = {
    ...data,
    ...legacy,
    exchangeRateSARPKR: rate,
    id: ticketId,
    marginSAR,
    purchaseCostSAR,
    salePriceSAR,
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
    createdByName: actor.name || actor.email,
  };

  if (!isConfigPlaceholder) {
    try {
      await setDoc(doc(db, TICKETS_COLLECTION, ticketId), stripUndefinedDeep(newTicket));
    } catch (err) {
      // No false success: if Firestore rejects it, the sale must not look saved.
      throw new Error('Ticket could not be saved to Firebase. Please try again.');
    }
  }

  const existing = await fetchTickets();
  const merged = [newTicket, ...existing.filter((tk) => tk.id !== ticketId)];
  localStorage.setItem(LOCAL_STORAGE_TICKETS_KEY, JSON.stringify(merged));

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

export interface TicketRefundDetails {
  reason: string;
  refundDate?: string;
  refundStatus?: string;
  refundPenaltySAR?: number;
  refundAirlineReceivableSAR?: number;
  refundCustomerPayableSAR?: number;
  refundNote?: string;
}

export async function refundTicket(
  actor: UserProfile,
  ticketId: string,
  details: TicketRefundDetails
): Promise<TicketDoc> {
  const tickets = await fetchTickets();
  const index = tickets.findIndex((t) => t.id === ticketId);
  if (index === -1) {
    throw new Error('Ticket not found');
  }

  const now = new Date().toISOString();
  const updated: TicketDoc = {
    ...tickets[index],
    status: 'Refunded',
    updatedAt: now,
    refundedAt: now,
    refundedBy: actor.name || actor.email,
    refundDate: details.refundDate,
    refundStatus: details.refundStatus,
    refundPenaltySAR: details.refundPenaltySAR ?? 0,
    refundAirlineReceivableSAR: details.refundAirlineReceivableSAR,
    refundCustomerPayableSAR: details.refundCustomerPayableSAR,
    refundNote: details.refundNote || details.reason,
  };

  tickets[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_TICKETS_KEY, JSON.stringify(tickets));

  await postTicketRefundReversal(actor, updated, details.reason);

  if (!isConfigPlaceholder) {
    try {
      await updateDoc(doc(db, TICKETS_COLLECTION, ticketId), stripUndefinedDeep({
        status: 'Refunded',
        updatedAt: now,
        refundedAt: now,
        refundedBy: actor.name || actor.email,
        refundDate: details.refundDate || null,
        refundStatus: details.refundStatus || null,
        refundPenaltySAR: details.refundPenaltySAR ?? 0,
        refundAirlineReceivableSAR: details.refundAirlineReceivableSAR ?? null,
        refundCustomerPayableSAR: details.refundCustomerPayableSAR ?? null,
        refundNote: details.refundNote || details.reason,
      }));
    } catch (err) {
      // No false success: surface the real error. Next fetchTickets() merge
      // lets Firestore (still Issued) win over the local Refunded copy.
      throw new Error('Ticket refund could not be saved to Firebase. Please try again.');
    }
  }

  await logAuditEvent({
    action: 'REFUND_TICKET',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: ticketId,
    targetUserName: updated.pnr,
    details: { reason: details.reason, refundPenaltySAR: details.refundPenaltySAR ?? 0 },
  });

  return updated;
}

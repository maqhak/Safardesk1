import { AirportRef, AirlineDoc } from './master';

export interface TicketPassenger {
  name: string;
  title?: string;
  passportNumber: string;
  cnic?: string;
  passportExpiry?: string;
  nationality?: string;
  ageType: 'Adult' | 'Child' | 'Infant';
  ticketNo: string;
}

export interface TicketCommission {
  enabled: boolean;
  recipientName: string;
  contact: string;
  amountSAR: number;
  isPaid: boolean;
}

export interface TicketSector {
  from: AirportRef | null;
  to: AirportRef | null;
  flightDate: string; // YYYY-MM-DD
  flightNo: string;
}

export interface TicketDoc {
  id: string;
  pnr: string; // Booking reference
  airline: AirlineDoc | null;
  flightNo: string;
  sectorFrom: AirportRef | null;
  sectorTo: AirportRef | null;
  flightDate: string; // YYYY-MM-DD
  // Multi-destination itinerary: one ticket, one passenger, 3–4+ legs
  // (e.g. ISB → DXB → JED → ISB). When present, it is the source of truth
  // for the route; the legacy single-sector fields above always mirror
  // sectors[0] so older views/reports keep working.
  sectors?: TicketSector[];
  departureTime?: string;
  arrivalTime?: string;
  passengers: TicketPassenger[];
  purchaseCostSAR: number;
  salePriceSAR: number;
  marginSAR: number; // sale - purchase
  // Fare breakdown (voucher-style detail)
  basicFareSAR?: number;
  otherTaxesSAR?: number;
  psfPercent?: number;
  psfAmountSAR?: number;
  // Airline commission
  airlineCommPercent?: number;
  airlineCommAmountSAR?: number;
  // Withholding tax
  whtPercent?: number;
  whtAmountSAR?: number;
  // Net profit after commission & WHT
  netProfitSAR?: number;
  supplierName: string;
  buyerType: 'agent' | 'customer';
  buyerId: string; // agentId or customerId
  buyerName: string;
  status: 'Booked' | 'Issued' | 'Cancelled' | 'Refunded';
  exchangeRateSARPKR: number;
  purchaseCostPKR: number;
  salePricePKR: number;
  purchaseCurrency?: 'PKR' | 'SAR' | 'USD';
  saleCurrency?: 'PKR' | 'SAR' | 'USD';
  commission: TicketCommission;
  // Invoice / reference fields (from the Ticket Sale form)
  invoiceDate?: string;
  invoiceStatus?: string;
  issueDate?: string;
  orderRef?: string;
  note?: string;
  postTo?: string;
  routeType?: string;
  shirkaId?: string;
  shirkaName?: string;
  // Extra sale-side figures (from the Ticket Sale form)
  airlineChargesSAR?: number;
  airlinePayableSAR?: number;
  chargesSAR?: number;
  custWhPercent?: number;
  custWhAmountSAR?: number;
  discountPercent?: number;
  discountAmountSAR?: number;
  customerReceivableSAR?: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  refundedAt?: string;
  refundedBy?: string;
  // Refund details (from the Ticket Refund form)
  refundDate?: string;
  refundStatus?: string;
  refundPenaltySAR?: number;
  refundAirlineReceivableSAR?: number;
  refundCustomerPayableSAR?: number;
  refundNote?: string;
}

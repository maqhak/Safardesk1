import { AirportRef, AirlineDoc } from './master';

export interface TicketPassenger {
  name: string;
  passportNumber: string;
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

export interface TicketDoc {
  id: string;
  pnr: string; // Booking reference
  airline: AirlineDoc | null;
  flightNo: string;
  sectorFrom: AirportRef | null;
  sectorTo: AirportRef | null;
  flightDate: string; // YYYY-MM-DD
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
  commission: TicketCommission;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  refundedAt?: string;
  refundedBy?: string;
  refundPenaltySAR?: number;
}

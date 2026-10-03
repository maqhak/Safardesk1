import { AirportRef, AirlineDoc } from './master';

export interface PassengerSnapshot {
  name: string;
  passportNumber: string;
  ageType: 'Adult' | 'Child' | 'Infant';
  visaId?: string;
}

export interface SectorItem {
  type: 'Arrival' | 'Departure' | 'Makkah to Madina' | 'Madina to Makkah' | string;
  date: string;
  fromAirport?: AirportRef | null;
  toAirport?: AirportRef | null;
  airline?: AirlineDoc | null;
  flightNo?: string;
  time?: string;
  vehicleType?: 'Car' | 'Staria' | 'Hiace' | 'Coaster' | 'Bus' | 'GMC';
  isSelfGari?: boolean; // Self vehicle — no company transport charge
  vehicleNote?: string; // Manual vehicle detail (e.g. "GMC Yukon white — driver Ahmed")
  transportRateSAR?: number;
}

export interface HotelStayItem {
  city: 'Makkah' | 'Madinah' | 'Jeddah' | string;
  hotelName: string;
  hotelId?: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  bedType: 'Double' | 'Triple' | 'Quad' | 'Sharing' | 'Room';
  roomCount: number;
  ratePerNightSAR: number;
  totalSAR: number;
  isSelfHotel?: boolean; // For agents
  description?: string; // Free-text note for the charge (shows on voucher + ledger)
}

export interface FlightBlockInfo {
  airline?: AirlineDoc | null;
  flightNo?: string;
  fromAirport?: AirportRef | null;
  toAirport?: AirportRef | null;
  date?: string;
  etd?: string;
  eta?: string;
}

export interface FlightDetailsSection {
  allowFlightInfo: boolean;
  departureFlight: FlightBlockInfo;
  returnFlight: FlightBlockInfo;
  lateIntimationChargesSAR: number;
}

export interface VoucherChargeItem {
  description: string;
  category: 'Hotel' | 'Transport' | 'Visa' | 'Other';
  amountSAR: number;
}

export interface VoucherCommission {
  enabled: boolean;
  recipientName: string;
  contact: string;
  amountSAR: number;
  isPaid: boolean;
}

export interface VoucherDoc {
  id: string;
  voucherNo: string; // e.g. "UV-000123"
  linkType: 'visa' | 'customer' | 'agent';
  visaIds: string[];
  customerId?: string;
  agentId?: string;
  shirkaVendorId?: string; // Which Shirka/vendor this voucher was made for
  status: 'Draft' | 'Confirmed' | 'Cancelled';
  passengers: PassengerSnapshot[];
  sectors: SectorItem[];
  hotelStays: HotelStayItem[];
  flightDetails?: FlightDetailsSection;
  charges: VoucherChargeItem[];
  totals: {
    hotelsSAR: number;
    transportSAR: number;
    otherSAR: number;
    totalSAR: number;
    totalPKR: number;
    exchangeRate?: number;
  };
  commission: VoucherCommission;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
  updatedAt?: string;
}

/** Payload snapshot for a voucher edit (create or approval). */
export interface VoucherEditPayload {
  visaIds: string[];
  agentId?: string;
  shirkaVendorId?: string;
  passengers: PassengerSnapshot[];
  sectors: SectorItem[];
  hotelStays: HotelStayItem[];
  flightDetails?: VoucherDoc['flightDetails'];
  charges: VoucherChargeItem[];
  totals: VoucherDoc['totals'];
  commission: VoucherCommission;
}

/** An edit request on a voucher — staff/agent edits need owner approval. */
export interface VoucherEditRequest {
  id: string;
  voucherId: string;
  voucherNo: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: string;
  requestedAt: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  newData: VoucherEditPayload;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

import { AirportRef, AirlineDoc } from './master';

/** Default Package Includes checklist — user ticks/unticks per voucher. */
export const DEFAULT_PACKAGE_INCLUDES = [
  'Return Air Ticket',
  'Airport Transfers',
  'Umrah Visa',
  'Inter City Transportation',
  'Hotel Accommodation',
  'Ziarat (As Per Itinerary)',
  'Daily Breakfast',
  '24/7 Assistance',
];

/**
 * All Package Includes options shown as checkboxes in the voucher form.
 * 'Kaaba View' is opt-in (unchecked by default) — staff tick it per voucher;
 * only saved selections print, so old vouchers are unaffected.
 */
export const PACKAGE_INCLUDES_OPTIONS = [
  ...DEFAULT_PACKAGE_INCLUDES,
  'Kaaba View',
];

export interface PassengerSnapshot {
  name: string;
  passportNumber: string;
  ageType: 'Adult' | 'Child' | 'Infant';
  visaId?: string;
  /** Ground-transport paid flag (Oracle: print shows YES if paid, XXXXX if not). */
  trnsPaid?: boolean;
  /** Without bed flag. */
  withoutBed?: boolean;
  /** Going flag. */
  going?: boolean;
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
  sector?: string; // e.g. "LHE-JED" (Oracle APEX layout)
  pnr?: string; // Booking PNR
}

export interface FlightDetailsSection {
  allowFlightInfo: boolean;
  arrivalFlight?: FlightBlockInfo; // Oracle APEX 3-column layout
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

export interface ZiaratInfo {
  by?: string; // Who conducts the ziarat
  costSAR?: number;
  rateSAR?: number;
}

export interface VoucherDoc {
  id: string;
  voucherNo: string; // e.g. "UV-000123"
  /** 'full' = regular package voucher, 'accommodation' = hotel-only, 'transport' = transport-only. Manual passengers on the latter two. */
  voucherKind?: 'full' | 'accommodation' | 'transport';
  linkType: 'visa' | 'customer' | 'agent';
  visaIds: string[];
  customerId?: string;
  agentId?: string;
  agentName?: string; // Denormalized agent display name for the print header
  shirkaVendorId?: string; // Which vendor company this voucher was made for
  shirkaId?: string; // Which sub-Shirka (empty = vendor company itself)
  shirkaName?: string; // Denormalized Sub-Vendor display name (sub-Shirka name when shirkaId is set, else the vendor company name)
  makkahStaffName?: string; // Editable per voucher, all roles
  makkahStaffPhone?: string;
  madinaStaffName?: string;
  madinaStaffPhone?: string;
  // --- Oracle APEX legacy fields (added 2026-10-07, creation form only) ---
  leaderName?: string;
  leaderContact?: string;
  leaderPassport?: string;
  packageType?: string;
  transportCompany?: string;
  saudiCompany?: string;
  pakCompany?: string;
  makkahZiarat?: ZiaratInfo;
  madinaZiarat?: ZiaratInfo;
  totalNights?: number;
  reference?: string;
  remarks?: string;
  voucherDate?: string; // Oracle APEX voucher/transaction date
  /** Booking/confirmation numbers entered manually at voucher creation (2026-10-14) */
  makkahHcn?: string; // Makkah hotel confirmation number
  madinaHcn?: string; // Madina hotel confirmation number
  transportHcn?: string; // Transport booking number
  transportType?: string; // Car / Staria / Hiace / Coaster / Bus (Oracle APEX)
  trip?: string; // Trip description (Oracle APEX)
  makkahShirka?: string; // Oracle APEX text fields
  madinaShirka?: string;
  packageIncludes?: string[]; // Manually selected Package Includes checklist
  status: 'Draft' | 'Approved' | 'Void';
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  disapprovedBy?: string;
  disapprovedByName?: string;
  disapprovedAt?: string;
  disapprovalNote?: string;
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
    buyROE?: number; // Dual ROE: cost side
    sellROE?: number; // Dual ROE: revenue side
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
  voucherKind?: 'full' | 'accommodation' | 'transport';
  visaIds: string[];
  agentId?: string;
  shirkaVendorId?: string;
  shirkaId?: string;
  shirkaName?: string;
  makkahStaffName?: string;
  makkahStaffPhone?: string;
  madinaStaffName?: string;
  madinaStaffPhone?: string;
  leaderName?: string;
  leaderContact?: string;
  leaderPassport?: string;
  packageType?: string;
  transportCompany?: string;
  saudiCompany?: string;
  pakCompany?: string;
  makkahZiarat?: ZiaratInfo;
  madinaZiarat?: ZiaratInfo;
  totalNights?: number;
  reference?: string;
  remarks?: string;
  voucherDate?: string;
  makkahHcn?: string;
  madinaHcn?: string;
  transportHcn?: string;
  transportType?: string;
  trip?: string;
  makkahShirka?: string;
  madinaShirka?: string;
  packageIncludes?: string[];
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

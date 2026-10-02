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
  vehicleType?: 'Car' | 'Staria' | 'Hiace' | 'Coaster' | 'Bus';
  isSelfGari?: boolean; // For agents
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
  status: 'Draft' | 'Confirmed' | 'Cancelled';
  passengers: PassengerSnapshot[];
  sectors: SectorItem[];
  hotelStays: HotelStayItem[];
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

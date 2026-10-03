export interface VendorDoc {
  id: string;
  vendorCode: string; // e.g. "VND-001"
  name: string; // Shirka / Vendor name
  country: string;
  city: string;
  contactPerson: string;
  mobile: string;
  email: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

export interface RoomTypeRate {
  bedType: 'Double' | 'Triple' | 'Quad' | 'Sharing' | 'Room';
  nightlyRateSAR: number;
}

export interface HotelDoc {
  id: string;
  name: string;
  city: string; // 'Makkah', 'Madinah', or free text
  starRating: 3 | 4 | 5;
  vendorId: string; // Mandatory link to vendor (Shirka)
  distanceFromHaram?: string;
  roomTypes: RoomTypeRate[];
  availabilityNote?: string; // e.g. "Available till 20-Oct"
  contactPhone?: string;
  notes?: string;
  isActive: boolean;
  usedFromCount: number;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

export interface VehicleDoc {
  id: string;
  vehicleType: 'Car' | 'Staria' | 'Hiace' | 'Coaster' | 'Bus' | 'GMC';
  seatCount: number;
  referenceRateSAR: number;
  description: string;
  isActive: boolean;
  usedFromCount?: number;
}

export interface AirlineDoc {
  id: string;
  iataCode: string; // 2 characters, unique
  name: string;
  country: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

export interface AirportRef {
  iata: string;
  city: string;
  name: string;
  country: string;
}

import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  getDoc 
} from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { VendorDoc, HotelDoc, VehicleDoc, AirlineDoc, AirportRef, RoomTypeRate } from '../types/master';
import { INITIAL_AIRLINES } from '../data/airlines';
import { AIRPORTS_DATA } from '../data/airports';
import { LedgerAccountDoc } from '../types/agent';
import { UserProfile } from '../types/auth';
import { logAuditEvent } from './userService';

const VENDORS_COLLECTION = 'vendors';
const HOTELS_COLLECTION = 'hotels';
const VEHICLES_COLLECTION = 'vehicles';
const AIRLINES_COLLECTION = 'airlines';
const LEDGER_ACCOUNTS_COLLECTION = 'ledgerAccounts';

const LOCAL_STORAGE_VENDORS_KEY = 'safardesk_vendors_directory';
const LOCAL_STORAGE_HOTELS_KEY = 'safardesk_hotels_directory';
const LOCAL_STORAGE_VEHICLES_KEY = 'safardesk_vehicles_directory';
const LOCAL_STORAGE_AIRLINES_KEY = 'safardesk_airlines_directory';

const INITIAL_VENDORS: VendorDoc[] = [
  {
    id: 'vnd-001',
    vendorCode: 'VND-001',
    name: 'Al-Haramain Group (Shirka)',
    country: 'Saudi Arabia',
    city: 'Makkah',
    contactPerson: 'Sheikh Mansoor Al-Harbi',
    mobile: '+966 55 981 2938',
    email: 'operations@alharamain-shirka.com.sa',
    notes: 'Primary Saudi visa and ground service provider in Makkah.',
    isActive: true,
    createdAt: '2026-01-10T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
  {
    id: 'vnd-002',
    vendorCode: 'VND-002',
    name: 'Taiba Investments & Hotels Co.',
    country: 'Saudi Arabia',
    city: 'Madinah',
    contactPerson: 'Fahad Al-Mutairi',
    mobile: '+966 54 112 8932',
    email: 'booking@taibahotels.sa',
    notes: 'Direct contracted supplier for Madinah northern area hotels.',
    isActive: true,
    createdAt: '2026-02-01T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
];

const INITIAL_HOTELS: HotelDoc[] = [
  {
    id: 'htl-001',
    name: 'Makkah Clock Royal Tower, A Fairmont Hotel',
    city: 'Makkah',
    starRating: 5,
    vendorId: 'vnd-001',
    distanceFromHaram: '50 meters (Abraj Al Bait)',
    roomTypes: [
      { bedType: 'Double', nightlyRateSAR: 1250 },
      { bedType: 'Triple', nightlyRateSAR: 1550 },
      { bedType: 'Quad', nightlyRateSAR: 1850 },
      { bedType: 'Sharing', nightlyRateSAR: 450 },
    ],
    availabilityNote: 'Available till 25-Nov (High Demand)',
    contactPhone: '+966 12 571 7000',
    notes: 'Direct Haram view quota allocated.',
    isActive: true,
    usedFromCount: 142,
    createdAt: '2026-01-15T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
  {
    id: 'htl-002',
    name: 'The Oberoi Madina',
    city: 'Madinah',
    starRating: 5,
    vendorId: 'vnd-002',
    distanceFromHaram: 'Zero meters (Markaziah)',
    roomTypes: [
      { bedType: 'Double', nightlyRateSAR: 1400 },
      { bedType: 'Triple', nightlyRateSAR: 1750 },
      { bedType: 'Quad', nightlyRateSAR: 2100 },
    ],
    availabilityNote: 'Available till 15-Dec',
    contactPhone: '+966 14 828 8888',
    notes: 'Luxury property facing Masjid an-Nabawi.',
    isActive: true,
    usedFromCount: 98,
    createdAt: '2026-02-05T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
  {
    id: 'htl-003',
    name: 'Swissôtel Al Maqam Makkah',
    city: 'Makkah',
    starRating: 5,
    vendorId: 'vnd-001',
    distanceFromHaram: '100 meters',
    roomTypes: [
      { bedType: 'Double', nightlyRateSAR: 950 },
      { bedType: 'Triple', nightlyRateSAR: 1200 },
      { bedType: 'Sharing', nightlyRateSAR: 350 },
    ],
    availabilityNote: 'Instant confirmation available',
    contactPhone: '+966 12 571 2222',
    notes: 'Reliable Umrah group hotel.',
    isActive: true,
    usedFromCount: 210,
    createdAt: '2026-02-10T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
];

const INITIAL_VEHICLES: VehicleDoc[] = [
  {
    id: 'veh-01',
    vehicleType: 'Car',
    seatCount: 4,
    referenceRateSAR: 250,
    description: 'Sedan (Camry / Hyundai Sonata) for airport transfer JED ⇄ Makkah',
    isActive: true,
  },
  {
    id: 'veh-02',
    vehicleType: 'Staria',
    seatCount: 7,
    referenceRateSAR: 350,
    description: 'Hyundai Staria VIP Van with luggage capacity',
    isActive: true,
  },
  {
    id: 'veh-03',
    vehicleType: 'Hiace',
    seatCount: 12,
    referenceRateSAR: 500,
    description: 'Toyota Hiace High Roof for family groups',
    isActive: true,
  },
  {
    id: 'veh-04',
    vehicleType: 'Coaster',
    seatCount: 22,
    referenceRateSAR: 850,
    description: 'Toyota Coaster AC Bus for medium groups',
    isActive: true,
  },
  {
    id: 'veh-05',
    vehicleType: 'Bus',
    seatCount: 49,
    referenceRateSAR: 1500,
    description: 'Luxury 49-Seater Bus for full Umrah groups (Makkah-Madinah-Jeddah)',
    isActive: true,
  },
];

// --- VENDORS SERVICE ---

export async function fetchVendors(): Promise<VendorDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, VENDORS_COLLECTION));
      return snap.docs.map((d) => d.data() as VendorDoc);
    }
  } catch (err) {
    console.warn('Could not read vendors from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_VENDORS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  return [];
}

export async function generateNextVendorCode(): Promise<string> {
  const vendors = await fetchVendors();
  const codes = vendors
    .map((v) => {
      const match = v.vendorCode.match(/VND-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));

  const maxVal = codes.length > 0 ? Math.max(...codes) : 0;
  const nextVal = maxVal + 1;
  return `VND-${String(nextVal).padStart(3, '0')}`;
}

export async function createVendor(
  actor: UserProfile,
  data: Omit<VendorDoc, 'id' | 'vendorCode' | 'isActive' | 'createdAt' | 'createdBy'>
): Promise<VendorDoc> {
  const vendorCode = await generateNextVendorCode();
  const vendorId = `vnd-${Date.now()}`;

  const newVendor: VendorDoc = {
    ...data,
    id: vendorId,
    vendorCode,
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };

  // Also auto-create vendor ledger account in ledgerAccounts
  const ledgerDoc: LedgerAccountDoc = {
    id: `ledger-vnd-${vendorId}`,
    accountType: 'vendor',
    linkedAgentId: vendorId, // using linkedAgentId field for vendor link
    agentCode: vendorCode,
    accountName: data.name,
    openingBalance: 0,
    currentBalanceSAR: 0,
    currency: 'SAR',
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };

  try {
    if (!isConfigPlaceholder) {
      await Promise.all([
        setDoc(doc(db, VENDORS_COLLECTION, vendorId), newVendor),
        setDoc(doc(db, LEDGER_ACCOUNTS_COLLECTION, ledgerDoc.id), ledgerDoc),
      ]);
    }
  } catch (err) {
    console.warn('Firestore write failed for vendor:', err);
  }

  const vendors = await fetchVendors();
  localStorage.setItem(LOCAL_STORAGE_VENDORS_KEY, JSON.stringify([newVendor, ...vendors]));

  // Log audit
  await logAuditEvent({
    action: 'CREATE_VENDOR',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: vendorId,
    targetUserName: data.name,
    details: { vendorCode, country: data.country },
  });

  return newVendor;
}

export async function updateVendor(
  actor: UserProfile,
  vendorId: string,
  updateData: Partial<VendorDoc>
): Promise<VendorDoc> {
  const vendors = await fetchVendors();
  const index = vendors.findIndex((v) => v.id === vendorId);
  if (index === -1) throw new Error('Vendor not found.');

  const updated: VendorDoc = {
    ...vendors[index],
    ...updateData,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, VENDORS_COLLECTION, vendorId), { ...updated } as any);
    }
  } catch (err) {
    console.warn('Firestore update vendor failed:', err);
  }

  vendors[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_VENDORS_KEY, JSON.stringify(vendors));

  await logAuditEvent({
    action: 'UPDATE_VENDOR',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: vendorId,
    targetUserName: updated.name,
    details: updateData,
  });

  return updated;
}

export async function toggleVendorStatus(actor: UserProfile, vendorId: string): Promise<void> {
  const vendors = await fetchVendors();
  const v = vendors.find((item) => item.id === vendorId);
  if (!v) throw new Error('Vendor not found.');

  const newState = !v.isActive;
  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, VENDORS_COLLECTION, vendorId), { isActive: newState });
    }
  } catch (err) {
    console.warn('Toggle vendor status failed:', err);
  }

  const updated = vendors.map((item) => (item.id === vendorId ? { ...item, isActive: newState } : item));
  localStorage.setItem(LOCAL_STORAGE_VENDORS_KEY, JSON.stringify(updated));

  await logAuditEvent({
    action: newState ? 'VENDOR_ACTIVATED' : 'VENDOR_DEACTIVATED',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: vendorId,
    targetUserName: v.name,
    details: { newState },
  });
}

// --- HOTELS SERVICE ---

export async function fetchHotels(): Promise<HotelDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, HOTELS_COLLECTION));
      return snap.docs.map((d) => d.data() as HotelDoc);
    }
  } catch (err) {
    console.warn('Could not read hotels from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_HOTELS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  return [];
}

export async function createHotel(
  actor: UserProfile,
  data: Omit<HotelDoc, 'id' | 'usedFromCount' | 'createdAt' | 'createdBy'>
): Promise<HotelDoc> {
  const hotelId = `htl-${Date.now()}`;
  const newHotel: HotelDoc = {
    ...data,
    id: hotelId,
    usedFromCount: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, HOTELS_COLLECTION, hotelId), newHotel);
    }
  } catch (err) {
    console.warn('Firestore write failed for hotel:', err);
  }

  const hotels = await fetchHotels();
  localStorage.setItem(LOCAL_STORAGE_HOTELS_KEY, JSON.stringify([newHotel, ...hotels]));

  await logAuditEvent({
    action: 'CREATE_HOTEL',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: hotelId,
    targetUserName: data.name,
    details: { city: data.city, vendorId: data.vendorId, stars: data.starRating },
  });

  return newHotel;
}

export async function updateHotel(
  actor: UserProfile,
  hotelId: string,
  updateData: Partial<HotelDoc>
): Promise<HotelDoc> {
  const hotels = await fetchHotels();
  const index = hotels.findIndex((h) => h.id === hotelId);
  if (index === -1) throw new Error('Hotel not found.');

  const updated: HotelDoc = {
    ...hotels[index],
    ...updateData,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, HOTELS_COLLECTION, hotelId), { ...updated } as any);
    }
  } catch (err) {
    console.warn('Firestore update hotel failed:', err);
  }

  hotels[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_HOTELS_KEY, JSON.stringify(hotels));

  await logAuditEvent({
    action: 'UPDATE_HOTEL',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: hotelId,
    targetUserName: updated.name,
    details: updateData,
  });

  return updated;
}

export async function toggleHotelStatus(actor: UserProfile, hotelId: string): Promise<void> {
  const hotels = await fetchHotels();
  const h = hotels.find((item) => item.id === hotelId);
  if (!h) throw new Error('Hotel not found.');

  const newState = !h.isActive;
  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, HOTELS_COLLECTION, hotelId), { isActive: newState });
    }
  } catch (err) {
    console.warn('Toggle hotel status failed:', err);
  }

  const updated = hotels.map((item) => (item.id === hotelId ? { ...item, isActive: newState } : item));
  localStorage.setItem(LOCAL_STORAGE_HOTELS_KEY, JSON.stringify(updated));

  await logAuditEvent({
    action: newState ? 'HOTEL_ACTIVATED' : 'HOTEL_DEACTIVATED',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: hotelId,
    targetUserName: h.name,
    details: { newState },
  });
}

/**
 * Requirement 6: Deleting a hotel/vendor that is referenced anywhere is blocked; offer Deactivate instead.
 */
export async function deleteOrDeactivateHotel(actor: UserProfile, hotelId: string): Promise<string> {
  const hotels = await fetchHotels();
  const h = hotels.find((item) => item.id === hotelId);
  if (!h) throw new Error('Hotel not found.');

  // Check if referenced or used
  if (h.usedFromCount > 0) {
    await toggleHotelStatus(actor, hotelId);
    return `Hotel "${h.name}" has been referenced in ${h.usedFromCount} vouchers and cannot be deleted. It has been safely deactivated instead.`;
  }

  try {
    if (!isConfigPlaceholder) {
      await deleteDoc(doc(db, HOTELS_COLLECTION, hotelId));
    }
  } catch (err) {
    console.warn('Delete hotel failed:', err);
  }

  const remaining = hotels.filter((item) => item.id !== hotelId);
  localStorage.setItem(LOCAL_STORAGE_HOTELS_KEY, JSON.stringify(remaining));

  await logAuditEvent({
    action: 'DELETE_HOTEL',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: hotelId,
    targetUserName: h.name,
    details: {},
  });

  return `Hotel "${h.name}" deleted successfully.`;
}

// --- VEHICLES SERVICE ---

export async function fetchVehicles(): Promise<VehicleDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, VEHICLES_COLLECTION));
      return snap.docs.map((d) => d.data() as VehicleDoc);
    }
  } catch (err) {
    console.warn('Could not read vehicles from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_VEHICLES_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  return [];
}

export async function updateVehicleReferenceRate(
  actor: UserProfile,
  vehicleId: string,
  newRate: number
): Promise<void> {
  const vehicles = await fetchVehicles();
  const updated = vehicles.map((v) => (v.id === vehicleId ? { ...v, referenceRateSAR: newRate } : v));
  localStorage.setItem(LOCAL_STORAGE_VEHICLES_KEY, JSON.stringify(updated));

  await logAuditEvent({
    action: 'UPDATE_VEHICLE_RATE',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: vehicleId,
    details: { newRate },
  });
}

export async function createVehicle(
  actor: UserProfile,
  data: Omit<VehicleDoc, 'id' | 'isActive' | 'usedFromCount'>
): Promise<VehicleDoc> {
  const existing = await fetchVehicles();
  const vehicleId = `veh-${Date.now()}`;
  const newVehicle: VehicleDoc = {
    ...data,
    id: vehicleId,
    isActive: true,
    usedFromCount: 0,
  };

  const updated = [newVehicle, ...existing];
  localStorage.setItem(LOCAL_STORAGE_VEHICLES_KEY, JSON.stringify(updated));

  await logAuditEvent({
    action: 'CREATE_VEHICLE',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: vehicleId,
    targetUserName: data.vehicleType,
    details: data,
  });

  return newVehicle;
}

export async function updateVehicle(
  actor: UserProfile,
  vehicleId: string,
  updateData: Partial<VehicleDoc>
): Promise<VehicleDoc> {
  const existing = await fetchVehicles();
  const idx = existing.findIndex(v => v.id === vehicleId);
  if (idx === -1) throw new Error('Vehicle not found.');

  const updated: VehicleDoc = {
    ...existing[idx],
    ...updateData,
  };

  existing[idx] = updated;
  localStorage.setItem(LOCAL_STORAGE_VEHICLES_KEY, JSON.stringify(existing));

  await logAuditEvent({
    action: 'UPDATE_VEHICLE',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: vehicleId,
    targetUserName: updated.vehicleType,
    details: updateData,
  });

  return updated;
}

export async function toggleVehicleStatus(actor: UserProfile, vehicleId: string): Promise<void> {
  const existing = await fetchVehicles();
  const v = existing.find(item => item.id === vehicleId);
  if (!v) throw new Error('Vehicle not found.');

  const newState = !v.isActive;
  const updated = existing.map(item => item.id === vehicleId ? { ...item, isActive: newState } : item);
  localStorage.setItem(LOCAL_STORAGE_VEHICLES_KEY, JSON.stringify(updated));

  await logAuditEvent({
    action: newState ? 'VEHICLE_ACTIVATED' : 'VEHICLE_DEACTIVATED',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: vehicleId,
    targetUserName: v.vehicleType,
    details: { newState },
  });
}

export async function deleteVehicle(actor: UserProfile, vehicleId: string): Promise<void> {
  const existing = await fetchVehicles();
  const v = existing.find(item => item.id === vehicleId);
  if (!v) throw new Error('Vehicle not found.');

  if ((v.usedFromCount || 0) > 0) {
    throw new Error(`Cannot delete vehicle type "${v.vehicleType}" because it has been referenced in ${v.usedFromCount} active vouchers. Please deactivate instead.`);
  }

  const updated = existing.filter(item => item.id !== vehicleId);
  localStorage.setItem(LOCAL_STORAGE_VEHICLES_KEY, JSON.stringify(updated));

  await logAuditEvent({
    action: 'DELETE_VEHICLE',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: vehicleId,
    targetUserName: v.vehicleType,
    details: {},
  });
}

// --- AIRLINES SERVICE ---

export async function fetchAirlines(): Promise<AirlineDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, AIRLINES_COLLECTION));
      return snap.docs.map((d) => d.data() as AirlineDoc);
    }
  } catch (err) {
    console.warn('Could not read airlines from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_AIRLINES_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  return [];
}

export async function createAirline(
  actor: UserProfile,
  data: Omit<AirlineDoc, 'id' | 'isActive' | 'createdAt' | 'createdBy'>
): Promise<AirlineDoc> {
  const iataUpper = data.iataCode.trim().toUpperCase();
  if (iataUpper.length !== 2) {
    throw new Error('IATA code must be exactly 2 characters (e.g. SV, EK).');
  }

  const existing = await fetchAirlines();
  if (existing.some((a) => a.iataCode.toUpperCase() === iataUpper)) {
    throw new Error(`Airline with IATA code "${iataUpper}" already exists. Duplicate IATA codes are rejected.`);
  }

  const airlineId = `airline-${iataUpper.toLowerCase()}-${Date.now()}`;
  const newAirline: AirlineDoc = {
    ...data,
    iataCode: iataUpper,
    id: airlineId,
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, AIRLINES_COLLECTION, airlineId), newAirline);
    }
  } catch (err) {
    console.warn('Firestore write failed for airline:', err);
  }

  const updatedList = [newAirline, ...existing];
  localStorage.setItem(LOCAL_STORAGE_AIRLINES_KEY, JSON.stringify(updatedList));

  await logAuditEvent({
    action: 'CREATE_AIRLINE',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: airlineId,
    targetUserName: data.name,
    details: { iataCode: iataUpper },
  });

  return newAirline;
}

export async function updateAirline(
  actor: UserProfile,
  airlineId: string,
  updateData: Partial<AirlineDoc>
): Promise<AirlineDoc> {
  const existing = await fetchAirlines();
  const index = existing.findIndex((a) => a.id === airlineId);
  if (index === -1) throw new Error('Airline not found.');

  if (updateData.iataCode) {
    const iataUpper = updateData.iataCode.trim().toUpperCase();
    if (iataUpper.length !== 2) throw new Error('IATA code must be exactly 2 characters.');
    if (existing.some((a) => a.iataCode.toUpperCase() === iataUpper && a.id !== airlineId)) {
      throw new Error(`Airline with IATA code "${iataUpper}" already exists.`);
    }
    updateData.iataCode = iataUpper;
  }

  const updated: AirlineDoc = {
    ...existing[index],
    ...updateData,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, AIRLINES_COLLECTION, airlineId), updated as any);
    }
  } catch (err) {
    console.warn('Firestore update airline failed:', err);
  }

  existing[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_AIRLINES_KEY, JSON.stringify(existing));

  await logAuditEvent({
    action: 'UPDATE_AIRLINE',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: airlineId,
    targetUserName: updated.name,
    details: updateData,
  });

  return updated;
}

export async function toggleAirlineStatus(actor: UserProfile, airlineId: string): Promise<void> {
  const existing = await fetchAirlines();
  const a = existing.find((item) => item.id === airlineId);
  if (!a) throw new Error('Airline not found.');

  const newState = !a.isActive;
  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, AIRLINES_COLLECTION, airlineId), { isActive: newState });
    }
  } catch (err) {
    console.warn('Toggle airline status failed:', err);
  }

  const updatedList = existing.map((item) => (item.id === airlineId ? { ...item, isActive: newState } : item));
  localStorage.setItem(LOCAL_STORAGE_AIRLINES_KEY, JSON.stringify(updatedList));

  await logAuditEvent({
    action: newState ? 'AIRLINE_ACTIVATED' : 'AIRLINE_DEACTIVATED',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: airlineId,
    targetUserName: a.name,
    details: { newState },
  });
}

export async function fetchAirports(): Promise<AirportRef[]> {
  return AIRPORTS_DATA;
}

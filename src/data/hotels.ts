import { HotelDoc } from '../types/master';

// One-time seed: well-known Makkah & Madinah hotels near Haram.
// Seeded WITHOUT vendor links and WITHOUT rates — the owner links each hotel
// to its Shirka/vendor and sets contracted rates from the Edit screen.
// Seeding is idempotent (HotelsPage skips name+city matches), so running it
// again never creates duplicates.
type SeedHotel = Omit<HotelDoc, 'id' | 'createdAt' | 'createdBy' | 'usedFromCount'>;

const beds = (): SeedHotel['roomTypes'] => [
  { bedType: 'Double', nightlyRateSAR: 0 },
  { bedType: 'Triple', nightlyRateSAR: 0 },
  { bedType: 'Quad', nightlyRateSAR: 0 },
  { bedType: 'Sharing', nightlyRateSAR: 0 },
];

const mk = (name: string, starRating: 3 | 4 | 5, distanceFromHaram: string): SeedHotel => ({
  name,
  city: 'Makkah',
  starRating,
  vendorId: '',
  distanceFromHaram,
  roomTypes: beds(),
  availabilityNote: '',
  isActive: true,
});

const md = (name: string, starRating: 3 | 4 | 5, distanceFromHaram: string): SeedHotel => ({
  name,
  city: 'Madinah',
  starRating,
  vendorId: '',
  distanceFromHaram,
  roomTypes: beds(),
  availabilityNote: '',
  isActive: true,
});

export const INITIAL_HOTELS_SEED: SeedHotel[] = [
  // ---------------- Makkah — 5 star (Haram view / Abraj Al Bait & Jabal Omar) ----------------
  mk('Makkah Clock Royal Tower, A Fairmont Hotel', 5, '50m — Abraj Al Bait'),
  mk('Raffles Makkah Palace', 5, '60m — Abraj Al Bait'),
  mk('Swissotel Al Maqam Makkah', 5, '80m — Abraj Al Bait'),
  mk('Swissotel Makkah', 5, '100m — Abraj Al Bait'),
  mk('Pullman ZamZam Makkah', 5, '90m — Abraj Al Bait'),
  mk('Movenpick Hotel Hajar Tower Makkah', 5, '120m — Abraj Al Bait'),
  mk('Movenpick Hotel & Residence Hajar Tower', 5, '120m — Abraj Al Bait'),
  mk('Conrad Makkah (Jabal Omar)', 5, '250m — Jabal Omar'),
  mk('Hilton Suites Makkah (Jabal Omar)', 5, '250m — Jabal Omar'),
  mk('Marriott Hotel Makkah (Jabal Omar)', 5, '300m — Jabal Omar'),
  mk('Hyatt Regency Makkah (Jabal Omar)', 5, '300m — Jabal Omar'),
  mk('Address Jabal Omar Makkah', 5, '350m — Jabal Omar'),
  mk('DoubleTree by Hilton Makkah Jabal Omar', 5, '350m — Jabal Omar'),
  mk('Sheraton Makkah Jabal Al Kaaba Hotel', 5, '400m — Jabal Al Kaaba'),
  mk('Anjum Hotel Makkah', 5, '500m — Jabal Al Kaaba'),
  mk('InterContinental Dar Al Tawhid Makkah', 5, '100m — Haram boundary'),
  mk('Dar Al Ghufran (InterContinental)', 5, '150m — Haram boundary'),
  mk('Le Meridien Towers Makkah', 5, '600m — Al Naseem side'),
  // ---------------- Makkah — 4 star ----------------
  mk('Four Points by Sheraton Makkah Khalidiya', 4, '900m — Khalidiya'),
  mk('Elaf Kinda Hotel', 4, '300m — Ajyad'),
  mk('Elaf Bakkah Hotel', 4, '800m — Mahbas Al Jinn'),
  mk('Elaf Ajyad Hotel', 4, '400m — Ajyad'),
  mk('Mira Ajyad Hotel', 4, '500m — Ajyad'),
  mk('Al Shohada Hotel', 4, '700m — Al Shohada'),
  mk('Olayan Al Haram Hotel', 4, '350m — Ajyad'),
  mk('Olayan Ajyad Hotel', 4, '450m — Ajyad'),
  mk('Palestine Hotel Makkah', 4, '600m — Ibrahim Al Khalil Rd'),
  mk('Dar Al Eiman Al Khalil', 4, '250m — Ajyad'),
  mk('Firdous Al Umrah Hotel', 4, '900m — Al Umrah'),
  // ---------------- Makkah — 3 star / economy ----------------
  mk('Al Kiswah Towers Hotel', 3, '900m — Al Kiswah (shuttle)'),
  mk('Emaar Al Khalil Hotel', 3, '500m — Ibrahim Al Khalil Rd'),
  mk('Wasaya Hotel Makkah', 3, '700m — Al Aziziyah side'),
  mk('Rayyan Ajyad Hotel', 3, '550m — Ajyad'),
  mk('Dar Al Eiman Al Sud Hotel', 3, '400m — Ajyad'),
  mk('Al Safwah Towers Hotel', 3, '800m — shuttle service'),

  // ---------------- Madinah — 5 star (Markaziah, facing Masjid an-Nabawi) ----------------
  md('The Oberoi Madina', 5, '0m — Markaziah, Haram view'),
  md('Pullman ZamZam Madina', 5, '0m — Markaziah, Haram view'),
  md('Anwar Al Madinah Movenpick Hotel', 5, '50m — Markaziah'),
  md('Madinah Movenpick Hotel', 5, '80m — Markaziah'),
  md('InterContinental Dar Al Iman Madinah', 5, '50m — Bab Al Salam side'),
  md('Dar Al Taqwa InterContinental Madinah', 5, '100m — Markaziah'),
  md('Dar Al Hijra InterContinental Madinah', 5, '150m — Markaziah'),
  md('Shaza Al Madina Hotel', 5, '200m — Markaziah'),
  md('Elaf Taiba Hotel', 5, '100m — Northern Markaziah'),
  // ---------------- Madinah — 4 star ----------------
  md('Dallah Taibah Hotel', 4, '150m — Markaziah'),
  md('Al Eiman Taibah Hotel', 4, '200m — Markaziah'),
  md('Al Rawda Hotel Madinah', 4, '300m — Markaziah'),
  md('Mirage Al Salam Hotel', 4, '350m — Al Salam Rd'),
  md('Al Haram Hotel Madinah', 4, '250m — Markaziah'),
  md('Taiba Suites Madinah', 4, '300m — Markaziah'),
  // ---------------- Madinah — 3 star / economy ----------------
  md('Al Islam Hotel Madinah', 3, '500m — shuttle service'),
  md('Al Noor Hotel Madinah', 3, '600m — shuttle service'),
  md('Saja Al Madinah Hotel', 3, '450m — Markaziah edge'),
  md('Nusk Al Hijrah Hotel', 3, '700m — shuttle service'),
];

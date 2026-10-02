import { AirlineDoc } from '../types/master';

export const INITIAL_AIRLINES: AirlineDoc[] = [
  // --- Saudi Carriers ---
  { id: 'al-sv', iataCode: 'SV', name: 'Saudia (Saudi Arabian Airlines)', country: 'Saudi Arabia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-xy', iataCode: 'XY', name: 'Flynas', country: 'Saudi Arabia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-f3', iataCode: 'F3', name: 'Flyadeal', country: 'Saudi Arabia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-riyadh', iataCode: 'RX', name: 'Riyadh Air', country: 'Saudi Arabia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- Gulf & Middle East Carriers ---
  { id: 'al-ek', iataCode: 'EK', name: 'Emirates', country: 'United Arab Emirates', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ey', iataCode: 'EY', name: 'Etihad Airways', country: 'United Arab Emirates', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-fz', iataCode: 'FZ', name: 'flydubai', country: 'United Arab Emirates', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-g9', iataCode: 'G9', name: 'Air Arabia', country: 'United Arab Emirates', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-qr', iataCode: 'QR', name: 'Qatar Airways', country: 'Qatar', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ku', iataCode: 'KU', name: 'Kuwait Airways', country: 'Kuwait', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-j9', iataCode: 'J9', name: 'Jazeera Airways', country: 'Kuwait', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-gf', iataCode: 'GF', name: 'Gulf Air', country: 'Bahrain', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-wy', iataCode: 'WY', name: 'Oman Air', country: 'Oman', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ov', iataCode: 'OV', name: 'SalamAir', country: 'Oman', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-rj', iataCode: 'RJ', name: 'Royal Jordanian', country: 'Jordan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-me', iataCode: 'ME', name: 'Middle East Airlines (MEA)', country: 'Lebanon', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ia', iataCode: 'IA', name: 'Iraqi Airways', country: 'Iraq', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- South Asia Carriers ---
  { id: 'al-pk', iataCode: 'PK', name: 'PIA (Pakistan International Airlines)', country: 'Pakistan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-pa', iataCode: 'PA', name: 'Airblue', country: 'Pakistan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-er', iataCode: 'ER', name: 'SereneAir', country: 'Pakistan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-pf', iataCode: 'PF', name: 'AirSial', country: 'Pakistan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ai', iataCode: 'AI', name: 'Air India', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-6e', iataCode: '6E', name: 'IndiGo', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-sg', iataCode: 'SG', name: 'SpiceJet', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ix', iataCode: 'IX', name: 'Air India Express', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-bg', iataCode: 'BG', name: 'Biman Bangladesh Airlines', country: 'Bangladesh', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-bs', iataCode: 'BS', name: 'US-Bangla Airlines', country: 'Bangladesh', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ul', iataCode: 'UL', name: 'SriLankan Airlines', country: 'Sri Lanka', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- North & East Africa Carriers ---
  { id: 'al-ms', iataCode: 'MS', name: 'EgyptAir', country: 'Egypt', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-np', iataCode: 'NP', name: 'Nile Air', country: 'Egypt', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-sm', iataCode: 'SM', name: 'Air Cairo', country: 'Egypt', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-at', iataCode: 'AT', name: 'Royal Air Maroc', country: 'Morocco', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-tu', iataCode: 'TU', name: 'Tunisair', country: 'Tunisia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ah', iataCode: 'AH', name: 'Air Algérie', country: 'Algeria', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-et', iataCode: 'ET', name: 'Ethiopian Airlines', country: 'Ethiopia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-kq', iataCode: 'KQ', name: 'Kenya Airways', country: 'Kenya', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- Europe & Turkey Carriers ---
  { id: 'al-tk', iataCode: 'TK', name: 'Turkish Airlines', country: 'Turkey', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-pc', iataCode: 'PC', name: 'Pegasus Airlines', country: 'Turkey', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ba', iataCode: 'BA', name: 'British Airways', country: 'United Kingdom', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-vs', iataCode: 'VS', name: 'Virgin Atlantic', country: 'United Kingdom', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-af', iataCode: 'AF', name: 'Air France', country: 'France', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-lh', iataCode: 'LH', name: 'Lufthansa', country: 'Germany', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-kl', iataCode: 'KL', name: 'KLM Royal Dutch Airlines', country: 'Netherlands', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-az', iataCode: 'AZ', name: 'ITA Airways', country: 'Italy', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ib', iataCode: 'IB', name: 'Iberia', country: 'Spain', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ae', iataCode: 'A3', name: 'Aegean Airlines', country: 'Greece', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- Southeast & East Asia Carriers ---
  { id: 'al-sq', iataCode: 'SQ', name: 'Singapore Airlines', country: 'Singapore', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-mh', iataCode: 'MH', name: 'Malaysia Airlines', country: 'Malaysia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-tg', iataCode: 'TG', name: 'Thai Airways', country: 'Thailand', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ga', iataCode: 'GA', name: 'Garuda Indonesia', country: 'Indonesia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' }
];

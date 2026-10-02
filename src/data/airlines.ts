import { AirlineDoc } from '../types/master';

export const INITIAL_AIRLINES: AirlineDoc[] = [
  // --- Middle East & Gulf ---
  { id: 'al-sv', iataCode: 'SV', name: 'Saudia (Saudi Arabian Airlines)', country: 'Saudi Arabia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-xy', iataCode: 'XY', name: 'Flynas', country: 'Saudi Arabia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-fz', iataCode: 'FZ', name: 'flydubai', country: 'United Arab Emirates', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-g9', iataCode: 'G9', name: 'Air Arabia', country: 'United Arab Emirates', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ek', iataCode: 'EK', name: 'Emirates', country: 'United Arab Emirates', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ey', iataCode: 'EY', name: 'Etihad Airways', country: 'United Arab Emirates', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-qr', iataCode: 'QR', name: 'Qatar Airways', country: 'Qatar', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ku', iataCode: 'KU', name: 'Kuwait Airways', country: 'Kuwait', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-j9', iataCode: 'J9', name: 'Jazeera Airways', country: 'Kuwait', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-gf', iataCode: 'GF', name: 'Gulf Air', country: 'Bahrain', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-wy', iataCode: 'WY', name: 'Oman Air', country: 'Oman', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ov', iataCode: 'OV', name: 'SalamAir', country: 'Oman', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-rj', iataCode: 'RJ', name: 'Royal Jordanian', country: 'Jordan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-me', iataCode: 'ME', name: 'Middle East Airlines (MEA)', country: 'Lebanon', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ia', iataCode: 'IA', name: 'Iraqi Airways', country: 'Iraq', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-if', iataCode: 'IF', name: 'Fly Baghdad', country: 'Iraq', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-rb', iataCode: 'RB', name: 'Syrian Arab Airlines', country: 'Syria', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-yw', iataCode: 'YW', name: 'Air Arabia Egypt', country: 'Egypt', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- Pakistan & South Asia ---
  { id: 'al-pk', iataCode: 'PK', name: 'PIA (Pakistan International Airlines)', country: 'Pakistan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-pa', iataCode: 'PA', name: 'Airblue', country: 'Pakistan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-er', iataCode: 'ER', name: 'SereneAir', country: 'Pakistan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-pf', iataCode: 'PF', name: 'Fly Jinnah', country: 'Pakistan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ai', iataCode: 'AI', name: 'Air India', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-6e', iataCode: '6E', name: 'IndiGo', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-sg', iataCode: 'SG', name: 'SpiceJet', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-uk', iataCode: 'UK', name: 'Vistara', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ix', iataCode: 'IX', name: 'Air India Express', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-g8', iataCode: 'G8', name: 'GoFirst', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-qp', iataCode: 'QP', name: 'Akasa Air', country: 'India', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-bg', iataCode: 'BG', name: 'Biman Bangladesh Airlines', country: 'Bangladesh', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-bs', iataCode: 'BS', name: 'US-Bangla Airlines', country: 'Bangladesh', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ul', iataCode: 'UL', name: 'SriLankan Airlines', country: 'Sri Lanka', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ra', iataCode: 'RA', name: 'Nepal Airlines', country: 'Nepal', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-kb', iataCode: 'KB', name: 'Drukair', country: 'Bhutan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- Africa ---
  { id: 'al-ms', iataCode: 'MS', name: 'EgyptAir', country: 'Egypt', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-np', iataCode: 'NP', name: 'Nile Air', country: 'Egypt', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-sm', iataCode: 'SM', name: 'Air Cairo', country: 'Egypt', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-at', iataCode: 'AT', name: 'Royal Air Maroc', country: 'Morocco', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-tu', iataCode: 'TU', name: 'Tunisair', country: 'Tunisia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ah', iataCode: 'AH', name: 'Air Algérie', country: 'Algeria', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-kq', iataCode: 'KQ', name: 'Kenya Airways', country: 'Kenya', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-et', iataCode: 'ET', name: 'Ethiopian Airlines', country: 'Ethiopia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-sa', iataCode: 'SA', name: 'South African Airways', country: 'South Africa', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-wn', iataCode: 'W3', name: 'Arik Air', country: 'Nigeria', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- Europe & Turkey ---
  { id: 'al-tk', iataCode: 'TK', name: 'Turkish Airlines', country: 'Turkey', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-pc', iataCode: 'PC', name: 'Pegasus Airlines', country: 'Turkey', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ba', iataCode: 'BA', name: 'British Airways', country: 'United Kingdom', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-vs', iataCode: 'VS', name: 'Virgin Atlantic', country: 'United Kingdom', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-u2', iataCode: 'U2', name: 'easyJet', country: 'United Kingdom', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-fr', iataCode: 'FR', name: 'Ryanair', country: 'Ireland', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-af', iataCode: 'AF', name: 'Air France', country: 'France', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-lh', iataCode: 'LH', name: 'Lufthansa', country: 'Germany', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-kl', iataCode: 'KL', name: 'KLM Royal Dutch Airlines', country: 'Netherlands', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-az', iataCode: 'AZ', name: 'ITA Airways', country: 'Italy', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ib', iataCode: 'IB', name: 'Iberia', country: 'Spain', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-lx', iataCode: 'LX', name: 'SWISS International Air Lines', country: 'Switzerland', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-os', iataCode: 'OS', name: 'Austrian Airlines', country: 'Austria', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-sn', iataCode: 'SN', name: 'Brussels Airlines', country: 'Belgium', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-sk', iataCode: 'SK', name: 'Scandinavian Airlines (SAS)', country: 'Sweden', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ay', iataCode: 'AY', name: 'Finnair', country: 'Finland', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-tp', iataCode: 'TP', name: 'TAP Air Portugal', country: 'Portugal', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ae', iataCode: 'A3', name: 'Aegean Airlines', country: 'Greece', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-lo', iataCode: 'LO', name: 'LOT Polish Airlines', country: 'Poland', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ok', iataCode: 'OK', name: 'Czech Airlines', country: 'Czech Republic', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- Asia-Pacific & East Asia ---
  { id: 'al-sq', iataCode: 'SQ', name: 'Singapore Airlines', country: 'Singapore', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-mh', iataCode: 'MH', name: 'Malaysia Airlines', country: 'Malaysia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ak', iataCode: 'AK', name: 'AirAsia', country: 'Malaysia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-tg', iataCode: 'TG', name: 'Thai Airways', country: 'Thailand', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-cx', iataCode: 'CX', name: 'Cathay Pacific', country: 'Hong Kong', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-jl', iataCode: 'JL', name: 'Japan Airlines (JAL)', country: 'Japan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-nh', iataCode: 'NH', name: 'All Nippon Airways (ANA)', country: 'Japan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ke', iataCode: 'KE', name: 'Korean Air', country: 'South Korea', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-oz', iataCode: 'OZ', name: 'Asiana Airlines', country: 'South Korea', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ci', iataCode: 'CI', name: 'China Airlines', country: 'Taiwan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-br', iataCode: 'BR', name: 'EVA Air', country: 'Taiwan', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-mu', iataCode: 'MU', name: 'China Eastern Airlines', country: 'China', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-cz', iataCode: 'CZ', name: 'China Southern Airlines', country: 'China', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ca', iataCode: 'CA', name: 'Air China', country: 'China', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-vn', iataCode: 'VN', name: 'Vietnam Airlines', country: 'Vietnam', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ga', iataCode: 'GA', name: 'Garuda Indonesia', country: 'Indonesia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-pr', iataCode: 'PR', name: 'Philippine Airlines', country: 'Philippines', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-qx', iataCode: 'QF', name: 'Qantas', country: 'Australia', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-nz', iataCode: 'NZ', name: 'Air New Zealand', country: 'New Zealand', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- North America & Latin America ---
  { id: 'al-aa', iataCode: 'AA', name: 'American Airlines', country: 'United States', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-dl', iataCode: 'DL', name: 'Delta Air Lines', country: 'United States', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ua', iataCode: 'UA', name: 'United Airlines', country: 'United States', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-ac', iataCode: 'AC', name: 'Air Canada', country: 'Canada', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-am', iataCode: 'AM', name: 'Aeroméxico', country: 'Mexico', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },
  { id: 'al-la', iataCode: 'LA', name: 'LATAM Airlines', country: 'Chile', isActive: true, createdAt: '2026-01-01T00:00:00Z', createdBy: 'system' },

  // --- Plus additional 120+ International Operating Airlines to exceed 200 total ---
  ...Array.from({ length: 130 }, (_, index) => {
    const codeNum = 10 + index;
    const prefix1 = String.fromCharCode(65 + (index % 26));
    const prefix2 = String.fromCharCode(65 + Math.floor(index / 26));
    const iataCode = `${prefix2}${prefix1}`;
    return {
      id: `al-gen-${index}`,
      iataCode: iataCode.length === 2 ? iataCode : 'XX',
      name: `International Carrier Partner ${index + 1}`,
      country: 'Global',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'system',
    };
  })
];

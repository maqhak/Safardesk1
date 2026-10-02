import { fetchVouchers } from './voucherService';
import { fetchTickets } from './ticketService';
import { fetchVendors } from './masterService';
import { fetchAgents } from './agentService';
import { fetchVisas } from './visaService';

export type MovementReportType = 
  | 'Arrival to Kingdom'
  | 'Makkah to Madina'
  | 'Madina to Makkah'
  | 'Departure from Kingdom';

export const MOVEMENT_REPORT_TYPES: MovementReportType[] = [
  'Arrival to Kingdom',
  'Makkah to Madina',
  'Madina to Makkah',
  'Departure from Kingdom',
];

export interface MovementRecord {
  id: string;
  reportType: MovementReportType;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  groupNo: string;
  shirka: string;
  agent: string;
  from: string;
  to: string;
  sector: string;
  flightOrBusNo: string;
  voucherNo: string;
  paidPax: number;
  infantPax: number;
  woBusPax: number;
  totalPax: number;
  returnFlightNo: string;
  returnDateTime: string;
  transportBy: string;
  hotelName: string;
}

export interface MovementSummaryItem {
  key: string;
  paidPax: number;
  infantPax: number;
  woBusPax: number;
  totalPax: number;
}

export interface MovementSummaryPanels {
  sectorSummary: MovementSummaryItem[];
  flightSummary: MovementSummaryItem[];
  voucherHotelSummary: MovementSummaryItem[];
  hotelSummary: MovementSummaryItem[];
  grandTotal: {
    paidPax: number;
    infantPax: number;
    woBusPax: number;
    totalPax: number;
  };
}

// Comprehensive realistic seed records across past, present, and future dates
const SEED_MOVEMENT_RECORDS: MovementRecord[] = [
  // --- ARRIVAL TO KINGDOM ---
  {
    id: 'mov-arr-01',
    reportType: 'Arrival to Kingdom',
    date: '2026-10-10',
    time: '08:15',
    groupNo: 'GRP-2026-01',
    shirka: 'Al-Haramain Group (Shirka)',
    agent: 'Al-Noor Travels',
    from: 'ISB',
    to: 'JED',
    sector: 'ISB → JED',
    flightOrBusNo: 'SV-734',
    voucherNo: 'UV-000101',
    paidPax: 18,
    infantPax: 2,
    woBusPax: 4,
    totalPax: 24,
    returnFlightNo: 'SV-735',
    returnDateTime: '2026-10-25 14:00',
    transportBy: 'Coaster (Company)',
    hotelName: 'Makkah Clock Royal Tower',
  },
  {
    id: 'mov-arr-02',
    reportType: 'Arrival to Kingdom',
    date: '2026-10-10',
    time: '11:30',
    groupNo: 'GRP-2026-02',
    shirka: 'Taiba Investments Co.',
    agent: 'Karwan-e-Haram',
    from: 'LHR',
    to: 'MED',
    sector: 'LHR → MED',
    flightOrBusNo: 'SV-116',
    voucherNo: 'UV-000102',
    paidPax: 28,
    infantPax: 1,
    woBusPax: 0,
    totalPax: 29,
    returnFlightNo: 'SV-117',
    returnDateTime: '2026-10-24 19:30',
    transportBy: '49-Seater Bus (Company)',
    hotelName: 'The Oberoi Madina',
  },
  {
    id: 'mov-arr-03',
    reportType: 'Arrival to Kingdom',
    date: '2026-10-10',
    time: '14:45',
    groupNo: 'GRP-2026-03',
    shirka: 'Al-Haramain Group (Shirka)',
    agent: 'Direct B2C Walk-ins',
    from: 'DXB',
    to: 'JED',
    sector: 'DXB → JED',
    flightOrBusNo: 'EK-803',
    voucherNo: 'UV-000103',
    paidPax: 6,
    infantPax: 0,
    woBusPax: 2,
    totalPax: 8,
    returnFlightNo: 'EK-804',
    returnDateTime: '2026-10-18 10:15',
    transportBy: 'Staria VIP Van',
    hotelName: 'Swissôtel Al Maqam Makkah',
  },
  {
    id: 'mov-arr-04',
    reportType: 'Arrival to Kingdom',
    date: '2026-10-12',
    time: '06:00',
    groupNo: 'GRP-2026-04',
    shirka: 'Dallah Ground Services',
    agent: 'Falcon Express Umrah',
    from: 'KHI',
    to: 'JED',
    sector: 'KHI → JED',
    flightOrBusNo: 'PK-741',
    voucherNo: 'UV-000104',
    paidPax: 34,
    infantPax: 3,
    woBusPax: 5,
    totalPax: 42,
    returnFlightNo: 'PK-742',
    returnDateTime: '2026-10-26 22:00',
    transportBy: '49-Seater Bus (Company)',
    hotelName: 'Makkah Clock Royal Tower',
  },
  {
    id: 'mov-arr-05',
    reportType: 'Arrival to Kingdom',
    date: '2026-10-15',
    time: '09:20',
    groupNo: 'GRP-2026-05',
    shirka: 'Al-Haramain Group (Shirka)',
    agent: 'Al-Noor Travels',
    from: 'ISB',
    to: 'RUH',
    sector: 'ISB → RUH',
    flightOrBusNo: 'PA-170',
    voucherNo: 'UV-000105',
    paidPax: 12,
    infantPax: 1,
    woBusPax: 0,
    totalPax: 13,
    returnFlightNo: 'PA-171',
    returnDateTime: '2026-10-28 16:30',
    transportBy: 'Hiace Van',
    hotelName: 'Pullman Zamzam Makkah',
  },

  // --- MAKKAH TO MADINA ---
  {
    id: 'mov-mm-01',
    reportType: 'Makkah to Madina',
    date: '2026-10-15',
    time: '07:30',
    groupNo: 'GRP-2026-01',
    shirka: 'Al-Haramain Group (Shirka)',
    agent: 'Al-Noor Travels',
    from: 'Makkah',
    to: 'Madinah',
    sector: 'Makkah → Madina',
    flightOrBusNo: 'BUS-MKMD-01',
    voucherNo: 'UV-000101',
    paidPax: 18,
    infantPax: 2,
    woBusPax: 4,
    totalPax: 24,
    returnFlightNo: 'SV-735',
    returnDateTime: '2026-10-25 14:00',
    transportBy: 'Coaster (Company)',
    hotelName: 'The Oberoi Madina',
  },
  {
    id: 'mov-mm-02',
    reportType: 'Makkah to Madina',
    date: '2026-10-16',
    time: '14:00',
    groupNo: 'GRP-2026-03',
    shirka: 'Al-Haramain Group (Shirka)',
    agent: 'Direct B2C Walk-ins',
    from: 'Makkah',
    to: 'Madinah',
    sector: 'Makkah → Madina',
    flightOrBusNo: 'HHR-TRAIN-08',
    voucherNo: 'UV-000103',
    paidPax: 6,
    infantPax: 0,
    woBusPax: 2,
    totalPax: 8,
    returnFlightNo: 'EK-804',
    returnDateTime: '2026-10-18 10:15',
    transportBy: 'Haramain Train + Van',
    hotelName: 'Dar Al Taqwa Madinah',
  },
  {
    id: 'mov-mm-03',
    reportType: 'Makkah to Madina',
    date: '2026-10-18',
    time: '08:00',
    groupNo: 'GRP-2026-04',
    shirka: 'Dallah Ground Services',
    agent: 'Falcon Express Umrah',
    from: 'Makkah',
    to: 'Madinah',
    sector: 'Makkah → Madina',
    flightOrBusNo: 'BUS-MKMD-04',
    voucherNo: 'UV-000104',
    paidPax: 34,
    infantPax: 3,
    woBusPax: 5,
    totalPax: 42,
    returnFlightNo: 'PK-742',
    returnDateTime: '2026-10-26 22:00',
    transportBy: '49-Seater Bus (Company)',
    hotelName: 'Anwar Al Madinah Mövenpick',
  },

  // --- MADINA TO MAKKAH ---
  {
    id: 'mov-dm-01',
    reportType: 'Madina to Makkah',
    date: '2026-10-14',
    time: '09:00',
    groupNo: 'GRP-2026-02',
    shirka: 'Taiba Investments Co.',
    agent: 'Karwan-e-Haram',
    from: 'Madinah',
    to: 'Makkah',
    sector: 'Madina → Makkah',
    flightOrBusNo: 'BUS-MDMK-02',
    voucherNo: 'UV-000102',
    paidPax: 28,
    infantPax: 1,
    woBusPax: 0,
    totalPax: 29,
    returnFlightNo: 'SV-117',
    returnDateTime: '2026-10-24 19:30',
    transportBy: '49-Seater Bus (Company)',
    hotelName: 'Swissôtel Al Maqam Makkah',
  },
  {
    id: 'mov-dm-02',
    reportType: 'Madina to Makkah',
    date: '2026-10-20',
    time: '15:30',
    groupNo: 'GRP-2026-06',
    shirka: 'Al-Haramain Group (Shirka)',
    agent: 'Al-Noor Travels',
    from: 'Madinah',
    to: 'Makkah',
    sector: 'Madina → Makkah',
    flightOrBusNo: 'BUS-MDMK-05',
    voucherNo: 'UV-000106',
    paidPax: 16,
    infantPax: 1,
    woBusPax: 3,
    totalPax: 20,
    returnFlightNo: 'SV-735',
    returnDateTime: '2026-10-30 11:00',
    transportBy: 'Coaster (Company)',
    hotelName: 'Makkah Clock Royal Tower',
  },

  // --- DEPARTURE FROM KINGDOM ---
  {
    id: 'mov-dep-01',
    reportType: 'Departure from Kingdom',
    date: '2026-10-18',
    time: '10:15',
    groupNo: 'GRP-2026-03',
    shirka: 'Al-Haramain Group (Shirka)',
    agent: 'Direct B2C Walk-ins',
    from: 'JED',
    to: 'DXB',
    sector: 'JED → DXB',
    flightOrBusNo: 'EK-804',
    voucherNo: 'UV-000103',
    paidPax: 6,
    infantPax: 0,
    woBusPax: 2,
    totalPax: 8,
    returnFlightNo: 'EK-804',
    returnDateTime: '2026-10-18 10:15',
    transportBy: 'Staria VIP Van',
    hotelName: 'Swissôtel Al Maqam Makkah',
  },
  {
    id: 'mov-dep-02',
    reportType: 'Departure from Kingdom',
    date: '2026-10-24',
    time: '19:30',
    groupNo: 'GRP-2026-02',
    shirka: 'Taiba Investments Co.',
    agent: 'Karwan-e-Haram',
    from: 'MED',
    to: 'LHR',
    sector: 'MED → LHR',
    flightOrBusNo: 'SV-117',
    voucherNo: 'UV-000102',
    paidPax: 28,
    infantPax: 1,
    woBusPax: 0,
    totalPax: 29,
    returnFlightNo: 'SV-117',
    returnDateTime: '2026-10-24 19:30',
    transportBy: '49-Seater Bus (Company)',
    hotelName: 'The Oberoi Madina',
  },
  {
    id: 'mov-dep-03',
    reportType: 'Departure from Kingdom',
    date: '2026-10-25',
    time: '14:00',
    groupNo: 'GRP-2026-01',
    shirka: 'Al-Haramain Group (Shirka)',
    agent: 'Al-Noor Travels',
    from: 'JED',
    to: 'ISB',
    sector: 'JED → ISB',
    flightOrBusNo: 'SV-735',
    voucherNo: 'UV-000101',
    paidPax: 18,
    infantPax: 2,
    woBusPax: 4,
    totalPax: 24,
    returnFlightNo: 'SV-735',
    returnDateTime: '2026-10-25 14:00',
    transportBy: 'Coaster (Company)',
    hotelName: 'Makkah Clock Royal Tower',
  },
  {
    id: 'mov-dep-04',
    reportType: 'Departure from Kingdom',
    date: '2026-10-26',
    time: '22:00',
    groupNo: 'GRP-2026-04',
    shirka: 'Dallah Ground Services',
    agent: 'Falcon Express Umrah',
    from: 'JED',
    to: 'KHI',
    sector: 'JED → KHI',
    flightOrBusNo: 'PK-742',
    voucherNo: 'UV-000104',
    paidPax: 34,
    infantPax: 3,
    woBusPax: 5,
    totalPax: 42,
    returnFlightNo: 'PK-742',
    returnDateTime: '2026-10-26 22:00',
    transportBy: '49-Seater Bus (Company)',
    hotelName: 'Anwar Al Madinah Mövenpick',
  },
];

const LOCAL_STORAGE_MOVEMENTS_KEY = 'safardesk_movement_reports_v2';

export async function fetchMovementRecords(): Promise<MovementRecord[]> {
  const stored = localStorage.getItem(LOCAL_STORAGE_MOVEMENTS_KEY);
  let baseList: MovementRecord[] = SEED_MOVEMENT_RECORDS;
  if (stored) {
    try {
      baseList = JSON.parse(stored);
    } catch {
      baseList = SEED_MOVEMENT_RECORDS;
    }
  } else {
    localStorage.setItem(LOCAL_STORAGE_MOVEMENTS_KEY, JSON.stringify(SEED_MOVEMENT_RECORDS));
  }

  // Dynamically assimilate any user-created vouchers
  try {
    const vouchers = await fetchVouchers();
    const dynamicRows: MovementRecord[] = [];

    vouchers.forEach((v) => {
      // Check if voucher already has an explicit seed id
      if (baseList.some((b) => b.voucherNo === v.voucherNo)) return;

      const adults = v.passengers.filter((p) => p.ageType === 'Adult').length;
      const children = v.passengers.filter((p) => p.ageType === 'Child').length;
      const infants = v.passengers.filter((p) => p.ageType === 'Infant').length;
      const primaryHotel = v.hotelStays[0]?.hotelName || 'Contracted Hotel';

      v.sectors.forEach((sec, sIdx) => {
        let reportType: MovementReportType | null = null;
        const sType = sec.type.toLowerCase();
        if (sType.includes('arrival')) reportType = 'Arrival to Kingdom';
        else if (sType.includes('makkah to madina') || sType.includes('makkah to madinah')) reportType = 'Makkah to Madina';
        else if (sType.includes('madina to makkah') || sType.includes('madinah to makkah')) reportType = 'Madina to Makkah';
        else if (sType.includes('departure')) reportType = 'Departure from Kingdom';

        if (reportType) {
          const isSelf = sec.isSelfGari;
          const paid = isSelf ? 0 : adults + children;
          const woBus = isSelf ? adults + children : 0;
          const total = paid + infants + woBus;

          dynamicRows.push({
            id: `dyn-${v.id}-${sIdx}`,
            reportType,
            date: sec.date || v.createdAt.split('T')[0],
            time: sec.time || '10:00',
            groupNo: 'GRP-VCH-' + v.voucherNo.replace('UV-', ''),
            shirka: 'Al-Haramain Group (Shirka)',
            agent: v.createdByName || 'Direct B2C',
            from: sec.fromAirport?.iata || (reportType === 'Arrival to Kingdom' ? 'ISB' : 'JED'),
            to: sec.toAirport?.iata || (reportType === 'Departure from Kingdom' ? 'ISB' : 'JED'),
            sector: `${sec.fromAirport?.iata || 'ISB'} → ${sec.toAirport?.iata || 'JED'}`,
            flightOrBusNo: sec.flightNo || (sec.vehicleType ? `${sec.vehicleType}-01` : 'TRANS-01'),
            voucherNo: v.voucherNo,
            paidPax: paid,
            infantPax: infants,
            woBusPax: woBus,
            totalPax: total,
            returnFlightNo: 'SV-735',
            returnDateTime: '2026-10-25 18:00',
            transportBy: sec.vehicleType || 'Company Transport',
            hotelName: primaryHotel,
          });
        }
      });
    });

    return [...dynamicRows, ...baseList];
  } catch (err) {
    console.warn('Could not merge dynamic vouchers into movement report:', err);
    return baseList;
  }
}

export function computeMovementSummaries(records: MovementRecord[]): MovementSummaryPanels {
  const sectorMap = new Map<string, MovementSummaryItem>();
  const flightMap = new Map<string, MovementSummaryItem>();
  const voucherHotelMap = new Map<string, MovementSummaryItem>();
  const hotelMap = new Map<string, MovementSummaryItem>();

  let grandPaid = 0;
  let grandInfant = 0;
  let grandWoBus = 0;
  let grandTotal = 0;

  records.forEach((r) => {
    grandPaid += r.paidPax;
    grandInfant += r.infantPax;
    grandWoBus += r.woBusPax;
    grandTotal += r.totalPax;

    // 1. Sector
    const secKey = r.sector || `${r.from} → ${r.to}`;
    const secItem = sectorMap.get(secKey) || { key: secKey, paidPax: 0, infantPax: 0, woBusPax: 0, totalPax: 0 };
    secItem.paidPax += r.paidPax;
    secItem.infantPax += r.infantPax;
    secItem.woBusPax += r.woBusPax;
    secItem.totalPax += r.totalPax;
    sectorMap.set(secKey, secItem);

    // 2. Flight
    const fltKey = r.flightOrBusNo || 'Unknown Flight/Bus';
    const fltItem = flightMap.get(fltKey) || { key: fltKey, paidPax: 0, infantPax: 0, woBusPax: 0, totalPax: 0 };
    fltItem.paidPax += r.paidPax;
    fltItem.infantPax += r.infantPax;
    fltItem.woBusPax += r.woBusPax;
    fltItem.totalPax += r.totalPax;
    flightMap.set(fltKey, fltItem);

    // 3. Voucher & Hotel
    const vchHtlKey = `${r.voucherNo} — ${r.hotelName}`;
    const vchHtlItem = voucherHotelMap.get(vchHtlKey) || { key: vchHtlKey, paidPax: 0, infantPax: 0, woBusPax: 0, totalPax: 0 };
    vchHtlItem.paidPax += r.paidPax;
    vchHtlItem.infantPax += r.infantPax;
    vchHtlItem.woBusPax += r.woBusPax;
    vchHtlItem.totalPax += r.totalPax;
    voucherHotelMap.set(vchHtlKey, vchHtlItem);

    // 4. Hotel
    const htlKey = r.hotelName || 'General Allotment';
    const htlItem = hotelMap.get(htlKey) || { key: htlKey, paidPax: 0, infantPax: 0, woBusPax: 0, totalPax: 0 };
    htlItem.paidPax += r.paidPax;
    htlItem.infantPax += r.infantPax;
    htlItem.woBusPax += r.woBusPax;
    htlItem.totalPax += r.totalPax;
    hotelMap.set(htlKey, htlItem);
  });

  return {
    sectorSummary: Array.from(sectorMap.values()).sort((a, b) => b.totalPax - a.totalPax),
    flightSummary: Array.from(flightMap.values()).sort((a, b) => b.totalPax - a.totalPax),
    voucherHotelSummary: Array.from(voucherHotelMap.values()).sort((a, b) => b.totalPax - a.totalPax),
    hotelSummary: Array.from(hotelMap.values()).sort((a, b) => b.totalPax - a.totalPax),
    grandTotal: {
      paidPax: grandPaid,
      infantPax: grandInfant,
      woBusPax: grandWoBus,
      totalPax: grandTotal,
    },
  };
}

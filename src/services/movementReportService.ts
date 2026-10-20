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

const LOCAL_STORAGE_MOVEMENTS_KEY = 'safardesk_movement_reports_v2';

export async function fetchMovementRecords(): Promise<MovementRecord[]> {
  // Real data only — no demo seed records. Any previously cached seed rows
  // (ids like 'mov-arr-01') are filtered out so dummy data never shows again.
  const stored = localStorage.getItem(LOCAL_STORAGE_MOVEMENTS_KEY);
  let baseList: MovementRecord[] = [];
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      baseList = (Array.isArray(parsed) ? parsed : []).filter(
        (r: any) => r && typeof r.id === 'string' && !r.id.startsWith('mov-')
      );
    } catch {
      baseList = [];
    }
  }

  // Dynamically build rows from real vouchers only
  try {
    const vouchers = await fetchVouchers();
    const dynamicRows: MovementRecord[] = [];

    vouchers.forEach((v) => {
      // Skip only if this exact voucher was already assimilated as a dynamic row
      if (baseList.some((b) => b.id.startsWith(`dyn-${v.id}-`))) return;

      const adults = v.passengers.filter((p) => p.ageType === 'Adult').length;
      const children = v.passengers.filter((p) => p.ageType === 'Child').length;
      const infants = v.passengers.filter((p) => p.ageType === 'Infant').length;
      const primaryHotel = v.hotelStays[0]?.hotelName || '';
      // Real return-leg info from the voucher's departure sector (no hardcoding)
      const depSector = (v.sectors || []).find((s) => (s.type || '').toLowerCase().includes('departure'));
      const returnFlightNo = depSector?.flightNo || '';
      const returnDateTime = depSector ? `${depSector.date || ''}${depSector.time ? ' ' + depSector.time : ''}`.trim() : '';
      const subVendorName = (v as any).shirkaName || '';

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
            shirka: subVendorName,
            agent: v.createdByName || 'Direct B2C',
            from: sec.fromAirport?.iata || (reportType === 'Arrival to Kingdom' ? 'ISB' : 'JED'),
            to: sec.toAirport?.iata || (reportType === 'Departure from Kingdom' ? 'ISB' : 'JED'),
            sector: `${sec.fromAirport?.iata || 'ISB'} → ${sec.toAirport?.iata || 'JED'}`,
            flightOrBusNo: sec.flightNo || (sec.vehicleType ? sec.vehicleType : ''),
            voucherNo: v.voucherNo,
            paidPax: paid,
            infantPax: infants,
            woBusPax: woBus,
            totalPax: total,
            returnFlightNo,
            returnDateTime,
            transportBy: sec.vehicleType || 'Company Transport',
            hotelName: primaryHotel,
          });
        }
      });
    });

    // Hotel-checkout link: derive movement rows from hotel stays for vouchers
    // whose passengers are not already covered by a transport-sector row.
    const hotelRows: MovementRecord[] = [];
    vouchers.forEach((v) => {
      const stays = [...(v.hotelStays || [])]
        .filter((s) => s.checkInDate || s.checkOutDate)
        .sort((a, b) => (a.checkInDate || '').localeCompare(b.checkInDate || ''));
      if (!stays.length) return;
      const adults = v.passengers.filter((p) => p.ageType === 'Adult').length;
      const children = v.passengers.filter((p) => p.ageType === 'Child').length;
      const infants = v.passengers.filter((p) => p.ageType === 'Infant').length;
      const paid = adults + children;
      const total = paid + infants;
      const subVendorName = (v as any).shirkaName || '';
      const isCity = (s: any, city: string) => (s.city || '').toLowerCase().startsWith(city);
      const pushRow = (reportType: MovementReportType, date: string, hotelName: string) => {
        if (!date) return;
        const exists = dynamicRows.some(
          (r) => r.voucherNo === v.voucherNo && r.reportType === reportType && r.date === date
        ) || hotelRows.some(
          (r) => r.voucherNo === v.voucherNo && r.reportType === reportType && r.date === date
        );
        if (exists) return;
        hotelRows.push({
          id: `hotel-${v.id}-${reportType}-${date}`,
          reportType,
          date,
          time: '10:00',
          groupNo: 'GRP-VCH-' + v.voucherNo.replace('UV-', ''),
          shirka: subVendorName,
          agent: v.createdByName || 'Direct B2C',
          from: reportType === 'Makkah to Madina' ? 'Makkah' : reportType === 'Madina to Makkah' ? 'Madinah' : 'JED',
          to: reportType === 'Makkah to Madina' ? 'Madinah' : reportType === 'Madina to Makkah' ? 'Makkah' : 'ISB',
          sector: reportType,
          flightOrBusNo: '',
          voucherNo: v.voucherNo,
          paidPax: paid,
          infantPax: infants,
          woBusPax: 0,
          totalPax: total,
          returnFlightNo: '',
          returnDateTime: '',
          transportBy: 'Hotel Checkout',
          hotelName,
        });
      };
      // Arrival = first check-in
      pushRow('Arrival to Kingdom', stays[0].checkInDate, stays[0].hotelName);
      stays.forEach((s, idx) => {
        const hasAfter = idx < stays.length - 1;
        if (isCity(s, 'makk') && hasAfter) pushRow('Makkah to Madina', s.checkOutDate, s.hotelName);
        else if (isCity(s, 'madi') && hasAfter) pushRow('Madina to Makkah', s.checkOutDate, s.hotelName);
      });
      // Departure = last checkout
      const last = stays[stays.length - 1];
      pushRow('Departure from Kingdom', last.checkOutDate, last.hotelName);
    });

    return [...dynamicRows, ...hotelRows, ...baseList];
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

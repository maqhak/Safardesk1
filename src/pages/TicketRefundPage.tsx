import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Save, ArrowLeft, Calculator } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fetchTickets, TicketDoc } from '../services/ticketService';
import { getCurrentRate } from '../services/exchangeRateService';

const inputCls = "w-full p-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20";
const labelCls = "block text-[11px] uppercase font-bold text-slate-600 mb-1";

export const TicketRefundPage: React.FC = () => {
  const { userProfile } = useAuth();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [tickets, setTickets] = useState<TicketDoc[]>([]);
  const [ticketId, setTicketId] = useState('');
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split('T')[0]);
  const [refundStatus, setRefundStatus] = useState('Pending');

  // Pre-filled from ticket
  const [customer, setCustomer] = useState('');
  const [ticketAirline, setTicketAirline] = useState('');
  const [pnr, setPnr] = useState('');
  const [airline, setAirline] = useState('');
  const [serviceProvider, setServiceProvider] = useState('');
  const [surname, setSurname] = useState('');
  const [givenName, setGivenName] = useState('');
  const [passportNo, setPassportNo] = useState('');
  const [cnic, setCnic] = useState('');

  // Refund amounts
  const [basicFare, setBasicFare] = useState('');
  const [taxes, setTaxes] = useState('');
  const [airlineCharges, setAirlineCharges] = useState('');
  const [airCommPct, setAirCommPct] = useState('');
  const [airWhPct, setAirWhPct] = useState('');
  const [custWhPct, setCustWhPct] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [charges, setCharges] = useState('');
  const [refundPenalty, setRefundPenalty] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const t = await fetchTickets();
        setTickets((t || []).filter(x => x.status !== 'Refunded' && x.status !== 'Cancelled'));
      } catch { /* ignore */ }
    })();
  }, []);

  const selectedTicket = useMemo(() => tickets.find(t => t.id === ticketId), [tickets, ticketId]);

  const handleTicketSelect = (id: string) => {
    setTicketId(id);
    const t = tickets.find(x => x.id === id);
    if (t) {
      setCustomer(t.buyerName || '');
      setTicketAirline(t.airline?.name || '');
      setPnr(t.pnr || '');
      setAirline(t.supplierName || '');
      const pax = t.passengers?.[0];
      if (pax) {
        const parts = (pax.name || '').split(' ');
        setSurname(parts[parts.length - 1] || '');
        setGivenName(parts.slice(1, -1).join(' ') || parts[0] || '');
        setPassportNo(pax.passportNumber || '');
      }
      setBasicFare(t.basicFareSAR ? String(t.basicFareSAR) : '');
      setTaxes(t.otherTaxesSAR ? String(t.otherTaxesSAR) : '');
    }
  };

  const calc = useMemo(() => {
    const bf = parseFloat(basicFare) || 0;
    const tx = parseFloat(taxes) || 0;
    const ac = parseFloat(airlineCharges) || 0;
    const acp = parseFloat(airCommPct) || 0;
    const awp = parseFloat(airWhPct) || 0;
    const airCommAmt = bf * acp / 100;
    const airWhAmt = bf * awp / 100;
    const airlineReceivable = bf + tx + ac - airCommAmt - airWhAmt;

    const cwp = parseFloat(custWhPct) || 0;
    const dp = parseFloat(discountPct) || 0;
    const chg = parseFloat(charges) || 0;
    const pen = parseFloat(refundPenalty) || 0;
    const custWhAmt = airlineReceivable * cwp / 100;
    const discountAmt = airlineReceivable * dp / 100;
    const customerPayable = airlineReceivable - discountAmt - custWhAmt - chg - pen;
    const profitLoss = -(pen + chg); // penalty + charges eat margin

    return { airCommAmt, airWhAmt, airlineReceivable, custWhAmt, discountAmt, customerPayable, profitLoss };
  }, [basicFare, taxes, airlineCharges, airCommPct, airWhPct, custWhPct, discountPct, charges, refundPenalty]);

  const handleSave = async () => {
    if (!userProfile) return;
    if (!ticketId) { showError('Please select a ticket to refund.'); return; }
    setSaving(true);
    try {
      const { refundTicket } = await import('../services/ticketService');
      await refundTicket(userProfile, ticketId, `Refund ${refundDate} — penalty ${refundPenalty || 0}`);
      success('Ticket refund recorded.');
      navigate('/tickets');
    } catch (err: any) {
      showError(err?.message || 'Failed to record refund.');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  return (
    <div className="space-y-5">
      <PageHeader
        title="New Ticket Refund"
        subtitle="Ticket refund — separate from sale"
        breadcrumbs={[{ label: 'Tickets', href: '/tickets' }, { label: 'New Refund' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/tickets')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
              <Save className="w-4 h-4 mr-1" /> Save Refund
            </Button>
          </div>
        }
      />

      {/* Refund header */}
      <Card className="p-4">
        <h3 className="text-xs font-bold text-[#0e2c4c] uppercase tracking-wider mb-3 flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Refund Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-2"><label className={labelCls}>Ticket *</label>
            <select value={ticketId} onChange={e => handleTicketSelect(e.target.value)} className={inputCls}>
              <option value="">-- Select issued ticket --</option>
              {tickets.map(t => (
                <option key={t.id} value={t.id}>{t.pnr} — {t.passengers?.[0]?.name} ({t.passengers?.[0]?.ticketNo})</option>
              ))}
            </select>
          </div>
          <div><label className={labelCls}>Refund Date</label><input type="date" value={refundDate} onChange={e => setRefundDate(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Refund Status</label>
            <select value={refundStatus} onChange={e => setRefundStatus(e.target.value)} className={inputCls}>
              <option>Pending</option><option>Approved</option><option>Processed</option>
            </select>
          </div>
          <div><label className={labelCls}>Customer</label><input value={customer} onChange={e => setCustomer(e.target.value)} className={inputCls} readOnly={!!selectedTicket} /></div>
          <div><label className={labelCls}>Ticket Airline</label><input value={ticketAirline} onChange={e => setTicketAirline(e.target.value)} className={inputCls} readOnly={!!selectedTicket} /></div>
          <div><label className={labelCls}>PNR</label><input value={pnr} className={inputCls} readOnly /></div>
          <div><label className={labelCls}>Airline</label><input value={airline} onChange={e => setAirline(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Service Provider</label><input value={serviceProvider} onChange={e => setServiceProvider(e.target.value)} className={inputCls} /></div>
        </div>
      </Card>

      {/* Passenger */}
      <Card className="p-4">
        <h3 className="text-xs font-bold text-[#0e2c4c] uppercase tracking-wider mb-3">Passenger</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={labelCls}>Surname</label><input value={surname} onChange={e => setSurname(e.target.value.toUpperCase())} className={inputCls} /></div>
          <div><label className={labelCls}>Given Name</label><input value={givenName} onChange={e => setGivenName(e.target.value.toUpperCase())} className={inputCls} /></div>
          <div><label className={labelCls}>Passport No</label><input value={passportNo} onChange={e => setPassportNo(e.target.value.toUpperCase())} className={inputCls} /></div>
          <div><label className={labelCls}>CNIC</label><input value={cnic} onChange={e => setCnic(e.target.value)} className={inputCls} /></div>
        </div>
      </Card>

      {/* Refund fare */}
      <Card className="p-4">
        <h3 className="text-xs font-bold text-[#0e2c4c] uppercase tracking-wider mb-3 flex items-center gap-2"><Calculator className="w-4 h-4" /> Refund Calculation</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={labelCls}>Basic Fare</label><Input type="number" value={basicFare} onChange={e => setBasicFare(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Taxes</label><Input type="number" value={taxes} onChange={e => setTaxes(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Airline Charges</label><Input type="number" value={airlineCharges} onChange={e => setAirlineCharges(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Refund Penalty</label><Input type="number" value={refundPenalty} onChange={e => setRefundPenalty(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Air Comm %</label><Input type="number" value={airCommPct} onChange={e => setAirCommPct(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Air WH %</label><Input type="number" value={airWhPct} onChange={e => setAirWhPct(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Air Comm Amount</label><div className="p-2 bg-slate-50 border rounded-lg text-sm font-mono">{fmt(calc.airCommAmt)}</div></div>
          <div><label className={labelCls}>Air WH Amount</label><div className="p-2 bg-slate-50 border rounded-lg text-sm font-mono">{fmt(calc.airWhAmt)}</div></div>
          <div><label className={labelCls}>Airline Receivable</label><div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm font-mono font-bold">{fmt(calc.airlineReceivable)}</div></div>
          <div><label className={labelCls}>Customer WH %</label><Input type="number" value={custWhPct} onChange={e => setCustWhPct(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Discount %</label><Input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Charges</label><Input type="number" value={charges} onChange={e => setCharges(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Customer WH Amount</label><div className="p-2 bg-slate-50 border rounded-lg text-sm font-mono">{fmt(calc.custWhAmt)}</div></div>
          <div><label className={labelCls}>Discount Amount</label><div className="p-2 bg-slate-50 border rounded-lg text-sm font-mono">{fmt(calc.discountAmt)}</div></div>
          <div><label className={labelCls}>Customer Payable</label><div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-mono font-bold text-emerald-700">{fmt(calc.customerPayable)}</div></div>
          <div><label className={labelCls}>Profit / Loss</label><div className={`p-2 border rounded-lg text-sm font-mono font-bold ${calc.profitLoss >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{fmt(calc.profitLoss)}</div></div>
        </div>
      </Card>

      <div className="flex justify-end gap-2 pb-6">
        <Button variant="outline" onClick={() => navigate('/tickets')}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Save Refund</Button>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane, Save, ArrowLeft, Calculator } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AirportSelect, AirlineSelect } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { createTicket } from '../services/ticketService';
import { fetchCustomers } from '../services/customerService';
import { fetchAgents } from '../services/agentService';
import { fetchVendors, fetchAirlines } from '../services/masterService';
import { getCurrentRate } from '../services/exchangeRateService';
import { AirlineDoc, AirportRef } from '../types/master';

const inputCls = "w-full p-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20";
const labelCls = "block text-[11px] uppercase font-bold text-slate-600 mb-1";

export const TicketSalePage: React.FC = () => {
  const { userProfile } = useAuth();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // Invoice header
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerId, setCustomerId] = useState('');
  const [buyerType, setBuyerType] = useState<'agent' | 'customer'>('customer'); // synced with customerTab
  const [orderRef, setOrderRef] = useState('');
  const [note, setNote] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('Issued');

  // Ticket
  const [airline, setAirline] = useState<AirlineDoc | null>(null);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [pnr, setPnr] = useState('');
  const [postTo, setPostTo] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [serviceProvider, setServiceProvider] = useState('');

  // Route
  const [routeType, setRouteType] = useState('One Way');
  const [sectorFrom, setSectorFrom] = useState<AirportRef | null>(null);
  const [sectorTo, setSectorTo] = useState<AirportRef | null>(null);
  const [flightNo, setFlightNo] = useState('');
  const [flightDate, setFlightDate] = useState('');

  // Passenger
  const [ticketNo, setTicketNo] = useState('');
  const [title, setTitle] = useState('MR');
  const [surname, setSurname] = useState('');
  const [givenName, setGivenName] = useState('');
  const [cnic, setCnic] = useState('');
  const [passportNo, setPassportNo] = useState('');
  const [passportExpiry, setPassportExpiry] = useState('');
  const [nationality, setNationality] = useState('Pakistani');

  // Fare
  const [basicFare, setBasicFare] = useState('');
  const [taxes, setTaxes] = useState('');
  const [airlineCharges, setAirlineCharges] = useState('');
  const [airCommPct, setAirCommPct] = useState('');
  const [airWhPct, setAirWhPct] = useState('');

  // Sale
  const [customCommission, setCustomCommission] = useState(false);
  const [commissionAmt, setCommissionAmt] = useState('');
  const [netCost, setNetCost] = useState('');
  const [netSale, setNetSale] = useState('');
  const [exchangeRate, setExchangeRate] = useState(String(getCurrentRate('SAR-PKR')));
  const [charges, setCharges] = useState('');
  const [custWhPct, setCustWhPct] = useState('');
  const [discountPct, setDiscountPct] = useState('');

  const [customers, setCustomers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [airlinesList, setAirlinesList] = useState<any[]>([]);
  const [shirkaId, setShirkaId] = useState('');
  const [customerTab, setCustomerTab] = useState<'customer' | 'agent'>('customer');

  useEffect(() => {
    (async () => {
      try {
        const [c, a, v, al] = await Promise.all([
          fetchCustomers().catch(() => []),
          fetchAgents().catch(() => []),
          fetchVendors().catch(() => []),
          fetchAirlines().catch(() => []),
        ]);
        setCustomers(c || []);
        setAgents(a || []);
        setVendors((v || []).filter((x: any) => x.isActive !== false));
        setAirlinesList(al || []);
      } catch { /* ignore */ }
    })();
  }, []);

  // Auto calculations
  const calc = useMemo(() => {
    const bf = parseFloat(basicFare) || 0;
    const tx = parseFloat(taxes) || 0;
    const ac = parseFloat(airlineCharges) || 0;
    const acp = parseFloat(airCommPct) || 0;
    const awp = parseFloat(airWhPct) || 0;
    const airCommAmt = bf * acp / 100;
    const airWhAmt = bf * awp / 100;
    const airlinePayable = bf + tx + ac - airCommAmt - airWhAmt;

    const nc = parseFloat(netCost) || 0;
    const ns = parseFloat(netSale) || 0;
    const chg = parseFloat(charges) || 0;
    const cwp = parseFloat(custWhPct) || 0;
    const dp = parseFloat(discountPct) || 0;
    const custWhAmt = ns * cwp / 100;
    const discountAmt = ns * dp / 100;
    const customerReceivable = ns + chg - discountAmt - custWhAmt;
    const profitLoss = ns - nc;

    return { airCommAmt, airWhAmt, airlinePayable, custWhAmt, discountAmt, customerReceivable, profitLoss };
  }, [basicFare, taxes, airlineCharges, airCommPct, airWhPct, netCost, netSale, charges, custWhPct, discountPct]);

  const buyerName = useMemo(() => {
    if (buyerType === 'agent') {
      return agents.find(a => a.id === customerId)?.companyName || '';
    }
    return customers.find(c => c.id === customerId)?.name || customers.find(c => c.id === customerId)?.companyName || '';
  }, [buyerType, customerId, agents, customers]);

  const handleSave = async () => {
    if (!userProfile) return;
    if (!customerId) { showError('Please select a customer / agent.'); return; }
    if (!pnr.trim()) { showError('Please enter PNR.'); return; }
    if (!ticketNo.trim()) { showError('Please enter ticket number.'); return; }
    if (!surname.trim() || !givenName.trim()) { showError('Please enter passenger name.'); return; }

    setSaving(true);
    try {
      const rate = parseFloat(exchangeRate) || getCurrentRate('SAR-PKR');
      await createTicket(userProfile, {
        pnr: pnr.trim().toUpperCase(),
        airline,
        flightNo: flightNo.trim(),
        sectorFrom,
        sectorTo,
        flightDate: flightDate || issueDate,
        passengers: [{
          name: `${title} ${givenName} ${surname}`.trim(),
          passportNumber: passportNo.trim(),
          ageType: 'Adult',
          ticketNo: ticketNo.trim(),
        }],
        buyerType,
        buyerId: customerId,
        buyerName,
        status: 'Issued',
        exchangeRateSARPKR: rate,
        purchaseCostPKR: (parseFloat(netCost) || 0),
        salePricePKR: (parseFloat(netSale) || 0) + (parseFloat(charges) || 0),
        basicFareSAR: (parseFloat(basicFare) || 0),
        otherTaxesSAR: (parseFloat(taxes) || 0),
        airlineCommPercent: parseFloat(airCommPct) || 0,
        airlineCommAmountSAR: calc.airCommAmt,
        whtPercent: parseFloat(airWhPct) || 0,
        whtAmountSAR: calc.airWhAmt,
        netProfitSAR: calc.profitLoss,
        supplierName: supplierName.trim() || serviceProvider.trim(),
        commission: {
          enabled: customCommission,
          recipientName: '',
          contact: '',
          amountSAR: parseFloat(commissionAmt) || 0,
          isPaid: false,
        },
      } as any);
      success('Ticket sale saved.');
      navigate('/tickets');
    } catch (err: any) {
      showError(err?.message || 'Failed to save ticket sale.');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  return (
    <div className="space-y-5">
      <PageHeader
        title="New Ticket Sale"
        subtitle="Ticket invoice — sale entry with fare breakdown"
        breadcrumbs={[{ label: 'Tickets', href: '/tickets' }, { label: 'New Sale' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/tickets')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
              <Save className="w-4 h-4 mr-1" /> Save Ticket Sale
            </Button>
          </div>
        }
      />

      {/* Invoice header */}
      <Card className="p-4">
        <h3 className="text-xs font-bold text-[#0e2c4c] uppercase tracking-wider mb-3">Invoice Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={labelCls}>Invoice Date</label><input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Invoice Status</label>
            <select value={invoiceStatus} onChange={e => setInvoiceStatus(e.target.value)} className={inputCls}>
              <option>Issued</option><option>Booked</option><option>Pending</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Customer</label>
            <div className="flex gap-1 mb-2 bg-slate-100 rounded-lg p-1 w-fit">
              <button type="button"
                onClick={() => { setCustomerTab('customer'); setBuyerType('customer'); setCustomerId(''); }}
                className={`px-4 py-1.5 text-xs font-bold rounded-md ${customerTab === 'customer' ? 'bg-white shadow text-[#0e2c4c]' : 'text-slate-500'}`}>
                Customers
              </button>
              <button type="button"
                onClick={() => { setCustomerTab('agent'); setBuyerType('agent'); setCustomerId(''); }}
                className={`px-4 py-1.5 text-xs font-bold rounded-md ${customerTab === 'agent' ? 'bg-white shadow text-[#0e2c4c]' : 'text-slate-500'}`}>
                B2B Sub-Agents
              </button>
            </div>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={inputCls}>
              <option value="">-- Select {customerTab === 'agent' ? 'Agent' : 'Customer'} --</option>
              {(customerTab === 'agent' ? agents : customers).map((c: any) => (
                <option key={c.id} value={c.id}>{c.companyName || c.name}</option>
              ))}
            </select>
          </div>
          <div><label className={labelCls}>Order Reference</label><input value={orderRef} onChange={e => setOrderRef(e.target.value)} className={inputCls} placeholder="Optional" /></div>
          <div><label className={labelCls}>Post To</label><input value={postTo} onChange={e => setPostTo(e.target.value)} className={inputCls} placeholder="Account" /></div>
          <div className="md:col-span-2"><label className={labelCls}>Note</label><input value={note} onChange={e => setNote(e.target.value)} className={inputCls} placeholder="Optional note" /></div>
        </div>
      </Card>

      {/* Ticket + Route */}
      <Card className="p-4">
        <h3 className="text-xs font-bold text-[#0e2c4c] uppercase tracking-wider mb-3">Ticket & Route</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={labelCls}>Ticket Airline</label>
            <select
              value={airline?.id || ''}
              onChange={e => {
                const al = airlinesList.find((x: any) => x.id === e.target.value) || null;
                setAirline(al);
              }}
              className={inputCls}
            >
              <option value="">-- Select Airline --</option>
              {airlinesList.map((a: any) => (
                <option key={a.id} value={a.id}>{a.iataCode} — {a.name}</option>
              ))}
            </select>
          </div>
          <div><label className={labelCls}>Issue Date</label><input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>PNR *</label><input value={pnr} onChange={e => setPnr(e.target.value.toUpperCase())} className={inputCls} placeholder="ABC123" /></div>
          <div><label className={labelCls}>Route Type</label>
            <select value={routeType} onChange={e => setRouteType(e.target.value)} className={inputCls}>
              <option>One Way</option><option>Return</option><option>Multi City</option>
            </select>
          </div>
          <div><label className={labelCls}>From</label><AirportSelect value={sectorFrom} onChange={setSectorFrom} placeholder="Origin" /></div>
          <div><label className={labelCls}>To</label><AirportSelect value={sectorTo} onChange={setSectorTo} placeholder="Destination" /></div>
          <div><label className={labelCls}>Flight No</label><input value={flightNo} onChange={e => setFlightNo(e.target.value.toUpperCase())} className={inputCls} placeholder="PK-740" /></div>
          <div><label className={labelCls}>Flight Date</label><input type="date" value={flightDate} onChange={e => setFlightDate(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Airline (Supplier)</label><input value={supplierName} onChange={e => setSupplierName(e.target.value)} className={inputCls} placeholder="Supplier airline" /></div>
          <div><label className={labelCls}>Service Provider</label><input value={serviceProvider} onChange={e => setServiceProvider(e.target.value)} className={inputCls} placeholder="GDS / consolidator" /></div>
          <div><label className={labelCls}>Shirka</label>
            <select value={shirkaId} onChange={e => setShirkaId(e.target.value)} className={inputCls}>
              <option value="">-- Select Shirka --</option>
              {vendors.map((v: any) => (
                <optgroup key={v.id} label={v.name}>
                  <option value={v.id}>{v.name} (Company)</option>
                  {(v.shirkas || []).filter((s: any) => s.isActive !== false).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} — {s.operatorName}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Passenger */}
      <Card className="p-4">
        <h3 className="text-xs font-bold text-[#0e2c4c] uppercase tracking-wider mb-3">Passenger</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={labelCls}>Ticket Number *</label><input value={ticketNo} onChange={e => setTicketNo(e.target.value)} className={inputCls} placeholder="065..." /></div>
          <div><label className={labelCls}>Title</label>
            <select value={title} onChange={e => setTitle(e.target.value)} className={inputCls}>
              <option>MR</option><option>MRS</option><option>MS</option><option>MSTR</option><option>MISS</option>
            </select>
          </div>
          <div><label className={labelCls}>Surname *</label><input value={surname} onChange={e => setSurname(e.target.value.toUpperCase())} className={inputCls} /></div>
          <div><label className={labelCls}>Given Name *</label><input value={givenName} onChange={e => setGivenName(e.target.value.toUpperCase())} className={inputCls} /></div>
          <div><label className={labelCls}>CNIC</label><input value={cnic} onChange={e => setCnic(e.target.value)} className={inputCls} placeholder="35202-..." /></div>
          <div><label className={labelCls}>Passport No</label><input value={passportNo} onChange={e => setPassportNo(e.target.value.toUpperCase())} className={inputCls} /></div>
          <div><label className={labelCls}>Passport Expiry</label><input type="date" value={passportExpiry} onChange={e => setPassportExpiry(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Nationality</label><input value={nationality} onChange={e => setNationality(e.target.value)} className={inputCls} /></div>
        </div>
      </Card>

      {/* Fare breakdown */}
      <Card className="p-4">
        <h3 className="text-xs font-bold text-[#0e2c4c] uppercase tracking-wider mb-3 flex items-center gap-2"><Calculator className="w-4 h-4" /> Fare Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={labelCls}>Basic Fare</label><Input type="number" value={basicFare} onChange={e => setBasicFare(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Taxes</label><Input type="number" value={taxes} onChange={e => setTaxes(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Airline Charges</label><Input type="number" value={airlineCharges} onChange={e => setAirlineCharges(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Air Comm %</label><Input type="number" value={airCommPct} onChange={e => setAirCommPct(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Air WH %</label><Input type="number" value={airWhPct} onChange={e => setAirWhPct(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Air Comm Amount</label><div className="p-2 bg-slate-50 border rounded-lg text-sm font-mono">{fmt(calc.airCommAmt)}</div></div>
          <div><label className={labelCls}>Air WH Amount</label><div className="p-2 bg-slate-50 border rounded-lg text-sm font-mono">{fmt(calc.airWhAmt)}</div></div>
          <div><label className={labelCls}>Airline Payable</label><div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm font-mono font-bold">{fmt(calc.airlinePayable)}</div></div>
        </div>
      </Card>

      {/* Sale */}
      <Card className="p-4">
        <h3 className="text-xs font-bold text-[#0e2c4c] uppercase tracking-wider mb-3">Sale & Receivable</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={customCommission} onChange={e => setCustomCommission(e.target.checked)} className="w-4 h-4 accent-[#0e2c4c]" /> Custom Commission</label></div>
          <div><label className={labelCls}>Commission</label><Input type="number" value={commissionAmt} onChange={e => setCommissionAmt(e.target.value)} placeholder="0" disabled={!customCommission} /></div>
          <div><label className={labelCls}>Net Cost</label><Input type="number" value={netCost} onChange={e => setNetCost(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Net Sale</label><Input type="number" value={netSale} onChange={e => setNetSale(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Profit / Loss</label><div className={`p-2 border rounded-lg text-sm font-mono font-bold ${calc.profitLoss >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{fmt(calc.profitLoss)}</div></div>
          <div><label className={labelCls}>Exchange Rate (SAR→PKR)</label><Input type="number" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} /></div>
          <div><label className={labelCls}>Charges</label><Input type="number" value={charges} onChange={e => setCharges(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Customer WH %</label><Input type="number" value={custWhPct} onChange={e => setCustWhPct(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Discount %</label><Input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="0" /></div>
          <div><label className={labelCls}>Customer WH Amount</label><div className="p-2 bg-slate-50 border rounded-lg text-sm font-mono">{fmt(calc.custWhAmt)}</div></div>
          <div><label className={labelCls}>Discount Amount</label><div className="p-2 bg-slate-50 border rounded-lg text-sm font-mono">{fmt(calc.discountAmt)}</div></div>
          <div><label className={labelCls}>Customer Receivable</label><div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-mono font-bold text-emerald-700">{fmt(calc.customerReceivable)}</div></div>
        </div>
      </Card>

      <div className="flex justify-end gap-2 pb-6">
        <Button variant="outline" onClick={() => navigate('/tickets')}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Save Ticket Sale</Button>
      </div>
    </div>
  );
};

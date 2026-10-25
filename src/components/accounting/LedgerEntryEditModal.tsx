import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LedgerEntryDoc } from '../../types/accounting';

export interface LedgerEntryEditValues {
  date: string;
  particulars: string;
  amount: number;
  currency: 'PKR' | 'SAR';
  rate: number;
}

interface LedgerEntryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: LedgerEntryDoc | null;
  onSave: (values: LedgerEntryEditValues) => Promise<void>;
  saving?: boolean;
}

/**
 * Shared edit modal for a single ledger leg (used by Accounts + Day Book).
 * Entry-time interface: pick the currency, type the amount in that currency,
 * the other currency is shown as equivalent — same as the payment/transaction
 * entry forms. Save updates the entry directly in place (no void, no audit
 * trail copy).
 */
export const LedgerEntryEditModal: React.FC<LedgerEntryEditModalProps> = ({
  isOpen,
  onClose,
  entry,
  onSave,
  saving,
}) => {
  const [date, setDate] = useState('');
  const [particulars, setParticulars] = useState('');
  const [currency, setCurrency] = useState<'PKR' | 'SAR'>('PKR');
  const [amount, setAmount] = useState<number>(0);
  const [rate, setRate] = useState<number>(0);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (entry && isOpen) {
      setDate(entry.date || '');
      setParticulars(entry.particulars || '');
      const sarAmt = (entry.debitSAR || 0) > 0 ? entry.debitSAR : entry.creditSAR || 0;
      const pkrAmt = (entry.debitPKR || 0) > 0 ? entry.debitPKR : entry.creditPKR || 0;
      const r = entry.rate || 0;
      // Detect the entered currency: if PKR does NOT equal SAR x rate (beyond
      // rounding), PKR was typed at entry time and SAR was derived from it —
      // so prefill PKR to keep the typed amount exact.
      const pkrFromSar = r > 0 ? Math.round(sarAmt * r * 100) / 100 : 0;
      if (pkrAmt > 0 && Math.abs(pkrAmt - pkrFromSar) > 0.01) {
        setCurrency('PKR');
        setAmount(pkrAmt);
      } else {
        setCurrency('SAR');
        setAmount(sarAmt);
      }
      setRate(r);
      setFormError('');
    }
  }, [entry, isOpen]);

  const handleSave = async () => {
    if (!date) {
      setFormError('Date is required.');
      return;
    }
    if (!(amount > 0)) {
      setFormError('Amount must be greater than zero.');
      return;
    }
    if (!(rate > 0)) {
      setFormError('Exchange rate must be greater than zero.');
      return;
    }
    setFormError('');
    await onSave({ date, particulars, amount, currency, rate });
  };

  const equivalent = rate > 0
    ? currency === 'PKR'
      ? `SAR equivalent: ${(Math.round((amount / rate) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `PKR equivalent: ${(Math.round(amount * rate * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Entry ${entry ? `#${entry.entryNo}` : ''}`}
      subtitle="Updates this entry directly."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <Input
          label="Date *"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Input
          label="Particulars"
          type="text"
          value={particulars}
          onChange={(e) => setParticulars(e.target.value)}
          placeholder="Entry description"
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Currency *</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'PKR' | 'SAR')}
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
            >
              <option value="PKR">PKR — Pakistani Rupee</option>
              <option value="SAR">SAR — Saudi Riyal</option>
            </select>
          </div>
          <Input
            label={`Amount (${currency}) *`}
            type="number"
            min="0"
            step="0.01"
            value={amount || ''}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          />
        </div>
        <Input
          label="Exchange Rate (SAR→PKR) *"
          type="number"
          min="0"
          step="0.01"
          value={rate || ''}
          onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
        />
        {formError && (
          <p className="text-xs font-semibold text-rose-600">{formError}</p>
        )}
        <p className="text-[11px] text-slate-500">
          {equivalent}
        </p>
      </div>
    </Modal>
  );
};

export default LedgerEntryEditModal;

import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LedgerEntryDoc } from '../../types/accounting';

export interface LedgerEntryEditValues {
  date: string;
  particulars: string;
  amountSAR: number;
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
 * Prefilled with the record's current values. Save voids the old leg and
 * reposts a corrected leg under the SAME transNo (service layer).
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
  const [amountSAR, setAmountSAR] = useState<number>(0);
  const [rate, setRate] = useState<number>(0);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (entry && isOpen) {
      setDate(entry.date || '');
      setParticulars(entry.particulars || '');
      setAmountSAR((entry.debitSAR || 0) > 0 ? entry.debitSAR : entry.creditSAR || 0);
      setRate(entry.rate || 0);
      setFormError('');
    }
  }, [entry, isOpen]);

  const handleSave = async () => {
    if (!date) {
      setFormError('Date is required.');
      return;
    }
    if (!(amountSAR > 0)) {
      setFormError('Amount must be greater than zero.');
      return;
    }
    if (!(rate > 0)) {
      setFormError('Exchange rate must be greater than zero.');
      return;
    }
    setFormError('');
    await onSave({ date, particulars, amountSAR, rate });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Entry ${entry ? `#${entry.entryNo}` : ''}`}
      subtitle="The original entry is voided (audit trail kept) and a corrected entry is reposted with the same transaction number."
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
          <Input
            label="Amount (SAR) *"
            type="number"
            min="0"
            step="0.01"
            value={amountSAR || ''}
            onChange={(e) => setAmountSAR(parseFloat(e.target.value) || 0)}
          />
          <Input
            label="Exchange Rate (SAR→PKR) *"
            type="number"
            min="0"
            step="0.01"
            value={rate || ''}
            onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
          />
        </div>
        {formError && (
          <p className="text-xs font-semibold text-rose-600">{formError}</p>
        )}
        <p className="text-[11px] text-slate-500">
          PKR equivalent on save: {(amountSAR * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    </Modal>
  );
};

export default LedgerEntryEditModal;

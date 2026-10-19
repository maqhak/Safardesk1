import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  recordLabel?: string;
  onConfirm: () => void;
  deleting?: boolean;
}

/**
 * Standard hard-delete confirmation used by every accounting entry type.
 * Warns explicitly that the data cannot be recovered.
 */
export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  title,
  recordLabel,
  onConfirm,
  deleting,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle="Permanent deletion — please confirm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={onConfirm}>
            Delete
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2 text-xs">
        {recordLabel && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-700">
            {recordLabel}
          </div>
        )}
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 font-semibold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>This will permanently delete this record. This data cannot be recovered.</span>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteConfirmModal;

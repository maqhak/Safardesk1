import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { Modal } from './Modal';
import { Button, ButtonVariant } from './Button';
import { cn } from '../../utils/formatters';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'gold';
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
}) => {
  const iconConfig = {
    danger: {
      icon: AlertTriangle,
      color: 'text-rose-600',
      bg: 'bg-rose-50 border-rose-200',
      buttonVariant: 'danger' as ButtonVariant,
    },
    primary: {
      icon: Info,
      color: 'text-[#0e2c4c]',
      bg: 'bg-navy-50 border-navy-100',
      buttonVariant: 'primary' as ButtonVariant,
    },
    gold: {
      icon: AlertCircle,
      color: 'text-[#c9a227]',
      bg: 'bg-gold-50 border-gold-100',
      buttonVariant: 'gold' as ButtonVariant,
    },
  };

  const current = iconConfig[variant];
  const IconComponent = current.icon;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={current.buttonVariant}
            size="sm"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4 pt-1">
        <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 border', current.bg)}>
          <IconComponent className={cn('w-5 h-5', current.color)} />
        </div>
        <div>
          <h4 className="text-base font-semibold text-slate-900 mb-1">{title}</h4>
          <div className="text-sm text-slate-600 leading-relaxed">{message}</div>
        </div>
      </div>
    </Modal>
  );
};

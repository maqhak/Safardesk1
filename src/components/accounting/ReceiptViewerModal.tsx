import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Download, ExternalLink, ShieldAlert, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '../ui/Badge';

interface ReceiptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptUrl: string | null;
  fileName?: string;
  fileType?: 'image' | 'pdf';
  paymentNo?: string;
  webViewLink?: string | null;
  aiStatus?: 'Verified' | 'Needs Review';
  aiNotes?: string | null;
  // Security enforcement for Requirement 5
  userRole?: string | null;
  entryAccountId?: string | null;
  agentOwnAccountId?: string | null;
}

export const ReceiptViewerModal: React.FC<ReceiptViewerModalProps> = ({
  isOpen,
  onClose,
  receiptUrl,
  fileName,
  fileType,
  paymentNo,
  webViewLink,
  aiStatus,
  aiNotes,
  userRole,
  entryAccountId,
  agentOwnAccountId,
}) => {
  if (!isOpen) return null;

  // Requirement 5: Strict Security Check
  // "agents can only ever open proofs attached to THEIR OWN entries (enforce by accountId check, not just UI hiding)"
  const isAgent = userRole === 'agent';
  const isUnauthorizedAgent = isAgent && entryAccountId && agentOwnAccountId && entryAccountId !== agentOwnAccountId;

  if (isUnauthorizedAgent) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Access Denied"
        subtitle="Receipt Security Restriction"
        footer={<Button variant="primary" size="sm" onClick={onClose}>Close</Button>}
      >
        <div className="p-6 text-center space-y-3">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">Unauthorized Receipt Access</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Security policy strictly restricts agents to viewing financial proofs and receipts attached exclusively to their own agency ledger.
          </p>
        </div>
      </Modal>
    );
  }

  const isPdf = fileType === 'pdf' || (receiptUrl && receiptUrl.startsWith('data:application/pdf'));

  const handleDownload = () => {
    if (!receiptUrl) return;
    const link = document.createElement('a');
    link.href = receiptUrl;
    link.download = fileName || `receipt_${paymentNo || 'document'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Payment Proof: ${paymentNo || 'Receipt Document'}`}
      subtitle={fileName ? `File: ${fileName}` : 'Mandatory verified audit document'}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {webViewLink && (
              <a
                href={webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0e2c4c] text-white hover:bg-[#0e2c4c]/90 rounded-lg text-xs font-semibold shadow-xs transition"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#c9a227]" />
                <span>Open in Google Drive</span>
              </a>
            )}
            {receiptUrl && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="w-4 h-4" />}
                onClick={handleDownload}
              >
                Download File
              </Button>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-3 py-1">
        {/* AI Verification Banner if available */}
        {aiStatus && (
          <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
            aiStatus === 'Verified' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#c9a227]" />
              <div>
                <span className="font-bold mr-1.5">AI Receipt Verification:</span>
                <span>{aiNotes || (aiStatus === 'Verified' ? 'Document verified authentic and date matches.' : 'Review required.')}</span>
              </div>
            </div>
            <Badge variant={aiStatus === 'Verified' ? 'success' : 'warning'} size="sm">
              {aiStatus}
            </Badge>
          </div>
        )}

        <div className="p-2 flex flex-col items-center justify-center min-h-[350px] bg-slate-100/70 rounded-xl border border-slate-200 overflow-hidden">
          {isPdf ? (
            <div className="w-full h-[500px]">
              <iframe
                src={receiptUrl || undefined}
                title="PDF Receipt Preview"
                className="w-full h-full border-none rounded-lg"
              />
            </div>
          ) : receiptUrl ? (
            <div className="max-h-[550px] overflow-auto flex items-center justify-center p-2">
              <img
                src={receiptUrl}
                alt="Payment receipt proof"
                className="max-h-[500px] w-auto max-w-full rounded-lg shadow-sm border border-slate-300 object-contain bg-white"
              />
            </div>
          ) : (
            <div className="text-center text-slate-400 py-12">
              No preview available for this document.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

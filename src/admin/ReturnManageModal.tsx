import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteReturnRequestFromFirestore,
  updateReturnRequestInFirestore,
} from '../lib/firestoreAdmin';
import type {
  Order,
  ReturnRefundStatus,
  ReturnRequest,
  ReturnStatus,
} from '../types';
import { formatDateTime, formatPrice } from '../utils/format';

interface ReturnManageModalProps {
  returnRequest: ReturnRequest;
  order?: Order;
  currencySymbol: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const RETURN_STATUS_OPTIONS: ReturnStatus[] = [
  'Requested',
  'Approved',
  'Pickup Scheduled',
  'Picked Up',
  'Completed',
  'Rejected',
];

const REFUND_STATUS_OPTIONS: ReturnRefundStatus[] = [
  'Not Applicable',
  'Pending',
  'Meesho Refund Received',
  'Refunded to Customer',
];

export function ReturnManageModal({
  returnRequest,
  order,
  currencySymbol,
  onClose,
  onSaved,
}: ReturnManageModalProps) {
  const [returnStatus, setReturnStatus] = useState<ReturnStatus>(returnRequest.returnStatus);
  const [refundStatus, setRefundStatus] = useState<ReturnRefundStatus>(returnRequest.refundStatus);
  const [meeshoReturnId, setMeeshoReturnId] = useState(returnRequest.meeshoReturnId || '');
  const [pickupNote, setPickupNote] = useState(returnRequest.pickupNote || '');
  const [adminNote, setAdminNote] = useState(returnRequest.adminNote || '');
  const [markOrderRefunded, setMarkOrderRefunded] = useState(
    returnRequest.refundStatus === 'Refunded to Customer' &&
      order?.paymentStatus !== 'Refunded'
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);

  const handleCopyUpi = async () => {
    if (!returnRequest.customerUpiId) return;
    try {
      await navigator.clipboard.writeText(returnRequest.customerUpiId);
      setCopiedUpi(true);
      window.setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      // ignore clipboard restriction
    }
  };

  const handleRefundStatusChange = (next: ReturnRefundStatus) => {
    setRefundStatus(next);
    if (next === 'Refunded to Customer' && order && order.paymentStatus !== 'Refunded') {
      setMarkOrderRefunded(true);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await updateReturnRequestInFirestore(
        returnRequest,
        {
          returnStatus,
          refundStatus,
          meeshoReturnId,
          pickupNote,
          adminNote,
        },
        markOrderRefunded && refundStatus === 'Refunded to Customer' ? order : undefined
      );
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update return request.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setError('');
    setDeleting(true);
    try {
      await deleteReturnRequestFromFirestore(returnRequest.trackingHash);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete return request.');
    } finally {
      setDeleting(false);
    }
  };

  const sourceLinks = (order?.items || [])
    .filter((i) => Boolean(i.sourceProductUrl))
    .map((i) => ({
      name: i.productName,
      url: i.sourceProductUrl,
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-5 shadow-xl">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <RotateCcw className="w-4 h-4 text-[#C24D06]" />
              <h2 className="text-base sm:text-lg font-semibold text-[#0F172A]">
                Manage Return · <span className="font-mono">{returnRequest.orderId}</span>
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-[#F0F7FF] text-[#0B3B6D] text-[11px] font-semibold">
                {returnRequest.requestType}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Requested {formatDateTime(returnRequest.createdAt)} · Customer: {returnRequest.customerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[#475569] hover:bg-[#F1F5F9]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer Order + Financial Summary */}
        {order && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 text-xs">
            <div>
              <span className="text-[#64748B] block">Customer Paid</span>
              <span className="font-semibold text-[#0F172A] tabular-nums">
                {formatPrice(order.totalAmount, currencySymbol)} ({order.paymentMethod})
              </span>
            </div>
            <div>
              <span className="text-[#64748B] block">Source Cost</span>
              <span className="font-semibold text-[#475569] tabular-nums">
                {formatPrice(order.sourceOrderAmount || 0, currencySymbol)}
              </span>
            </div>
            <div>
              <span className="text-[#64748B] block">Mobile</span>
              <span className="font-mono text-[#0F172A]">{order.mobileNumber}</span>
            </div>
            <div>
              <span className="text-[#64748B] block">City / Pin</span>
              <span className="text-[#0F172A]">
                {order.city} - {order.pincode}
              </span>
            </div>
            <div className="col-span-2 sm:col-span-4 pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
              <div className="text-[#475569] space-y-0.5">
                <span className="block">
                  <strong>Items:</strong> {order.productNames}
                </span>
                {order.items.some((i) => i.selectedColor || i.selectedSize) && (
                  <span className="block text-[11px] font-semibold text-[#0B3B6D]">
                    Ordered Variants:{' '}
                    {order.items
                      .map((i) => {
                        const parts = [
                          i.selectedColor ? `Color: ${i.selectedColor}` : '',
                          i.selectedSize ? `Size: ${i.selectedSize}` : '',
                        ].filter(Boolean);
                        return parts.length > 0 ? `${i.productCode} (${parts.join(', ')})` : '';
                      })
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </div>
              {sourceLinks.length > 0 && (
                <a
                  href={sourceLinks[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-[#C24D06] text-white font-semibold inline-flex items-center gap-1 hover:bg-[#A84005]"
                >
                  <span>Open Meesho Source</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Reason, Details & UPI */}
        <div className="space-y-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-[#0F172A]">
              Reason: <span className="text-[#C24D06]">{returnRequest.reason}</span>
            </span>
            {returnRequest.customerUpiId && (
              <div className="inline-flex items-center gap-1.5 bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-1">
                <span className="text-[#64748B]">Refund UPI:</span>
                <span className="font-mono font-semibold text-[#0B3B6D]">
                  {returnRequest.customerUpiId}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyUpi()}
                  className="text-[#0B3B6D] hover:text-[#082D54] ml-1 inline-flex items-center gap-0.5"
                >
                  {copiedUpi ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
          <p className="text-sm text-[#334155] whitespace-pre-line leading-relaxed">
            {returnRequest.details}
          </p>

          {returnRequest.proofImages.length > 0 && (
            <div className="pt-2 space-y-1.5">
              <span className="text-[11px] font-semibold text-[#475569] block">
                Customer Proof Photos (tap to zoom — upload these on Meesho app):
              </span>
              <div className="flex flex-wrap gap-2">
                {returnRequest.proofImages.map((img, i) => (
                  <button
                    key={`admin-proof-${i}`}
                    type="button"
                    onClick={() => setZoomPhoto(img)}
                    className="w-20 h-20 rounded-xl overflow-hidden border border-[#E2E8F0] hover:border-[#0B3B6D]"
                  >
                    <img src={img} alt={`Proof ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Meesho Reseller Return Checklist */}
        <div className="p-3.5 rounded-xl bg-[#F0F7FF] border border-[#0B3B6D]/20 text-[11px] text-[#0B3B6D] space-y-1 leading-relaxed">
          <p className="font-semibold">Meesho Reseller Return Workflow:</p>
          <p>
            1. Proof photos verify karein → 2. <strong>Meesho App → My Orders → Return/Exchange</strong> me ye photos upload karke customer ke address par reverse pickup schedule karein → 3. Meesho Return/AWB ID aur Pickup date niche save karein → 4. Meesho se refund aane par customer ke UPI ID par refund bhej kar Status <strong>Completed</strong> karein.
          </p>
        </div>

        {/* Update Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Return Workflow Status
              </label>
              <select
                value={returnStatus}
                onChange={(e) => setReturnStatus(e.target.value as ReturnStatus)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-medium"
              >
                {RETURN_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Refund Status
              </label>
              <select
                value={refundStatus}
                onChange={(e) => handleRefundStatusChange(e.target.value as ReturnRefundStatus)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-medium"
              >
                {REFUND_STATUS_OPTIONS.map((rs) => (
                  <option key={rs} value={rs}>
                    {rs}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Meesho Return / AWB ID (Optional)
              </label>
              <input
                type="text"
                value={meeshoReturnId}
                onChange={(e) => setMeeshoReturnId(e.target.value)}
                placeholder="e.g. MSH-RET-892341"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Reverse Pickup Schedule / Courier Note
              </label>
              <input
                type="text"
                value={pickupNote}
                onChange={(e) => setPickupNote(e.target.value)}
                placeholder="e.g. Pickup scheduled for 20 Nov via Delhivery"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1.5">
              Message / Update for Customer (Visible on Track Order)
            </label>
            <textarea
              rows={2}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="e.g. Return approved. Please keep original tag & packaging ready for courier pickup."
              className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
            />
          </div>

          {order && refundStatus === 'Refunded to Customer' && order.paymentStatus !== 'Refunded' && (
            <label className="flex items-center gap-2 text-xs font-medium text-[#0F172A]">
              <input
                type="checkbox"
                checked={markOrderRefunded}
                onChange={(e) => setMarkOrderRefunded(e.target.checked)}
                className="w-4 h-4 accent-[#0B3B6D]"
              />
              <span>Also mark Order {order.orderId} payment status as &ldquo;Refunded&rdquo;</span>
            </label>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#FECACA] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Return</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#DC2626] text-white text-xs font-semibold"
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs"
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#475569]"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#082D54] disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Update</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {zoomPhoto && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoomPhoto(null)}
        >
          <div className="relative max-w-xl w-full bg-white rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomPhoto(null)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/70 text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={zoomPhoto} alt="Customer return proof" className="w-full max-h-[80vh] object-contain bg-[#0F172A]" />
          </div>
        </div>
      )}
    </div>
  );
}

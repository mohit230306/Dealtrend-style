import { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookmarkCheck,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  PackageCheck,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { compressImageFileToDataUrl } from '../lib/imageUpload';
import type {
  OrderStatus,
  PublicCancelRequest,
  PublicOrder,
  PublicReturnRequest,
  ReturnRequestType,
  ReturnStatus,
} from '../types';
import { postJsonWithRetry } from '../utils/api';
import { formatDateTime, formatPrice } from '../utils/format';
import {
  removeSavedOrderFromDevice,
  syncTrackedOrderToDevice,
  type SavedCustomerOrder,
} from '../utils/recentOrders';
import { ReturnGuidelinesSection, SevenDayReturnLogo } from './ReturnPolicyBadge';

interface OrderTrackingViewProps {
  currencySymbol: string;
  initialOrderId?: string;
  initialMobile?: string;
  savedOrders?: SavedCustomerOrder[];
  onSavedOrdersChange?: (orders: SavedCustomerOrder[]) => void;
  onOpenSupport?: () => void;
}

const STEPS: OrderStatus[] = ['New', 'Confirmed', 'Processing', 'Shipped', 'Delivered'];
const RETURN_STEPS: ReturnStatus[] = [
  'Requested',
  'Approved',
  'Pickup Scheduled',
  'Picked Up',
  'Completed',
];
const RETURN_REASONS = [
  'Damaged / Broken Product',
  'Wrong Product / Color Received',
  'Size / Fit Issue',
  'Defective / Not Working',
  'Missing Item / Accessory',
  'Quality Not as Expected',
];
const CANCEL_REASONS = [
  'Ordered by mistake',
  'Selected wrong size / color / variant',
  'Want to change delivery address or mobile number',
  'Changed my mind / No longer needed',
  'Want to change payment method (COD / Online)',
  'Other reason',
];

export function OrderTrackingView({
  currencySymbol,
  initialOrderId = '',
  initialMobile = '',
  savedOrders = [],
  onSavedOrdersChange,
  onOpenSupport,
}: OrderTrackingViewProps) {
  const [orderId, setOrderId] = useState(initialOrderId);
  const [mobileNumber, setMobileNumber] = useState(initialMobile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trackedOrder, setTrackedOrder] = useState<Partial<PublicOrder> | null>(null);
  const [returnRequest, setReturnRequest] = useState<PublicReturnRequest | null>(null);
  const [cancelRequest, setCancelRequest] = useState<PublicCancelRequest | null>(null);
  const [copiedSavedId, setCopiedSavedId] = useState<string | null>(null);

  // Cancel request form state (New / Confirmed orders before dispatch)
  const [cancelFormOpen, setCancelFormOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelUpiId, setCancelUpiId] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');

  // Return request form state
  const [returnFormOpen, setReturnFormOpen] = useState(false);
  const [requestType, setRequestType] = useState<ReturnRequestType>('Return & Refund');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [customerUpiId, setCustomerUpiId] = useState('');
  const [details, setDetails] = useState('');
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [openingVideoConfirmed, setOpeningVideoConfirmed] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [returnSuccess, setReturnSuccess] = useState('');

  const performLookup = async (id: string, phone: string) => {
    setError('');
    setTrackedOrder(null);
    setReturnRequest(null);
    setCancelRequest(null);
    setCancelFormOpen(false);
    setCancelError('');
    setCancelSuccess('');
    setReturnFormOpen(false);
    setReturnError('');
    setReturnSuccess('');
    if (!id.trim() || phone.replace(/\D/g, '').length < 10) {
      setError('Please enter both your Order ID and 10-digit Mobile Number.');
      return;
    }

    setLoading(true);
    try {
      const result = await postJsonWithRetry<{
        order?: Partial<PublicOrder>;
        returnRequest?: PublicReturnRequest | null;
        cancelRequest?: PublicCancelRequest | null;
        error?: string;
      }>(
        '/api/orders/track',
        {
          orderId: id.trim(),
          mobileNumber: phone.trim(),
        },
        { retries: 2, timeoutMs: 15000 }
      );
      if (!result.ok || !result.data?.order) {
        setError(
          result.errorMessage || result.data?.error || 'No matching order found.'
        );
      } else {
        setTrackedOrder(result.data.order);
        setReturnRequest(result.data.returnRequest ?? null);
        setCancelRequest(result.data.cancelRequest ?? null);
        const updated = syncTrackedOrderToDevice(id, phone, result.data.order);
        onSavedOrdersChange?.(updated);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialOrderId) {
      setOrderId(initialOrderId);
    }
    if (initialMobile) {
      setMobileNumber(initialMobile);
    }
    if (initialOrderId && initialMobile) {
      void performLookup(initialOrderId, initialMobile);
    }
  }, [initialOrderId, initialMobile]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void performLookup(orderId, mobileNumber);
  };

  const handleQuickTrack = (saved: SavedCustomerOrder) => {
    setOrderId(saved.orderId);
    setMobileNumber(saved.mobileNumber);
    void performLookup(saved.orderId, saved.mobileNumber);
  };

  const handleRemoveSaved = (id: string) => {
    const updated = removeSavedOrderFromDevice(id);
    onSavedOrdersChange?.(updated);
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setReturnError('');
    setUploadingProof(true);
    try {
      const next: string[] = [];
      const limit = Math.max(0, 3 - proofImages.length);
      for (const file of Array.from(files).slice(0, limit)) {
        const compressed = await compressImageFileToDataUrl(file, 560, 0.65);
        next.push(compressed);
      }
      setProofImages((prev) => [...prev, ...next].slice(0, 3));
    } catch {
      setReturnError('Could not process selected photo. Please try a smaller image.');
    } finally {
      setUploadingProof(false);
      e.target.value = '';
    }
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackedOrder?.orderId || submittingReturn) return;
    setReturnError('');
    setReturnSuccess('');

    if (requestType === 'Return & Refund' && (!customerUpiId.trim() || !customerUpiId.includes('@'))) {
      setReturnError('Please enter a valid UPI ID (e.g. name@okaxis) to receive your refund.');
      return;
    }
    if (details.trim().length < 5) {
      setReturnError('Please describe the issue briefly (at least 5 characters).');
      return;
    }
    if (proofImages.length === 0) {
      setReturnError('Please upload at least 1 clear photo of the product and shipping label.');
      return;
    }
    if (!openingVideoConfirmed) {
      setReturnError(
        'Please confirm that you have recorded an uncut parcel opening video and uploaded clear product & label photos.'
      );
      return;
    }

    setSubmittingReturn(true);
    try {
      const result = await postJsonWithRetry<{
        ok?: boolean;
        returnRequest?: PublicReturnRequest;
        error?: string;
      }>(
        '/api/returns',
        {
          orderId: trackedOrder.orderId,
          mobileNumber: mobileNumber.trim(),
          requestType,
          reason,
          details: details.trim(),
          customerUpiId: requestType === 'Return & Refund' ? customerUpiId.trim() : '',
          proofImages,
        },
        { retries: 2, timeoutMs: 25000 }
      );

      if (!result.ok || !result.data?.returnRequest) {
        setReturnError(
          result.errorMessage || result.data?.error || 'Could not submit return request.'
        );
      } else {
        setReturnRequest(result.data.returnRequest);
        setReturnFormOpen(false);
        setReturnSuccess('Return / Replacement request submitted! Track pickup updates below.');
      }
    } finally {
      setSubmittingReturn(false);
    }
  };

  const handleSubmitCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackedOrder?.orderId || submittingCancel) return;
    setCancelError('');
    setCancelSuccess('');

    if (cancelUpiId.trim() && !cancelUpiId.trim().includes('@')) {
      setCancelError('Please enter a valid UPI ID (e.g. name@okaxis) or leave it blank.');
      return;
    }

    setSubmittingCancel(true);
    try {
      const result = await postJsonWithRetry<{
        ok?: boolean;
        cancelRequest?: PublicCancelRequest;
        error?: string;
      }>(
        '/api/orders/cancel-request',
        {
          orderId: trackedOrder.orderId,
          mobileNumber: mobileNumber.trim(),
          reason: cancelReason,
          note: cancelNote.trim(),
          customerUpiId:
            trackedOrder.paymentMethod === 'Online' ? cancelUpiId.trim() : '',
        },
        { retries: 2, timeoutMs: 15000 }
      );

      if (!result.ok || !result.data?.cancelRequest) {
        setCancelError(
          result.errorMessage || result.data?.error || 'Could not submit cancellation request.'
        );
      } else {
        setCancelRequest(result.data.cancelRequest);
        setCancelFormOpen(false);
        setCancelNote('');
        setCancelUpiId('');
        setCancelSuccess(
          'Cancellation request received! Our team will review and stop dispatch before shipping.'
        );
      }
    } finally {
      setSubmittingCancel(false);
    }
  };

  const currentStepIndex = trackedOrder?.orderStatus
    ? STEPS.indexOf(trackedOrder.orderStatus as OrderStatus)
    : -1;
  const currentReturnStepIndex = returnRequest
    ? RETURN_STEPS.indexOf(returnRequest.returnStatus)
    : -1;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-28 md:pb-16">
      <div className="mb-6">
        <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
          My Orders &amp; Live Tracking
        </h1>
        <p className="text-sm text-[#475569] mt-1.5">
          Your recent orders on this phone are saved below automatically. Or enter any Order ID and mobile number to track delivery or request a 7-day return.
        </p>
      </div>

      {/* Saved Orders on This Device */}
      {savedOrders.length > 0 && (
        <section className="mb-6 bg-white border border-[#0B3B6D]/25 rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookmarkCheck className="w-4 h-4 text-[#0B3B6D]" />
              <h2 className="text-sm font-semibold text-[#0F172A]">
                Your Recent Orders ({savedOrders.length})
              </h2>
            </div>
            <span className="text-[11px] text-[#64748B]">Saved on this device</span>
          </div>

          <div className="space-y-2.5">
            {savedOrders.map((saved) => {
              const isSelected = trackedOrder?.orderId === saved.orderId;
              return (
                <div
                  key={saved.orderId}
                  className={`rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    isSelected
                      ? 'border-[#0B3B6D] bg-[#F0F7FF]'
                      : 'border-[#E2E8F0] bg-[#F8FAFC]'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#0F172A] select-all">
                        {saved.orderId}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(saved.orderId).then(() => {
                            setCopiedSavedId(saved.orderId);
                            window.setTimeout(() => setCopiedSavedId(null), 1800);
                          });
                        }}
                        aria-label={`Copy Order ID ${saved.orderId}`}
                        className="px-2 py-0.5 rounded-md border border-[#CBD5E1] bg-white text-[11px] font-medium text-[#334155] hover:bg-[#F1F5F9] inline-flex items-center gap-1"
                      >
                        {copiedSavedId === saved.orderId ? (
                          <>
                            <Check className="w-3 h-3 text-[#15803D]" />
                            <span className="text-[#15803D]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          saved.orderStatus === 'Cancelled'
                            ? 'bg-[#FEE2E2] text-[#991B1B]'
                            : saved.orderStatus === 'Delivered'
                            ? 'bg-[#DCFCE7] text-[#166534]'
                            : 'bg-[#E0F2FE] text-[#075985]'
                        }`}
                      >
                        {saved.orderStatus}
                      </span>
                    </div>
                    {saved.productNames && (
                      <p className="text-xs text-[#334155] line-clamp-1">{saved.productNames}</p>
                    )}
                    <p className="text-[11px] text-[#64748B] tabular-nums">
                      {formatDateTime(saved.timestamp)} ·{' '}
                      <strong className="text-[#0F172A]">
                        {formatPrice(saved.totalAmount, currencySymbol)}
                      </strong>{' '}
                      · {saved.paymentMethod} ({saved.paymentStatus})
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleQuickTrack(saved)}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold hover:bg-[#082D54] inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Track Live</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSaved(saved.orderId)}
                      title="Remove from this device"
                      aria-label={`Remove saved order ${saved.orderId}`}
                      className="w-9 h-9 rounded-xl border border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#B91C1C] hover:border-[#FECACA] flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1.5">
              Order ID
            </label>
            <input
              type="text"
              required
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="e.g. ORD-20261115-A1B2"
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1.5">
              Mobile Number
            </label>
            <input
              type="tel"
              inputMode="numeric"
              required
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="10-digit mobile number"
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
            />
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#991B1B]">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-[#0B3B6D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#082D54] transition-colors disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Checking Status...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Track Order</span>
              </>
            )}
          </button>

          {onOpenSupport && (
            <button
              type="button"
              onClick={onOpenSupport}
              className="text-xs font-medium text-[#475569] hover:text-[#0B3B6D] underline underline-offset-2"
            >
              Ordered on another phone &amp; forgot Order ID? Ask Support
            </button>
          )}
        </div>
      </form>

      {trackedOrder && (
        <div className="mt-6 space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#F1F5F9]">
              <div>
                <p className="text-xs text-[#64748B]">Order ID</p>
                <p className="font-mono text-base font-semibold text-[#0F172A]">
                  {trackedOrder.orderId}
                </p>
                {trackedOrder.timestamp && (
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Placed {formatDateTime(trackedOrder.timestamp)}
                  </p>
                )}
              </div>

              <div className="text-left sm:text-right">
                <p className="text-xs text-[#64748B]">Current Status</p>
                <p className="text-base font-semibold text-[#0B3B6D] inline-flex items-center gap-1.5">
                  {trackedOrder.orderStatus === 'Cancelled' ? (
                    <>
                      <XCircle className="w-4 h-4 text-[#B91C1C]" />
                      <span className="text-[#B91C1C]">Cancelled</span>
                    </>
                  ) : (
                    <>
                      <PackageCheck className="w-4 h-4" />
                      <span>{trackedOrder.orderStatus}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {trackedOrder.orderStatus !== 'Cancelled' && (
              <div className="grid grid-cols-5 gap-2">
                {STEPS.map((step, index) => {
                  const completed = currentStepIndex >= index;
                  return (
                    <div key={step} className="flex flex-col items-center text-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border ${
                          completed
                            ? 'bg-[#0B3B6D] border-[#0B3B6D] text-white'
                            : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]'
                        }`}
                      >
                        {completed ? <Check className="w-4 h-4" /> : index + 1}
                      </div>
                      <span
                        className={`text-[11px] leading-tight ${
                          completed ? 'font-semibold text-[#0F172A]' : 'text-[#64748B]'
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 text-sm">
              <div>
                <span className="text-xs text-[#64748B] block">Total Amount</span>
                <span className="font-semibold tabular-nums text-[#0F172A]">
                  {formatPrice(Number(trackedOrder.totalAmount || 0), currencySymbol)}
                </span>
              </div>
              <div>
                <span className="text-xs text-[#64748B] block">Payment Method</span>
                <span className="font-medium text-[#0F172A]">
                  {trackedOrder.paymentMethod} ({trackedOrder.paymentStatus})
                </span>
              </div>
              <div>
                <span className="text-xs text-[#64748B] block">Destination</span>
                <span className="font-medium text-[#0F172A]">
                  {trackedOrder.city}, {trackedOrder.state} - {trackedOrder.pincode}
                </span>
              </div>
            </div>

            {Array.isArray(trackedOrder.items) && trackedOrder.items.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-[#475569] uppercase tracking-wide">
                  Items in Order
                </h2>
                <div className="divide-y divide-[#F1F5F9] border border-[#E2E8F0] rounded-xl px-4">
                  {trackedOrder.items.map((item, idx) => (
                    <div
                      key={`${item.productId}-${item.selectedColor || ''}-${item.selectedSize || ''}-${idx}`}
                      className="py-2.5 flex items-center justify-between text-sm"
                    >
                      <div>
                        <span className="font-medium text-[#0F172A]">{item.productName}</span>
                        {(item.selectedColor || item.selectedSize) && (
                          <span className="block text-xs font-medium text-[#0B3B6D]">
                            {[
                              item.selectedColor ? `Color: ${item.selectedColor}` : '',
                              item.selectedSize ? `Size: ${item.selectedSize}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                        <span className="block text-xs font-mono text-[#64748B]">
                          {item.productCode} · Qty {item.quantity}
                        </span>
                      </div>
                      <span className="font-semibold tabular-nums">
                        {formatPrice(item.lineTotal, currencySymbol)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* PRE-DISPATCH ORDER CANCELLATION SECTION */}
          {cancelSuccess && (
            <div className="p-4 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] text-xs font-medium text-[#15803D] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{cancelSuccess}</span>
            </div>
          )}

          {cancelRequest ? (
            <div
              className={`rounded-2xl border p-5 sm:p-6 space-y-4 ${
                cancelRequest.cancelStatus === 'Requested'
                  ? 'bg-[#FFFBEB] border-[#FDE68A]'
                  : cancelRequest.cancelStatus === 'Approved'
                  ? 'bg-[#FEF2F2] border-[#FECACA]'
                  : 'bg-[#F0F7FF] border-[#BFDBFE]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-black/5">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">
                    Order Cancellation Request
                  </span>
                  <h2 className="font-editorial text-lg font-semibold text-[#0F172A] mt-0.5">
                    {cancelRequest.cancelStatus === 'Requested'
                      ? 'Cancellation Request Pending Review'
                      : cancelRequest.cancelStatus === 'Approved'
                      ? 'Cancellation Approved'
                      : 'Cancellation Request Declined'}
                  </h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Submitted {formatDateTime(cancelRequest.createdAt)} · Reason: {cancelRequest.reason}
                  </p>
                </div>

                <span
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    cancelRequest.cancelStatus === 'Requested'
                      ? 'bg-[#D97706] text-white'
                      : cancelRequest.cancelStatus === 'Approved'
                      ? 'bg-[#DC2626] text-white'
                      : 'bg-[#0B3B6D] text-white'
                  }`}
                >
                  {cancelRequest.cancelStatus}
                </span>
              </div>

              {(cancelRequest.note || cancelRequest.maskedUpiId) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white/80 border border-[#E2E8F0] rounded-xl p-3.5 text-xs">
                  {cancelRequest.note && (
                    <div>
                      <span className="text-[#64748B] block">Your Note</span>
                      <span className="font-medium text-[#0F172A]">{cancelRequest.note}</span>
                    </div>
                  )}
                  {cancelRequest.maskedUpiId && (
                    <div>
                      <span className="text-[#64748B] block">Refund UPI ID</span>
                      <span className="font-mono font-medium text-[#0F172A]">
                        {cancelRequest.maskedUpiId}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {cancelRequest.adminNote ? (
                <div className="p-3.5 rounded-xl bg-white border border-[#E2E8F0] text-xs text-[#0F172A]">
                  <span className="font-semibold text-[#0B3B6D] block mb-0.5">
                    Store Team Update:
                  </span>
                  <span>{cancelRequest.adminNote}</span>
                </div>
              ) : (
                cancelRequest.cancelStatus === 'Requested' && (
                  <p className="text-xs text-[#92400E] leading-relaxed">
                    Your request has been flagged to our fulfillment team so we hold dispatch and review it promptly.
                  </p>
                )
              )}
            </div>
          ) : (trackedOrder.orderStatus === 'New' || trackedOrder.orderStatus === 'Confirmed') ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
                    Need to Cancel This Order?
                  </h2>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Ordered by mistake or want to change size/address? Request cancellation now before dispatch starts.
                  </p>
                </div>

                {!cancelFormOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelError('');
                      setCancelFormOpen(true);
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] text-xs font-semibold hover:bg-[#FEE2E2] inline-flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Request Order Cancellation</span>
                  </button>
                )}
              </div>

              {cancelFormOpen && (
                <form
                  onSubmit={handleSubmitCancel}
                  className="pt-4 border-t border-[#F1F5F9] space-y-4"
                >
                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1.5">
                      Reason for Cancellation *
                    </label>
                    <select
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                    >
                      {CANCEL_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  {trackedOrder.paymentMethod === 'Online' && (
                    <div>
                      <label className="block text-xs font-medium text-[#475569] mb-1.5">
                        Your UPI ID for Refund (Optional)
                      </label>
                      <input
                        type="text"
                        value={cancelUpiId}
                        onChange={(e) => setCancelUpiId(e.target.value)}
                        placeholder="e.g. yourname@okicici or 98XXXXXXXX@ybl"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-mono"
                      />
                      <p className="text-[11px] text-[#64748B] mt-1">
                        If your UPI payment was already completed, share your UPI ID so our team can refund you after approval.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1.5">
                      Additional Note (Optional)
                    </label>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={cancelNote}
                      onChange={(e) => setCancelNote(e.target.value)}
                      placeholder="Any extra detail (e.g. want to reorder in a different size)..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                    />
                  </div>

                  {cancelError && (
                    <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#991B1B] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{cancelError}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={submittingCancel}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#DC2626] text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#B91C1C] disabled:opacity-60"
                    >
                      {submittingCancel ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Submitting Request...</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4" />
                          <span>Submit Cancel Request</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCancelFormOpen(false);
                        setCancelError('');
                      }}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]"
                    >
                      Keep Order
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}

          {/* RETURN & REPLACEMENT SECTION */}
          {returnSuccess && (
            <div className="p-4 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] text-xs font-medium text-[#15803D] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{returnSuccess}</span>
            </div>
          )}

          {returnRequest ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#F1F5F9]">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#0B3B6D]">
                    {returnRequest.requestType}
                  </span>
                  <h2 className="font-editorial text-lg font-semibold text-[#0F172A] mt-0.5">
                    Return / Replacement Status
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Submitted {formatDateTime(returnRequest.createdAt)} · Reason: {returnRequest.reason}
                  </p>
                </div>

                <span
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    returnRequest.returnStatus === 'Rejected'
                      ? 'bg-[#FEF2F2] text-[#B91C1C]'
                      : returnRequest.returnStatus === 'Completed'
                      ? 'bg-[#F0FDF4] text-[#15803D]'
                      : 'bg-[#F0F7FF] text-[#0B3B6D]'
                  }`}
                >
                  {returnRequest.returnStatus}
                </span>
              </div>

              {returnRequest.returnStatus !== 'Rejected' && (
                <div className="grid grid-cols-5 gap-2">
                  {RETURN_STEPS.map((step, idx) => {
                    const done = currentReturnStepIndex >= idx;
                    return (
                      <div key={step} className="flex flex-col items-center text-center gap-1.5">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold border ${
                            done
                              ? 'bg-[#C24D06] border-[#C24D06] text-white'
                              : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]'
                          }`}
                        >
                          {done ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                        </div>
                        <span
                          className={`text-[10px] sm:text-[11px] leading-tight ${
                            done ? 'font-semibold text-[#0F172A]' : 'text-[#64748B]'
                          }`}
                        >
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 text-xs">
                <div>
                  <span className="text-[#64748B] block">Refund Status</span>
                  <span className="font-semibold text-[#0F172A]">{returnRequest.refundStatus}</span>
                </div>
                {returnRequest.maskedUpiId && (
                  <div>
                    <span className="text-[#64748B] block">Refund UPI ID</span>
                    <span className="font-mono font-medium text-[#0F172A]">
                      {returnRequest.maskedUpiId}
                    </span>
                  </div>
                )}
                {returnRequest.meeshoReturnId && (
                  <div>
                    <span className="text-[#64748B] block">Pickup / Return Tracking ID</span>
                    <span className="font-mono font-semibold text-[#0B3B6D]">
                      {returnRequest.meeshoReturnId}
                    </span>
                  </div>
                )}
                {returnRequest.pickupNote && (
                  <div>
                    <span className="text-[#64748B] block">Pickup Schedule</span>
                    <span className="font-medium text-[#0F172A]">{returnRequest.pickupNote}</span>
                  </div>
                )}
              </div>

              {returnRequest.adminNote && (
                <div className="p-3.5 rounded-xl bg-[#F0F7FF] border border-[#0B3B6D]/20 text-xs text-[#0B3B6D]">
                  <span className="font-semibold block mb-0.5">Support Team Update:</span>
                  <span>{returnRequest.adminNote}</span>
                </div>
              )}

              {returnRequest.proofImages.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-[#475569] block">
                    Submitted Proof Photos
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {returnRequest.proofImages.map((img, i) => (
                      <img
                        key={`proof-${i}`}
                        src={img}
                        alt={`Return proof ${i + 1}`}
                        className="w-16 h-16 rounded-xl object-cover border border-[#E2E8F0]"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : trackedOrder.orderStatus === 'Delivered' ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <SevenDayReturnLogo size="sm" />
                  <div>
                    <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
                      7-Day Return or Replacement
                    </h2>
                    <p className="text-xs text-[#475569] mt-0.5">
                      Received a damaged, wrong, or defective item? Keep your uncut parcel opening video ready and upload clear photos below.
                    </p>
                  </div>
                </div>

                {!returnFormOpen && (
                  <button
                    type="button"
                    onClick={() => setReturnFormOpen(true)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#C24D06] text-white text-xs font-semibold hover:bg-[#A84005] shrink-0"
                  >
                    Request Return / Exchange
                  </button>
                )}
              </div>

              {returnFormOpen && (
                <form onSubmit={handleSubmitReturn} className="pt-4 border-t border-[#F1F5F9] space-y-4">
                  <div className="p-3.5 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] text-xs text-[#9A3412] space-y-1">
                    <p className="font-semibold text-[#7C2D12]">
                      Mandatory Return Verification Requirements
                    </p>
                    <p className="leading-relaxed">
                      1. <strong>Uncut Parcel Opening Video:</strong> Keep a continuous unboxing video starting from the sealed parcel &amp; shipping label ready if requested by our team on WhatsApp/Support.
                    </p>
                    <p className="leading-relaxed">
                      2. <strong>Proper Proof Photos:</strong> Upload clear, well-lit photos below showing both the shipping label and the product issue.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#475569] mb-1.5">
                        Request Type *
                      </label>
                      <select
                        value={requestType}
                        onChange={(e) => setRequestType(e.target.value as ReturnRequestType)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                      >
                        <option value="Return & Refund">Return &amp; Refund</option>
                        <option value="Replacement">Replacement / Exchange</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#475569] mb-1.5">
                        Reason *
                      </label>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                      >
                        {RETURN_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {requestType === 'Return & Refund' && (
                    <div>
                      <label className="block text-xs font-medium text-[#475569] mb-1.5">
                        Your UPI ID for Refund *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerUpiId}
                        onChange={(e) => setCustomerUpiId(e.target.value)}
                        placeholder="e.g. yourname@okicici or 98XXXXXXXX@ybl"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-mono"
                      />
                      <p className="text-[11px] text-[#64748B] mt-1">
                        Refund is transferred directly to this UPI ID after reverse pickup verification.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1.5">
                      Describe the Issue *
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder="Explain what is wrong, missing, or damaged (or preferred exchange size)..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#475569]">
                      Upload Proof Photos * (1–3 photos showing product &amp; shipping label)
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      {proofImages.map((img, idx) => (
                        <div
                          key={`upload-proof-${idx}`}
                          className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#F1F5F9]"
                        >
                          <img
                            src={img}
                            alt={`Proof ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setProofImages((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label="Remove proof photo"
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}

                      {proofImages.length < 3 && (
                        <label className="min-h-[44px] px-4 py-2.5 rounded-xl border border-dashed border-[#0B3B6D]/40 bg-[#F8FAFC] text-xs font-semibold text-[#0B3B6D] inline-flex items-center gap-2 cursor-pointer hover:bg-[#F0F7FF]">
                          {uploadingProof ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          <span>
                            {uploadingProof ? 'Compressing...' : `Add Photos (${proofImages.length}/3)`}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={uploadingProof}
                            onChange={(e) => void handleProofUpload(e)}
                            className="sr-only"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] cursor-pointer text-xs text-[#0F172A]">
                    <input
                      type="checkbox"
                      checked={openingVideoConfirmed}
                      onChange={(e) => setOpeningVideoConfirmed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#0B3B6D] shrink-0"
                    />
                    <span className="leading-relaxed">
                      I confirm that I have a <strong>continuous parcel opening video</strong> (with shipping label visible), uploaded <strong>proper product &amp; label photos</strong>, and kept the item in original unused packaging.
                    </span>
                  </label>

                  {returnError && (
                    <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#991B1B] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{returnError}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={submittingReturn || uploadingProof}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#C24D06] text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#A84005] disabled:opacity-60"
                    >
                      {submittingReturn ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Submitting Request...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-4 h-4" />
                          <span>Submit Return Request</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturnFormOpen(false)}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            trackedOrder.orderStatus !== 'Cancelled' && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#475569]">
                <span>
                  {trackedOrder.orderStatus === 'Processing' || trackedOrder.orderStatus === 'Shipped' ? (
                    <>
                      This order is already <strong>{trackedOrder.orderStatus}</strong>, so direct cancellation is closed. 7-Day Return / Replacement opens here once <strong>Delivered</strong>.
                    </>
                  ) : (
                    <>
                      7-Day Return / Replacement becomes available here once your order is{' '}
                      <strong>Delivered</strong>. Need help with your order?
                    </>
                  )}
                </span>
                {onOpenSupport && (
                  <button
                    type="button"
                    onClick={onOpenSupport}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-white font-semibold text-[#0B3B6D] shrink-0 hover:bg-[#F1F5F9]"
                  >
                    Contact Support
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}

      <div className="mt-8">
        <ReturnGuidelinesSection compact />
      </div>
    </div>
  );
}

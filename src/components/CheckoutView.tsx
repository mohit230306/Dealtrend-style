import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  Lock,
  ShieldAlert,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { compressImageFileToDataUrl } from '../lib/imageUpload';
import type { CartItem, PaymentMethod, PublicOrder, PublicStoreSettings } from '../types';
import { postJsonWithRetry } from '../utils/api';
import {
  formatPrice,
  isValidMobile,
  isValidPincode,
  normalizeUpiUtr,
  validateUpiUtr,
} from '../utils/format';
import { SevenDayReturnLogo } from './ReturnPolicyBadge';

interface CheckoutViewProps {
  items: CartItem[];
  settings: PublicStoreSettings;
  onBack: () => void;
  onOrderSuccess: (order: PublicOrder) => void;
}

export function CheckoutView({
  items,
  settings,
  onBack,
  onOrderSuccess,
}: CheckoutViewProps) {
  const defaultPayment: PaymentMethod = settings.codEnabled ? 'COD' : 'Online';

  const [customerName, setCustomerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [landmark, setLandmark] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultPayment);
  const [paymentReference, setPaymentReference] = useState('');
  const [confirmPaymentReference, setConfirmPaymentReference] = useState('');
  const [paymentProofImage, setPaymentProofImage] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofError, setProofError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Stable idempotency key per checkout session to prevent duplicate orders on double tap
  const idempotencyKey = useMemo(
    () => `chk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    []
  );

  const getItemUnitPrice = (item: CartItem, method: PaymentMethod) =>
    method === 'Online' && item.onlinePrice && item.onlinePrice > 0
      ? item.onlinePrice
      : item.sellingPrice;

  const codSubtotal = items.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
  const codShippingFee =
    items.length === 0 ? 0 : codSubtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFee;
  const codTotalAmount = codSubtotal + codShippingFee;

  const onlineSubtotal = items.reduce(
    (sum, item) => sum + getItemUnitPrice(item, 'Online') * item.quantity,
    0
  );
  const onlineShippingFee =
    items.length === 0
      ? 0
      : onlineSubtotal >= settings.freeShippingThreshold
      ? 0
      : settings.shippingFee;
  const onlineTotalAmount = onlineSubtotal + onlineShippingFee;

  const subtotal = paymentMethod === 'Online' ? onlineSubtotal : codSubtotal;
  const shippingFee = paymentMethod === 'Online' ? onlineShippingFee : codShippingFee;
  const totalAmount = paymentMethod === 'Online' ? onlineTotalAmount : codTotalAmount;
  const codAmount = paymentMethod === 'COD' ? totalAmount : 0;

  const cleanUpiId = settings.upiId.trim();
  const upiPayHref = cleanUpiId
    ? `upi://pay?pa=${encodeURIComponent(cleanUpiId)}&pn=${encodeURIComponent(
        settings.storeName || 'DealTrend'
      )}&am=${onlineTotalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(
        `${settings.storeName || 'DealTrend'} Order`
      )}`
    : '';

  const utrValidation = useMemo(() => validateUpiUtr(paymentReference), [paymentReference]);

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProofError('Please upload a valid image screenshot (JPG, PNG, or WEBP).');
      return;
    }
    setProofError('');
    setUploadingProof(true);
    try {
      let dataUrl = await compressImageFileToDataUrl(file, 720, 0.72);
      if (dataUrl.length > 240000) {
        dataUrl = await compressImageFileToDataUrl(file, 520, 0.5);
      }
      if (
        !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUrl) ||
        dataUrl.length > 250000
      ) {
        setProofError(
          'Screenshot file is too large or unsupported. Please upload a standard JPG/PNG screenshot.'
        );
        return;
      }
      setPaymentProofImage(dataUrl);
    } catch {
      setProofError('Could not process screenshot. Please try uploading again.');
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    if (items.length === 0) {
      setError('Your cart is empty.');
      return;
    }
    if (customerName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!isValidMobile(mobileNumber)) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address or leave it empty.');
      return;
    }
    if (fullAddress.trim().length < 6) {
      setError('Please enter your complete street address, house/flat number.');
      return;
    }
    if (city.trim().length < 2 || stateName.trim().length < 2) {
      setError('Please enter both City and State.');
      return;
    }
    if (!isValidPincode(pincode)) {
      setError('Please enter a valid 6-digit Pincode.');
      return;
    }
    if (paymentMethod === 'Online') {
      if (!cleanUpiId) {
        setError('Store UPI ID is not configured yet. Please choose Cash on Delivery.');
        return;
      }
      const check = validateUpiUtr(paymentReference);
      if (!check.valid) {
        setError(
          check.error || 'Please enter a valid 12-digit numeric UPI UTR / Reference number.'
        );
        return;
      }
      if (normalizeUpiUtr(confirmPaymentReference) !== check.utr) {
        setError(
          'Re-entered 12-digit UTR does not match. Please double-check your UPI UTR number from your payment app or bank SMS.'
        );
        return;
      }
    }

    setSubmitting(true);
    const result = await postJsonWithRetry<{ order?: PublicOrder; error?: string }>(
      '/api/orders',
      {
        customerName: customerName.trim(),
        mobileNumber: mobileNumber.trim(),
        email: email.trim(),
        fullAddress: fullAddress.trim(),
        city: city.trim(),
        state: stateName.trim(),
        pincode: pincode.trim(),
        landmark: landmark.trim(),
        paymentMethod,
        paymentReference: paymentMethod === 'Online' ? normalizeUpiUtr(paymentReference) : '',
        paymentProofImage: paymentMethod === 'Online' ? paymentProofImage : '',
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          ...(i.selectedColor ? { selectedColor: i.selectedColor } : {}),
          ...(i.selectedSize ? { selectedSize: i.selectedSize } : {}),
        })),
        idempotencyKey,
      },
      { retries: 2, timeoutMs: 25000 }
    );

    if (!result.ok || !result.data?.order) {
      setError(
        result.errorMessage ||
          result.data?.error ||
          'Could not place order. Please review your details and try again.'
      );
      setSubmitting(false);
      return;
    }

    onOrderSuccess(result.data.order);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-28 md:pb-12">
      <button
        type="button"
        onClick={onBack}
        className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Cart</span>
      </button>

      <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A] mb-6">
        Checkout
      </h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Delivery Details & Payment Selection */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
              1. Delivery Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  Customer Name <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  Mobile Number <span className="text-[#B91C1C]">*</span>
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

              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  Full Address <span className="text-[#B91C1C]">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={fullAddress}
                  onChange={(e) => setFullAddress(e.target.value)}
                  placeholder="House/Flat No., Building, Street, Area"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  City <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Bengaluru"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  State <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  placeholder="e.g. Karnataka"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  Pincode <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit pincode"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">
                  Landmark (optional)
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="Near park, school, etc."
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                />
              </div>
            </div>
          </section>

          {/* Payment Options */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
              2. Payment Method
            </h2>

            <div className="space-y-3">
              {settings.codEnabled && (
                <label
                  className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-colors ${
                    paymentMethod === 'COD'
                      ? 'border-[#0B3B6D] bg-[#0B3B6D]/[0.04]'
                      : 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === 'COD'}
                    onChange={() => setPaymentMethod('COD')}
                    className="mt-1 accent-[#0B3B6D] w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#0F172A] inline-flex items-center gap-2">
                        <Banknote className="w-4 h-4 text-[#0B3B6D]" />
                        Cash on Delivery (COD)
                      </span>
                      <span className="text-sm font-semibold text-[#0B3B6D] tabular-nums">
                        {formatPrice(codTotalAmount, settings.currencySymbol)}
                      </span>
                    </div>
                    <p className="text-xs text-[#475569] mt-1">
                      Pay {formatPrice(codTotalAmount, settings.currencySymbol)} in cash or UPI upon delivery. Payment status will be recorded as Pending until collected.
                    </p>
                  </div>
                </label>
              )}

              {settings.onlinePaymentEnabled && (
                <div
                  className={`p-4 rounded-xl border transition-colors ${
                    paymentMethod === 'Online'
                      ? 'border-[#0B3B6D] bg-[#0B3B6D]/[0.04]'
                      : 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <label className="flex items-start gap-3.5 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === 'Online'}
                      onChange={() => setPaymentMethod('Online')}
                      className="mt-1 accent-[#0B3B6D] w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#0F172A] inline-flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-[#0B3B6D]" />
                          {settings.paymentGatewayName || 'Online Payment / UPI'}
                        </span>
                        <span className="text-sm font-semibold text-[#0B3B6D] tabular-nums">
                          {formatPrice(onlineTotalAmount, settings.currencySymbol)}
                        </span>
                      </div>
                      <p className="text-xs text-[#475569] mt-1">
                        {settings.paymentGatewayNote ||
                          'Online orders remain Pending Verification until payment is confirmed by the payment gateway or our verification team.'}
                      </p>
                      {onlineTotalAmount < codTotalAmount && (
                        <p className="text-xs font-semibold text-[#15803D] mt-1 tabular-nums">
                          Online Pay Special Price: Save{' '}
                          {formatPrice(codTotalAmount - onlineTotalAmount, settings.currencySymbol)} compared to COD
                        </p>
                      )}
                    </div>
                  </label>

                  {paymentMethod === 'Online' && (
                    <div className="mt-3 pt-3 pl-0 sm:pl-7 border-t border-[#E2E8F0] space-y-3.5">
                      {cleanUpiId ? (
                        <div className="p-3.5 rounded-xl bg-white border border-[#0B3B6D]/25 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div>
                              <span className="text-[11px] font-semibold text-[#0B3B6D] uppercase tracking-wide block">
                                Step 1 · Pay exact amount via UPI
                              </span>
                              <span className="font-mono font-semibold text-sm text-[#0F172A] select-all">
                                {cleanUpiId}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(cleanUpiId).then(() => {
                                  setCopiedUpi(true);
                                  window.setTimeout(() => setCopiedUpi(false), 2000);
                                });
                              }}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#0F172A] inline-flex items-center gap-1.5"
                            >
                              {copiedUpi ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#15803D]" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy UPI ID</span>
                                </>
                              )}
                            </button>
                          </div>

                          <a
                            href={upiPayHref}
                            className="w-full min-h-[42px] px-4 py-2 rounded-lg bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#082D54] transition-colors"
                          >
                            <span>
                              Open UPI App &amp; Pay{' '}
                              {formatPrice(onlineTotalAmount, settings.currencySymbol)}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ) : (
                        <div className="text-xs bg-[#FFF7ED] border border-[#FED7AA] text-[#9A3412] rounded-lg px-3 py-2.5 font-medium">
                          Store UPI ID is not configured yet. Please contact store support or choose Cash on Delivery.
                        </div>
                      )}

                      {/* Step 2: Mandatory 12-Digit Numeric UPI UTR + Confirm */}
                      <div className="space-y-2.5">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="block text-xs font-semibold text-[#0F172A]">
                              Step 2 · 12-Digit UPI UTR / Reference No.{' '}
                              <span className="text-[#B91C1C]">*</span>
                            </label>
                            <span
                              className={`text-[11px] font-mono font-semibold tabular-nums ${
                                utrValidation.valid ? 'text-[#15803D]' : 'text-[#64748B]'
                              }`}
                            >
                              {paymentReference.length}/12 digits
                            </span>
                          </div>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={12}
                            required={paymentMethod === 'Online'}
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(normalizeUpiUtr(e.target.value))}
                            placeholder="e.g. 429812345678 (from UPI app or bank SMS)"
                            className={`w-full min-h-[44px] px-3 py-2 rounded-lg border bg-white text-sm font-mono tracking-wider tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B3B6D] ${
                              paymentReference.length === 12 && !utrValidation.valid
                                ? 'border-[#DC2626] bg-[#FEF2F2]'
                                : utrValidation.valid
                                ? 'border-[#16A34A] bg-[#F0FDF4]'
                                : 'border-[#CBD5E1]'
                            }`}
                          />
                          {paymentReference.length === 12 && !utrValidation.valid && (
                            <p className="text-[11px] font-medium text-[#B91C1C]">
                              {utrValidation.error}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="block text-xs font-semibold text-[#0F172A]">
                              Confirm 12-Digit UTR Number{' '}
                              <span className="text-[#B91C1C]">*</span>
                            </label>
                            <span
                              className={`text-[11px] font-mono font-semibold tabular-nums ${
                                utrValidation.valid &&
                                confirmPaymentReference === paymentReference
                                  ? 'text-[#15803D]'
                                  : 'text-[#64748B]'
                              }`}
                            >
                              {confirmPaymentReference.length}/12 digits
                            </span>
                          </div>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={12}
                            required={paymentMethod === 'Online'}
                            value={confirmPaymentReference}
                            onChange={(e) =>
                              setConfirmPaymentReference(normalizeUpiUtr(e.target.value))
                            }
                            placeholder="Re-enter the same 12-digit UTR to avoid typos"
                            className={`w-full min-h-[44px] px-3 py-2 rounded-lg border bg-white text-sm font-mono tracking-wider tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B3B6D] ${
                              confirmPaymentReference.length === 12 &&
                              confirmPaymentReference !== paymentReference
                                ? 'border-[#DC2626] bg-[#FEF2F2]'
                                : utrValidation.valid &&
                                  confirmPaymentReference === paymentReference
                                ? 'border-[#16A34A] bg-[#F0FDF4]'
                                : 'border-[#CBD5E1]'
                            }`}
                          />
                          {confirmPaymentReference.length === 12 &&
                            confirmPaymentReference !== paymentReference && (
                              <p className="text-[11px] font-medium text-[#B91C1C]">
                                Both UTR numbers do not match. Please check again.
                              </p>
                            )}
                          {utrValidation.valid &&
                            confirmPaymentReference === paymentReference && (
                              <p className="text-[11px] font-medium text-[#15803D] inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>12-digit UTR verified &amp; matched</span>
                              </p>
                            )}
                        </div>
                      </div>

                      {/* Step 3: Optional Payment Proof Screenshot */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs font-semibold text-[#0F172A]">
                            Step 3 · Payment Screenshot{' '}
                            <span className="font-normal text-[#64748B]">(Optional)</span>
                          </label>
                        </div>
                        {paymentProofImage ? (
                          <div className="p-2.5 rounded-xl bg-white border border-[#16A34A]/40 flex items-center gap-3">
                            <img
                              src={paymentProofImage}
                              alt="Uploaded UPI payment proof"
                              className="w-16 h-16 rounded-lg object-cover border border-[#E2E8F0] shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[#15803D] inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Payment screenshot attached</span>
                              </p>
                              <p className="text-[11px] text-[#64748B] mt-0.5">
                                Helps us verify your payment even faster.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPaymentProofImage('')}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[#FECACA] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] inline-flex items-center gap-1 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center gap-1.5 p-3.5 rounded-xl border border-dashed border-[#CBD5E1] bg-white hover:border-[#0B3B6D] hover:bg-[#F8FAFC] cursor-pointer transition-colors text-center">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleProofUpload}
                              disabled={uploadingProof}
                              className="hidden"
                            />
                            {uploadingProof ? (
                              <>
                                <Loader2 className="w-5 h-5 text-[#0B3B6D] animate-spin" />
                                <span className="text-xs font-medium text-[#0B3B6D]">
                                  Compressing screenshot...
                                </span>
                              </>
                            ) : (
                              <>
                                <UploadCloud className="w-4 h-4 text-[#0B3B6D]" />
                                <span className="text-xs font-semibold text-[#0F172A]">
                                  Upload UPI screenshot (if your app allows)
                                </span>
                                <span className="text-[11px] text-[#64748B]">
                                  PhonePe / Bank app blocks screenshots? Skip this — your 12-digit UTR above is enough.
                                </span>
                              </>
                            )}
                          </label>
                        )}
                        {proofError && (
                          <p className="text-[11px] font-medium text-[#B91C1C]">{proofError}</p>
                        )}
                      </div>

                      <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 text-[11px] text-[#92400E] flex items-start gap-2 leading-relaxed">
                        <ShieldAlert className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                        <span>
                          <strong>Strict Anti-Fraud Check:</strong> Your order is confirmed only after we verify your 12-digit UTR &amp; exact amount ({formatPrice(onlineTotalAmount, settings.currencySymbol)}) in our bank statement. Fake or duplicate UTRs are automatically rejected and cancelled.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right: Complete Order Summary */}
        <aside className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-5 lg:sticky lg:top-24">
          <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
            Order Summary
          </h2>

          <div className="divide-y divide-[#F1F5F9] max-h-72 overflow-y-auto pr-1">
            {items.map((item) => {
              const unit = getItemUnitPrice(item, paymentMethod);
              const lineKey = item.cartKey || item.productId;
              return (
                <div key={lineKey} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0F172A] leading-snug">
                      {item.name}
                    </p>
                    {(item.selectedColor || item.selectedSize) && (
                      <p className="text-xs font-medium text-[#0B3B6D] mt-0.5">
                        {[
                          item.selectedColor ? `Color: ${item.selectedColor}` : '',
                          item.selectedSize ? `Size: ${item.selectedSize}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    <p className="text-xs text-[#64748B] mt-0.5 font-mono">
                      {item.productCode} · Qty {item.quantity} ·{' '}
                      {formatPrice(unit, settings.currencySymbol)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-[#0F172A] tabular-nums shrink-0">
                    {formatPrice(unit * item.quantity, settings.currencySymbol)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[#E2E8F0] space-y-2 text-sm">
            <div className="flex items-center justify-between text-[#475569]">
              <span>Subtotal</span>
              <span className="tabular-nums font-medium text-[#0F172A]">
                {formatPrice(subtotal, settings.currencySymbol)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[#475569]">
              <span>Shipping</span>
              <span className="tabular-nums font-medium text-[#0F172A]">
                {shippingFee === 0 ? 'Free' : formatPrice(shippingFee, settings.currencySymbol)}
              </span>
            </div>
            {paymentMethod === 'COD' && (
              <div className="flex items-center justify-between text-[#475569]">
                <span>COD Payable Amount</span>
                <span className="tabular-nums font-medium text-[#0B3B6D]">
                  {formatPrice(codAmount, settings.currencySymbol)}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-base font-semibold text-[#0F172A]">
              <span>Total Amount</span>
              <span className="tabular-nums">{formatPrice(totalAmount, settings.currencySymbol)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <SevenDayReturnLogo size="sm" />
            <p className="text-[11px] text-[#475569] leading-snug">
              <strong className="text-[#0F172A]">7-Day Easy Return:</strong> Record an uncut parcel opening video &amp; clear photos of the product and shipping label on delivery.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#991B1B]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              submitting ||
              uploadingProof ||
              items.length === 0 ||
              (paymentMethod === 'Online' && !cleanUpiId)
            }
            className="w-full min-h-[50px] px-5 py-3 rounded-xl bg-[#0B3B6D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#082D54] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{paymentMethod === 'Online' ? 'Submitting UPI Proof...' : 'Placing Order...'}</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>
                  {paymentMethod === 'Online'
                    ? `Submit UPI Proof & Place Order · ${formatPrice(totalAmount, settings.currencySymbol)}`
                    : `Place Order · ${formatPrice(totalAmount, settings.currencySymbol)}`}
                </span>
              </>
            )}
          </button>
        </aside>
      </form>
    </div>
  );
}

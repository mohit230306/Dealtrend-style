import { useState } from 'react';
import {
  BookmarkCheck,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  MessageCircle,
  PackageSearch,
  ShieldAlert,
  ShoppingBag,
} from 'lucide-react';
import type { PublicOrder } from '../types';
import { formatDateTime, formatPrice } from '../utils/format';
import { SevenDayReturnLogo } from './ReturnPolicyBadge';

interface OrderSuccessViewProps {
  order: PublicOrder;
  storeName?: string;
  currencySymbol: string;
  onTrackOrder: (orderId: string, mobileNumber: string) => void;
  onContinueShopping: () => void;
}

export function OrderSuccessView({
  order,
  storeName = 'DealTrend',
  currencySymbol,
  onTrackOrder,
  onContinueShopping,
}: OrderSuccessViewProps) {
  const [copiedId, setCopiedId] = useState(false);
  const isPendingUpi = order.paymentMethod === 'Online' && order.paymentStatus !== 'Paid';

  const trackUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?order=${encodeURIComponent(order.orderId)}`
      : '';

  const whatsappSaveText = [
    `*${storeName} — Order Receipt*`,
    `Order ID: *${order.orderId}*`,
    `Amount: ${formatPrice(order.totalAmount, currencySymbol)} (${order.paymentMethod})`,
    order.paymentMethod === 'Online' && order.paymentReference
      ? `UPI UTR: ${order.paymentReference}`
      : '',
    `Items: ${order.productNames}`,
    trackUrl ? `Track Order: ${trackUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappSaveText)}`;

  const handleCopyOrderId = () => {
    void navigator.clipboard.writeText(order.orderId).then(() => {
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 2000);
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 pb-28 md:pb-16">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col items-center text-center">
          {isPendingUpi ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] flex items-center justify-center mb-4">
                <Clock className="w-8 h-8" />
              </div>
              <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
                Order Received — UPI Payment Under Verification
              </h1>
              <p className="text-sm text-[#475569] mt-2 max-w-lg">
                Thank you, {order.customerName}. Your 12-digit UPI UTR has been received. Your order will be confirmed and dispatched only after we verify the payment in our bank account.
              </p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-[#0B3B6D]/10 text-[#0B3B6D] flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
                Order Placed Successfully
              </h1>
              <p className="text-sm text-[#475569] mt-2">
                Thank you, {order.customerName}. Your order has been recorded and will be processed shortly.
              </p>
            </>
          )}
        </div>

        {/* Highlighted Order ID & Instant Save Actions */}
        <div className="rounded-2xl bg-[#F0F7FF] border border-[#0B3B6D]/25 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#0B3B6D] block">
                Your Order ID (Auto-Saved on This Phone)
              </span>
              <span className="font-mono text-lg sm:text-xl font-bold text-[#0F172A] select-all">
                {order.orderId}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyOrderId}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white border border-[#CBD5E1] text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] inline-flex items-center gap-1.5"
            >
              {copiedId ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#15803D]" />
                  <span className="text-[#15803D]">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Order ID</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#0B3B6D]/15 text-xs">
            <span className="text-[#334155] inline-flex items-center gap-1.5">
              <BookmarkCheck className="w-4 h-4 text-[#15803D] shrink-0" />
              <span>
                Saved under <strong>My Orders / Track</strong> even if you close the store.
              </span>
            </span>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534] inline-flex items-center gap-1.5 shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Save on WhatsApp</span>
            </a>
          </div>
        </div>

        {isPendingUpi && (
          <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-4 flex items-start gap-3 text-xs text-[#92400E]">
            <ShieldAlert className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-[#78350F]">
                Bank Verification Required Before Dispatch
              </p>
              <p className="leading-relaxed">
                Our team matches your submitted 12-digit UTR &amp; paid amount directly against our bank/UPI statement. Orders with fake, unmatched, or unpaid UPI references are automatically cancelled.
              </p>
            </div>
          </div>
        )}

        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs text-[#64748B] block">Order ID</span>
            <span className="font-mono font-semibold text-[#0F172A] select-all">
              {order.orderId}
            </span>
          </div>
          <div>
            <span className="text-xs text-[#64748B] block">Placed On</span>
            <span className="font-medium text-[#0F172A]">
              {formatDateTime(order.timestamp)}
            </span>
          </div>
          <div>
            <span className="text-xs text-[#64748B] block">Payment Method</span>
            <span className="font-medium text-[#0F172A]">
              {order.paymentMethod === 'COD' ? 'Cash on Delivery (COD)' : 'Online UPI Payment'}
            </span>
          </div>
          <div>
            <span className="text-xs text-[#64748B] block">Payment Status</span>
            <span
              className={`font-semibold ${
                isPendingUpi ? 'text-[#B45309]' : 'text-[#0F172A]'
              }`}
            >
              {order.paymentStatus}
            </span>
          </div>
          {order.paymentMethod === 'Online' && order.paymentReference && (
            <div className="sm:col-span-2 pt-2 border-t border-[#E2E8F0] flex items-center justify-between gap-2">
              <span className="text-xs text-[#475569]">Submitted 12-Digit UPI UTR</span>
              <span className="font-mono font-semibold text-[#0F172A] select-all">
                {order.paymentReference}
              </span>
            </div>
          )}
          {order.paymentMethod === 'COD' && (
            <div className="sm:col-span-2 pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
              <span className="text-xs text-[#475569]">COD Amount Due at Delivery</span>
              <span className="font-semibold text-[#0B3B6D] tabular-nums">
                {formatPrice(order.codAmount, currencySymbol)}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          <h2 className="text-sm font-semibold text-[#0F172A]">Items Ordered</h2>
          <div className="divide-y divide-[#F1F5F9] border border-[#E2E8F0] rounded-xl px-4">
            {order.items.map((item, idx) => (
              <div
                key={`${item.productId}-${item.selectedColor || ''}-${item.selectedSize || ''}-${idx}`}
                className="py-3 flex items-center justify-between gap-3 text-sm"
              >
                <div>
                  <p className="font-medium text-[#0F172A]">{item.productName}</p>
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
                  <p className="text-xs text-[#64748B] font-mono">
                    {item.productCode} · Qty {item.quantity}
                  </p>
                </div>
                <span className="font-semibold text-[#0F172A] tabular-nums">
                  {formatPrice(item.lineTotal, currencySymbol)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-[#475569] bg-[#F1F5F9] rounded-xl p-4">
          <strong className="text-[#0F172A] block mb-1">Delivery Address</strong>
          {order.fullAddress}, {order.city}, {order.state} - {order.pincode}
          {order.landmark ? ` (Landmark: ${order.landmark})` : ''} · Mobile: {order.mobileNumber}
        </div>

        <div className="flex items-start gap-3.5 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] p-4">
          <SevenDayReturnLogo size="sm" />
          <div className="text-xs text-[#9A3412] space-y-1">
            <p className="font-semibold text-[#7C2D12]">
              7-Day Return Policy — Parcel Opening Video Required
            </p>
            <p className="leading-relaxed">
              When your order arrives, please record a <strong>continuous, uncut parcel opening video</strong> (starting from the sealed parcel &amp; shipping label) and take <strong>clear photos</strong> of the product &amp; label to remain eligible for 7-day return or replacement.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => onTrackOrder(order.orderId, order.mobileNumber)}
            className="min-h-[48px] px-5 py-3 rounded-xl border border-[#0F172A] bg-white text-[#0F172A] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#F1F5F9] transition-colors"
          >
            <PackageSearch className="w-4 h-4" />
            <span>Track Order</span>
          </button>
          <button
            type="button"
            onClick={onContinueShopping}
            className="min-h-[48px] px-5 py-3 rounded-xl bg-[#0B3B6D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#082D54] transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Continue Shopping</span>
          </button>
        </div>
      </div>
    </div>
  );
}

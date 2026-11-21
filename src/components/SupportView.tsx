import { useRef, useState } from 'react';
import { CheckCircle2, Loader2, Mail, MapPin, Phone, RotateCcw, Send } from 'lucide-react';
import type { PublicStoreSettings } from '../types';
import { postJsonWithRetry } from '../utils/api';
import { SevenDayReturnLogo } from './ReturnPolicyBadge';

interface SupportViewProps {
  settings: PublicStoreSettings;
  onNavigateToTrack?: () => void;
}

function createTicketId(): string {
  return `SUP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function SupportView({ settings, onNavigateToTrack }: SupportViewProps) {
  const [name, setName] = useState('');
  const [mobileOrEmail, setMobileOrEmail] = useState('');
  const [orderId, setOrderId] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const [error, setError] = useState('');
  const ticketIdRef = useRef<string>(createTicketId());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSentMessage('');
    setSubmitting(true);

    try {
      const result = await postJsonWithRetry<{
        ok?: boolean;
        ticketId?: string;
        message?: string;
        error?: string;
      }>(
        '/api/support',
        {
          ticketId: ticketIdRef.current,
          name,
          mobileOrEmail,
          orderId,
          message,
        },
        { retries: 2, timeoutMs: 20000 }
      );

      if (!result.ok) {
        setError(result.errorMessage || result.data?.error || 'Could not send message.');
      } else {
        setSentMessage(
          result.data?.message || 'Message received. Our support team will reach out soon.'
        );
        ticketIdRef.current = createTicketId();
        setName('');
        setMobileOrEmail('');
        setOrderId('');
        setMessage('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-28 md:pb-16">
      <div className="mb-8">
        <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
          Customer Support
        </h1>
        <p className="text-sm text-[#475569] mt-1.5">
          Need help with an order, delivery timing, or Cash on Delivery? Reach us directly below.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-5">
            <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
              Contact {settings.storeName}
            </h2>

            {settings.supportPhone && (
              <a
                href={`tel:${settings.supportPhone.replace(/\s+/g, '')}`}
                className="flex items-start gap-3 text-sm text-[#0F172A] hover:text-[#0B3B6D] min-h-[44px]"
              >
                <Phone className="w-4 h-4 mt-0.5 text-[#0B3B6D] shrink-0" />
                <div>
                  <span className="block text-xs text-[#64748B]">Phone / WhatsApp Support</span>
                  <span className="font-medium tabular-nums">{settings.supportPhone}</span>
                </div>
              </a>
            )}

            {settings.supportEmail && (
              <a
                href={`mailto:${settings.supportEmail}`}
                className="flex items-start gap-3 text-sm text-[#0F172A] hover:text-[#0B3B6D] min-h-[44px]"
              >
                <Mail className="w-4 h-4 mt-0.5 text-[#0B3B6D] shrink-0" />
                <div>
                  <span className="block text-xs text-[#64748B]">Email</span>
                  <span className="font-medium">{settings.supportEmail}</span>
                </div>
              </a>
            )}

            {settings.supportAddress && (
              <div className="flex items-start gap-3 text-sm text-[#0F172A]">
                <MapPin className="w-4 h-4 mt-0.5 text-[#0B3B6D] shrink-0" />
                <div>
                  <span className="block text-xs text-[#64748B]">Studio & Dispatch Address</span>
                  <span className="text-[#475569]">{settings.supportAddress}</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#F1F5F9] rounded-2xl p-6 space-y-3 text-xs text-[#475569]">
            <div className="flex items-center gap-3">
              <SevenDayReturnLogo size="sm" />
              <div>
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Shipping, Payment &amp; 7-Day Returns
                </h3>
                <p className="text-[11px] text-[#64748B]">
                  Opening video &amp; clear photos required for returns
                </p>
              </div>
            </div>
            <p>
              Cash on Delivery orders are confirmed quickly and payable directly to the courier partner upon arrival.
            </p>
            <p>
              <strong>7-Day Return Guidelines:</strong> Please record an <strong>uncut parcel opening video</strong> (starting from the sealed shipping label) and take <strong>clear photos</strong> of the product and label. Keep original tags and packaging intact.
            </p>
            <p>
              To submit a return or exchange request for a delivered order, open <strong>Track Order</strong> with your Order ID and mobile number.
            </p>
            {onNavigateToTrack && (
              <button
                type="button"
                onClick={onNavigateToTrack}
                className="mt-1 min-h-[38px] px-3.5 py-2 rounded-xl bg-white border border-[#E2E8F0] text-xs font-semibold text-[#0B3B6D] inline-flex items-center gap-1.5 hover:bg-[#F8FAFC]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Request Return on Track Order</span>
              </button>
            )}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4"
        >
          <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
            Send Us a Message
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Your Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Mobile or Email *
              </label>
              <input
                type="text"
                required
                value={mobileOrEmail}
                onChange={(e) => setMobileOrEmail(e.target.value)}
                placeholder="Phone number or email"
                className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1.5">
              Order ID (optional)
            </label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="e.g. ORD-20261115-..."
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1.5">
              How can we help? *
            </label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your question or request..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#991B1B]">
              {error}
            </div>
          )}

          {sentMessage && (
            <div className="p-3.5 rounded-xl bg-[#0B3B6D]/10 border border-[#0B3B6D]/20 text-xs font-medium text-[#0B3B6D] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{sentMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-[#0B3B6D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#082D54] transition-colors disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Submit Request</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

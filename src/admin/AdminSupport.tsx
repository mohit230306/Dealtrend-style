import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { deleteSupportMessageFromFirestore } from '../lib/firestoreAdmin';
import type { Order, ReturnRequest, SupportMessage } from '../types';
import { formatDateTime, formatPrice } from '../utils/format';
import { ReturnManageModal } from './ReturnManageModal';

interface AdminSupportProps {
  tickets: SupportMessage[];
  returnRequests?: ReturnRequest[];
  orders?: Order[];
  currencySymbol?: string;
  onRefresh: () => Promise<void>;
  onViewOrders: () => void;
}

export function AdminSupport({
  tickets,
  returnRequests = [],
  orders = [],
  currencySymbol = '₹',
  onRefresh,
  onViewOrders,
}: AdminSupportProps) {
  const [section, setSection] = useState<'tickets' | 'returns'>(
    tickets.length === 0 && returnRequests.length > 0 ? 'returns' : 'tickets'
  );
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [managingReturn, setManagingReturn] = useState<ReturnRequest | null>(null);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.mobileOrEmail.toLowerCase().includes(q) ||
        (t.orderId || '').toLowerCase().includes(q) ||
        t.message.toLowerCase().includes(q)
    );
  }, [tickets, search]);

  const filteredReturns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return returnRequests;
    return returnRequests.filter(
      (r) =>
        r.orderId.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        r.details.toLowerCase().includes(q) ||
        r.returnStatus.toLowerCase().includes(q)
    );
  }, [returnRequests, search]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteSupportMessageFromFirestore(id);
      await onRefresh();
    } finally {
      setDeletingId(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
            Support Tickets &amp; Returns
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            Manage customer support messages and Meesho reselling return / replacement requests.
          </p>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9] inline-flex items-center justify-center gap-2 self-start sm:self-auto shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh ({tickets.length + returnRequests.length})</span>
        </button>
      </div>

      {/* Section Switcher */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSection('tickets')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
            section === 'tickets'
              ? 'bg-[#0B3B6D] text-white'
              : 'bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Support Tickets ({tickets.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSection('returns')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
            section === 'returns'
              ? 'bg-[#C24D06] text-white'
              : 'bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Return &amp; Exchange Requests ({returnRequests.length})</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            section === 'returns'
              ? 'Search Order ID, customer name, reason, or status...'
              : 'Search customer name, phone/email, Order ID, or message...'
          }
          className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm"
        />
      </div>

      {section === 'tickets' ? (
        filteredTickets.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] text-[#475569] flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-[#0F172A]">
              {tickets.length === 0 ? 'No support tickets yet' : 'No matching tickets found'}
            </p>
            <p className="text-sm text-[#475569]">
              {tickets.length === 0
                ? 'When a customer submits a support request on your store, it will show up right here.'
                : 'Try clearing your search query.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTickets.map((ticket) => {
              const isEmail = ticket.mobileOrEmail.includes('@');
              const digits = ticket.mobileOrEmail.replace(/\D/g, '');
              const isPhone = !isEmail && digits.length >= 10;

              return (
                <div
                  key={ticket.id}
                  className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-[#0F172A]">{ticket.name}</h2>
                        <span className="text-[11px] font-mono text-[#64748B]">#{ticket.id}</span>
                      </div>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        Received {formatDateTime(ticket.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {ticket.orderId && (
                        <button
                          type="button"
                          onClick={onViewOrders}
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-[#F0F7FF] border border-[#0B3B6D]/20 text-xs font-mono font-semibold text-[#0B3B6D] hover:bg-[#0B3B6D]/10"
                        >
                          Order: {ticket.orderId}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={deletingId === ticket.id}
                        onClick={() => void handleDelete(ticket.id)}
                        className="min-h-[34px] px-3 py-1 rounded-lg border border-[#E2E8F0] text-xs font-semibold text-[#15803D] hover:bg-[#F0FDF4] inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {deletingId === ticket.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Resolve</span>
                            <Trash2 className="w-3 h-3 text-[#64748B] ml-0.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 text-sm text-[#0F172A] whitespace-pre-line leading-relaxed">
                    {ticket.message}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {isPhone ? (
                      <a
                        href={`tel:${digits}`}
                        className="inline-flex items-center gap-1.5 font-semibold text-[#0B3B6D] hover:underline"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call / Contact: {ticket.mobileOrEmail}</span>
                      </a>
                    ) : isEmail ? (
                      <a
                        href={`mailto:${ticket.mobileOrEmail}`}
                        className="inline-flex items-center gap-1.5 font-semibold text-[#0B3B6D] hover:underline"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Reply via Email: {ticket.mobileOrEmail}</span>
                      </a>
                    ) : (
                      <span className="text-[#475569] font-medium">
                        Contact: {ticket.mobileOrEmail}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : filteredReturns.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#FFF7ED] text-[#C24D06] flex items-center justify-center mx-auto mb-3">
            <RotateCcw className="w-6 h-6" />
          </div>
          <p className="text-base font-semibold text-[#0F172A]">
            {returnRequests.length === 0
              ? 'No return or replacement requests yet'
              : 'No matching return requests'}
          </p>
          <p className="text-sm text-[#475569] max-w-md mx-auto">
            {returnRequests.length === 0
              ? 'When a customer submits a 7-day return or exchange request on Track Order for a Delivered order, it appears here with proof photos & UPI ID.'
              : 'Try clearing your search query.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReturns.map((req) => {
            const linkedOrder = orders.find((o) => o.orderId === req.orderId);
            return (
              <div
                key={req.trackingHash}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-[#0F172A]">
                        {req.orderId}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#F0F7FF] text-[#0B3B6D] text-[11px] font-semibold">
                        {req.requestType}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                          req.returnStatus === 'Rejected'
                            ? 'bg-[#FEF2F2] text-[#B91C1C]'
                            : req.returnStatus === 'Completed'
                            ? 'bg-[#F0FDF4] text-[#15803D]'
                            : 'bg-[#FFF7ED] text-[#C24D06]'
                        }`}
                      >
                        {req.returnStatus}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {req.customerName} · {formatDateTime(req.createdAt)}
                      {linkedOrder ? ` · Order Amt: ${formatPrice(linkedOrder.totalAmount, currencySymbol)}` : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setManagingReturn(req)}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#082D54] self-start shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Manage Return</span>
                  </button>
                </div>

                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-2 text-xs">
                  <p className="font-semibold text-[#0F172A]">
                    Reason: <span className="text-[#C24D06]">{req.reason}</span>
                  </p>
                  <p className="text-sm text-[#334155] whitespace-pre-line">{req.details}</p>
                  <div className="flex flex-wrap gap-4 pt-1 text-[#475569]">
                    <span>
                      <strong>Refund:</strong> {req.refundStatus}
                    </span>
                    {req.customerUpiId && (
                      <span className="font-mono">
                        <strong>Customer UPI:</strong> {req.customerUpiId}
                      </span>
                    )}
                    {req.meeshoReturnId && (
                      <span className="font-mono text-[#0B3B6D]">
                        <strong>Meesho ID:</strong> {req.meeshoReturnId}
                      </span>
                    )}
                  </div>
                </div>

                {req.proofImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {req.proofImages.map((img, i) => (
                      <button
                        key={`${req.trackingHash}-img-${i}`}
                        type="button"
                        onClick={() => setManagingReturn(req)}
                        className="w-16 h-16 rounded-xl overflow-hidden border border-[#E2E8F0]"
                      >
                        <img
                          src={img}
                          alt={`Return proof ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {managingReturn && (
        <ReturnManageModal
          returnRequest={managingReturn}
          order={orders.find((o) => o.orderId === managingReturn.orderId)}
          currencySymbol={currencySymbol}
          onClose={() => setManagingReturn(null)}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}

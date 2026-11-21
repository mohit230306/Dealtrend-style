import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
  ZoomIn,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import {
  buildAppsScriptOrderPayload,
  deleteOrderFromFirestore,
  updateCancelRequestInFirestore,
  updateOrderStatusInFirestore,
} from '../lib/firestoreAdmin';
import type { CancelRequest, Order, OrderStatus, PaymentStatus, ReturnRequest } from '../types';
import { formatDateTime, formatPrice } from '../utils/format';
import { ReturnManageModal } from './ReturnManageModal';

interface AdminOrdersProps {
  orders: Order[];
  returnRequests?: ReturnRequest[];
  cancelRequests?: CancelRequest[];
  appsScriptUrl: string;
  currencySymbol: string;
  onRefresh: () => Promise<void>;
}

const ORDER_STATUSES: OrderStatus[] = [
  'New',
  'Confirmed',
  'Processing',
  'Shipped',
  'Delivered',
  'Cancelled',
];

const PAYMENT_STATUSES: PaymentStatus[] = [
  'Unpaid',
  'Pending',
  'Pending Verification',
  'Paid',
  'Refunded',
];

export function AdminOrders({
  orders,
  returnRequests = [],
  cancelRequests = [],
  appsScriptUrl,
  currencySymbol,
  onRefresh,
}: AdminOrdersProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkSyncFeedback, setBulkSyncFeedback] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [managingReturn, setManagingReturn] = useState<ReturnRequest | null>(null);
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState<Order | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [copiedUtrId, setCopiedUtrId] = useState<string | null>(null);
  const [zoomedProofImage, setZoomedProofImage] = useState<string | null>(null);
  const [cancelAdminNote, setCancelAdminNote] = useState('');
  const [updatingCancelId, setUpdatingCancelId] = useState<string | null>(null);
  const [copiedCancelUpi, setCopiedCancelUpi] = useState(false);

  const returnByOrderId = useMemo(
    () => new Map(returnRequests.map((r) => [r.orderId, r])),
    [returnRequests]
  );

  const cancelByOrderId = useMemo(
    () => new Map(cancelRequests.map((c) => [c.orderId, c])),
    [cancelRequests]
  );

  const pendingCancelRequests = useMemo(
    () =>
      cancelRequests.filter((c) => {
        if (c.cancelStatus !== 'Requested') return false;
        const order = orders.find((o) => o.orderId === c.orderId);
        return !order || order.orderStatus !== 'Cancelled';
      }),
    [cancelRequests, orders]
  );

  const activeReturnRequests = useMemo(
    () =>
      returnRequests.filter(
        (r) => r.returnStatus !== 'Completed' && r.returnStatus !== 'Rejected'
      ),
    [returnRequests]
  );

  const unverifiedUpiOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.paymentMethod === 'Online' &&
          o.paymentStatus !== 'Paid' &&
          o.orderStatus !== 'Cancelled'
      ),
    [orders]
  );

  const utrCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (o.paymentMethod === 'Online' && o.orderStatus !== 'Cancelled') {
        const ref = (o.paymentReference || '').trim();
        if (ref) {
          map.set(ref, (map.get(ref) || 0) + 1);
        }
      }
    }
    return map;
  }, [orders]);

  const unsyncedOrders = useMemo(
    () => orders.filter((o) => o.appsScriptSyncStatus !== 'Synced'),
    [orders]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const statusMatch =
        statusFilter === 'All'
          ? true
          : statusFilter === 'CancelRequests'
          ? cancelByOrderId.has(o.orderId)
          : statusFilter === 'UnverifiedUPI'
          ? o.paymentMethod === 'Online' &&
            o.paymentStatus !== 'Paid' &&
            o.orderStatus !== 'Cancelled'
          : statusFilter === 'Returns'
          ? returnByOrderId.has(o.orderId)
          : o.orderStatus === statusFilter;
      const searchMatch =
        !q ||
        o.orderId.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.mobileNumber.toLowerCase().includes(q) ||
        (o.paymentReference || '').toLowerCase().includes(q) ||
        o.productCodes.toLowerCase().includes(q) ||
        o.productNames.toLowerCase().includes(q) ||
        o.items.some(
          (i) =>
            (i.selectedColor || '').toLowerCase().includes(q) ||
            (i.selectedSize || '').toLowerCase().includes(q)
        );
      return statusMatch && searchMatch;
    });
  }, [orders, search, statusFilter, returnByOrderId, cancelByOrderId]);

  const postProxyAppsScript = async (
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; message: string }> => {
    const token = await auth.currentUser?.getIdToken();
    if (!token || !appsScriptUrl) {
      return { ok: false, message: 'Apps Script URL not configured.' };
    }
    const res = await fetch('/api/admin/proxy-apps-script', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: appsScriptUrl, payload }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    return {
      ok: Boolean(data.ok),
      message: data.message || data.error || 'Apps Script sync error',
    };
  };

  const handleUpdateOrder = async (
    orderId: string,
    patch: { orderStatus?: OrderStatus; paymentStatus?: PaymentStatus }
  ) => {
    const order = orders.find((o) => o.orderId === orderId);
    if (!order) return;

    setUpdatingId(orderId);
    try {
      const nextOrderStatus = patch.orderStatus ?? order.orderStatus;
      const nextPaymentStatus = patch.paymentStatus ?? order.paymentStatus;
      let syncStatus = order.appsScriptSyncStatus;
      let syncMessage = order.appsScriptSyncMessage;

      if (appsScriptUrl) {
        const syncPayload =
          order.appsScriptSyncStatus === 'Synced'
            ? {
                action: 'updateOrderStatus',
                orderId: order.orderId,
                orderStatus: nextOrderStatus,
                paymentStatus: nextPaymentStatus,
                timestamp: new Date().toISOString(),
              }
            : buildAppsScriptOrderPayload({
                ...order,
                orderStatus: nextOrderStatus,
                paymentStatus: nextPaymentStatus,
              });
        const syncRes = await postProxyAppsScript(syncPayload);
        if (
          !syncRes.ok &&
          order.appsScriptSyncStatus === 'Synced' &&
          /name is required/i.test(syncRes.message)
        ) {
          syncStatus = 'Synced';
          syncMessage = order.appsScriptSyncMessage || 'Synced to Google Sheet';
        } else {
          syncStatus = syncRes.ok ? 'Synced' : 'Failed';
          syncMessage = syncRes.message;
        }
      }

      await updateOrderStatusInFirestore(order, {
        orderStatus: nextOrderStatus,
        paymentStatus: nextPaymentStatus,
        appsScriptSyncStatus: syncStatus,
        appsScriptSyncMessage: syncMessage,
      });

      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder({
          ...order,
          orderStatus: nextOrderStatus,
          paymentStatus: nextPaymentStatus,
          appsScriptSyncStatus: syncStatus,
          appsScriptSyncMessage: syncMessage,
        });
      }
      await onRefresh();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleManualSync = async (orderId: string) => {
    const order = orders.find((o) => o.orderId === orderId);
    if (!order || !appsScriptUrl) return;
    setSyncingId(orderId);
    setBulkSyncFeedback('');
    try {
      const syncRes = await postProxyAppsScript(buildAppsScriptOrderPayload(order));
      const nextStatus = syncRes.ok ? ('Synced' as const) : ('Failed' as const);
      await updateOrderStatusInFirestore(order, {
        appsScriptSyncStatus: nextStatus,
        appsScriptSyncMessage: syncRes.message,
      });
      setBulkSyncFeedback(
        syncRes.ok
          ? `Order ${orderId} pushed to your Google Sheet (${syncRes.message}).`
          : `Order ${orderId} sync failed: ${syncRes.message}`
      );
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder({
          ...order,
          appsScriptSyncStatus: nextStatus,
          appsScriptSyncMessage: syncRes.message,
        });
      }
      await onRefresh();
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAllUnsynced = async () => {
    if (!appsScriptUrl || unsyncedOrders.length === 0) return;
    setBulkSyncing(true);
    setBulkSyncFeedback('');
    let syncedCount = 0;
    let lastError = '';
    try {
      for (const order of unsyncedOrders) {
        const syncRes = await postProxyAppsScript(buildAppsScriptOrderPayload(order));
        await updateOrderStatusInFirestore(order, {
          appsScriptSyncStatus: syncRes.ok ? 'Synced' : 'Failed',
          appsScriptSyncMessage: syncRes.message,
        });
        if (syncRes.ok) {
          syncedCount += 1;
        } else {
          lastError = syncRes.message;
        }
      }
      setBulkSyncFeedback(
        lastError
          ? `Synced ${syncedCount}/${unsyncedOrders.length} orders. Last error: ${lastError}`
          : `All ${syncedCount} pending order(s) pushed to your Google Sheet.`
      );
      await onRefresh();
    } finally {
      setBulkSyncing(false);
    }
  };

  const getPrimarySourceUrl = (order: Order): string => {
    return order.items.find((i) => i.sourceProductUrl)?.sourceProductUrl || '';
  };

  const openOrderDetails = (order: Order) => {
    const existingCancel = cancelByOrderId.get(order.orderId);
    setCancelAdminNote(existingCancel?.adminNote || '');
    setCopiedCancelUpi(false);
    setSelectedOrder(order);
  };

  const handleResolveCancelRequest = async (
    order: Order,
    cancelReq: CancelRequest,
    decision: 'Approved' | 'Rejected'
  ) => {
    setUpdatingCancelId(order.orderId);
    try {
      const trimmedNote = cancelAdminNote.trim();
      const defaultNote =
        decision === 'Approved'
          ? 'Your cancellation request has been approved and the order is cancelled.'
          : 'Cancellation request could not be approved as dispatch processing has already started.';
      await updateCancelRequestInFirestore(cancelReq, {
        cancelStatus: decision,
        adminNote: trimmedNote || defaultNote,
      });

      if (decision === 'Approved') {
        await handleUpdateOrder(order.orderId, { orderStatus: 'Cancelled' });
      } else {
        await onRefresh();
      }
    } finally {
      setUpdatingCancelId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteOrder) return;
    const target = confirmDeleteOrder;
    setDeletingId(target.orderId);
    setDeleteError('');
    try {
      await deleteOrderFromFirestore(target);
      if (selectedOrder?.orderId === target.orderId) {
        setSelectedOrder(null);
      }
      setConfirmDeleteOrder(null);
      await onRefresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Unable to delete order. Please try again.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
            Reseller Order Management
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            View customer order amounts vs. source amounts, expected profit, COD details, and open source links to fulfill manually.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative sm:w-64">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Order ID, UTR, name, mobile..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter orders by status"
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm"
          >
            <option value="All">All Statuses</option>
            {cancelRequests.length > 0 && (
              <option value="CancelRequests">
                Cancel Requests ({pendingCancelRequests.length} pending / {cancelRequests.length} total)
              </option>
            )}
            {unverifiedUpiOrders.length > 0 && (
              <option value="UnverifiedUPI">
                Unverified UPI Payments ({unverifiedUpiOrders.length})
              </option>
            )}
            {returnRequests.length > 0 && (
              <option value="Returns">
                Return / Exchange Requests ({returnRequests.length})
              </option>
            )}
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pendingCancelRequests.length > 0 && (
        <div className="rounded-2xl border border-[#F87171] bg-[#FEF2F2] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#991B1B]">
          <div className="flex items-start sm:items-center gap-2.5">
            <XCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-semibold block sm:inline">
                {pendingCancelRequests.length} customer order cancellation request
                {pendingCancelRequests.length === 1 ? '' : 's'} waiting for review!
              </span>{' '}
              <span>
                Review &amp; approve/reject before placing these orders on Meesho.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setStatusFilter(statusFilter === 'CancelRequests' ? 'All' : 'CancelRequests')
            }
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#DC2626] text-white font-semibold hover:bg-[#B91C1C] shrink-0"
          >
            {statusFilter === 'CancelRequests' ? 'Show All Orders' : 'Review Cancel Requests'}
          </button>
        </div>
      )}

      {unverifiedUpiOrders.length > 0 && (
        <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#991B1B]">
          <div className="flex items-start sm:items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-semibold block sm:inline">
                {unverifiedUpiOrders.length} Online UPI order
                {unverifiedUpiOrders.length === 1 ? '' : 's'} waiting for bank verification.
              </span>{' '}
              <span>
                Always match the 12-digit UTR &amp; screenshot in your bank/UPI app before ordering on Meesho.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setStatusFilter(statusFilter === 'UnverifiedUPI' ? 'All' : 'UnverifiedUPI')
            }
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#DC2626] text-white font-semibold hover:bg-[#B91C1C] shrink-0"
          >
            {statusFilter === 'UnverifiedUPI' ? 'Show All Orders' : 'Verify Pending UPI Orders'}
          </button>
        </div>
      )}

      {activeReturnRequests.length > 0 && (
        <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#92400E]">
          <div className="flex items-center gap-2.5">
            <RotateCcw className="w-4 h-4 text-[#C24D06] shrink-0" />
            <span className="font-semibold">
              {activeReturnRequests.length} active Meesho return / replacement request
              {activeReturnRequests.length === 1 ? '' : 's'} need action.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'Returns' ? 'All' : 'Returns')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#C24D06] text-white font-semibold hover:bg-[#A84005] shrink-0"
          >
            {statusFilter === 'Returns' ? 'Show All Orders' : 'Filter Return Orders'}
          </button>
        </div>
      )}

      {(unsyncedOrders.length > 0 || bulkSyncFeedback) && (
        <div
          className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            !appsScriptUrl
              ? 'bg-[#FFF7ED] border-[#FED7AA] text-[#9A3412]'
              : unsyncedOrders.some((o) => o.appsScriptSyncStatus === 'Failed')
              ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
              : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A]'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {unsyncedOrders.length === 0 ? (
              <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              {!appsScriptUrl ? (
                <p className="font-medium">
                  Google Apps Script Web App URL is not saved yet. Go to Admin → Settings, paste your deployed <code className="font-mono">/exec</code> URL, and click Save URL.
                </p>
              ) : unsyncedOrders.length > 0 ? (
                <>
                  <p className="font-semibold">
                    {unsyncedOrders.length} order{unsyncedOrders.length === 1 ? '' : 's'} not synced to Google Sheet yet.
                  </p>
                  {unsyncedOrders.find((o) => o.appsScriptSyncMessage)?.appsScriptSyncMessage && (
                    <div className="space-y-1">
                      <p className="text-[11px] opacity-90">
                        Last sync note:{' '}
                        {unsyncedOrders.find((o) => o.appsScriptSyncMessage)?.appsScriptSyncMessage}
                      </p>
                      {/HTTP 40[13]/i.test(
                        unsyncedOrders.find((o) => o.appsScriptSyncMessage)?.appsScriptSyncMessage || ''
                      ) && (
                        <p className="text-[11px] font-medium">
                          Fix: Open Google Apps Script → Deploy → Manage deployments → Edit, set{' '}
                          <strong>Execute as: Me</strong> &amp;{' '}
                          <strong>Who has access: Anyone</strong>, then click Deploy.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="font-medium text-[#15803D]">{bulkSyncFeedback}</p>
              )}
              {bulkSyncFeedback && unsyncedOrders.length > 0 && (
                <p className="font-medium">{bulkSyncFeedback}</p>
              )}
            </div>
          </div>

          {appsScriptUrl && unsyncedOrders.length > 0 && (
            <button
              type="button"
              disabled={bulkSyncing}
              onClick={() => void handleSyncAllUnsynced()}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#082D54] disabled:opacity-60 shrink-0"
            >
              {bulkSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Sync {unsyncedOrders.length} Order{unsyncedOrders.length === 1 ? '' : 's'} to Sheet</span>
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center text-sm text-[#475569]">
          No orders match your current filter.
        </div>
      ) : (
        <>
          {/* Mobile Order Cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((order) => {
              const primarySourceUrl = getPrimarySourceUrl(order);
              const retReq = returnByOrderId.get(order.orderId);
              const cancelReq = cancelByOrderId.get(order.orderId);
              const hasPendingCancel =
                cancelReq?.cancelStatus === 'Requested' && order.orderStatus !== 'Cancelled';
              const needsUpiVerification =
                order.paymentMethod === 'Online' &&
                order.paymentStatus !== 'Paid' &&
                order.orderStatus !== 'Cancelled';
              const isDuplicateUtr =
                order.paymentMethod === 'Online' &&
                Boolean(order.paymentReference) &&
                (utrCountMap.get(order.paymentReference!.trim()) || 0) > 1;
              return (
                <div
                  key={order.orderId}
                  className={`bg-white border rounded-2xl p-4 space-y-3 text-xs ${
                    hasPendingCancel
                      ? 'border-[#EF4444] bg-[#FEF2F2]/60'
                      : needsUpiVerification
                      ? 'border-[#F59E0B] bg-[#FFFDF7]'
                      : 'border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-semibold text-sm text-[#0F172A] block">
                        {order.orderId}
                      </span>
                      <span className="text-[11px] text-[#64748B]">
                        {formatDateTime(order.timestamp)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${
                          order.appsScriptSyncStatus === 'Synced'
                            ? 'bg-[#0B3B6D]/10 text-[#0B3B6D]'
                            : order.appsScriptSyncStatus === 'Failed'
                            ? 'bg-[#FEF2F2] text-[#991B1B]'
                            : 'bg-[#F1F5F9] text-[#475569]'
                        }`}
                      >
                        Sheet: {order.appsScriptSyncStatus}
                      </span>
                      {hasPendingCancel && (
                        <span className="px-2 py-0.5 rounded-md bg-[#FEE2E2] border border-[#EF4444] text-[#991B1B] text-[10px] font-bold">
                          CANCEL REQUESTED
                        </span>
                      )}
                      {needsUpiVerification && (
                        <span className="px-2 py-0.5 rounded-md bg-[#FEF3C7] border border-[#F59E0B] text-[#92400E] text-[10px] font-bold">
                          VERIFY UPI FIRST
                        </span>
                      )}
                      {isDuplicateUtr && (
                        <span className="px-2 py-0.5 rounded-md bg-[#FEE2E2] border border-[#EF4444] text-[#991B1B] text-[10px] font-bold">
                          DUPLICATE UTR!
                        </span>
                      )}
                      {retReq && (
                        <span className="px-2 py-0.5 rounded-md bg-[#FFF7ED] border border-[#FED7AA] text-[#C24D06] text-[10px] font-semibold">
                          Return: {retReq.returnStatus}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <p className="font-semibold text-[#0F172A] text-sm">{order.customerName}</p>
                    <p className="text-[#475569] tabular-nums">{order.mobileNumber}</p>
                    <p className="text-[#64748B]">
                      {order.city}, {order.state} - {order.pincode}
                    </p>
                  </div>

                  {order.paymentMethod === 'Online' && (
                    <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold text-[#64748B] uppercase block">
                          UPI UTR Reference
                        </span>
                        <span className="font-mono font-semibold text-xs text-[#0F172A] select-all">
                          {order.paymentReference || 'Missing UTR'}
                        </span>
                      </div>
                      {order.paymentProofImage ? (
                        <button
                          type="button"
                          onClick={() => openOrderDetails(order)}
                          className="px-2.5 py-1 rounded-lg bg-[#0B3B6D]/10 text-[#0B3B6D] text-[11px] font-semibold shrink-0"
                        >
                          View Proof
                        </button>
                      ) : (
                        <span className="text-[10px] font-medium text-[#64748B] shrink-0">
                          UTR Only
                        </span>
                      )}
                    </div>
                  )}

                  <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                    <p className="font-medium text-[#0F172A] line-clamp-2">{order.productNames}</p>
                    <p className="font-mono text-[11px] text-[#64748B]">
                      {order.productCodes} · Qty {order.quantity}
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1 tabular-nums">
                      <span className="font-semibold text-[#0F172A]">
                        Cust: {formatPrice(order.totalAmount, currencySymbol)}
                      </span>
                      <span className="text-[#64748B]">
                        Src: {formatPrice(order.sourceOrderAmount || 0, currencySymbol)}
                      </span>
                      <span className="font-semibold text-[#15803D]">
                        Profit: +{formatPrice(order.expectedProfit || 0, currencySymbol)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] text-[#64748B] block mb-1">
                        Payment ({order.paymentMethod}
                        {order.paymentMethod === 'COD'
                          ? ` ${formatPrice(order.codAmount, currencySymbol)}`
                          : ''}
                        )
                      </span>
                      <select
                        disabled={updatingId === order.orderId}
                        value={order.paymentStatus}
                        onChange={(e) =>
                          void handleUpdateOrder(order.orderId, {
                            paymentStatus: e.target.value as PaymentStatus,
                          })
                        }
                        className="w-full min-h-[38px] px-2 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                      >
                        {PAYMENT_STATUSES.map((ps) => (
                          <option key={ps} value={ps}>
                            {ps}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#64748B] block mb-1">Order Status</span>
                      <select
                        disabled={updatingId === order.orderId}
                        value={order.orderStatus}
                        onChange={(e) =>
                          void handleUpdateOrder(order.orderId, {
                            orderStatus: e.target.value as OrderStatus,
                          })
                        }
                        className="w-full min-h-[38px] px-2 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F172A]"
                      >
                        {ORDER_STATUSES.map((os) => (
                          <option key={os} value={os}>
                            {os}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {order.appsScriptSyncMessage && (
                    <p className="text-[11px] text-[#475569] break-words">
                      Sheet note: {order.appsScriptSyncMessage}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {hasPendingCancel ? (
                      <button
                        type="button"
                        onClick={() => openOrderDetails(order)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#DC2626] text-white text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Review Cancel Request</span>
                      </button>
                    ) : needsUpiVerification ? (
                      <button
                        type="button"
                        onClick={() => openOrderDetails(order)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#D97706] text-white text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Verify UPI First</span>
                      </button>
                    ) : primarySourceUrl ? (
                      <a
                        href={primarySourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#C24D06] text-white text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <span>Open Source Product</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : null}
                    {appsScriptUrl && (
                      <button
                        type="button"
                        disabled={syncingId === order.orderId}
                        onClick={() => void handleManualSync(order.orderId)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#0B3B6D] text-[#0B3B6D] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                      >
                        {syncingId === order.orderId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>Push to Sheet</span>
                      </button>
                    )}
                    {retReq && (
                      <button
                        type="button"
                        onClick={() => setManagingReturn(retReq)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#FFF7ED] border border-[#FED7AA] text-[#C24D06] text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Manage Return</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openOrderDetails(order)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#0F172A] inline-flex items-center gap-1 ml-auto"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === order.orderId}
                      onClick={() => {
                        setDeleteError('');
                        setConfirmDeleteOrder(order);
                      }}
                      aria-label={`Delete order ${order.orderId}`}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#FECACA] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Order Table */}
          <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold text-[#475569]">
                  <tr>
                    <th className="py-3 px-4">Order ID &amp; Date</th>
                    <th className="py-3 px-4">Customer &amp; Address</th>
                    <th className="py-3 px-4">Products &amp; Code</th>
                    <th className="py-3 px-4">Customer / Source / Profit</th>
                    <th className="py-3 px-4">Payment &amp; COD</th>
                    <th className="py-3 px-4">Order Status</th>
                    <th className="py-3 px-4">Sheets Sync</th>
                    <th className="py-3 px-4 text-right">Fulfill &amp; View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {filtered.map((order) => {
                    const primarySourceUrl = getPrimarySourceUrl(order);
                    const retReq = returnByOrderId.get(order.orderId);
                    const cancelReq = cancelByOrderId.get(order.orderId);
                    const hasPendingCancel =
                      cancelReq?.cancelStatus === 'Requested' && order.orderStatus !== 'Cancelled';
                    const needsUpiVerification =
                      order.paymentMethod === 'Online' &&
                      order.paymentStatus !== 'Paid' &&
                      order.orderStatus !== 'Cancelled';
                    const isDuplicateUtr =
                      order.paymentMethod === 'Online' &&
                      Boolean(order.paymentReference) &&
                      (utrCountMap.get(order.paymentReference!.trim()) || 0) > 1;
                    return (
                      <tr
                        key={order.orderId}
                        className={
                          hasPendingCancel
                            ? 'bg-[#FEF2F2]/80 hover:bg-[#FEE2E2]/60'
                            : needsUpiVerification
                            ? 'bg-[#FFFBEB]/60 hover:bg-[#FEF3C7]/50'
                            : 'hover:bg-[#F8FAFC]'
                        }
                      >
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-mono font-semibold text-[#0F172A]">
                            {order.orderId}
                          </span>
                          <span className="block text-[11px] text-[#64748B]">
                            {formatDateTime(order.timestamp)}
                          </span>
                          {hasPendingCancel && (
                            <span className="mt-1 inline-block px-2 py-0.5 rounded-md bg-[#FEE2E2] border border-[#EF4444] text-[#991B1B] text-[10px] font-bold">
                              CANCEL REQ
                            </span>
                          )}
                          {needsUpiVerification && (
                            <span className="mt-1 ml-1 inline-block px-2 py-0.5 rounded-md bg-[#FEF3C7] border border-[#F59E0B] text-[#92400E] text-[10px] font-bold">
                              VERIFY UPI
                            </span>
                          )}
                          {isDuplicateUtr && (
                            <span className="mt-1 ml-1 inline-block px-2 py-0.5 rounded-md bg-[#FEE2E2] border border-[#EF4444] text-[#991B1B] text-[10px] font-bold">
                              DUP UTR
                            </span>
                          )}
                          {retReq && (
                            <span className="mt-1 ml-1 inline-block px-2 py-0.5 rounded-md bg-[#FFF7ED] border border-[#FED7AA] text-[#C24D06] text-[10px] font-semibold">
                              Return: {retReq.returnStatus}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 max-w-[200px]">
                          <span className="font-medium text-[#0F172A] block truncate">
                            {order.customerName}
                          </span>
                          <span className="block text-xs text-[#64748B] tabular-nums">
                            {order.mobileNumber}
                          </span>
                          <span className="block text-[11px] text-[#64748B] truncate">
                            {order.city}, {order.pincode}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 max-w-[220px]">
                          <span className="text-xs text-[#0F172A] line-clamp-2">
                            {order.productNames}
                          </span>
                          <span className="block text-[11px] font-mono text-[#64748B] mt-0.5">
                            {order.productCodes} · Qty {order.quantity}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap tabular-nums text-xs">
                          <span className="font-semibold text-[#0F172A] block">
                            Cust: {formatPrice(order.totalAmount, currencySymbol)}
                          </span>
                          <span className="text-[#64748B] block">
                            Src: {formatPrice(order.sourceOrderAmount || 0, currencySymbol)}
                          </span>
                          <span className="font-semibold text-[#15803D] block">
                            Profit: +{formatPrice(order.expectedProfit || 0, currencySymbol)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="block text-xs font-medium text-[#0F172A]">
                            {order.paymentMethod}
                            {order.paymentMethod === 'COD' &&
                              ` · COD ${formatPrice(order.codAmount, currencySymbol)}`}
                          </span>
                          {order.paymentMethod === 'Online' && (
                            <span className="block text-[11px] font-mono text-[#475569]">
                              UTR: {order.paymentReference || 'Missing'}
                            </span>
                          )}
                          <select
                            disabled={updatingId === order.orderId}
                            value={order.paymentStatus}
                            onChange={(e) =>
                              void handleUpdateOrder(order.orderId, {
                                paymentStatus: e.target.value as PaymentStatus,
                              })
                            }
                            className="mt-1 min-h-[34px] px-2 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                          >
                            {PAYMENT_STATUSES.map((ps) => (
                              <option key={ps} value={ps}>
                                {ps}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <select
                            disabled={updatingId === order.orderId}
                            value={order.orderStatus}
                            onChange={(e) =>
                              void handleUpdateOrder(order.orderId, {
                                orderStatus: e.target.value as OrderStatus,
                              })
                            }
                            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F172A]"
                          >
                            {ORDER_STATUSES.map((os) => (
                              <option key={os} value={os}>
                                {os}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={
                                order.appsScriptSyncStatus === 'Synced'
                                  ? 'text-[#0B3B6D] font-medium'
                                  : order.appsScriptSyncStatus === 'Failed'
                                  ? 'text-[#B91C1C] font-medium'
                                  : 'text-[#64748B]'
                              }
                            >
                              {order.appsScriptSyncStatus}
                            </span>
                            {order.appsScriptSyncStatus !== 'Not Configured' && (
                              <button
                                type="button"
                                disabled={syncingId === order.orderId}
                                onClick={() => void handleManualSync(order.orderId)}
                                title="Push order to Google Apps Script"
                                className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#475569]"
                              >
                                {syncingId === order.orderId ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {hasPendingCancel ? (
                              <button
                                type="button"
                                onClick={() => openOrderDetails(order)}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] inline-flex items-center gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Review Cancel</span>
                              </button>
                            ) : needsUpiVerification ? (
                              <button
                                type="button"
                                onClick={() => openOrderDetails(order)}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#D97706] text-white text-xs font-semibold hover:bg-[#B45309] inline-flex items-center gap-1"
                              >
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>Verify UPI First</span>
                              </button>
                            ) : primarySourceUrl ? (
                              <a
                                href={primarySourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#C24D06] text-white text-xs font-semibold hover:bg-[#A84005] inline-flex items-center gap-1"
                              >
                                <span>Open Source Product</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <span className="text-[11px] text-[#64748B]">No source link</span>
                            )}
                            {retReq && (
                              <button
                                type="button"
                                onClick={() => setManagingReturn(retReq)}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FFF7ED] border border-[#FED7AA] text-xs font-semibold text-[#C24D06] hover:bg-[#FFEDD5] inline-flex items-center gap-1"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Return</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openOrderDetails(order)}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] inline-flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === order.orderId}
                              onClick={() => {
                                setDeleteError('');
                                setConfirmDeleteOrder(order);
                              }}
                              title="Delete Order"
                              aria-label={`Delete order ${order.orderId}`}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[#FECACA] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div>
                <h2 className="font-mono text-lg font-semibold text-[#0F172A]">
                  {selectedOrder.orderId}
                </h2>
                <p className="text-xs text-[#64748B]">
                  {formatDateTime(selectedOrder.timestamp)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[#475569] hover:bg-[#F1F5F9]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4">
              <div>
                <span className="text-xs text-[#64748B] block">Customer Details</span>
                <span className="font-semibold text-[#0F172A]">{selectedOrder.customerName}</span>
                <span className="block text-xs text-[#475569] tabular-nums">
                  {selectedOrder.mobileNumber}
                </span>
                {selectedOrder.email && (
                  <span className="block text-xs text-[#475569]">{selectedOrder.email}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-[#64748B] block">Delivery Address</span>
                <span className="text-xs text-[#0F172A] leading-relaxed block">
                  {selectedOrder.fullAddress}, {selectedOrder.city}, {selectedOrder.state} -{' '}
                  {selectedOrder.pincode}
                  {selectedOrder.landmark ? ` (Landmark: ${selectedOrder.landmark})` : ''}
                </span>
              </div>
            </div>

            {/* Customer Order Cancellation Request Panel */}
            {(() => {
              const cancelReq = cancelByOrderId.get(selectedOrder.orderId);
              if (!cancelReq) return null;
              const isPending = cancelReq.cancelStatus === 'Requested';
              return (
                <div
                  className={`rounded-2xl border p-4 space-y-3 ${
                    isPending
                      ? 'bg-[#FEF2F2] border-[#EF4444]'
                      : cancelReq.cancelStatus === 'Approved'
                      ? 'bg-[#FFF7ED] border-[#FDBA74]'
                      : 'bg-[#F0F7FF] border-[#93C5FD]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <XCircle
                        className={`w-5 h-5 ${
                          isPending
                            ? 'text-[#DC2626]'
                            : cancelReq.cancelStatus === 'Approved'
                            ? 'text-[#C24D06]'
                            : 'text-[#0B3B6D]'
                        }`}
                      />
                      <div>
                        <h3 className="text-sm font-semibold text-[#0F172A]">
                          Customer Order Cancellation Request
                        </h3>
                        <p className="text-[11px] text-[#475569]">
                          Requested {formatDateTime(cancelReq.createdAt)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        isPending
                          ? 'bg-[#DC2626] text-white'
                          : cancelReq.cancelStatus === 'Approved'
                          ? 'bg-[#C24D06] text-white'
                          : 'bg-[#0B3B6D] text-white'
                      }`}
                    >
                      {cancelReq.cancelStatus}
                    </span>
                  </div>

                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-3 space-y-2 text-xs">
                    <div>
                      <span className="text-[11px] text-[#64748B] block">Cancellation Reason</span>
                      <span className="font-semibold text-[#0F172A]">{cancelReq.reason}</span>
                    </div>
                    {cancelReq.note && (
                      <div>
                        <span className="text-[11px] text-[#64748B] block">Customer Note</span>
                        <span className="text-[#334155] leading-relaxed block">
                          {cancelReq.note}
                        </span>
                      </div>
                    )}
                    {cancelReq.customerUpiId && (
                      <div className="pt-1 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] text-[#64748B] block">
                            Customer Refund UPI ID (for Online Payment)
                          </span>
                          <span className="font-mono font-semibold text-[#0F172A] select-all">
                            {cancelReq.customerUpiId}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(cancelReq.customerUpiId || '')
                              .then(() => {
                                setCopiedCancelUpi(true);
                                window.setTimeout(() => setCopiedCancelUpi(false), 1800);
                              });
                          }}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold text-[#0F172A] inline-flex items-center gap-1"
                        >
                          {copiedCancelUpi ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-[#15803D]" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy UPI</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {isPending ? (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#475569] mb-1">
                          Optional Message for Customer (shown on tracking page)
                        </label>
                        <input
                          type="text"
                          value={cancelAdminNote}
                          onChange={(e) => setCancelAdminNote(e.target.value)}
                          maxLength={500}
                          placeholder="e.g. Order cancelled before dispatch. Refund initiated to UPI."
                          className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-[#E2E8F0] bg-white text-xs"
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <button
                          type="button"
                          disabled={
                            updatingCancelId === selectedOrder.orderId ||
                            updatingId === selectedOrder.orderId
                          }
                          onClick={() =>
                            void handleResolveCancelRequest(selectedOrder, cancelReq, 'Approved')
                          }
                          className="flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                        >
                          {updatingCancelId === selectedOrder.orderId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          <span>Approve &amp; Cancel Order</span>
                        </button>
                        <button
                          type="button"
                          disabled={
                            updatingCancelId === selectedOrder.orderId ||
                            updatingId === selectedOrder.orderId
                          }
                          onClick={() =>
                            void handleResolveCancelRequest(selectedOrder, cancelReq, 'Rejected')
                          }
                          className="flex-1 min-h-[42px] px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] text-xs font-semibold hover:bg-[#F8FAFC] inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                        >
                          <XCircle className="w-4 h-4 text-[#475569]" />
                          <span>Reject Cancel Request</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    cancelReq.adminNote && (
                      <div className="p-2.5 rounded-xl bg-white/80 border border-[#E2E8F0] text-xs text-[#334155]">
                        <span className="font-semibold text-[#0F172A]">Admin Note: </span>
                        {cancelReq.adminNote}
                      </div>
                    )
                  )}
                </div>
              );
            })()}

            {/* Admin UPI Anti-Fraud Verification Panel */}
            {selectedOrder.paymentMethod === 'Online' && (
              <div
                className={`rounded-2xl border p-4 space-y-3.5 ${
                  selectedOrder.paymentStatus === 'Paid'
                    ? 'bg-[#F0FDF4] border-[#86EFAC]'
                    : selectedOrder.orderStatus === 'Cancelled'
                    ? 'bg-[#FEF2F2] border-[#FECACA]'
                    : 'bg-[#FFFBEB] border-[#F59E0B]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {selectedOrder.paymentStatus === 'Paid' ? (
                      <ShieldCheck className="w-5 h-5 text-[#15803D]" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-[#B45309]" />
                    )}
                    <div>
                      <h3 className="text-sm font-semibold text-[#0F172A]">
                        UPI Payment Verification (Admin Only)
                      </h3>
                      <p className="text-[11px] text-[#475569]">
                        {selectedOrder.paymentStatus === 'Paid'
                          ? 'Verified as Paid. Safe to place order on Meesho.'
                          : selectedOrder.orderStatus === 'Cancelled'
                          ? 'Order cancelled / payment rejected.'
                          : `Verify ${formatPrice(selectedOrder.totalAmount, currencySymbol)} received in your bank/UPI app before fulfilling.`}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      selectedOrder.paymentStatus === 'Paid'
                        ? 'bg-[#15803D] text-white'
                        : selectedOrder.orderStatus === 'Cancelled'
                        ? 'bg-[#DC2626] text-white'
                        : 'bg-[#D97706] text-white'
                    }`}
                  >
                    {selectedOrder.paymentStatus}
                  </span>
                </div>

                {/* UTR Reference & Copy */}
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] text-[#64748B] block">
                      12-Digit UPI UTR / Reference Number
                    </span>
                    <span className="font-mono text-base font-bold tracking-wider text-[#0F172A] select-all">
                      {selectedOrder.paymentReference || 'Not Provided'}
                    </span>
                    {selectedOrder.paymentReference &&
                      (utrCountMap.get(selectedOrder.paymentReference.trim()) || 0) > 1 && (
                        <span className="block text-[11px] font-bold text-[#DC2626] mt-0.5">
                          Warning: This UTR appears on multiple orders! Check carefully for fraud.
                        </span>
                      )}
                  </div>
                  {selectedOrder.paymentReference && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(selectedOrder.paymentReference || '')
                          .then(() => {
                            setCopiedUtrId(selectedOrder.orderId);
                            window.setTimeout(() => setCopiedUtrId(null), 2000);
                          });
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#0F172A] inline-flex items-center gap-1.5"
                    >
                      {copiedUtrId === selectedOrder.orderId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#15803D]" />
                          <span>UTR Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy UTR</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Uploaded Payment Proof Screenshot */}
                {selectedOrder.paymentProofImage ? (
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setZoomedProofImage(selectedOrder.paymentProofImage || null)}
                      className="relative group rounded-lg overflow-hidden border border-[#E2E8F0] shrink-0"
                    >
                      <img
                        src={selectedOrder.paymentProofImage}
                        alt="Customer UPI payment screenshot"
                        className="w-24 h-28 object-cover"
                      />
                      <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ZoomIn className="w-5 h-5" />
                      </span>
                    </button>
                    <div className="space-y-1.5 text-xs">
                      <p className="font-semibold text-[#0F172A]">
                        Customer Payment Proof Screenshot
                      </p>
                      <p className="text-[#475569]">
                        Confirm the screenshot shows{' '}
                        <strong>{formatPrice(selectedOrder.totalAmount, currencySymbol)}</strong>,
                        your UPI ID, and matching 12-digit UTR — and double-check credit in your bank app.
                      </p>
                      <button
                        type="button"
                        onClick={() => setZoomedProofImage(selectedOrder.paymentProofImage || null)}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-[#0B3B6D]/10 text-[#0B3B6D] font-semibold inline-flex items-center gap-1.5"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                        <span>View Full Screenshot</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-3 text-xs text-[#475569]">
                    No screenshot uploaded (many UPI apps like PhonePe &amp; bank apps block screenshots). Copy the 12-digit UTR above and verify{' '}
                    <strong className="text-[#0F172A]">
                      {formatPrice(selectedOrder.totalAmount, currencySymbol)}
                    </strong>{' '}
                    received directly in your bank/UPI app before confirming.
                  </div>
                )}

                {/* 1-Tap Verify or Reject Fake Payment */}
                {selectedOrder.orderStatus !== 'Cancelled' &&
                  selectedOrder.paymentStatus !== 'Paid' && (
                    <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={updatingId === selectedOrder.orderId}
                        onClick={() =>
                          void handleUpdateOrder(selectedOrder.orderId, {
                            paymentStatus: 'Paid',
                            orderStatus:
                              selectedOrder.orderStatus === 'New'
                                ? 'Confirmed'
                                : selectedOrder.orderStatus,
                          })
                        }
                        className="flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534] inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                      >
                        {updatingId === selectedOrder.orderId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                        <span>Verify Paid &amp; Confirm Order</span>
                      </button>
                      <button
                        type="button"
                        disabled={updatingId === selectedOrder.orderId}
                        onClick={() =>
                          void handleUpdateOrder(selectedOrder.orderId, {
                            paymentStatus: 'Unpaid',
                            orderStatus: 'Cancelled',
                          })
                        }
                        className="flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                      >
                        {updatingId === selectedOrder.orderId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span>Reject Fake Payment &amp; Cancel</span>
                      </button>
                    </div>
                  )}
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[#475569] uppercase tracking-wide">
                Items &amp; Supplier Fulfillment Links (Admin Only)
              </h3>
              <div className="divide-y divide-[#F1F5F9] border border-[#E2E8F0] rounded-xl px-4">
                {selectedOrder.items.map((item, idx) => {
                  const pendingCancelLock =
                    cancelByOrderId.get(selectedOrder.orderId)?.cancelStatus === 'Requested' &&
                    selectedOrder.orderStatus !== 'Cancelled';
                  const lockFulfillment =
                    selectedOrder.paymentMethod === 'Online' &&
                    selectedOrder.paymentStatus !== 'Paid';
                  return (
                    <div
                      key={`${item.productId}-${item.selectedColor || ''}-${item.selectedSize || ''}-${idx}`}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-[#0F172A]">{item.productName}</p>
                        {(item.selectedColor || item.selectedSize) && (
                          <p className="text-xs font-semibold text-[#0B3B6D] mt-0.5">
                            {[
                              item.selectedColor ? `Color / Design: ${item.selectedColor}` : '',
                              item.selectedSize ? `Size: ${item.selectedSize}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                        <p className="text-xs font-mono text-[#64748B]">
                          {item.productCode} · Qty {item.quantity} × Sell{' '}
                          {formatPrice(item.unitPrice, currencySymbol)} · Source{' '}
                          {formatPrice(item.sourcePrice || 0, currencySymbol)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums">
                          {formatPrice(item.lineTotal, currencySymbol)}
                        </span>
                        {item.sourceProductUrl &&
                          (pendingCancelLock ? (
                            <span className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#FEE2E2] border border-[#EF4444] text-[#991B1B] text-[11px] font-semibold inline-flex items-center gap-1 shrink-0">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Cancel Requested — Review</span>
                            </span>
                          ) : lockFulfillment ? (
                            <span className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#FEF3C7] border border-[#F59E0B] text-[#92400E] text-[11px] font-semibold inline-flex items-center gap-1 shrink-0">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Verify UPI to Unlock</span>
                            </span>
                          ) : (
                            <a
                              href={item.sourceProductUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#C24D06] text-white text-xs font-semibold hover:bg-[#A84005] inline-flex items-center gap-1 shrink-0"
                            >
                              <span>Open Source Product</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reseller Financial Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl p-4 text-xs">
              <div>
                <span className="text-[#64748B] block">Customer Order Amt</span>
                <span className="text-sm font-semibold text-[#0F172A] tabular-nums">
                  {formatPrice(selectedOrder.totalAmount, currencySymbol)}
                </span>
              </div>
              <div>
                <span className="text-[#64748B] block">Source Order Amt</span>
                <span className="text-sm font-semibold text-[#475569] tabular-nums">
                  {formatPrice(selectedOrder.sourceOrderAmount || 0, currencySymbol)}
                </span>
              </div>
              <div>
                <span className="text-[#64748B] block">Expected Profit</span>
                <span className="text-sm font-semibold text-[#15803D] tabular-nums">
                  +{formatPrice(selectedOrder.expectedProfit || 0, currencySymbol)}
                </span>
              </div>
              <div>
                <span className="text-[#64748B] block">Payment ({selectedOrder.paymentMethod})</span>
                <span className="text-sm font-semibold text-[#0B3B6D]">
                  {selectedOrder.paymentStatus}
                  {selectedOrder.paymentMethod === 'COD' &&
                    ` · ${formatPrice(selectedOrder.codAmount, currencySymbol)}`}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <span className="font-semibold text-[#0F172A] block">
                  Google Sheets Sync: {selectedOrder.appsScriptSyncStatus}
                </span>
                {selectedOrder.appsScriptSyncMessage && (
                  <span className="text-[#475569] block break-words">
                    {selectedOrder.appsScriptSyncMessage}
                  </span>
                )}
              </div>
              {appsScriptUrl && (
                <button
                  type="button"
                  disabled={syncingId === selectedOrder.orderId}
                  onClick={() => void handleManualSync(selectedOrder.orderId)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#0B3B6D] text-white font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-60"
                >
                  {syncingId === selectedOrder.orderId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Push to Google Sheet</span>
                </button>
              )}
            </div>

            <div className="pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
              {returnByOrderId.get(selectedOrder.orderId) ? (
                <button
                  type="button"
                  onClick={() => {
                    const ret = returnByOrderId.get(selectedOrder.orderId);
                    if (ret) {
                      setSelectedOrder(null);
                      setManagingReturn(ret);
                    }
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] text-xs font-semibold text-[#C24D06] hover:bg-[#FFEDD5] inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    Manage Return ({returnByOrderId.get(selectedOrder.orderId)?.returnStatus})
                  </span>
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => {
                  setDeleteError('');
                  setConfirmDeleteOrder(selectedOrder);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEE2E2] inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Order Modal */}
      {confirmDeleteOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#0F172A]">
                  Delete Order {confirmDeleteOrder.orderId}?
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {confirmDeleteOrder.customerName} ·{' '}
                  {formatPrice(confirmDeleteOrder.totalAmount, currencySymbol)}
                </p>
              </div>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setConfirmDeleteOrder(null)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[#475569] hover:bg-[#F1F5F9]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#475569] leading-relaxed">
              This will permanently remove this order from your Admin dashboard, profit metrics, and customer order tracking.
              {confirmDeleteOrder.appsScriptSyncStatus === 'Synced' &&
                ' Note: Since this order was already synced to Google Sheets, delete its row in your Sheet separately if needed.'}
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setConfirmDeleteOrder(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => void handleConfirmDelete()}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {deletingId ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
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

      {/* Fullscreen UPI Payment Screenshot Lightbox */}
      {zoomedProofImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setZoomedProofImage(null)}
        >
          <div
            className="relative max-w-2xl w-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomedProofImage(null)}
              className="self-end min-h-[40px] px-3.5 py-2 rounded-xl bg-white/15 text-white text-xs font-semibold hover:bg-white/25 inline-flex items-center gap-1.5"
            >
              <X className="w-4 h-4" />
              <span>Close Screenshot</span>
            </button>
            <img
              src={zoomedProofImage}
              alt="Full UPI Payment Screenshot Proof"
              className="max-h-[82vh] w-auto rounded-2xl border border-white/20 shadow-2xl object-contain bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}

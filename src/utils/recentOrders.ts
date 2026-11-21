import type { OrderStatus, PaymentMethod, PaymentStatus, PublicOrder } from '../types';

const RECENT_ORDERS_STORAGE_KEY = 'dealtrend_recent_orders_v1';
const MAX_SAVED_ORDERS = 20;

export interface SavedCustomerOrder {
  orderId: string;
  mobileNumber: string;
  timestamp: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  productNames: string;
  itemCount: number;
  paymentReference?: string;
}

function normalizeSavedOrder(raw: unknown): SavedCustomerOrder | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const orderId = typeof obj.orderId === 'string' ? obj.orderId.trim().toUpperCase() : '';
  const mobileNumber =
    typeof obj.mobileNumber === 'string' ? obj.mobileNumber.replace(/\D/g, '').slice(-10) : '';
  if (!orderId || mobileNumber.length < 10) return null;

  return {
    orderId,
    mobileNumber,
    timestamp:
      typeof obj.timestamp === 'string' && obj.timestamp
        ? obj.timestamp
        : new Date().toISOString(),
    totalAmount: Number(obj.totalAmount) || 0,
    paymentMethod: obj.paymentMethod === 'Online' ? 'Online' : 'COD',
    paymentStatus: (obj.paymentStatus as PaymentStatus) || 'Unpaid',
    orderStatus: (obj.orderStatus as OrderStatus) || 'New',
    productNames: typeof obj.productNames === 'string' ? obj.productNames : '',
    itemCount: Math.max(1, Number(obj.itemCount) || 1),
    paymentReference:
      typeof obj.paymentReference === 'string' && obj.paymentReference
        ? obj.paymentReference
        : undefined,
  };
}

export function loadSavedOrders(): SavedCustomerOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_ORDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeSavedOrder)
      .filter((item): item is SavedCustomerOrder => item !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, MAX_SAVED_ORDERS);
  } catch {
    return [];
  }
}

function persistSavedOrders(orders: SavedCustomerOrder[]): SavedCustomerOrder[] {
  const deduped = new Map<string, SavedCustomerOrder>();
  for (const item of orders) {
    const clean = normalizeSavedOrder(item);
    if (clean && !deduped.has(clean.orderId)) {
      deduped.set(clean.orderId, clean);
    }
  }
  const sorted = Array.from(deduped.values())
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_SAVED_ORDERS);
  try {
    localStorage.setItem(RECENT_ORDERS_STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // ignore storage quota errors
  }
  return sorted;
}

export function savePublicOrderToDevice(order: PublicOrder): SavedCustomerOrder[] {
  const existing = loadSavedOrders();
  const nextEntry: SavedCustomerOrder = {
    orderId: order.orderId.trim().toUpperCase(),
    mobileNumber: order.mobileNumber.replace(/\D/g, '').slice(-10),
    timestamp: order.timestamp || new Date().toISOString(),
    totalAmount: Number(order.totalAmount) || 0,
    paymentMethod: order.paymentMethod === 'Online' ? 'Online' : 'COD',
    paymentStatus: order.paymentStatus || 'Unpaid',
    orderStatus: order.orderStatus || 'New',
    productNames: order.productNames || order.items.map((i) => i.productName).join(', '),
    itemCount: Math.max(1, Number(order.quantity) || order.items.length || 1),
    paymentReference: order.paymentReference,
  };
  return persistSavedOrders([
    nextEntry,
    ...existing.filter((o) => o.orderId !== nextEntry.orderId),
  ]);
}

export function syncTrackedOrderToDevice(
  orderId: string,
  mobileNumber: string,
  tracked: Partial<PublicOrder>
): SavedCustomerOrder[] {
  const cleanId = (tracked.orderId || orderId).trim().toUpperCase();
  const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
  if (!cleanId || cleanMobile.length < 10) return loadSavedOrders();

  const existing = loadSavedOrders();
  const prev = existing.find((o) => o.orderId === cleanId);
  const merged: SavedCustomerOrder = {
    orderId: cleanId,
    mobileNumber: cleanMobile,
    timestamp: tracked.timestamp || prev?.timestamp || new Date().toISOString(),
    totalAmount: Number(tracked.totalAmount ?? prev?.totalAmount ?? 0),
    paymentMethod:
      tracked.paymentMethod === 'Online'
        ? 'Online'
        : tracked.paymentMethod === 'COD'
        ? 'COD'
        : prev?.paymentMethod || 'COD',
    paymentStatus: (tracked.paymentStatus as PaymentStatus) || prev?.paymentStatus || 'Unpaid',
    orderStatus: (tracked.orderStatus as OrderStatus) || prev?.orderStatus || 'New',
    productNames: tracked.productNames || prev?.productNames || '',
    itemCount: Math.max(
      1,
      Number(tracked.quantity ?? tracked.items?.length ?? prev?.itemCount ?? 1)
    ),
    paymentReference: tracked.paymentReference || prev?.paymentReference,
  };

  return persistSavedOrders([
    merged,
    ...existing.filter((o) => o.orderId !== cleanId),
  ]);
}

export function removeSavedOrderFromDevice(orderId: string): SavedCustomerOrder[] {
  const cleanId = orderId.trim().toUpperCase();
  const existing = loadSavedOrders();
  return persistSavedOrders(existing.filter((o) => o.orderId !== cleanId));
}

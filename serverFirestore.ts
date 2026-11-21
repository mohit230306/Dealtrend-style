import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import type {
  CancelRequestStatus,
  Order,
  PublicCancelRequest,
  PublicOrder,
  PublicProduct,
  PublicReturnRequest,
  PublicStoreSettings,
  ReturnRefundStatus,
  ReturnRequestType,
  ReturnStatus,
} from './src/types.ts';

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as FirebaseAppletConfig;

const firebaseApp = initializeApp(firebaseConfig, 'dealtrend-server');
export const serverDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

export function computeTrackingHash(orderId: string, mobileNumber: string): string {
  const digits = mobileNumber.replace(/\D/g, '').slice(-10);
  return crypto
    .createHash('sha256')
    .update(`${orderId.trim().toUpperCase()}:${digits}`)
    .digest('hex');
}

export function computeUtrHash(utr: string): string {
  return crypto.createHash('sha256').update(utr.trim()).digest('hex');
}

export async function isUtrAlreadyUsedInFirestore(utr: string): Promise<boolean> {
  const clean = utr.trim();
  if (!/^\d{12}$/.test(clean)) return false;
  try {
    const snap = await getDoc(doc(serverDb, 'used_utrs', computeUtrHash(clean)));
    return snap.exists();
  } catch (err) {
    console.error('Firestore used_utrs lookup error:', err);
    return false;
  }
}

export async function claimUtrInFirestore(
  utr: string,
  orderId: string
): Promise<{ claimed: boolean; alreadyUsed: boolean }> {
  const clean = utr.trim();
  const utrHash = computeUtrHash(clean);
  const utrRef = doc(serverDb, 'used_utrs', utrHash);

  const existing = await getDoc(utrRef);
  if (existing.exists()) {
    return { claimed: false, alreadyUsed: true };
  }

  try {
    await setDoc(utrRef, {
      orderId,
      createdAt: serverTimestamp(),
    });
    return { claimed: true, alreadyUsed: false };
  } catch (err) {
    // If a concurrent request claimed this UTR first, Firestore rules reject the overwrite
    try {
      const checkAfter = await getDoc(utrRef);
      if (checkAfter.exists()) {
        return { claimed: false, alreadyUsed: true };
      }
    } catch {
      // fall through
    }
    throw err;
  }
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

const PUBLIC_CACHE_TTL_MS = 60_000;

let publicStoreCache: {
  expiresAt: number;
  value: { settings: PublicStoreSettings; initialized: boolean };
} | null = null;
let storeFetchInFlight: Promise<{ settings: PublicStoreSettings; initialized: boolean }> | null =
  null;

let publicProductsCache: {
  expiresAt: number;
  value: PublicProduct[];
} | null = null;
let productsFetchInFlight: Promise<PublicProduct[]> | null = null;

export function invalidatePublicCatalogCache(): void {
  publicStoreCache = null;
  publicProductsCache = null;
}

export function toSlimCatalogProduct(product: PublicProduct): PublicProduct {
  const reviews = Array.isArray(product.reviews) ? product.reviews : [];
  const reviewCount =
    typeof product.reviewCount === 'number' ? product.reviewCount : reviews.length;
  const averageRating =
    typeof product.averageRating === 'number'
      ? product.averageRating
      : reviews.length > 0
      ? Number(
          (
            reviews.reduce((sum, r) => sum + (Number(r.rating) || 5), 0) / reviews.length
          ).toFixed(1)
        )
      : undefined;

  return {
    ...product,
    images: product.images.length > 0 ? [product.images[0]] : [],
    reviews: undefined,
    reviewCount,
    ...(averageRating !== undefined ? { averageRating } : {}),
    isSummary: true,
  };
}

export async function warmPublicCatalogCache(
  fallbackSettings: PublicStoreSettings,
  fallbackProducts: PublicProduct[]
): Promise<void> {
  try {
    await Promise.all([
      fetchPublicStoreFromFirestore(fallbackSettings),
      fetchPublicProductsFromFirestore(fallbackProducts),
    ]);
  } catch {
    // silent startup warmup
  }
}

export async function fetchPublicStoreFromFirestore(
  fallback: PublicStoreSettings
): Promise<{ settings: PublicStoreSettings; initialized: boolean }> {
  const now = Date.now();
  if (publicStoreCache && publicStoreCache.expiresAt > now) {
    return publicStoreCache.value;
  }
  if (storeFetchInFlight) {
    return storeFetchInFlight;
  }

  storeFetchInFlight = (async () => {
    try {
      const snap = await getDoc(doc(serverDb, 'public_store', 'config'));
      if (!snap.exists()) {
        const res = { settings: fallback, initialized: false };
        publicStoreCache = { expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS, value: res };
        return res;
      }
      const data = snap.data() as Record<string, unknown>;
      const res = {
        initialized: true,
        settings: {
          storeName: String(data.storeName || fallback.storeName),
          storeDescription:
            typeof data.storeDescription === 'string'
              ? data.storeDescription
              : fallback.storeDescription,
          logoUrl: String(data.logoUrl ?? fallback.logoUrl),
          heroImageUrl:
            data.heroImageUrl === '/src/assets/images/hero_storefront_1794731351452.jpg'
              ? ''
              : String(data.heroImageUrl ?? fallback.heroImageUrl),
          currencySymbol: String(data.currencySymbol || fallback.currencySymbol),
          announcementText: String(data.announcementText ?? fallback.announcementText),
          codEnabled: typeof data.codEnabled === 'boolean' ? data.codEnabled : fallback.codEnabled,
          onlinePaymentEnabled:
            typeof data.onlinePaymentEnabled === 'boolean'
              ? data.onlinePaymentEnabled
              : fallback.onlinePaymentEnabled,
          upiId: String(data.upiId ?? ''),
          paymentGatewayName: String(data.paymentGatewayName || fallback.paymentGatewayName),
          paymentGatewayNote: String(data.paymentGatewayNote ?? fallback.paymentGatewayNote),
          freeShippingThreshold: Number(
            data.freeShippingThreshold ?? fallback.freeShippingThreshold
          ),
          shippingFee: Number(data.shippingFee ?? fallback.shippingFee),
          supportPhone: String(data.supportPhone ?? fallback.supportPhone),
          supportEmail: String(data.supportEmail ?? fallback.supportEmail),
          supportAddress: String(data.supportAddress ?? fallback.supportAddress),
        },
      };
      publicStoreCache = { expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS, value: res };
      return res;
    } catch (err) {
      console.error('Firestore public_store fetch error:', err);
      return publicStoreCache?.value ?? { settings: fallback, initialized: false };
    } finally {
      storeFetchInFlight = null;
    }
  })();

  return storeFetchInFlight;
}

export async function fetchPublicProductsFromFirestore(
  fallbackProducts: PublicProduct[]
): Promise<PublicProduct[]> {
  const now = Date.now();
  if (publicProductsCache && publicProductsCache.expiresAt > now) {
    return publicProductsCache.value;
  }
  if (productsFetchInFlight) {
    return productsFetchInFlight;
  }

  productsFetchInFlight = (async () => {
    let storeInitialized = publicStoreCache?.value.initialized ?? false;
    try {
      const [storeSnap, snap] = await Promise.all([
        publicStoreCache ? Promise.resolve(null) : getDoc(doc(serverDb, 'public_store', 'config')),
        getDocs(
          query(
            collection(serverDb, 'public_products'),
            where('status', 'in', ['Active', 'Out of Stock'])
          )
        ),
      ]);
      if (storeSnap) {
        storeInitialized = storeSnap.exists();
      }

      if (!storeInitialized && snap.empty) {
        publicProductsCache = {
          expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS,
          value: fallbackProducts,
        };
        return fallbackProducts;
      }

      const list: PublicProduct[] = snap.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: String(data.id || d.id),
            productCode: String(data.productCode || ''),
            name: String(data.name || ''),
            category: String(data.category || ''),
            images: Array.isArray(data.images) ? data.images.map(String) : [],
            originalPrice: Number(data.originalPrice || 0),
            sellingPrice: Number(data.sellingPrice || 0),
            onlinePrice: Number(data.onlinePrice || 0),
            discountPercent: Number(data.discountPercent || 0),
            description: String(data.description || ''),
            availableStock: Number(data.availableStock ?? 999),
            status:
              data.status === 'Out of Stock'
                ? ('Out of Stock' as const)
                : ('Active' as const),
            reviews: Array.isArray(data.reviews)
              ? data.reviews
                  .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
                  .slice(0, 20)
                  .map((r, idx) => ({
                    id: String(r.id || `rev-${idx + 1}`),
                    reviewerName: String(r.reviewerName || 'Verified Customer'),
                    rating: Math.min(5, Math.max(1, Number(r.rating) || 5)),
                    comment: String(r.comment || ''),
                    dateLabel: String(r.dateLabel || ''),
                    verified: typeof r.verified === 'boolean' ? r.verified : true,
                    images: Array.isArray(r.images)
                      ? r.images.map(String).filter(Boolean).slice(0, 4)
                      : [],
                  }))
                  .filter((r) => r.comment.length > 0)
              : [],
            colorOptions: Array.isArray(data.colorOptions)
              ? data.colorOptions
                  .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
                  .slice(0, 20)
                  .map((c) => {
                    const name = String(c.name || '').trim().slice(0, 60);
                    const idx =
                      c.imageIndex !== undefined && c.imageIndex !== null && c.imageIndex !== ''
                        ? Math.floor(Number(c.imageIndex))
                        : undefined;
                    return {
                      name,
                      ...(idx !== undefined && Number.isFinite(idx) && idx >= 0 && idx <= 11
                        ? { imageIndex: idx }
                        : {}),
                    };
                  })
                  .filter((c) => c.name.length > 0)
              : [],
            sizeOptions: Array.isArray(data.sizeOptions)
              ? data.sizeOptions
                  .map((s) => String(s || '').trim().slice(0, 40))
                  .filter(Boolean)
                  .slice(0, 20)
              : [],
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      publicProductsCache = { expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS, value: list };
      return list;
    } catch (err) {
      console.error('Firestore public_products fetch error:', err);
      return publicProductsCache?.value ?? (storeInitialized ? [] : fallbackProducts);
    } finally {
      productsFetchInFlight = null;
    }
  })();

  return productsFetchInFlight;
}

export async function saveOrderToFirestore(
  order: Order,
  resellerFieldsEnriched: boolean
): Promise<void> {
  const trackingHash = computeTrackingHash(order.orderId, order.mobileNumber);

  const orderDoc: Record<string, unknown> = {
    orderId: order.orderId,
    timestamp: order.timestamp,
    customerName: order.customerName.slice(0, 120),
    mobileNumber: order.mobileNumber.slice(0, 20),
    email: order.email.slice(0, 120),
    fullAddress: order.fullAddress.slice(0, 500),
    city: order.city.slice(0, 100),
    state: order.state.slice(0, 100),
    pincode: order.pincode,
    landmark: order.landmark.slice(0, 200),
    items: order.items,
    productNames: order.productNames.slice(0, 2000),
    productCodes: order.productCodes.slice(0, 1000),
    quantity: order.quantity,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    totalAmount: order.totalAmount,
    sourceOrderAmount: order.sourceOrderAmount,
    expectedProfit: order.expectedProfit,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    codAmount: order.codAmount,
    orderStatus: order.orderStatus,
    appsScriptSyncStatus: order.appsScriptSyncStatus,
    resellerFieldsEnriched,
    trackingHash,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (order.paymentReference) {
    orderDoc.paymentReference = order.paymentReference.slice(0, 100);
  }
  if (order.paymentProofImage) {
    orderDoc.paymentProofImage = order.paymentProofImage.slice(0, 260000);
  }
  if (order.appsScriptSyncMessage) {
    orderDoc.appsScriptSyncMessage = order.appsScriptSyncMessage.slice(0, 500);
  }

  const firstNameOnly = order.customerName.trim().split(/\s+/)[0] || 'Customer';
  const trackingDoc = {
    orderId: order.orderId,
    timestamp: order.timestamp,
    customerName: firstNameOnly.slice(0, 120),
    city: order.city.slice(0, 100),
    state: order.state.slice(0, 100),
    pincode: order.pincode,
    items: order.items.map((item) => ({
      productId: item.productId,
      productCode: item.productCode,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      ...(item.selectedColor ? { selectedColor: item.selectedColor } : {}),
      ...(item.selectedSize ? { selectedSize: item.selectedSize } : {}),
    })),
    productNames: order.productNames.slice(0, 2000),
    productCodes: order.productCodes.slice(0, 1000),
    quantity: order.quantity,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    codAmount: order.codAmount,
    orderStatus: order.orderStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await Promise.all([
    setDoc(doc(serverDb, 'orders', order.orderId), orderDoc),
    setDoc(doc(serverDb, 'order_tracking', trackingHash), trackingDoc),
  ]);
}

export async function fetchOrderTrackingFromFirestore(
  orderId: string,
  mobileNumber: string
): Promise<Partial<PublicOrder> | null> {
  const digits = mobileNumber.replace(/\D/g, '').slice(-10);
  if (!orderId.trim() || digits.length < 10) return null;

  const trackingHash = computeTrackingHash(orderId, digits);
  try {
    const snap = await getDoc(doc(serverDb, 'order_tracking', trackingHash));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    return {
      orderId: String(data.orderId || orderId.trim().toUpperCase()),
      timestamp: String(data.timestamp || ''),
      customerName: String(data.customerName || 'Customer'),
      city: String(data.city || ''),
      state: String(data.state || ''),
      pincode: String(data.pincode || ''),
      items: Array.isArray(data.items)
        ? (data.items as PublicOrder['items'])
        : [],
      productNames: String(data.productNames || ''),
      productCodes: String(data.productCodes || ''),
      quantity: Number(data.quantity || 0),
      totalAmount: Number(data.totalAmount || 0),
      paymentMethod: data.paymentMethod === 'Online' ? 'Online' : 'COD',
      paymentStatus: (data.paymentStatus as PublicOrder['paymentStatus']) || 'Unpaid',
      codAmount: Number(data.codAmount || 0),
      orderStatus: (data.orderStatus as PublicOrder['orderStatus']) || 'New',
    };
  } catch (err) {
    console.error('Firestore order_tracking fetch error:', err);
    return null;
  }
}

export async function saveSupportMessageToFirestore(payload: {
  id: string;
  name: string;
  mobileOrEmail: string;
  orderId?: string;
  message: string;
}): Promise<void> {
  const docData: Record<string, unknown> = {
    id: payload.id,
    name: payload.name.slice(0, 120),
    mobileOrEmail: payload.mobileOrEmail.slice(0, 120),
    message: payload.message.slice(0, 2000),
    createdAt: serverTimestamp(),
  };
  if (payload.orderId) {
    docData.orderId = payload.orderId.slice(0, 64);
  }
  await setDoc(doc(serverDb, 'support_messages', payload.id), docData);
}

function maskUpiId(upi: string): string {
  const trimmed = upi.trim();
  if (!trimmed) return '';
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 2) return trimmed.slice(0, 1) + '***' + (atIdx >= 0 ? trimmed.slice(atIdx) : '');
  return trimmed.slice(0, 2) + '****' + trimmed.slice(atIdx);
}

export async function fetchReturnRequestFromFirestore(
  orderId: string,
  mobileNumber: string
): Promise<PublicReturnRequest | null> {
  const digits = mobileNumber.replace(/\D/g, '').slice(-10);
  if (!orderId.trim() || digits.length < 10) return null;

  const trackingHash = computeTrackingHash(orderId, digits);
  try {
    const snap = await getDoc(doc(serverDb, 'return_requests', trackingHash));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const rawUpi = typeof data.customerUpiId === 'string' ? data.customerUpiId : '';
    return {
      trackingHash: String(data.trackingHash || trackingHash),
      orderId: String(data.orderId || orderId.trim().toUpperCase()),
      customerName: String(data.customerName || 'Customer'),
      requestType: data.requestType === 'Replacement' ? 'Replacement' : 'Return & Refund',
      reason: String(data.reason || ''),
      details: String(data.details || ''),
      maskedUpiId: rawUpi ? maskUpiId(rawUpi) : undefined,
      proofImages: Array.isArray(data.proofImages) ? data.proofImages.map(String).slice(0, 3) : [],
      returnStatus: (data.returnStatus as ReturnStatus) || 'Requested',
      refundStatus: (data.refundStatus as ReturnRefundStatus) || 'Pending',
      meeshoReturnId:
        typeof data.meeshoReturnId === 'string' && data.meeshoReturnId
          ? data.meeshoReturnId
          : undefined,
      pickupNote:
        typeof data.pickupNote === 'string' && data.pickupNote ? data.pickupNote : undefined,
      adminNote: typeof data.adminNote === 'string' && data.adminNote ? data.adminNote : undefined,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
    };
  } catch (err) {
    console.error('Firestore return_requests fetch error:', err);
    return null;
  }
}

export async function saveReturnRequestToFirestore(payload: {
  orderId: string;
  mobileNumber: string;
  customerName: string;
  requestType: ReturnRequestType;
  reason: string;
  details: string;
  customerUpiId?: string;
  proofImages: string[];
}): Promise<PublicReturnRequest> {
  const trackingHash = computeTrackingHash(payload.orderId, payload.mobileNumber);
  const refundStatus: ReturnRefundStatus =
    payload.requestType === 'Replacement' ? 'Not Applicable' : 'Pending';

  const docData: Record<string, unknown> = {
    trackingHash,
    orderId: payload.orderId.trim().toUpperCase().slice(0, 64),
    customerName: payload.customerName.trim().slice(0, 120) || 'Customer',
    requestType: payload.requestType,
    reason: payload.reason.trim().slice(0, 120),
    details: payload.details.trim().slice(0, 1500),
    proofImages: payload.proofImages.slice(0, 3),
    returnStatus: 'Requested',
    refundStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (payload.customerUpiId && payload.customerUpiId.trim()) {
    docData.customerUpiId = payload.customerUpiId.trim().slice(0, 120);
  }

  await setDoc(doc(serverDb, 'return_requests', trackingHash), docData);

  const nowIso = new Date().toISOString();
  return {
    trackingHash,
    orderId: String(docData.orderId),
    customerName: String(docData.customerName),
    requestType: payload.requestType,
    reason: String(docData.reason),
    details: String(docData.details),
    maskedUpiId:
      payload.customerUpiId && payload.customerUpiId.trim()
        ? maskUpiId(payload.customerUpiId)
        : undefined,
    proofImages: payload.proofImages.slice(0, 3),
    returnStatus: 'Requested',
    refundStatus,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function fetchCancelRequestFromFirestore(
  orderId: string,
  mobileNumber: string
): Promise<PublicCancelRequest | null> {
  const digits = mobileNumber.replace(/\D/g, '').slice(-10);
  if (!orderId.trim() || digits.length < 10) return null;

  const trackingHash = computeTrackingHash(orderId, digits);
  try {
    const snap = await getDoc(doc(serverDb, 'cancel_requests', trackingHash));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const rawUpi = typeof data.customerUpiId === 'string' ? data.customerUpiId : '';
    return {
      trackingHash: String(data.trackingHash || trackingHash),
      orderId: String(data.orderId || orderId.trim().toUpperCase()),
      customerName: String(data.customerName || 'Customer'),
      reason: String(data.reason || ''),
      note: String(data.note || ''),
      maskedUpiId: rawUpi ? maskUpiId(rawUpi) : undefined,
      cancelStatus: (data.cancelStatus as CancelRequestStatus) || 'Requested',
      adminNote: typeof data.adminNote === 'string' && data.adminNote ? data.adminNote : undefined,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
    };
  } catch (err) {
    console.error('Firestore cancel_requests fetch error:', err);
    return null;
  }
}

export async function saveCancelRequestToFirestore(payload: {
  orderId: string;
  mobileNumber: string;
  customerName: string;
  reason: string;
  note: string;
  customerUpiId?: string;
}): Promise<PublicCancelRequest> {
  const trackingHash = computeTrackingHash(payload.orderId, payload.mobileNumber);

  const docData: Record<string, unknown> = {
    trackingHash,
    orderId: payload.orderId.trim().toUpperCase().slice(0, 64),
    customerName: payload.customerName.trim().slice(0, 120) || 'Customer',
    reason: payload.reason.trim().slice(0, 120),
    note: payload.note.trim().slice(0, 500),
    cancelStatus: 'Requested',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (payload.customerUpiId && payload.customerUpiId.trim()) {
    docData.customerUpiId = payload.customerUpiId.trim().slice(0, 120);
  }

  await setDoc(doc(serverDb, 'cancel_requests', trackingHash), docData);

  const nowIso = new Date().toISOString();
  return {
    trackingHash,
    orderId: String(docData.orderId),
    customerName: String(docData.customerName),
    reason: String(docData.reason),
    note: String(docData.note),
    maskedUpiId:
      payload.customerUpiId && payload.customerUpiId.trim()
        ? maskUpiId(payload.customerUpiId)
        : undefined,
    cancelStatus: 'Requested',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function verifyFirebaseAdminIdToken(
  idToken: string
): Promise<{ valid: boolean; email?: string }> {
  if (!idToken || !firebaseConfig.apiKey) {
    return { valid: false };
  }
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
        firebaseConfig.apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return { valid: false };
    const data = (await res.json()) as {
      users?: Array<{ email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user || !user.emailVerified) {
      return { valid: false };
    }
    const email = (user.email || '').toLowerCase();
    if (email !== 'nk4080294@gmail.com') {
      return { valid: false };
    }
    return { valid: true, email };
  } catch {
    return { valid: false };
  }
}

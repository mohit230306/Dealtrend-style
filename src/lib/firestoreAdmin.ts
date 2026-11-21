import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import type {
  AdminStoreSettings,
  CancelRequest,
  CancelRequestStatus,
  DashboardMetrics,
  Order,
  OrderStatus,
  PaymentStatus,
  Product,
  ProductColorOption,
  ProductReview,
  PublicStoreSettings,
  ReturnRefundStatus,
  ReturnRequest,
  ReturnStatus,
  SupportMessage,
} from '../types';
import { calculateDiscountPercent, normalizeImageUrl } from '../utils/format';
import { db, handleFirestoreError, OperationType } from './firebase';

export const DEFAULT_PUBLIC_STORE_SEED: PublicStoreSettings = {
  storeName: 'DealTrend',
  storeDescription:
    'Explore curated daily deals and trending essentials at everyday value. Fast dispatch with Cash on Delivery available.',
  logoUrl: '/assets/aistudio/IMG_20260724_225713_a2747bae.jpg',
  heroImageUrl: '',
  currencySymbol: '₹',
  announcementText:
    'Smart Shopping. Daily Deals. · Free shipping above ₹1,499 · Cash on Delivery available',
  codEnabled: true,
  onlinePaymentEnabled: true,
  upiId: '',
  paymentGatewayName: 'UPI / Online Payment',
  paymentGatewayNote:
    'Online payment requests remain in Pending Verification until confirmed by our payment gateway or verification desk.',
  freeShippingThreshold: 1499,
  shippingFee: 99,
  supportPhone: '+91 98200 41200',
  supportEmail: 'care@dealtrend.in',
  supportAddress: '42 Indiranagar 100 Feet Road, Bengaluru 560038',
};

export const DEFAULT_ADMIN_SETTINGS_SEED = {
  appsScriptUrl: '',
  googleDriveFolderUrl: '',
  lastConnectionStatus: 'Not Configured' as const,
  lastConnectionMessage: 'Paste your Google Apps Script Web App URL to enable Google Sheets sync.',
};

export const STARTER_PRODUCTS_SEED: Array<Omit<Product, 'createdAt' | 'updatedAt'>> = [
  {
    id: 'prod-kettle-101',
    productCode: 'DT-KTL-101',
    name: 'Matte Clay & Brass Pour-Over Kettle',
    category: 'Kitchen & Brew',
    images: [
      '/src/assets/images/product_ceramic_kettle_1794731350403.jpg',
      '/src/assets/images/hero_storefront_1794731351452.jpg',
    ],
    originalPrice: 3499,
    sellingPrice: 2799,
    discountPercent: 20,
    sourcePrice: 1850,
    expectedProfit: 949,
    sourceProductUrl: 'https://www.meesho.com/search?q=gooseneck+pour+over+kettle',
    description:
      'Precision gooseneck pour-over kettle crafted from matte stoneware-finished steel with a brushed solid brass spout and balanced walnut handle. Engineered for slow, controlled extraction.',
    availableStock: 999,
    status: 'Active',
  },
  {
    id: 'prod-speaker-204',
    productCode: 'DT-AUD-204',
    name: 'Walnut Acoustic Wireless Speaker',
    category: 'Audio',
    images: [
      '/src/assets/images/product_wireless_speaker_1794731351786.jpg',
      '/src/assets/images/hero_storefront_1794731351452.jpg',
    ],
    originalPrice: 6999,
    sellingPrice: 5499,
    discountPercent: 21,
    sourcePrice: 3890,
    expectedProfit: 1609,
    sourceProductUrl: 'https://www.meesho.com/search?q=wooden+wireless+bluetooth+speaker',
    description:
      'Hand-finished walnut enclosure paired with an anodized aluminum grille. Features 18-hour USB-C battery life, warm room-filling acoustics, and low-latency Bluetooth 5.3.',
    availableStock: 999,
    status: 'Active',
  },
  {
    id: 'prod-tote-302',
    productCode: 'DT-BAG-302',
    name: 'Vegetable-Tanned Leather Carry Tote',
    category: 'Carry & Leather',
    images: ['/src/assets/images/product_leather_tote_1794731351228.jpg'],
    originalPrice: 5299,
    sellingPrice: 4299,
    discountPercent: 19,
    sourcePrice: 2950,
    expectedProfit: 1349,
    sourceProductUrl: 'https://www.meesho.com/search?q=leather+tote+handbag',
    description:
      'Structured full-grain leather tote with solid brass hardware, reinforced bridle handles, and a padded 15-inch laptop sleeve built for daily commute and travel.',
    availableStock: 999,
    status: 'Active',
  },
  {
    id: 'prod-lamp-405',
    productCode: 'DT-LMP-405',
    name: 'Architectural Anodized Desk Lamp',
    category: 'Lighting',
    images: [
      '/src/assets/images/product_desk_lamp_1794731352150.jpg',
      '/src/assets/images/hero_storefront_1794731351452.jpg',
    ],
    originalPrice: 4499,
    sellingPrice: 3699,
    discountPercent: 18,
    sourcePrice: 2450,
    expectedProfit: 1249,
    sourceProductUrl: 'https://www.meesho.com/search?q=modern+led+desk+lamp',
    description:
      'Precision-machined matte charcoal aluminum task lamp with dual-hinge articulation, high-CRI warm 3000K LED diffusion, and stepless touch dimming on the weighted base.',
    availableStock: 999,
    status: 'Active',
  },
  {
    id: 'prod-linen-501',
    productCode: 'DT-TEX-501',
    name: 'Stonewashed Belgian Linen Throw',
    category: 'Home Textiles',
    images: ['/src/assets/images/product_linen_throw_1794731352816.jpg'],
    originalPrice: 2899,
    sellingPrice: 2299,
    discountPercent: 21,
    sourcePrice: 1420,
    expectedProfit: 879,
    sourceProductUrl: 'https://www.meesho.com/search?q=cotton+linen+sofa+throw+blanket',
    description:
      'Woven from organic flax and enzyme stonewashed for immediate softness. Breathable year-round weight with hand-knotted fringe in oat and muted sage.',
    availableStock: 999,
    status: 'Active',
  },
  {
    id: 'prod-brewset-108',
    productCode: 'DT-BRW-108',
    name: 'Studio Ceramic Dripper & Server Set',
    category: 'Kitchen & Brew',
    images: [
      '/src/assets/images/hero_storefront_1794731351452.jpg',
      '/src/assets/images/product_ceramic_kettle_1794731350403.jpg',
    ],
    originalPrice: 4199,
    sellingPrice: 3499,
    discountPercent: 17,
    sourcePrice: 2280,
    expectedProfit: 1219,
    sourceProductUrl: 'https://www.meesho.com/search?q=ceramic+coffee+dripper+set',
    description:
      'Speckled stoneware dripper and matching carafe with walnut handle. Retains thermal stability throughout the brew cycle for clean, aromatic filter coffee.',
    availableStock: 999,
    status: 'Active',
  },
];

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function ensureFirestoreSeeded(): Promise<void> {
  try {
    const publicStoreRef = doc(db, 'public_store', 'config');
    const adminSettingsRef = doc(db, 'admin_settings', 'config');
    const [pubSnap, admSnap] = await Promise.all([
      getDoc(publicStoreRef),
      getDoc(adminSettingsRef),
    ]);

    if (!pubSnap.exists()) {
      await setDoc(publicStoreRef, {
        ...DEFAULT_PUBLIC_STORE_SEED,
        updatedAt: serverTimestamp(),
      });
    }

    if (!admSnap.exists()) {
      await setDoc(adminSettingsRef, {
        ...DEFAULT_ADMIN_SETTINGS_SEED,
        updatedAt: serverTimestamp(),
      });
    }

    const adminProductsSnap = await getDocs(collection(db, 'admin_products'));
    if (adminProductsSnap.empty && !pubSnap.exists()) {
      await Promise.all(
        STARTER_PRODUCTS_SEED.map(async (item) => {
          const ts = serverTimestamp();
          await setDoc(doc(db, 'admin_products', item.id), {
            ...item,
            createdAt: ts,
            updatedAt: ts,
          });
          if (item.status !== 'Hidden') {
            await setDoc(doc(db, 'public_products', item.id), {
              id: item.id,
              productCode: item.productCode,
              name: item.name,
              category: item.category,
              images: item.images,
              originalPrice: item.originalPrice,
              sellingPrice: item.sellingPrice,
              discountPercent: item.discountPercent,
              description: item.description,
              availableStock: item.availableStock,
              status: item.status,
              createdAt: ts,
              updatedAt: ts,
            });
          }
        })
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'public_store/config');
  }
}

export async function loadAdminSettingsFromFirestore(): Promise<AdminStoreSettings> {
  try {
    const [pubSnap, admSnap] = await Promise.all([
      getDoc(doc(db, 'public_store', 'config')),
      getDoc(doc(db, 'admin_settings', 'config')),
    ]);

    const pubData = pubSnap.exists() ? (pubSnap.data() as Record<string, unknown>) : {};
    const admData = admSnap.exists() ? (admSnap.data() as Record<string, unknown>) : {};

    return {
      storeName: String(pubData.storeName || DEFAULT_PUBLIC_STORE_SEED.storeName),
      storeDescription:
        typeof pubData.storeDescription === 'string'
          ? pubData.storeDescription
          : DEFAULT_PUBLIC_STORE_SEED.storeDescription,
      logoUrl: String(pubData.logoUrl ?? DEFAULT_PUBLIC_STORE_SEED.logoUrl),
      heroImageUrl:
        pubData.heroImageUrl === '/src/assets/images/hero_storefront_1794731351452.jpg'
          ? ''
          : String(pubData.heroImageUrl ?? DEFAULT_PUBLIC_STORE_SEED.heroImageUrl),
      currencySymbol: String(pubData.currencySymbol || DEFAULT_PUBLIC_STORE_SEED.currencySymbol),
      announcementText: String(
        pubData.announcementText ?? DEFAULT_PUBLIC_STORE_SEED.announcementText
      ),
      codEnabled:
        typeof pubData.codEnabled === 'boolean'
          ? pubData.codEnabled
          : DEFAULT_PUBLIC_STORE_SEED.codEnabled,
      onlinePaymentEnabled:
        typeof pubData.onlinePaymentEnabled === 'boolean'
          ? pubData.onlinePaymentEnabled
          : DEFAULT_PUBLIC_STORE_SEED.onlinePaymentEnabled,
      upiId: String(pubData.upiId ?? ''),
      paymentGatewayName: String(
        pubData.paymentGatewayName || DEFAULT_PUBLIC_STORE_SEED.paymentGatewayName
      ),
      paymentGatewayNote: String(
        pubData.paymentGatewayNote ?? DEFAULT_PUBLIC_STORE_SEED.paymentGatewayNote
      ),
      freeShippingThreshold: Number(
        pubData.freeShippingThreshold ?? DEFAULT_PUBLIC_STORE_SEED.freeShippingThreshold
      ),
      shippingFee: Number(pubData.shippingFee ?? DEFAULT_PUBLIC_STORE_SEED.shippingFee),
      supportPhone: String(pubData.supportPhone ?? DEFAULT_PUBLIC_STORE_SEED.supportPhone),
      supportEmail: String(pubData.supportEmail ?? DEFAULT_PUBLIC_STORE_SEED.supportEmail),
      supportAddress: String(pubData.supportAddress ?? DEFAULT_PUBLIC_STORE_SEED.supportAddress),
      appsScriptUrl: String(admData.appsScriptUrl ?? ''),
      googleDriveFolderUrl: String(admData.googleDriveFolderUrl ?? ''),
      lastConnectionTestAt:
        typeof admData.lastConnectionTestAt === 'string'
          ? admData.lastConnectionTestAt
          : undefined,
      lastConnectionStatus:
        admData.lastConnectionStatus === 'Connected' ||
        admData.lastConnectionStatus === 'Failed' ||
        admData.lastConnectionStatus === 'Not Configured'
          ? admData.lastConnectionStatus
          : 'Not Configured',
      lastConnectionMessage: String(
        admData.lastConnectionMessage ?? DEFAULT_ADMIN_SETTINGS_SEED.lastConnectionMessage
      ),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'admin_settings/config');
  }
}

export async function saveAdminSettingsToFirestore(
  settings: AdminStoreSettings
): Promise<AdminStoreSettings> {
  const publicPayload = {
    storeName: settings.storeName.trim().slice(0, 100) || DEFAULT_PUBLIC_STORE_SEED.storeName,
    storeDescription: settings.storeDescription.trim().slice(0, 600),
    logoUrl: normalizeImageUrl(settings.logoUrl).slice(0, 500000),
    heroImageUrl: normalizeImageUrl(settings.heroImageUrl).slice(0, 500000),
    currencySymbol: settings.currencySymbol.trim().slice(0, 6) || '₹',
    announcementText: settings.announcementText.trim().slice(0, 300),
    codEnabled: Boolean(settings.codEnabled),
    onlinePaymentEnabled: Boolean(settings.onlinePaymentEnabled),
    upiId: settings.upiId.trim().slice(0, 120),
    paymentGatewayName: settings.paymentGatewayName.trim().slice(0, 100),
    paymentGatewayNote: settings.paymentGatewayNote.trim().slice(0, 500),
    freeShippingThreshold: Math.max(0, Number(settings.freeShippingThreshold) || 0),
    shippingFee: Math.max(0, Number(settings.shippingFee) || 0),
    supportPhone: settings.supportPhone.trim().slice(0, 40),
    supportEmail: settings.supportEmail.trim().slice(0, 120),
    supportAddress: settings.supportAddress.trim().slice(0, 300),
    updatedAt: serverTimestamp(),
  };

  const cleanAppsScript = settings.appsScriptUrl.trim().slice(0, 1000);
  const adminPayload: Record<string, unknown> = {
    appsScriptUrl: cleanAppsScript,
    googleDriveFolderUrl: settings.googleDriveFolderUrl.trim().slice(0, 1000),
    lastConnectionStatus: cleanAppsScript
      ? settings.lastConnectionStatus || 'Not Configured'
      : 'Not Configured',
    lastConnectionMessage: cleanAppsScript
      ? (settings.lastConnectionMessage || 'URL saved. Click Test Connection to verify.').slice(
          0,
          500
        )
      : 'Paste your Google Apps Script Web App URL to enable Google Sheets sync.',
    updatedAt: serverTimestamp(),
  };
  if (settings.lastConnectionTestAt) {
    adminPayload.lastConnectionTestAt = settings.lastConnectionTestAt.slice(0, 64);
  }

  try {
    await Promise.all([
      setDoc(doc(db, 'public_store', 'config'), publicPayload),
      setDoc(doc(db, 'admin_settings', 'config'), adminPayload),
    ]);
    return loadAdminSettingsFromFirestore();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'admin_settings/config');
  }
}

function sanitizeReviews(input: unknown): ProductReview[] {
  if (!Array.isArray(input)) return [];
  const defaultDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return input
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
    .slice(0, 20)
    .map((r, idx) => {
      const reviewerName = String(r.reviewerName || '').trim().slice(0, 80);
      const comment = String(r.comment || '').trim().slice(0, 600);
      if (!reviewerName || !comment) return null;
      const ratingNum = Number(r.rating);
      const rating = Number.isFinite(ratingNum)
        ? Math.min(5, Math.max(1, Math.round(ratingNum)))
        : 5;
      const dateLabel = (String(r.dateLabel || '').trim() || defaultDate).slice(0, 40);
      const rawId = String(r.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
      const id = (rawId || `rev-${idx + 1}`).slice(0, 64);
      const images = Array.isArray(r.images)
        ? r.images
            .map((img) => normalizeImageUrl(String(img || '')))
            .filter((img) => Boolean(img) && img.length <= 250000)
            .slice(0, 4)
        : [];
      return {
        id,
        reviewerName,
        rating,
        comment,
        dateLabel,
        verified: typeof r.verified === 'boolean' ? r.verified : true,
        images,
      } satisfies ProductReview;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

function sanitizeColorOptions(input: unknown, maxImageCount: number): ProductColorOption[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ProductColorOption[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = String(obj.name || '').trim().slice(0, 60);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const opt: ProductColorOption = { name };
    if (
      obj.imageIndex !== undefined &&
      obj.imageIndex !== null &&
      obj.imageIndex !== ''
    ) {
      const idx = Math.floor(Number(obj.imageIndex));
      if (Number.isFinite(idx) && idx >= 0 && idx < Math.min(12, Math.max(0, maxImageCount))) {
        opt.imageIndex = idx;
      }
    }
    out.push(opt);
    if (out.length >= 20) break;
  }
  return out;
}

function sanitizeSizeOptions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const val = String(raw || '').trim().slice(0, 40);
    if (!val) continue;
    const key = val.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(val);
    if (out.length >= 20) break;
  }
  return out;
}

export async function loadAdminProductsFromFirestore(): Promise<Product[]> {
  try {
    const snap = await getDocs(collection(db, 'admin_products'));
    const list: Product[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const images = Array.isArray(data.images) ? data.images.map(String) : [];
      return {
        id: String(data.id || d.id),
        productCode: String(data.productCode || ''),
        name: String(data.name || ''),
        category: String(data.category || ''),
        images,
        originalPrice: Number(data.originalPrice || 0),
        sellingPrice: Number(data.sellingPrice || 0),
        onlinePrice: Number(data.onlinePrice || 0),
        discountPercent: Number(data.discountPercent || 0),
        sourcePrice: Number(data.sourcePrice || 0),
        expectedProfit: Number(data.expectedProfit || 0),
        sourceProductUrl: String(data.sourceProductUrl || ''),
        description: String(data.description || ''),
        availableStock: Number(data.availableStock ?? 999),
        status:
          data.status === 'Hidden' || data.status === 'Out of Stock' || data.status === 'Active'
            ? data.status
            : 'Active',
        reviews: sanitizeReviews(data.reviews),
        colorOptions: sanitizeColorOptions(data.colorOptions, images.length),
        sizeOptions: sanitizeSizeOptions(data.sizeOptions),
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt),
      };
    });
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'admin_products');
  }
}

export async function saveProductToFirestore(
  input: {
    id?: string;
    productCode?: string;
    name: string;
    category: string;
    originalPrice: number;
    sellingPrice: number;
    onlinePrice?: number;
    sourcePrice: number;
    sourceProductUrl: string;
    availableStock: number;
    status: Product['status'];
    description: string;
    images: string[];
    reviews?: ProductReview[];
    colorOptions?: ProductColorOption[];
    sizeOptions?: string[];
  },
  existingProducts: Product[]
): Promise<Product> {
  const id =
    input.id ||
    `prod-${crypto.getRandomValues(new Uint32Array(2)).reduce((acc, n) => acc + n.toString(16), '').slice(0, 8)}`;

  const existingCodes = new Set(
    existingProducts.filter((p) => p.id !== id).map((p) => p.productCode.toUpperCase())
  );

  let productCode = (input.productCode || '').trim().toUpperCase().slice(0, 64);
  if (!productCode) {
    const prefix =
      input.name
        .replace(/[^a-zA-Z]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'PRD';
    productCode = `DT-${prefix}-${Math.floor(100 + Math.random() * 900)}`;
    while (existingCodes.has(productCode)) {
      productCode = `DT-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
  } else if (existingCodes.has(productCode)) {
    throw new Error(`Internal Product Code "${productCode}" already exists.`);
  }

  const sellingPrice = Number(input.sellingPrice);
  if (!(sellingPrice > 0)) {
    throw new Error('My Selling Price must be greater than 0.');
  }
  const rawOnlinePrice = Number(input.onlinePrice) || 0;
  const onlinePrice = rawOnlinePrice > 0 ? Number(rawOnlinePrice.toFixed(2)) : 0;
  const originalPrice = Math.max(sellingPrice, Number(input.originalPrice) || sellingPrice);
  const sourcePrice = Math.max(0, Number(input.sourcePrice) || 0);
  const expectedProfit = Number((sellingPrice - sourcePrice).toFixed(2));
  const discountPercent = calculateDiscountPercent(originalPrice, sellingPrice);
  const images = input.images
    .map((img) => normalizeImageUrl(img))
    .filter(Boolean)
    .slice(0, 12);

  const cleanName = input.name.trim().slice(0, 200);
  const cleanCategory = input.category.trim().slice(0, 100);
  if (cleanName.length < 2) {
    throw new Error('Product Name must be at least 2 characters.');
  }
  if (!cleanCategory) {
    throw new Error('Category is required.');
  }

  const adminRef = doc(db, 'admin_products', id);
  const pubRef = doc(db, 'public_products', id);

  try {
    const existingAdminSnap = input.id ? await getDoc(adminRef) : null;
    const isExistingAdmin = Boolean(existingAdminSnap && existingAdminSnap.exists());
    const existingPubSnap = isExistingAdmin ? await getDoc(pubRef) : null;
    const isExistingPub = Boolean(existingPubSnap && existingPubSnap.exists());

    const existingAdminCreatedAt =
      existingAdminSnap && existingAdminSnap.exists()
        ? existingAdminSnap.data().createdAt
        : serverTimestamp();
    const existingPubCreatedAt =
      existingPubSnap && existingPubSnap.exists()
        ? existingPubSnap.data().createdAt
        : serverTimestamp();

    const cleanReviews = sanitizeReviews(input.reviews);
    const cleanColorOptions = sanitizeColorOptions(input.colorOptions, images.length);
    const cleanSizeOptions = sanitizeSizeOptions(input.sizeOptions);

    const adminDocData = {
      id,
      productCode,
      name: cleanName,
      category: cleanCategory,
      images,
      originalPrice,
      sellingPrice,
      onlinePrice,
      discountPercent,
      sourcePrice,
      expectedProfit,
      sourceProductUrl: input.sourceProductUrl.trim().slice(0, 2000),
      description: input.description.trim().slice(0, 4000),
      availableStock: Math.max(0, Math.floor(Number(input.availableStock) || 0)),
      status: input.status,
      reviews: cleanReviews,
      colorOptions: cleanColorOptions,
      sizeOptions: cleanSizeOptions,
      createdAt: existingAdminCreatedAt,
      updatedAt: serverTimestamp(),
    };

    if (isExistingAdmin) {
      await updateDoc(adminRef, adminDocData);
    } else {
      await setDoc(adminRef, adminDocData);
    }

    if (input.status === 'Hidden') {
      if (isExistingPub) {
        await deleteDoc(pubRef);
      }
    } else {
      const publicDocData = {
        id,
        productCode,
        name: adminDocData.name,
        category: adminDocData.category,
        images: adminDocData.images,
        originalPrice: adminDocData.originalPrice,
        sellingPrice: adminDocData.sellingPrice,
        onlinePrice: adminDocData.onlinePrice,
        discountPercent: adminDocData.discountPercent,
        description: adminDocData.description,
        availableStock: adminDocData.availableStock,
        status: input.status,
        reviews: cleanReviews,
        colorOptions: cleanColorOptions,
        sizeOptions: cleanSizeOptions,
        createdAt: existingPubCreatedAt,
        updatedAt: serverTimestamp(),
      };
      if (isExistingPub) {
        await updateDoc(pubRef, publicDocData);
      } else {
        await setDoc(pubRef, publicDocData);
      }
    }

    const updatedSnap = await getDoc(adminRef);
    const saved = updatedSnap.data() as Record<string, unknown>;
    return {
      ...adminDocData,
      createdAt: timestampToIso(saved?.createdAt),
      updatedAt: timestampToIso(saved?.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `admin_products/${id}`);
  }
}

export async function deleteProductFromFirestore(productId: string): Promise<void> {
  try {
    await Promise.all([
      deleteDoc(doc(db, 'admin_products', productId)),
      deleteDoc(doc(db, 'public_products', productId)),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `admin_products/${productId}`);
  }
}

interface StoredOrderDoc extends Order {
  resellerFieldsEnriched?: boolean;
  trackingHash?: string;
  createdAt?: unknown;
}

export async function loadAndEnrichOrdersFromFirestore(
  adminProducts: Product[]
): Promise<Order[]> {
  try {
    const snap = await getDocs(collection(db, 'orders'));
    const productMap = new Map(adminProducts.map((p) => [p.id, p]));
    const orders: Order[] = [];

    for (const d of snap.docs) {
      const data = d.data() as StoredOrderDoc;
      let order: Order = {
        orderId: String(data.orderId || d.id),
        timestamp: String(data.timestamp || timestampToIso(data.createdAt)),
        customerName: String(data.customerName || ''),
        mobileNumber: String(data.mobileNumber || ''),
        email: String(data.email || ''),
        fullAddress: String(data.fullAddress || ''),
        city: String(data.city || ''),
        state: String(data.state || ''),
        pincode: String(data.pincode || ''),
        landmark: String(data.landmark || ''),
        items: Array.isArray(data.items) ? data.items : [],
        productNames: String(data.productNames || ''),
        productCodes: String(data.productCodes || ''),
        quantity: Number(data.quantity || 0),
        subtotal: Number(data.subtotal || 0),
        shippingFee: Number(data.shippingFee || 0),
        totalAmount: Number(data.totalAmount || 0),
        sourceOrderAmount: Number(data.sourceOrderAmount || 0),
        expectedProfit: Number(data.expectedProfit || 0),
        paymentMethod: data.paymentMethod === 'Online' ? 'Online' : 'COD',
        paymentStatus: data.paymentStatus || 'Unpaid',
        codAmount: Number(data.codAmount || 0),
        orderStatus: data.orderStatus || 'New',
        paymentReference: data.paymentReference,
        paymentProofImage:
          typeof data.paymentProofImage === 'string' && data.paymentProofImage
            ? data.paymentProofImage
            : undefined,
        appsScriptSyncStatus: data.appsScriptSyncStatus || 'Pending',
        appsScriptSyncMessage: data.appsScriptSyncMessage,
      };

      // Attach reseller source price, expected profit & Meesho source URL if customer ordered while server container was cold
      if (data.resellerFieldsEnriched === false && productMap.size > 0) {
        const enrichedItems = order.items.map((item) => {
          const prod = productMap.get(item.productId);
          const sourcePrice = prod ? Number(prod.sourcePrice || 0) : Number(item.sourcePrice || 0);
          const sourceLineTotal = Number((sourcePrice * item.quantity).toFixed(2));
          const sourceProductUrl = prod
            ? prod.sourceProductUrl || ''
            : item.sourceProductUrl || '';
          const itemExpectedProfit = Number((item.lineTotal - sourceLineTotal).toFixed(2));
          return {
            ...item,
            sourcePrice,
            sourceLineTotal,
            sourceProductUrl,
            itemExpectedProfit,
          };
        });
        const sourceOrderAmount = Number(
          enrichedItems.reduce((sum, i) => sum + i.sourceLineTotal, 0).toFixed(2)
        );
        const expectedProfit = Number((order.subtotal - sourceOrderAmount).toFixed(2));

        await updateDoc(doc(db, 'orders', order.orderId), {
          items: enrichedItems,
          sourceOrderAmount,
          expectedProfit,
          resellerFieldsEnriched: true,
          updatedAt: serverTimestamp(),
        });

        order = {
          ...order,
          items: enrichedItems,
          sourceOrderAmount,
          expectedProfit,
        };
      }

      orders.push(order);
    }

    return orders.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'orders');
  }
}

export async function updateOrderStatusInFirestore(
  order: Order,
  patch: {
    orderStatus?: OrderStatus;
    paymentStatus?: PaymentStatus;
    appsScriptSyncStatus?: Order['appsScriptSyncStatus'];
    appsScriptSyncMessage?: string;
  }
): Promise<void> {
  const orderRef = doc(db, 'orders', order.orderId);
  const nextOrderStatus = patch.orderStatus ?? order.orderStatus;
  const nextPaymentStatus = patch.paymentStatus ?? order.paymentStatus;

  const orderUpdate: Record<string, unknown> = {
    orderStatus: nextOrderStatus,
    paymentStatus: nextPaymentStatus,
    appsScriptSyncStatus: patch.appsScriptSyncStatus ?? order.appsScriptSyncStatus,
    updatedAt: serverTimestamp(),
  };
  if (patch.appsScriptSyncMessage !== undefined) {
    orderUpdate.appsScriptSyncMessage = patch.appsScriptSyncMessage.slice(0, 500);
  }

  try {
    await updateDoc(orderRef, orderUpdate);

    const digits = order.mobileNumber.replace(/\D/g, '').slice(-10);
    if (digits.length === 10) {
      const trackingHash = await sha256Hex(`${order.orderId.toUpperCase()}:${digits}`);
      const trackingRef = doc(db, 'order_tracking', trackingHash);
      const trackingSnap = await getDoc(trackingRef);
      if (trackingSnap.exists()) {
        await updateDoc(trackingRef, {
          orderStatus: nextOrderStatus,
          paymentStatus: nextPaymentStatus,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${order.orderId}`);
  }
}

export async function deleteOrderFromFirestore(order: Order): Promise<void> {
  try {
    const deletes: Array<Promise<void>> = [deleteDoc(doc(db, 'orders', order.orderId))];
    const digits = order.mobileNumber.replace(/\D/g, '').slice(-10);
    if (digits.length === 10) {
      const trackingHash = await sha256Hex(`${order.orderId.trim().toUpperCase()}:${digits}`);
      deletes.push(deleteDoc(doc(db, 'order_tracking', trackingHash)));
      deletes.push(deleteDoc(doc(db, 'cancel_requests', trackingHash)));
    }
    const cleanUtr = (order.paymentReference || '').trim();
    if (order.paymentMethod === 'Online' && /^\d{12}$/.test(cleanUtr)) {
      const utrHash = await sha256Hex(cleanUtr);
      deletes.push(deleteDoc(doc(db, 'used_utrs', utrHash)));
    }
    await Promise.all(deletes);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `orders/${order.orderId}`);
  }
}

export function buildAppsScriptOrderPayload(order: Order): Record<string, unknown> {
  const safeQty = Math.max(1, Number(order.quantity) || 1);
  const effectiveUnitPrice = Math.round((order.totalAmount / safeQty) * 100) / 100;
  const formatItemLabel = (item: Order['items'][number]) => {
    const parts: string[] = [];
    if (item.selectedColor) parts.push(`Color: ${item.selectedColor}`);
    if (item.selectedSize) parts.push(`Size: ${item.selectedSize}`);
    return parts.length > 0 ? `${item.productName} [${parts.join(', ')}]` : item.productName;
  };
  const primaryName =
    order.items.length === 1 ? formatItemLabel(order.items[0]) : order.productNames;
  const primaryCode =
    order.items.length === 1 ? order.items[0].productCode : order.productCodes;
  const selectedVariantsSummary = order.items
    .map((item) => {
      const parts: string[] = [];
      if (item.selectedColor) parts.push(`Color: ${item.selectedColor}`);
      if (item.selectedSize) parts.push(`Size: ${item.selectedSize}`);
      return parts.length > 0 ? `${item.productCode} (${parts.join(', ')})` : '';
    })
    .filter(Boolean)
    .join(' | ');
  let combinedAddress = [order.fullAddress, order.landmark].filter(Boolean).join(', ').trim();
  if (combinedAddress.length < 8) {
    combinedAddress = [combinedAddress, order.city, order.state].filter(Boolean).join(', ');
  }

  return {
    action: 'createOrder',
    requestId: order.orderId,
    orderId: order.orderId,
    timestamp: order.timestamp,
    name: order.customerName,
    customerName: order.customerName,
    mobile: order.mobileNumber,
    mobileNumber: order.mobileNumber,
    email: order.email,
    address: combinedAddress,
    fullAddress: order.fullAddress,
    city: order.city,
    state: order.state,
    pin: order.pincode,
    pincode: order.pincode,
    landmark: order.landmark,
    productName: primaryName,
    productNames: order.productNames,
    productCode: primaryCode,
    productCodes: order.productCodes,
    selectedColor: order.items.map((i) => i.selectedColor).filter(Boolean).join(', '),
    selectedSize: order.items.map((i) => i.selectedSize).filter(Boolean).join(', '),
    selectedVariants: selectedVariantsSummary,
    price: effectiveUnitPrice,
    quantity: safeQty,
    customerSellingPrice: order.items.map((i) => i.unitPrice).join(', '),
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    customerOrderAmount: order.totalAmount,
    totalAmount: order.totalAmount,
    sourceOrderAmount: order.sourceOrderAmount,
    expectedProfit: order.expectedProfit,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    codAmount: order.codAmount,
    orderStatus: order.orderStatus,
    paymentReference: order.paymentReference || '',
    sourceProductUrls: order.items
      .map((i) => i.sourceProductUrl)
      .filter(Boolean)
      .join(' | '),
    items: order.items,
  };
}

export function computeDashboardMetrics(orders: Order[]): DashboardMetrics {
  const activeOrders = orders.filter((o) => o.orderStatus !== 'Cancelled');
  return {
    totalOrders: orders.length,
    newOrders: orders.filter((o) => o.orderStatus === 'New').length,
    codOrders: orders.filter((o) => o.paymentMethod === 'COD').length,
    onlinePaidOrders: orders.filter(
      (o) => o.paymentMethod === 'Online' && o.paymentStatus === 'Paid'
    ).length,
    pendingOrders: orders.filter(
      (o) => o.orderStatus === 'New' || o.orderStatus === 'Confirmed'
    ).length,
    processingOrders: orders.filter(
      (o) => o.orderStatus === 'Processing' || o.orderStatus === 'Shipped'
    ).length,
    deliveredOrders: orders.filter((o) => o.orderStatus === 'Delivered').length,
    cancelledOrders: orders.filter((o) => o.orderStatus === 'Cancelled').length,
    totalCustomerSales: Number(
      activeOrders.reduce((sum, o) => sum + o.totalAmount, 0).toFixed(2)
    ),
    totalExpectedProfit: Number(
      activeOrders.reduce((sum, o) => sum + (o.expectedProfit || 0), 0).toFixed(2)
    ),
    recentOrders: orders.slice(0, 8),
  };
}

export async function loadSupportMessagesFromFirestore(): Promise<SupportMessage[]> {
  try {
    const snap = await getDocs(collection(db, 'support_messages'));
    const list: SupportMessage[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: String(data.id || d.id),
        name: String(data.name || ''),
        mobileOrEmail: String(data.mobileOrEmail || ''),
        orderId: typeof data.orderId === 'string' && data.orderId ? data.orderId : undefined,
        message: String(data.message || ''),
        createdAt: timestampToIso(data.createdAt),
      };
    });
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'support_messages');
  }
}

export async function deleteSupportMessageFromFirestore(messageId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'support_messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `support_messages/${messageId}`);
  }
}

export async function loadReturnRequestsFromFirestore(): Promise<ReturnRequest[]> {
  try {
    const snap = await getDocs(collection(db, 'return_requests'));
    const list: ReturnRequest[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        trackingHash: String(data.trackingHash || d.id),
        orderId: String(data.orderId || ''),
        customerName: String(data.customerName || 'Customer'),
        requestType: data.requestType === 'Replacement' ? 'Replacement' : 'Return & Refund',
        reason: String(data.reason || ''),
        details: String(data.details || ''),
        customerUpiId:
          typeof data.customerUpiId === 'string' && data.customerUpiId
            ? data.customerUpiId
            : undefined,
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
    });
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'return_requests');
  }
}

export async function updateReturnRequestInFirestore(
  req: ReturnRequest,
  patch: {
    returnStatus: ReturnStatus;
    refundStatus: ReturnRefundStatus;
    meeshoReturnId?: string;
    pickupNote?: string;
    adminNote?: string;
  },
  orderToRefund?: Order
): Promise<void> {
  const ref = doc(db, 'return_requests', req.trackingHash);
  const updatePayload: Record<string, unknown> = {
    returnStatus: patch.returnStatus,
    refundStatus: patch.refundStatus,
    meeshoReturnId: (patch.meeshoReturnId || '').trim().slice(0, 120),
    pickupNote: (patch.pickupNote || '').trim().slice(0, 300),
    adminNote: (patch.adminNote || '').trim().slice(0, 500),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(ref, updatePayload);
    if (orderToRefund && patch.refundStatus === 'Refunded to Customer') {
      await updateOrderStatusInFirestore(orderToRefund, { paymentStatus: 'Refunded' });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `return_requests/${req.trackingHash}`);
  }
}

export async function deleteReturnRequestFromFirestore(trackingHash: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'return_requests', trackingHash));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `return_requests/${trackingHash}`);
  }
}

export async function loadCancelRequestsFromFirestore(): Promise<CancelRequest[]> {
  try {
    const snap = await getDocs(collection(db, 'cancel_requests'));
    const list: CancelRequest[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        trackingHash: String(data.trackingHash || d.id),
        orderId: String(data.orderId || ''),
        customerName: String(data.customerName || 'Customer'),
        reason: String(data.reason || ''),
        note: String(data.note || ''),
        customerUpiId:
          typeof data.customerUpiId === 'string' && data.customerUpiId
            ? data.customerUpiId
            : undefined,
        cancelStatus: (data.cancelStatus as CancelRequestStatus) || 'Requested',
        adminNote: typeof data.adminNote === 'string' && data.adminNote ? data.adminNote : undefined,
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt),
      };
    });
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'cancel_requests');
  }
}

export async function updateCancelRequestInFirestore(
  req: CancelRequest,
  patch: {
    cancelStatus: CancelRequestStatus;
    adminNote?: string;
  }
): Promise<void> {
  const ref = doc(db, 'cancel_requests', req.trackingHash);
  try {
    await updateDoc(ref, {
      cancelStatus: patch.cancelStatus,
      adminNote: (patch.adminNote || '').trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `cancel_requests/${req.trackingHash}`);
  }
}


import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AdminStoreSettings,
  Order,
  Product,
  PublicOrder,
  PublicProduct,
  PublicStoreSettings,
} from './src/types.ts';

export interface IdempotencyRecord {
  key: string;
  orderId: string;
  createdAt: string;
}

export interface SupportMessage {
  id: string;
  name: string;
  mobileOrEmail: string;
  orderId?: string;
  message: string;
  createdAt: string;
}

export interface StoreDatabase {
  settings: AdminStoreSettings;
  adminAuth: {
    passwordHash: string;
    passwordSalt: string;
    sessionSecret: string;
    isDefaultPasscode: boolean;
  };
  products: Product[];
  orders: Order[];
  idempotency: IdempotencyRecord[];
  supportMessages: SupportMessage[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPasswordHash(password: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function createInitialDatabase(): StoreDatabase {
  const now = new Date().toISOString();
  const initialSalt = crypto.randomBytes(16).toString('hex');
  const defaultPasscode = process.env.ADMIN_PASSWORD || 'admin1234';
  const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

  const products: Product[] = [
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
      createdAt: now,
      updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-tote-302',
      productCode: 'DT-BAG-302',
      name: 'Vegetable-Tanned Leather Carry Tote',
      category: 'Carry & Leather',
      images: [
        '/src/assets/images/product_leather_tote_1794731351228.jpg',
      ],
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
      createdAt: now,
      updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-linen-501',
      productCode: 'DT-TEX-501',
      name: 'Stonewashed Belgian Linen Throw',
      category: 'Home Textiles',
      images: [
        '/src/assets/images/product_linen_throw_1794731352816.jpg',
      ],
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
      createdAt: now,
      updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    settings: {
      storeName: 'DealTrend',
      storeDescription:
        'Explore curated daily deals and trending essentials at everyday value. Fast dispatch with Cash on Delivery available.',
      logoUrl: '/assets/aistudio/IMG_20260724_225713_a2747bae.jpg',
      heroImageUrl: '',
      currencySymbol: '₹',
      announcementText: 'Smart Shopping. Daily Deals. · Free shipping above ₹1,499 · Cash on Delivery available',
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
      appsScriptUrl: '',
      googleDriveFolderUrl: '',
      lastConnectionStatus: 'Not Configured',
      lastConnectionMessage: 'Paste your Google Apps Script Web App URL to enable Google Sheets sync.',
    },
    adminAuth: {
      passwordHash: hashPassword(defaultPasscode, initialSalt),
      passwordSalt: initialSalt,
      sessionSecret,
      isDefaultPasscode: !process.env.ADMIN_PASSWORD,
    },
    products,
    orders: [],
    idempotency: [],
    supportMessages: [],
  };
}

let cachedDb: StoreDatabase | null = null;

function migrateDatabase(db: StoreDatabase): StoreDatabase {
  let changed = false;
  db.products = db.products.map((p) => {
    const sourcePrice = typeof p.sourcePrice === 'number' ? p.sourcePrice : Math.round(p.sellingPrice * 0.68);
    const expectedProfit = Number((p.sellingPrice - sourcePrice).toFixed(2));
    const sourceProductUrl = typeof p.sourceProductUrl === 'string' ? p.sourceProductUrl : '';
    if (
      p.sourcePrice === undefined ||
      p.expectedProfit === undefined ||
      p.sourceProductUrl === undefined
    ) {
      changed = true;
    }
    return {
      ...p,
      sourcePrice,
      expectedProfit,
      sourceProductUrl,
    };
  });

  db.orders = db.orders.map((o) => {
    if (o.sourceOrderAmount === undefined || o.expectedProfit === undefined) {
      changed = true;
    }
    const items = o.items.map((item) => {
      const sp = typeof item.sourcePrice === 'number' ? item.sourcePrice : 0;
      const slt = typeof item.sourceLineTotal === 'number' ? item.sourceLineTotal : sp * item.quantity;
      return {
        ...item,
        sourcePrice: sp,
        sourceLineTotal: slt,
        sourceProductUrl: item.sourceProductUrl || '',
        itemExpectedProfit:
          typeof item.itemExpectedProfit === 'number' ? item.itemExpectedProfit : item.lineTotal - slt,
      };
    });
    const sourceOrderAmount =
      typeof o.sourceOrderAmount === 'number'
        ? o.sourceOrderAmount
        : items.reduce((sum, i) => sum + i.sourceLineTotal, 0);
    const expectedProfit =
      typeof o.expectedProfit === 'number' ? o.expectedProfit : o.subtotal - sourceOrderAmount;

    return {
      ...o,
      items,
      sourceOrderAmount,
      expectedProfit,
    };
  });

  if (typeof db.settings.storeDescription !== 'string') {
    db.settings.storeDescription =
      'Explore curated daily deals and trending essentials at everyday value. Fast dispatch with Cash on Delivery available.';
    changed = true;
  }
  if (db.settings.heroImageUrl === '/src/assets/images/hero_storefront_1794731351452.jpg') {
    db.settings.heroImageUrl = '';
    changed = true;
  }

  if (changed) {
    saveDb(db);
  }
  return db;
}

export function loadDb(): StoreDatabase {
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDatabase();
    saveDb(initial);
    cachedDb = initial;
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = migrateDatabase(JSON.parse(raw) as StoreDatabase);
    cachedDb = parsed;
    return parsed;
  } catch {
    const fallback = createInitialDatabase();
    saveDb(fallback);
    cachedDb = fallback;
    return fallback;
  }
}

export function saveDb(db: StoreDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
  cachedDb = db;
}

export function toPublicSettings(settings: AdminStoreSettings): PublicStoreSettings {
  return {
    storeName: settings.storeName,
    storeDescription: settings.storeDescription || '',
    logoUrl: settings.logoUrl,
    heroImageUrl:
      settings.heroImageUrl === '/src/assets/images/hero_storefront_1794731351452.jpg'
        ? ''
        : settings.heroImageUrl,
    currencySymbol: settings.currencySymbol,
    announcementText: settings.announcementText,
    codEnabled: settings.codEnabled,
    onlinePaymentEnabled: settings.onlinePaymentEnabled,
    upiId: settings.upiId,
    paymentGatewayName: settings.paymentGatewayName,
    paymentGatewayNote: settings.paymentGatewayNote,
    freeShippingThreshold: settings.freeShippingThreshold,
    shippingFee: settings.shippingFee,
    supportPhone: settings.supportPhone,
    supportEmail: settings.supportEmail,
    supportAddress: settings.supportAddress,
  };
}

// CRITICAL: Strip all reseller-only fields (sourcePrice, expectedProfit, sourceProductUrl)
export function toPublicProduct(product: PublicProduct): PublicProduct {
  return {
    id: product.id,
    productCode: product.productCode,
    name: product.name,
    category: product.category,
    images: product.images,
    originalPrice: product.originalPrice,
    sellingPrice: product.sellingPrice,
    onlinePrice:
      typeof product.onlinePrice === 'number' && product.onlinePrice > 0
        ? product.onlinePrice
        : 0,
    discountPercent: product.discountPercent,
    description: product.description,
    availableStock: product.availableStock,
    status: product.status,
    reviews: Array.isArray(product.reviews) ? product.reviews : [],
    colorOptions: Array.isArray(product.colorOptions) ? product.colorOptions : [],
    sizeOptions: Array.isArray(product.sizeOptions) ? product.sizeOptions : [],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

// CRITICAL: Strip all reseller-only order fields (sourceOrderAmount, expectedProfit, item source links/prices)
export function toPublicOrder(order: Order): PublicOrder {
  return {
    orderId: order.orderId,
    timestamp: order.timestamp,
    customerName: order.customerName,
    mobileNumber: order.mobileNumber,
    email: order.email,
    fullAddress: order.fullAddress,
    city: order.city,
    state: order.state,
    pincode: order.pincode,
    landmark: order.landmark,
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
    productNames: order.productNames,
    productCodes: order.productCodes,
    quantity: order.quantity,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    codAmount: order.codAmount,
    orderStatus: order.orderStatus,
    paymentReference: order.paymentReference,
  };
}

export function validateAppsScriptUrl(urlString: string): { valid: boolean; reason?: string } {
  const trimmed = urlString.trim();
  if (!trimmed) {
    return { valid: false, reason: 'URL cannot be empty.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    return { valid: false, reason: 'Google Apps Script URL must use HTTPS.' };
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === '169.254.169.254' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^127\./.test(host) ||
    host === '0.0.0.0'
  ) {
    return { valid: false, reason: 'Private or internal network URLs are not permitted.' };
  }
  if (host === 'script.google.com' && parsed.pathname.endsWith('/dev')) {
    return {
      valid: false,
      reason: 'Please deploy your Apps Script as a Web App and use the /exec URL (not the /dev test URL).',
    };
  }
  return { valid: true };
}

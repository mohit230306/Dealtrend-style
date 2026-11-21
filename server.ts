import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import {
  claimUtrInFirestore,
  fetchCancelRequestFromFirestore,
  fetchOrderTrackingFromFirestore,
  fetchPublicProductsFromFirestore,
  fetchPublicStoreFromFirestore,
  fetchReturnRequestFromFirestore,
  invalidatePublicCatalogCache,
  isUtrAlreadyUsedInFirestore,
  saveCancelRequestToFirestore,
  saveOrderToFirestore,
  saveReturnRequestToFirestore,
  saveSupportMessageToFirestore,
  toSlimCatalogProduct,
  verifyFirebaseAdminIdToken,
  warmPublicCatalogCache,
} from './serverFirestore.ts';
import {
  loadDb,
  toPublicOrder,
  toPublicProduct,
  toPublicSettings,
  validateAppsScriptUrl,
} from './serverStore.ts';
import type {
  Order,
  OrderItem,
  PaymentMethod,
  PaymentStatus,
  PublicOrder,
} from './src/types.ts';
import { isValidMobile, isValidPincode, validateUpiUtr } from './src/utils/format.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface CachedSourceInfo {
  sourcePrice: number;
  sourceProductUrl: string;
}

const CACHE_FILE = path.resolve(process.cwd(), 'data', 'reseller-cache.json');

interface PersistedResellerCache {
  appsScriptUrl?: string;
  products?: Record<string, CachedSourceInfo>;
}

// Warm-server reseller cache (populated by authenticated Admin client or APPS_SCRIPT_URL env var,
// and persisted locally on disk so server restarts never drop Apps Script sync).
const warmResellerCache: {
  appsScriptUrl: string;
  sourceByProductId: Map<string, CachedSourceInfo>;
  idempotency: Map<string, PublicOrder>;
  supportTickets: Set<string>;
  usedUtrs: Set<string>;
} = {
  appsScriptUrl: (process.env.APPS_SCRIPT_URL || '').trim(),
  sourceByProductId: new Map(),
  idempotency: new Map(),
  supportTickets: new Set(),
  usedUtrs: new Set(),
};

function isValidPaymentProofDataUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 30 || trimmed.length > 255000) return null;
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function loadPersistedResellerCache(): void {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) as PersistedResellerCache;
    if (typeof raw.appsScriptUrl === 'string' && raw.appsScriptUrl.trim()) {
      warmResellerCache.appsScriptUrl = raw.appsScriptUrl.trim();
    }
    if (raw.products && typeof raw.products === 'object') {
      for (const [id, info] of Object.entries(raw.products)) {
        if (info && typeof info.sourcePrice === 'number') {
          warmResellerCache.sourceByProductId.set(id, {
            sourcePrice: info.sourcePrice,
            sourceProductUrl: String(info.sourceProductUrl || ''),
          });
        }
      }
    }
  } catch {
    // ignore corrupt cache file
  }
}

function savePersistedResellerCache(): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const products: Record<string, CachedSourceInfo> = {};
    for (const [id, info] of warmResellerCache.sourceByProductId.entries()) {
      products[id] = info;
    }
    const temp = `${CACHE_FILE}.tmp`;
    fs.writeFileSync(
      temp,
      JSON.stringify({ appsScriptUrl: warmResellerCache.appsScriptUrl, products }, null, 2),
      'utf-8'
    );
    fs.renameSync(temp, CACHE_FILE);
  } catch {
    // ignore disk cache write errors
  }
}

loadPersistedResellerCache();

async function requireFirebaseAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : '';

  if (!token) {
    res.status(401).json({ error: 'Unauthorized. Please sign in to the Admin Panel.' });
    return;
  }

  const verified = await verifyFirebaseAdminIdToken(token);
  if (!verified.valid) {
    res.status(401).json({ error: 'Unauthorized or unverified Admin session.' });
    return;
  }

  next();
}

function normalizeAppsScriptUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.hostname.toLowerCase() === 'script.google.com') {
      parsed.pathname = parsed.pathname
        .replace(/^\/u\/\d+\/macros\//, '/macros/')
        .replace(/^\/macros\/u\/\d+\//, '/macros/');
    }
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

async function postToAppsScript(
  url: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; message: string; data?: unknown; latencyMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const targetUrl = normalizeAppsScriptUrl(url);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const text = await response.text();
    const trimmed = text.trim();
    let parsed: unknown = undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 300);
    }

    if (!response.ok) {
      const isPermissionError = response.status === 401 || response.status === 403;
      return {
        ok: false,
        status: response.status,
        message: isPermissionError
          ? `Apps Script returned HTTP ${response.status} (Access Denied). In Google Apps Script → Deploy → Manage deployments → Edit, set "Execute as: Me" and "Who has access: Anyone", click Deploy, then copy the /exec URL into Admin → Settings.`
          : `Apps Script returned HTTP ${response.status}.`,
        data: parsed,
        latencyMs,
      };
    }

    if (trimmed.startsWith('<') || contentType.includes('text/html')) {
      const isAuthRedirect =
        /accounts\.google\.com|ServiceLogin|Sign in/i.test(text) ||
        response.url.includes('accounts.google.com');
      return {
        ok: false,
        status: response.status,
        message: isAuthRedirect
          ? 'Google Apps Script returned a Sign-In page. In Apps Script Deploy → Manage Deployments, set "Who has access" to "Anyone" and use the /exec URL.'
          : 'Google Apps Script returned HTML instead of JSON. Check your doPost(e) deployment and ensure it returns ContentService JSON.',
        data: parsed,
        latencyMs,
      };
    }

    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      const failed =
        p.success === false ||
        p.ok === false ||
        p.status === 'error' ||
        p.result === 'error' ||
        (typeof p.error === 'string' && p.error.length > 0);
      if (failed) {
        const errMsg =
          typeof p.error === 'string' && p.error
            ? p.error
            : typeof p.message === 'string' && p.message
            ? p.message
            : 'Apps Script reported an error.';
        return {
          ok: false,
          status: response.status,
          message: errMsg,
          data: parsed,
          latencyMs,
        };
      }
    }

    const preview =
      typeof parsed === 'string'
        ? parsed.slice(0, 100)
        : parsed
        ? JSON.stringify(parsed).slice(0, 120)
        : '';

    return {
      ok: true,
      status: response.status,
      message: preview ? `Accepted (${preview})` : 'Connected and accepted payload.',
      data: parsed,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Request timed out after 10 seconds.'
          : err.message
        : 'Network request failed.';
    return { ok: false, status: 0, message: msg, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

function generateOrderId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `ORD-${y}${m}${d}-${rand}`;
}

function formatOrderItemWithVariants(item: {
  productName: string;
  selectedColor?: string;
  selectedSize?: string;
}): string {
  const parts: string[] = [];
  if (item.selectedColor) parts.push(`Color: ${item.selectedColor}`);
  if (item.selectedSize) parts.push(`Size: ${item.selectedSize}`);
  return parts.length > 0 ? `${item.productName} [${parts.join(', ')}]` : item.productName;
}

export function buildAppsScriptOrderPayload(order: Order): Record<string, unknown> {
  const safeQty = Math.max(1, Number(order.quantity) || 1);
  const effectiveUnitPrice = Math.round((order.totalAmount / safeQty) * 100) / 100;
  const primaryName =
    order.items.length === 1 ? formatOrderItemWithVariants(order.items[0]) : order.productNames;
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

function normalizeProxyPayloadForAppsScript(raw: Record<string, unknown>): Record<string, unknown> {
  const action = typeof raw.action === 'string' ? raw.action : '';
  if (action && action !== 'createOrder') {
    return raw;
  }

  const items = Array.isArray(raw.items) ? (raw.items as Array<Record<string, unknown>>) : [];
  const firstItem = items.length === 1 && items[0] && typeof items[0] === 'object' ? items[0] : null;
  const qty = Math.max(1, Math.min(50, Math.floor(Number(raw.quantity) || 1)));

  const name = String(raw.name || raw.customerName || '').trim();
  const mobile = String(raw.mobile || raw.mobileNumber || '').trim();
  const city = String(raw.city || '').trim();
  const state = String(raw.state || '').trim();
  const pin = String(raw.pin || raw.pincode || '').trim();

  let address = String(
    raw.address || [raw.fullAddress, raw.landmark].filter(Boolean).join(', ')
  ).trim();
  if (address.length < 8) {
    address = [address, city, state].filter(Boolean).join(', ');
  }

  const productCode = String(
    raw.productCode || (firstItem ? firstItem.productCode : '') || raw.productCodes || ''
  ).trim();
  const firstItemLabel = firstItem
    ? formatOrderItemWithVariants({
        productName: String(firstItem.productName || ''),
        selectedColor: typeof firstItem.selectedColor === 'string' ? firstItem.selectedColor : undefined,
        selectedSize: typeof firstItem.selectedSize === 'string' ? firstItem.selectedSize : undefined,
      })
    : '';
  const productName = String(
    raw.productName || firstItemLabel || raw.productNames || ''
  ).trim();

  const totalNum =
    Number(raw.totalAmount) ||
    Number(raw.customerOrderAmount) ||
    Number(raw.subtotal) ||
    0;
  const rawPrice = Number(raw.price);
  const price =
    rawPrice > 0 ? rawPrice : Math.round((totalNum / qty) * 100) / 100;

  return {
    ...raw,
    action: action || 'createOrder',
    requestId: raw.requestId || raw.orderId || '',
    name,
    mobile,
    address,
    city,
    state,
    pin,
    productCode,
    productName,
    quantity: qty,
    price,
  };
}

async function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));

  app.use('/src/assets/images', express.static(path.resolve(__dirname, 'src/assets/images')));
  app.use('/assets', express.static(path.resolve(__dirname, 'public/assets')));

  // Gzip helper for fast mobile ad-click payloads (60-80% smaller over 4G)
  function sendCompressedJson(
    req: Request,
    res: Response,
    payload: unknown,
    cacheControl = 'public, max-age=15, stale-while-revalidate=60'
  ): void {
    const json = JSON.stringify(payload);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cacheControl);
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    if (json.length > 1024 && /\bgzip\b/i.test(acceptEncoding)) {
      zlib.gzip(Buffer.from(json, 'utf-8'), (err, gz) => {
        if (err) {
          res.send(json);
          return;
        }
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.send(gz);
      });
      return;
    }
    res.send(json);
  }

  function sendCompressedHtml(req: Request, res: Response, html: string): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    if (html.length > 1024 && /\bgzip\b/i.test(acceptEncoding)) {
      zlib.gzip(Buffer.from(html, 'utf-8'), (err, gz) => {
        if (err) {
          res.send(html);
          return;
        }
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.send(gz);
      });
      return;
    }
    res.send(html);
  }

  function escapeHtmlAttr(val: string): string {
    return val
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function safeInlineJson(data: unknown): string {
    return JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function findProductByIdOrCode<T extends { id: string; productCode: string }>(
    list: T[],
    slug: string
  ): T | undefined {
    const clean = slug.trim().toLowerCase();
    if (!clean) return undefined;
    return (
      list.find((p) => p.id.toLowerCase() === clean) ||
      list.find((p) => p.productCode.toLowerCase() === clean)
    );
  }

  function extractRequestedProductSlug(req: Request): string {
    const pathMatch = req.path.match(/^\/p\/([^/?#]+)/i);
    if (pathMatch?.[1]) {
      try {
        return decodeURIComponent(pathMatch[1]).trim();
      } catch {
        return pathMatch[1].trim();
      }
    }
    const qp =
      typeof req.query.p === 'string'
        ? req.query.p
        : typeof req.query.product === 'string'
        ? req.query.product
        : '';
    return qp.trim();
  }

  async function injectStorefrontBootstrapHtml(rawHtml: string, req: Request): Promise<string> {
    if (req.path.replace(/\/+$/, '').startsWith('/admin')) {
      return rawHtml;
    }

    const seedDb = loadDb();
    const fallbackSettings = toPublicSettings(seedDb.settings);
    const fallbackProducts = seedDb.products
      .filter((p) => p.status !== 'Hidden')
      .map(toPublicProduct);

    const requestedSlug = extractRequestedProductSlug(req);

    let settings = fallbackSettings;
    let products = fallbackProducts;
    try {
      const fetchPair = Promise.all([
        fetchPublicStoreFromFirestore(fallbackSettings),
        fetchPublicProductsFromFirestore(fallbackProducts),
      ]);
      const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
      const result = await Promise.race([fetchPair, timeoutGuard]);
      if (result) {
        settings = result[0].settings;
        products = result[1].filter((p) => p.status !== 'Hidden').map(toPublicProduct);
      }
    } catch {
      // fall back to instant seed / client fetch
    }

    const matchedFull = requestedSlug ? findProductByIdOrCode(products, requestedSlug) : undefined;
    const slimProducts = products.map(toSlimCatalogProduct);

    // Keep initial HTML lightweight so 4G/3G ad clicks render immediately
    let featuredForHtml = matchedFull;
    if (featuredForHtml && JSON.stringify(featuredForHtml).length > 260_000) {
      featuredForHtml = toSlimCatalogProduct(featuredForHtml);
    }

    let productsForHtml = slimProducts;
    if (featuredForHtml) {
      // Direct product ad link (/p/:code): send ONLY the target product inline for fastest possible Frame 1;
      // the remaining catalog hydrates silently in the background via /api/bootstrap.
      productsForHtml = [featuredForHtml];
    } else if (JSON.stringify(productsForHtml).length > 320_000) {
      productsForHtml = slimProducts.slice(0, 6);
    }

    const bootstrapPayload = {
      settings,
      products: productsForHtml,
      featuredProduct: featuredForHtml ?? null,
      requestedProductSlug: requestedSlug || null,
      partialCatalog: productsForHtml.length < slimProducts.length,
    };

    let html = rawHtml;
    if (matchedFull) {
      const priceLabel = `${settings.currencySymbol}${Math.round(matchedFull.sellingPrice)}`;
      const titleText = `${matchedFull.name} (${priceLabel}) — ${settings.storeName}`;
      const descText =
        matchedFull.description.slice(0, 160) ||
        `Buy ${matchedFull.name} at ${priceLabel} with Cash on Delivery & 7-Day Easy Return on ${settings.storeName}.`;
      html = html
        .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlAttr(titleText)}</title>`)
        .replace(
          /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
          `<meta name="description" content="${escapeHtmlAttr(descText)}" />`
        )
        .replace(
          /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
          `<meta property="og:title" content="${escapeHtmlAttr(titleText)}" />`
        )
        .replace(
          /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
          `<meta property="og:description" content="${escapeHtmlAttr(descText)}" />`
        );
    }

    const inlineScript = `<script>window.__INITIAL_STORE__=${safeInlineJson(bootstrapPayload)};</script>`;
    return html.replace('</head>', `${inlineScript}\n  </head>`);
  }

  // ==========================================
  // PUBLIC CUSTOMER STORE API (FIRESTORE BACKED, CACHED & GZIPPED)
  // ==========================================

  app.get('/api/bootstrap', async (req, res) => {
    const seedDb = loadDb();
    const fallbackSettings = toPublicSettings(seedDb.settings);
    const fallbackProducts = seedDb.products
      .filter((p) => p.status !== 'Hidden')
      .map(toPublicProduct);

    const [{ settings }, allProducts] = await Promise.all([
      fetchPublicStoreFromFirestore(fallbackSettings),
      fetchPublicProductsFromFirestore(fallbackProducts),
    ]);

    const visible = allProducts.filter((p) => p.status !== 'Hidden').map(toPublicProduct);
    const requestedSlug =
      typeof req.query.product === 'string'
        ? req.query.product.trim()
        : typeof req.query.p === 'string'
        ? req.query.p.trim()
        : '';
    const featuredProduct = requestedSlug
      ? findProductByIdOrCode(visible, requestedSlug) ?? null
      : null;

    sendCompressedJson(req, res, {
      settings,
      products: visible.map(toSlimCatalogProduct),
      featuredProduct,
    });
  });

  app.get('/api/store', async (req, res) => {
    const seedDb = loadDb();
    const { settings } = await fetchPublicStoreFromFirestore(toPublicSettings(seedDb.settings));
    sendCompressedJson(req, res, settings);
  });

  app.get('/api/products', async (req, res) => {
    const seedDb = loadDb();
    const fallbackProducts = seedDb.products
      .filter((p) => p.status !== 'Hidden')
      .map(toPublicProduct);

    const products = await fetchPublicProductsFromFirestore(fallbackProducts);
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const search =
      typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const slim = req.query.slim === '1';

    let visible = products.filter((p) => p.status !== 'Hidden');
    if (category && category !== 'All') {
      visible = visible.filter((p) => p.category.toLowerCase() === category.toLowerCase());
    }
    if (search) {
      visible = visible.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.category.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search) ||
          p.productCode.toLowerCase().includes(search) ||
          (Array.isArray(p.colorOptions) &&
            p.colorOptions.some((c) => c.name.toLowerCase().includes(search))) ||
          (Array.isArray(p.sizeOptions) &&
            p.sizeOptions.some((s) => s.toLowerCase().includes(search)))
      );
    }
    const payload = visible.map((p) =>
      slim ? toSlimCatalogProduct(toPublicProduct(p)) : toPublicProduct(p)
    );
    sendCompressedJson(req, res, payload);
  });

  app.get('/api/products/:id', async (req, res) => {
    const seedDb = loadDb();
    const fallbackProducts = seedDb.products
      .filter((p) => p.status !== 'Hidden')
      .map(toPublicProduct);
    const products = await fetchPublicProductsFromFirestore(fallbackProducts);
    const visible = products.filter((p) => p.status !== 'Hidden');
    const product = findProductByIdOrCode(visible, req.params.id);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    sendCompressedJson(req, res, toPublicProduct(product));
  });

  app.post('/api/orders', async (req, res) => {
    const seedDb = loadDb();
    const { settings } = await fetchPublicStoreFromFirestore(toPublicSettings(seedDb.settings));
    const fallbackProducts = seedDb.products
      .filter((p) => p.status !== 'Hidden')
      .map(toPublicProduct);
    const catalog = await fetchPublicProductsFromFirestore(fallbackProducts);

    const body = req.body as {
      customerName?: unknown;
      mobileNumber?: unknown;
      email?: unknown;
      fullAddress?: unknown;
      city?: unknown;
      state?: unknown;
      pincode?: unknown;
      landmark?: unknown;
      paymentMethod?: unknown;
      paymentReference?: unknown;
      paymentProofImage?: unknown;
      items?: unknown;
      idempotencyKey?: unknown;
    };

    const idempotencyKey =
      typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    if (idempotencyKey && warmResellerCache.idempotency.has(idempotencyKey)) {
      const cachedOrder = warmResellerCache.idempotency.get(idempotencyKey);
      if (cachedOrder) {
        res.status(200).json({ order: cachedOrder, duplicatePrevented: true });
        return;
      }
    }

    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
    const mobileNumber = typeof body.mobileNumber === 'string' ? body.mobileNumber.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const fullAddress = typeof body.fullAddress === 'string' ? body.fullAddress.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const state = typeof body.state === 'string' ? body.state.trim() : '';
    const pincode = typeof body.pincode === 'string' ? body.pincode.trim() : '';
    const landmark = typeof body.landmark === 'string' ? body.landmark.trim() : '';
    const paymentMethod = body.paymentMethod as PaymentMethod;
    const rawPaymentReference =
      typeof body.paymentReference === 'string' ? body.paymentReference.trim().slice(0, 80) : '';

    if (customerName.length < 2) {
      res.status(400).json({ error: 'Please enter a valid full name.' });
      return;
    }
    if (!isValidMobile(mobileNumber)) {
      res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address or leave it blank.' });
      return;
    }
    if (fullAddress.length < 6) {
      res.status(400).json({ error: 'Please enter your complete street/house address.' });
      return;
    }
    if (city.length < 2 || state.length < 2) {
      res.status(400).json({ error: 'Please enter both city and state.' });
      return;
    }
    if (!isValidPincode(pincode)) {
      res.status(400).json({ error: 'Please enter a valid 6-digit pincode.' });
      return;
    }
    if (paymentMethod !== 'COD' && paymentMethod !== 'Online') {
      res.status(400).json({ error: 'Please select a valid payment method (COD or Online).' });
      return;
    }
    if (paymentMethod === 'COD' && !settings.codEnabled) {
      res.status(400).json({ error: 'Cash on Delivery is currently disabled.' });
      return;
    }
    if (paymentMethod === 'Online' && !settings.onlinePaymentEnabled) {
      res.status(400).json({ error: 'Online Payment is currently disabled.' });
      return;
    }

    let verifiedUtr = '';
    let verifiedProofImage = '';
    if (paymentMethod === 'Online') {
      if (!settings.upiId.trim()) {
        res.status(400).json({
          error:
            'Online UPI payment is currently unavailable because the store UPI ID is not configured. Please choose Cash on Delivery.',
        });
        return;
      }

      const utrCheck = validateUpiUtr(rawPaymentReference);
      if (!utrCheck.valid) {
        res.status(400).json({
          error:
            utrCheck.error ||
            'Please enter a valid 12-digit numeric UPI UTR / Reference number.',
        });
        return;
      }
      verifiedUtr = utrCheck.utr;

      const rawProof = typeof body.paymentProofImage === 'string' ? body.paymentProofImage.trim() : '';
      if (rawProof) {
        const validProof = isValidPaymentProofDataUrl(rawProof);
        if (!validProof) {
          res.status(400).json({
            error:
              'Invalid payment screenshot format or file too large. Please upload a standard JPG/PNG/WEBP image or leave it blank.',
          });
          return;
        }
        verifiedProofImage = validProof;
      }

      if (
        warmResellerCache.usedUtrs.has(verifiedUtr) ||
        (await isUtrAlreadyUsedInFirestore(verifiedUtr))
      ) {
        res.status(409).json({
          error:
            'This 12-digit UPI UTR has already been used for an earlier order. Please pay freshly and enter your new unique 12-digit UTR.',
        });
        return;
      }
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ error: 'Your cart is empty.' });
      return;
    }

    const verifiedItems: OrderItem[] = [];
    const totalQtyByProduct = new Map<string, number>();
    const requestedLines = new Map<
      string,
      { productId: string; quantity: number; selectedColor: string; selectedSize: string }
    >();

    for (const rawItem of body.items) {
      if (!rawItem || typeof rawItem !== 'object') {
        res.status(400).json({ error: 'Invalid cart item format.' });
        return;
      }
      const itemObj = rawItem as {
        productId?: unknown;
        quantity?: unknown;
        selectedColor?: unknown;
        selectedSize?: unknown;
      };
      const productId = typeof itemObj.productId === 'string' ? itemObj.productId : '';
      const qty = typeof itemObj.quantity === 'number' ? Math.floor(itemObj.quantity) : 0;
      const selectedColor =
        typeof itemObj.selectedColor === 'string' ? itemObj.selectedColor.trim().slice(0, 60) : '';
      const selectedSize =
        typeof itemObj.selectedSize === 'string' ? itemObj.selectedSize.trim().slice(0, 40) : '';
      if (!productId || qty < 1 || qty > 50) {
        res.status(400).json({ error: 'Invalid product or quantity in cart.' });
        return;
      }

      totalQtyByProduct.set(productId, (totalQtyByProduct.get(productId) || 0) + qty);
      const lineKey = `${productId}::${selectedColor.toLowerCase()}::${selectedSize.toLowerCase()}`;
      const existingLine = requestedLines.get(lineKey);
      if (existingLine) {
        existingLine.quantity += qty;
      } else {
        requestedLines.set(lineKey, {
          productId,
          quantity: qty,
          selectedColor,
          selectedSize,
        });
      }
    }

    if (requestedLines.size > 50) {
      res.status(400).json({ error: 'Maximum 50 line items allowed per order.' });
      return;
    }

    let allItemsHaveSourceInfo = true;
    for (const line of requestedLines.values()) {
      const product = catalog.find((p) => p.id === line.productId);
      if (!product || product.status === 'Hidden') {
        res.status(400).json({ error: 'One or more selected products are no longer available.' });
        return;
      }
      if (product.status === 'Out of Stock' || product.availableStock <= 0) {
        res.status(400).json({ error: `${product.name} is currently unavailable.` });
        return;
      }
      const totalRequestedForProduct = totalQtyByProduct.get(line.productId) || line.quantity;
      if (product.availableStock < 999 && totalRequestedForProduct > product.availableStock) {
        res.status(400).json({
          error: `Only ${product.availableStock} unit(s) of ${product.name} are available right now.`,
        });
        return;
      }

      const colorOpts = Array.isArray(product.colorOptions) ? product.colorOptions : [];
      const sizeOpts = Array.isArray(product.sizeOptions) ? product.sizeOptions : [];

      let finalColor = line.selectedColor;
      if (colorOpts.length > 0) {
        if (!finalColor) {
          if (colorOpts.length === 1) {
            finalColor = colorOpts[0].name;
          } else {
            res.status(400).json({
              error: `Please select a Color / Design option for ${product.name}.`,
            });
            return;
          }
        } else {
          const matched = colorOpts.find(
            (c) => c.name.toLowerCase() === finalColor.toLowerCase()
          );
          if (!matched) {
            res.status(400).json({
              error: `Selected Color / Design "${finalColor}" is no longer available for ${product.name}.`,
            });
            return;
          }
          finalColor = matched.name;
        }
      }

      let finalSize = line.selectedSize;
      if (sizeOpts.length > 0) {
        if (!finalSize) {
          if (sizeOpts.length === 1) {
            finalSize = sizeOpts[0];
          } else {
            res.status(400).json({
              error: `Please select a Size option for ${product.name}.`,
            });
            return;
          }
        } else {
          const matchedSize = sizeOpts.find(
            (s) => s.toLowerCase() === finalSize.toLowerCase()
          );
          if (!matchedSize) {
            res.status(400).json({
              error: `Selected Size "${finalSize}" is no longer available for ${product.name}.`,
            });
            return;
          }
          finalSize = matchedSize;
        }
      }

      const cachedSource = warmResellerCache.sourceByProductId.get(product.id);
      const seedMatch = seedDb.products.find((p) => p.id === product.id);
      if (!cachedSource && !seedMatch) {
        allItemsHaveSourceInfo = false;
      }

      const hasCustomOnlinePrice =
        typeof product.onlinePrice === 'number' && product.onlinePrice > 0;
      const effectiveUnitPrice =
        paymentMethod === 'Online' && hasCustomOnlinePrice
          ? product.onlinePrice!
          : product.sellingPrice;

      const qty = line.quantity;
      const lineTotal = Number((effectiveUnitPrice * qty).toFixed(2));
      const sourcePrice = cachedSource
        ? cachedSource.sourcePrice
        : seedMatch
        ? seedMatch.sourcePrice
        : 0;
      const sourceProductUrl = cachedSource
        ? cachedSource.sourceProductUrl
        : seedMatch
        ? seedMatch.sourceProductUrl
        : '';
      const sourceLineTotal = Number((sourcePrice * qty).toFixed(2));
      const itemExpectedProfit = Number((lineTotal - sourceLineTotal).toFixed(2));

      verifiedItems.push({
        productId: product.id,
        productCode: product.productCode,
        productName: product.name,
        quantity: qty,
        unitPrice: effectiveUnitPrice,
        lineTotal,
        ...(finalColor ? { selectedColor: finalColor } : {}),
        ...(finalSize ? { selectedSize: finalSize } : {}),
        sourcePrice,
        sourceLineTotal,
        sourceProductUrl,
        itemExpectedProfit,
      });
    }

    const subtotal = Number(
      verifiedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
    );
    const shippingFee = subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFee;
    const totalAmount = Number((subtotal + shippingFee).toFixed(2));
    const sourceOrderAmount = Number(
      verifiedItems.reduce((sum, item) => sum + item.sourceLineTotal, 0).toFixed(2)
    );
    const expectedProfit = Number((subtotal - sourceOrderAmount).toFixed(2));
    const totalQuantity = verifiedItems.reduce((sum, item) => sum + item.quantity, 0);

    // COD => Unpaid (collected at delivery)
    // Online => Pending Verification (never falsely marked Paid)
    const paymentStatus: PaymentStatus =
      paymentMethod === 'COD' ? 'Unpaid' : 'Pending Verification';
    const codAmount = paymentMethod === 'COD' ? totalAmount : 0;

    const orderId = generateOrderId();
    const timestamp = new Date().toISOString();

    if (paymentMethod === 'Online') {
      try {
        const claim = await claimUtrInFirestore(verifiedUtr, orderId);
        if (claim.alreadyUsed) {
          res.status(409).json({
            error:
              'This 12-digit UPI UTR has already been used for an earlier order. Please pay freshly and enter your new unique 12-digit UTR.',
          });
          return;
        }
      } catch (err) {
        console.error('Failed to claim UTR in Firestore:', err);
        res.status(500).json({ error: 'Unable to verify UPI UTR right now. Please try again.' });
        return;
      }

      warmResellerCache.usedUtrs.add(verifiedUtr);
      if (warmResellerCache.usedUtrs.size > 1000) {
        const firstUtr = warmResellerCache.usedUtrs.values().next().value;
        if (firstUtr) warmResellerCache.usedUtrs.delete(firstUtr);
      }
    }

    const order: Order = {
      orderId,
      timestamp,
      customerName,
      mobileNumber,
      email,
      fullAddress,
      city,
      state,
      pincode,
      landmark,
      items: verifiedItems,
      productNames: verifiedItems
        .map((i) => `${formatOrderItemWithVariants(i)} (x${i.quantity})`)
        .join(', '),
      productCodes: verifiedItems.map((i) => i.productCode).join(', '),
      quantity: totalQuantity,
      subtotal,
      shippingFee,
      totalAmount,
      sourceOrderAmount,
      expectedProfit,
      paymentMethod,
      paymentStatus,
      codAmount,
      orderStatus: 'New',
      paymentReference: paymentMethod === 'Online' ? verifiedUtr : undefined,
      paymentProofImage: paymentMethod === 'Online' ? verifiedProofImage : undefined,
      appsScriptSyncStatus: warmResellerCache.appsScriptUrl ? 'Pending' : 'Pending',
    };

    if (warmResellerCache.appsScriptUrl) {
      const result = await postToAppsScript(
        warmResellerCache.appsScriptUrl,
        buildAppsScriptOrderPayload(order)
      );
      order.appsScriptSyncStatus = result.ok ? 'Synced' : 'Failed';
      order.appsScriptSyncMessage = result.message;
      console.log(
        `[AppsScript Sync] order=${order.orderId} ok=${result.ok} message=${result.message}`
      );
    }

    try {
      await saveOrderToFirestore(order, allItemsHaveSourceInfo);
    } catch (err) {
      console.error('Failed to persist order to Firestore:', err);
      res.status(500).json({ error: 'Unable to save order to cloud database. Please try again.' });
      return;
    }

    const publicOrder = toPublicOrder(order);
    if (idempotencyKey) {
      warmResellerCache.idempotency.set(idempotencyKey, publicOrder);
      if (warmResellerCache.idempotency.size > 300) {
        const firstKey = warmResellerCache.idempotency.keys().next().value;
        if (firstKey) warmResellerCache.idempotency.delete(firstKey);
      }
    }

    res.status(201).json({ order: publicOrder });
  });

  app.post('/api/orders/track', async (req, res) => {
    const { orderId, mobileNumber } = req.body as {
      orderId?: unknown;
      mobileNumber?: unknown;
    };
    const cleanOrderId = typeof orderId === 'string' ? orderId.trim().toUpperCase() : '';
    const cleanMobile = typeof mobileNumber === 'string' ? mobileNumber.replace(/\D/g, '') : '';

    if (!cleanOrderId || cleanMobile.length < 10) {
      res.status(400).json({ error: 'Please enter both your Order ID and 10-digit Mobile Number.' });
      return;
    }

    const [tracked, returnRequest, cancelRequest] = await Promise.all([
      fetchOrderTrackingFromFirestore(cleanOrderId, cleanMobile),
      fetchReturnRequestFromFirestore(cleanOrderId, cleanMobile),
      fetchCancelRequestFromFirestore(cleanOrderId, cleanMobile),
    ]);
    if (tracked) {
      res.json({ order: tracked, returnRequest, cancelRequest });
      return;
    }

    if (warmResellerCache.appsScriptUrl) {
      const result = await postToAppsScript(warmResellerCache.appsScriptUrl, {
        action: 'trackOrder',
        orderId: cleanOrderId,
        mobileNumber: cleanMobile.slice(-10),
      });
      if (
        result.ok &&
        result.data &&
        typeof result.data === 'object' &&
        'order' in result.data &&
        (result.data as { order?: Order }).order
      ) {
        const remote = (result.data as { order: Order }).order;
        res.json({
          order: {
            orderId: remote.orderId,
            timestamp: remote.timestamp,
            customerName: remote.customerName,
            city: remote.city,
            state: remote.state,
            pincode: remote.pincode,
            items: Array.isArray(remote.items)
              ? remote.items.map((i) => ({
                  productId: i.productId,
                  productCode: i.productCode,
                  productName: i.productName,
                  quantity: i.quantity,
                  unitPrice: i.unitPrice,
                  lineTotal: i.lineTotal,
                  ...(i.selectedColor ? { selectedColor: i.selectedColor } : {}),
                  ...(i.selectedSize ? { selectedSize: i.selectedSize } : {}),
                }))
              : [],
            productNames: remote.productNames,
            productCodes: remote.productCodes,
            quantity: remote.quantity,
            totalAmount: remote.totalAmount,
            paymentMethod: remote.paymentMethod,
            paymentStatus: remote.paymentStatus,
            codAmount: remote.codAmount,
            orderStatus: remote.orderStatus,
          },
        });
        return;
      }
    }

    res.status(404).json({
      error: 'No matching order found. Please check your Order ID and Mobile Number.',
    });
  });

  app.post('/api/support', async (req, res) => {
    const { ticketId, name, mobileOrEmail, orderId, message } = req.body as {
      ticketId?: unknown;
      name?: unknown;
      mobileOrEmail?: unknown;
      orderId?: unknown;
      message?: unknown;
    };

    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanContact = typeof mobileOrEmail === 'string' ? mobileOrEmail.trim() : '';
    const cleanOrder = typeof orderId === 'string' ? orderId.trim() : '';
    const cleanMsg = typeof message === 'string' ? message.trim() : '';

    if (cleanName.length < 2 || cleanContact.length < 5 || cleanMsg.length < 5) {
      res.status(400).json({ error: 'Please complete your name, contact info, and message.' });
      return;
    }

    const rawTicketId = typeof ticketId === 'string' ? ticketId.trim() : '';
    const safeTicketId = /^[a-zA-Z0-9_-]{4,64}$/.test(rawTicketId)
      ? rawTicketId
      : `SUP-${Date.now()}`;

    if (warmResellerCache.supportTickets.has(safeTicketId)) {
      res.status(200).json({
        ok: true,
        ticketId: safeTicketId,
        message: 'Thank you. Our support desk has received your request.',
      });
      return;
    }

    try {
      await saveSupportMessageToFirestore({
        id: safeTicketId,
        name: cleanName,
        mobileOrEmail: cleanContact,
        orderId: cleanOrder || undefined,
        message: cleanMsg,
      });
      warmResellerCache.supportTickets.add(safeTicketId);
      if (warmResellerCache.supportTickets.size > 300) {
        const firstTicket = warmResellerCache.supportTickets.values().next().value;
        if (firstTicket) warmResellerCache.supportTickets.delete(firstTicket);
      }
      res.status(201).json({
        ok: true,
        ticketId: safeTicketId,
        message: 'Thank you. Our support desk has received your request.',
      });
    } catch (err) {
      console.error('Failed to save support message:', err);
      res.status(500).json({ error: 'Unable to submit message right now. Please try again.' });
    }
  });

  app.post('/api/returns', async (req, res) => {
    const body = req.body as {
      orderId?: unknown;
      mobileNumber?: unknown;
      requestType?: unknown;
      reason?: unknown;
      details?: unknown;
      customerUpiId?: unknown;
      proofImages?: unknown;
    };

    const cleanOrderId = typeof body.orderId === 'string' ? body.orderId.trim().toUpperCase() : '';
    const cleanMobile = typeof body.mobileNumber === 'string' ? body.mobileNumber.replace(/\D/g, '') : '';
    const requestType = body.requestType === 'Replacement' ? 'Replacement' : 'Return & Refund';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const details = typeof body.details === 'string' ? body.details.trim() : '';
    const customerUpiId = typeof body.customerUpiId === 'string' ? body.customerUpiId.trim() : '';

    if (!cleanOrderId || cleanMobile.length < 10) {
      res.status(400).json({ error: 'Please provide a valid Order ID and 10-digit Mobile Number.' });
      return;
    }
    if (reason.length < 2) {
      res.status(400).json({ error: 'Please select a reason for your return or replacement.' });
      return;
    }
    if (details.length < 5) {
      res.status(400).json({ error: 'Please describe the issue (at least 5 characters).' });
      return;
    }
    if (requestType === 'Return & Refund' && (!customerUpiId || !customerUpiId.includes('@'))) {
      res.status(400).json({ error: 'Please enter a valid UPI ID (e.g. name@upi) to receive your refund.' });
      return;
    }

    const proofImages = Array.isArray(body.proofImages)
      ? body.proofImages
          .filter((img): img is string => typeof img === 'string')
          .map((img) => img.trim())
          .filter(
            (img) =>
              img.length > 0 &&
              img.length <= 250000 &&
              (img.startsWith('data:image/') || img.startsWith('https://'))
          )
          .slice(0, 3)
      : [];

    if (proofImages.length === 0) {
      res.status(400).json({
        error: 'Please upload at least 1 clear photo of the product/packaging for verification.',
      });
      return;
    }

    try {
      const [tracked, existingReturn] = await Promise.all([
        fetchOrderTrackingFromFirestore(cleanOrderId, cleanMobile),
        fetchReturnRequestFromFirestore(cleanOrderId, cleanMobile),
      ]);

      if (!tracked) {
        res.status(404).json({
          error: 'Order not found. Please check your Order ID and 10-digit Mobile Number.',
        });
        return;
      }

      if (existingReturn) {
        res.status(200).json({ ok: true, returnRequest: existingReturn });
        return;
      }

      if (tracked.orderStatus !== 'Delivered') {
        res.status(400).json({
          error: 'Return or replacement can be requested only after your order is Delivered.',
        });
        return;
      }

      const saved = await saveReturnRequestToFirestore({
        orderId: cleanOrderId,
        mobileNumber: cleanMobile,
        customerName: tracked.customerName || 'Customer',
        requestType,
        reason,
        details,
        customerUpiId: requestType === 'Return & Refund' ? customerUpiId : '',
        proofImages,
      });

      res.status(201).json({ ok: true, returnRequest: saved });
    } catch (err) {
      console.error('Failed to submit return request:', err);
      res.status(500).json({ error: 'Unable to submit return request right now. Please try again.' });
    }
  });

  app.post('/api/orders/cancel-request', async (req, res) => {
    const body = req.body as {
      orderId?: unknown;
      mobileNumber?: unknown;
      reason?: unknown;
      note?: unknown;
      customerUpiId?: unknown;
    };

    const cleanOrderId = typeof body.orderId === 'string' ? body.orderId.trim().toUpperCase() : '';
    const cleanMobile = typeof body.mobileNumber === 'string' ? body.mobileNumber.replace(/\D/g, '') : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 120) : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
    const customerUpiId =
      typeof body.customerUpiId === 'string' ? body.customerUpiId.trim().slice(0, 120) : '';

    if (!cleanOrderId || cleanMobile.length < 10) {
      res.status(400).json({ error: 'Please provide a valid Order ID and 10-digit Mobile Number.' });
      return;
    }
    if (reason.length < 2) {
      res.status(400).json({ error: 'Please select a reason for cancelling this order.' });
      return;
    }
    if (customerUpiId && !customerUpiId.includes('@')) {
      res.status(400).json({
        error: 'Please enter a valid UPI ID (e.g. name@okicici) or leave it blank.',
      });
      return;
    }

    try {
      const [tracked, existingCancel] = await Promise.all([
        fetchOrderTrackingFromFirestore(cleanOrderId, cleanMobile),
        fetchCancelRequestFromFirestore(cleanOrderId, cleanMobile),
      ]);

      if (!tracked) {
        res.status(404).json({
          error: 'Order not found. Please check your Order ID and 10-digit Mobile Number.',
        });
        return;
      }

      if (existingCancel) {
        res.status(200).json({ ok: true, cancelRequest: existingCancel });
        return;
      }

      if (tracked.orderStatus !== 'New' && tracked.orderStatus !== 'Confirmed') {
        res.status(400).json({
          error:
            tracked.orderStatus === 'Cancelled'
              ? 'This order is already cancelled.'
              : `Direct cancellation is closed because this order is already ${tracked.orderStatus}. Please contact support for help.`,
        });
        return;
      }

      const saved = await saveCancelRequestToFirestore({
        orderId: cleanOrderId,
        mobileNumber: cleanMobile,
        customerName: tracked.customerName || 'Customer',
        reason,
        note,
        customerUpiId: tracked.paymentMethod === 'Online' ? customerUpiId : '',
      });

      res.status(201).json({ ok: true, cancelRequest: saved });
    } catch (err) {
      console.error('Failed to submit cancel request:', err);
      res.status(500).json({
        error: 'Unable to submit cancellation request right now. Please try again.',
      });
    }
  });

  // ==========================================
  // PROTECTED ADMIN SERVER ROUTES (FIREBASE ID TOKEN AUTH)
  // ==========================================

  app.get('/api/admin/orders', requireFirebaseAdmin, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/admin/cache-refresh', requireFirebaseAdmin, (req, res) => {
    const { appsScriptUrl, products } = req.body as {
      appsScriptUrl?: unknown;
      products?: unknown;
    };
    if (typeof appsScriptUrl === 'string') {
      warmResellerCache.appsScriptUrl = appsScriptUrl.trim();
    }
    if (Array.isArray(products)) {
      warmResellerCache.sourceByProductId.clear();
      for (const item of products) {
        if (item && typeof item === 'object') {
          const p = item as {
            id?: unknown;
            sourcePrice?: unknown;
            sourceProductUrl?: unknown;
          };
          if (typeof p.id === 'string') {
            warmResellerCache.sourceByProductId.set(p.id, {
              sourcePrice: Number(p.sourcePrice) || 0,
              sourceProductUrl: typeof p.sourceProductUrl === 'string' ? p.sourceProductUrl : '',
            });
          }
        }
      }
    }
    savePersistedResellerCache();
    invalidatePublicCatalogCache();
    res.json({ ok: true });
  });

  app.post('/api/admin/test-apps-script', requireFirebaseAdmin, async (req, res) => {
    const body = req.body as { url?: unknown; storeName?: unknown };
    const candidateUrl =
      typeof body?.url === 'string' ? body.url.trim() : warmResellerCache.appsScriptUrl;

    if (!candidateUrl) {
      res.status(400).json({ error: 'Please paste your Google Apps Script Web App URL first.' });
      return;
    }

    const check = validateAppsScriptUrl(candidateUrl);
    if (!check.valid) {
      res.status(400).json({ error: check.reason });
      return;
    }

    warmResellerCache.appsScriptUrl = candidateUrl;
    savePersistedResellerCache();

    let result = await postToAppsScript(candidateUrl, {
      action: 'ping',
      source: 'dealtrend-reseller-admin',
      storeName: typeof body?.storeName === 'string' ? body.storeName : 'DealTrend',
      timestamp: new Date().toISOString(),
    });

    // Some Apps Script backends (e.g. doGet ping + doPost saveOrder_) handle ping via GET ?action=ping
    if (!result.ok && /name is required/i.test(result.message)) {
      const start = Date.now();
      try {
        const pingUrl = new URL(candidateUrl);
        pingUrl.searchParams.set('action', 'ping');
        const getRes = await fetch(pingUrl.toString(), { redirect: 'follow' });
        const latencyMs = Date.now() - start;
        const txt = await getRes.text();
        try {
          const parsedGet = JSON.parse(txt) as Record<string, unknown>;
          if (getRes.ok && (parsedGet.ok === true || parsedGet.success === true)) {
            result = {
              ok: true,
              status: getRes.status,
              message: String(parsedGet.message || 'Order API is running'),
              data: parsedGet,
              latencyMs,
            };
          }
        } catch {
          // keep original POST error
        }
      } catch {
        // keep original POST error
      }
    }

    const testedAt = new Date().toISOString();
    const status = result.ok ? 'Connected' : 'Failed';
    const message = result.ok
      ? `Connected (${result.latencyMs}ms) — ${result.message}`
      : result.message;

    res.json({
      ok: result.ok,
      status: result.status,
      latencyMs: result.latencyMs,
      lastConnectionTestAt: testedAt,
      lastConnectionStatus: status,
      message,
      responsePreview: result.data,
    });
  });

  app.post('/api/admin/proxy-apps-script', requireFirebaseAdmin, async (req, res) => {
    const body = req.body as { url?: unknown; payload?: unknown };
    const targetUrl =
      typeof body?.url === 'string' ? body.url.trim() : warmResellerCache.appsScriptUrl;

    if (!targetUrl) {
      res.status(400).json({ ok: false, error: 'Google Apps Script Web App URL is not configured.' });
      return;
    }

    const check = validateAppsScriptUrl(targetUrl);
    if (!check.valid) {
      res.status(400).json({ ok: false, error: check.reason });
      return;
    }

    if (!body?.payload || typeof body.payload !== 'object') {
      res.status(400).json({ ok: false, error: 'Invalid Apps Script payload.' });
      return;
    }

    warmResellerCache.appsScriptUrl = targetUrl;
    savePersistedResellerCache();

    const normalizedPayload = normalizeProxyPayloadForAppsScript(
      body.payload as Record<string, unknown>
    );
    const result = await postToAppsScript(targetUrl, normalizedPayload);
    console.log(
      `[AppsScript Proxy] action=${String(normalizedPayload.action || 'createOrder')} orderId=${String(normalizedPayload.orderId || '')} ok=${result.ok} message=${result.message}`
    );
    res.json(result);
  });

  const httpServer = http.createServer(app);
  // Prevent Node's default 5s keepAliveTimeout from racing with Cloud Run / reverse-proxy idle connections
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.get('/@vite/client', async (req, res, next) => {
      try {
        const result = await vite.transformRequest(req.originalUrl || '/@vite/client');
        if (!result) {
          next();
          return;
        }
        const patchedCode = result.code
          .replace(/transport\.connect\(createHMRHandler\(handleMessage\)\);?/g, 'void 0;')
          .replace(/setupForwardConsoleHandler\(transport,\s*forwardConsole\);?/g, 'void 0;')
          .replace(/throw new SendBeforeConnectError\([^)]*\);?/g, 'return;')
          .replace(/\bws\.send\(/g, 'ws?.send(');
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(patchedCode);
      } catch (err) {
        next(err);
      }
    });
    // Zero-waterfall HTML bootstrap for customer storefront routes in dev mode
    // Must be registered BEFORE vite.middlewares so Vite's SPA fallback doesn't intercept / or /p/:slug
    app.get(['/', '/p/:slug'], async (req, res, next) => {
      try {
        const rawTemplate = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawTemplate);
        const hydrated = await injectStorefrontBootstrapHtml(transformed, req);
        sendCompressedHtml(req, res, hydrated);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const distIndexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
    app.use(
      express.static(distDir, {
        index: false,
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', async (req, res) => {
      try {
        const hydrated = await injectStorefrontBootstrapHtml(distIndexHtml, req);
        sendCompressedHtml(req, res, hydrated);
      } catch {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(distIndexHtml);
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    const seedDb = loadDb();
    void warmPublicCatalogCache(
      toPublicSettings(seedDb.settings),
      seedDb.products.filter((p) => p.status !== 'Hidden').map(toPublicProduct)
    );
  });
}

createApp();

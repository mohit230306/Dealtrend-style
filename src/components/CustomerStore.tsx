import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookmarkCheck,
  Check,
  Copy,
  Search,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';
import type {
  CartItem,
  CustomerScreen,
  PublicOrder,
  PublicProduct,
  PublicStoreSettings,
} from '../types';
import {
  loadSavedOrders,
  savePublicOrderToDevice,
  type SavedCustomerOrder,
} from '../utils/recentOrders';
import { CartView } from './CartView';
import { CheckoutView } from './CheckoutView';
import { CustomerHeader } from './CustomerHeader';
import { OrderSuccessView } from './OrderSuccessView';
import { OrderTrackingView } from './OrderTrackingView';
import { ProductCard } from './ProductCard';
import { ProductDetailsView, type SelectedVariantPayload } from './ProductDetailsView';
import { ReturnGuidelinesModal, SevenDayReturnLogo } from './ReturnPolicyBadge';
import { StoreImage } from './StoreImage';
import { StoreLogo } from './StoreLogo';
import { SupportView } from './SupportView';

const CART_STORAGE_KEY = 'storefront_cart_v1';
const STORE_CACHE_KEY = 'dealtrend_store_cache_v1';
const STORE_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

interface InitialStorePayload {
  settings: PublicStoreSettings;
  products: PublicProduct[];
  featuredProduct?: PublicProduct | null;
  requestedProductSlug?: string | null;
  partialCatalog?: boolean;
}

declare global {
  interface Window {
    __INITIAL_STORE__?: InitialStorePayload;
  }
}

function buildCartKey(productId: string, selectedColor?: string, selectedSize?: string): string {
  return `${productId}::${(selectedColor || '').trim().toLowerCase()}::${(selectedSize || '').trim().toLowerCase()}`;
}

function getRequestedProductSlugFromLocation(): string {
  try {
    const pathMatch = window.location.pathname.match(/^\/p\/([^/]+)\/?$/i);
    if (pathMatch && pathMatch[1]) {
      try {
        return decodeURIComponent(pathMatch[1]).trim();
      } catch {
        return pathMatch[1].trim();
      }
    }
    const params = new URLSearchParams(window.location.search);
    return (params.get('p') || params.get('product') || '').trim();
  } catch {
    return '';
  }
}

function getDeepOrderFromLocation(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get('order') || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

function findProductBySlug(list: PublicProduct[], slug: string): PublicProduct | null {
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;
  return (
    list.find(
      (p) =>
        p.id.trim().toLowerCase() === clean ||
        (p.productCode || '').trim().toLowerCase() === clean
    ) ?? null
  );
}

function mergeProductIntoList(list: PublicProduct[], product: PublicProduct): PublicProduct[] {
  const exists = list.some((p) => p.id === product.id);
  if (!exists) return [product, ...list];
  return list.map((p) => (p.id === product.id ? product : p));
}

function readCachedStorefront(): {
  settings: PublicStoreSettings;
  products: PublicProduct[];
} | null {
  try {
    const raw = localStorage.getItem(STORE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      ts?: number;
      settings?: PublicStoreSettings;
      products?: PublicProduct[];
    };
    if (
      !parsed ||
      typeof parsed.ts !== 'number' ||
      Date.now() - parsed.ts > STORE_CACHE_MAX_AGE_MS ||
      !parsed.settings ||
      !Array.isArray(parsed.products)
    ) {
      return null;
    }
    return { settings: parsed.settings, products: parsed.products };
  } catch {
    return null;
  }
}

function writeCachedStorefront(settings: PublicStoreSettings, products: PublicProduct[]) {
  try {
    const slim = products.map((p) => ({
      ...p,
      images: p.images.length > 0 ? [p.images[0]] : [],
      reviews: undefined,
      isSummary: true,
    }));
    const serialized = JSON.stringify({ ts: Date.now(), settings, products: slim });
    if (serialized.length < 450_000) {
      localStorage.setItem(STORE_CACHE_KEY, serialized);
    }
  } catch {
    // ignore storage quota errors
  }
}

const DEFAULT_PUBLIC_SETTINGS: PublicStoreSettings = {
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
};

function resolveInitialBootstrap() {
  const inline = typeof window !== 'undefined' ? window.__INITIAL_STORE__ : undefined;
  const cached = !inline ? readCachedStorefront() : null;
  const requestedSlug = getRequestedProductSlugFromLocation();
  const deepOrder = getDeepOrderFromLocation();

  const initialSettings = inline?.settings || cached?.settings || DEFAULT_PUBLIC_SETTINGS;
  let initialProducts: PublicProduct[] = Array.isArray(inline?.products)
    ? inline.products
    : Array.isArray(cached?.products)
    ? cached.products
    : [];

  if (inline?.featuredProduct) {
    initialProducts = mergeProductIntoList(initialProducts, inline.featuredProduct);
  }

  const initialSelectedProduct = requestedSlug
    ? inline?.featuredProduct || findProductBySlug(initialProducts, requestedSlug)
    : null;

  let initialScreen: CustomerScreen = 'home';
  if (deepOrder) {
    initialScreen = 'track';
  } else if (initialSelectedProduct) {
    initialScreen = 'product';
  }

  const hasReadyData = deepOrder
    ? true
    : requestedSlug
    ? Boolean(initialSelectedProduct)
    : initialProducts.length > 0;

  return {
    inline,
    requestedSlug,
    deepOrder,
    initialSettings,
    initialProducts,
    initialSelectedProduct,
    initialScreen,
    initialLoading: !hasReadyData,
  };
}

export function CustomerStore() {
  const boot = useMemo(() => resolveInitialBootstrap(), []);

  const [settings, setSettings] = useState<PublicStoreSettings>(boot.initialSettings);
  const [products, setProducts] = useState<PublicProduct[]>(boot.initialProducts);
  const [loading, setLoading] = useState(boot.initialLoading);
  const [loadError, setLoadError] = useState('');

  const [screen, setScreen] = useState<CustomerScreen>(boot.initialScreen);
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(
    boot.initialSelectedProduct
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'featured' | 'price-asc' | 'price-desc'>('featured');

  const productsRef = useRef<PublicProduct[]>(products);
  productsRef.current = products;

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((item: CartItem) => ({
            ...item,
            cartKey:
              item.cartKey || buildCartKey(item.productId, item.selectedColor, item.selectedSize),
          }));
        }
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [returnPolicyModalOpen, setReturnPolicyModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [completedOrder, setCompletedOrder] = useState<PublicOrder | null>(null);
  const [savedOrders, setSavedOrders] = useState<SavedCustomerOrder[]>(() => loadSavedOrders());
  const [copiedBannerOrderId, setCopiedBannerOrderId] = useState(false);
  const [trackPrefill, setTrackPrefill] = useState<{ orderId: string; mobile: string }>(() => {
    if (boot.deepOrder) {
      const matched = loadSavedOrders().find((o) => o.orderId === boot.deepOrder);
      return { orderId: boot.deepOrder, mobile: matched?.mobileNumber || '' };
    }
    return { orderId: '', mobile: '' };
  });

  const syncCartWithCatalog = useCallback((prodData: PublicProduct[]) => {
    setCart((prev) =>
      prev.map((item) => {
        const latest = prodData.find((p) => p.id === item.productId);
        if (!latest) return item;
        let resolvedImage = latest.images[0] || item.image;
        if (item.selectedColor && Array.isArray(latest.colorOptions)) {
          const matchedColor = latest.colorOptions.find(
            (c) => c.name.trim().toLowerCase() === item.selectedColor?.trim().toLowerCase()
          );
          if (
            matchedColor &&
            matchedColor.imageIndex !== undefined &&
            matchedColor.imageIndex >= 0 &&
            matchedColor.imageIndex < latest.images.length
          ) {
            resolvedImage = latest.images[matchedColor.imageIndex];
          }
        }
        return {
          ...item,
          cartKey:
            item.cartKey ||
            buildCartKey(item.productId, item.selectedColor, item.selectedSize),
          name: latest.name,
          productCode: latest.productCode,
          originalPrice: latest.originalPrice,
          sellingPrice: latest.sellingPrice,
          onlinePrice: latest.onlinePrice,
          availableStock: latest.availableStock,
          image: resolvedImage,
        };
      })
    );
  }, []);

  const hydrateFullProduct = useCallback(async (slugOrId: string, openOnLoad = false) => {
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(slugOrId)}`);
      if (!res.ok) return null;
      const fullProduct = (await res.json()) as PublicProduct;
      setProducts((prev) => mergeProductIntoList(prev, fullProduct));
      setSelectedProduct((curr) => {
        if (
          openOnLoad ||
          !curr ||
          curr.id === fullProduct.id ||
          curr.productCode.toLowerCase() === fullProduct.productCode.toLowerCase()
        ) {
          return fullProduct;
        }
        return curr;
      });
      if (openOnLoad) {
        setScreen('product');
      }
      return fullProduct;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    if (screen === 'product' && selectedProduct) {
      document.title = `${selectedProduct.name} — ${settings.storeName}`;
    } else {
      document.title = `${settings.storeName} — Online Store`;
    }
  }, [screen, selectedProduct, settings.storeName]);

  useEffect(() => {
    let active = true;

    // Cache inline SSR bootstrap for instant repeat visits
    if (boot.inline && boot.inline.products.length > 0) {
      writeCachedStorefront(boot.inline.settings, boot.inline.products);
      syncCartWithCatalog(boot.inline.products);
    }

    // If direct product landed in summary mode, fetch full gallery + reviews in background immediately
    if (boot.initialSelectedProduct?.isSummary) {
      void hydrateFullProduct(boot.initialSelectedProduct.id);
    }

    const needsBootstrapFetch =
      !boot.inline ||
      Boolean(boot.inline.partialCatalog) ||
      boot.initialProducts.length === 0 ||
      Boolean(boot.requestedSlug && !boot.initialSelectedProduct);

    async function loadStorefront() {
      if (boot.initialLoading) {
        setLoading(true);
      }
      setLoadError('');
      try {
        const query = boot.requestedSlug
          ? `?product=${encodeURIComponent(boot.requestedSlug)}`
          : '';
        const res = await fetch(`/api/bootstrap${query}`);
        if (!res.ok) {
          throw new Error('Failed to load storefront data.');
        }
        const data = (await res.json()) as {
          settings: PublicStoreSettings;
          products: PublicProduct[];
          featuredProduct?: PublicProduct | null;
        };
        if (!active) return;

        let mergedProducts = Array.isArray(data.products) ? data.products : [];
        if (data.featuredProduct) {
          mergedProducts = mergeProductIntoList(mergedProducts, data.featuredProduct);
        }

        setSettings(data.settings);
        setProducts((prev) => {
          // Preserve any already-hydrated full products when merging slim catalog refresh
          const fullById = new Map(prev.filter((p) => !p.isSummary).map((p) => [p.id, p]));
          return mergedProducts.map((p) => (p.isSummary && fullById.has(p.id) ? fullById.get(p.id)! : p));
        });
        syncCartWithCatalog(mergedProducts);
        writeCachedStorefront(data.settings, mergedProducts);

        if (boot.requestedSlug) {
          const matched =
            data.featuredProduct || findProductBySlug(mergedProducts, boot.requestedSlug);
          if (matched) {
            setSelectedProduct((curr) => (curr && !curr.isSummary && curr.id === matched.id ? curr : matched));
            setScreen('product');
          }
        }
      } catch {
        if (active && productsRef.current.length === 0) {
          setLoadError('Unable to load products right now. Please refresh.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (needsBootstrapFetch) {
      void loadStorefront();
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [boot, hydrateFullProduct, syncCartWithCatalog]);

  // Sync browser Back/Forward navigation for /p/:code links
  useEffect(() => {
    const handlePopState = () => {
      const slug = getRequestedProductSlugFromLocation();
      if (slug) {
        const localMatch = findProductBySlug(productsRef.current, slug);
        if (localMatch) {
          setSelectedProduct(localMatch);
          setScreen('product');
          if (localMatch.isSummary) {
            void hydrateFullProduct(localMatch.id);
          }
        } else {
          void hydrateFullProduct(slug, true);
        }
        return;
      }
      setScreen((curr) => (curr === 'product' ? 'home' : curr));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hydrateFullProduct]);

  const refreshProducts = async () => {
    try {
      const res = await fetch('/api/products?slim=1');
      if (res.ok) {
        const data = (await res.json()) as PublicProduct[];
        setProducts(data);
        writeCachedStorefront(settings, data);
      }
    } catch {
      // silent refresh failure
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? '' : curr));
    }, 2400);
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return ['All', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = products.filter((p) => {
      const catMatch = selectedCategory === 'All' || p.category === selectedCategory;
      const searchMatch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.productCode.toLowerCase().includes(q) ||
        (Array.isArray(p.colorOptions) &&
          p.colorOptions.some((c) => c.name.toLowerCase().includes(q))) ||
        (Array.isArray(p.sizeOptions) &&
          p.sizeOptions.some((s) => s.toLowerCase().includes(q)));
      return catMatch && searchMatch;
    });

    if (sortOrder === 'price-asc') {
      list = [...list].sort((a, b) => a.sellingPrice - b.sellingPrice);
    } else if (sortOrder === 'price-desc') {
      list = [...list].sort((a, b) => b.sellingPrice - a.sellingPrice);
    }
    return list;
  }, [products, selectedCategory, searchQuery, sortOrder]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const addItemToCart = (
    product: PublicProduct,
    quantity = 1,
    openDrawer = false,
    variants?: SelectedVariantPayload
  ) => {
    if (product.status === 'Out of Stock' || product.availableStock <= 0) return;

    const resolvedColor =
      variants?.selectedColor ??
      (Array.isArray(product.colorOptions) && product.colorOptions.length === 1
        ? product.colorOptions[0].name
        : undefined);
    const resolvedSize =
      variants?.selectedSize ??
      (Array.isArray(product.sizeOptions) && product.sizeOptions.length === 1
        ? product.sizeOptions[0]
        : undefined);
    const cartKey = buildCartKey(product.id, resolvedColor, resolvedSize);

    let itemImage = variants?.variantImage || '';
    if (!itemImage && resolvedColor && Array.isArray(product.colorOptions)) {
      const matchedColor = product.colorOptions.find(
        (c) => c.name.trim().toLowerCase() === resolvedColor.trim().toLowerCase()
      );
      if (
        matchedColor &&
        matchedColor.imageIndex !== undefined &&
        matchedColor.imageIndex >= 0 &&
        matchedColor.imageIndex < product.images.length
      ) {
        itemImage = product.images[matchedColor.imageIndex];
      }
    }
    if (!itemImage) {
      itemImage = product.images[0] || '';
    }

    setCart((prev) => {
      const existing = prev.find(
        (i) =>
          (i.cartKey || buildCartKey(i.productId, i.selectedColor, i.selectedSize)) === cartKey
      );
      const otherLinesQty = prev
        .filter(
          (i) =>
            i.productId === product.id &&
            (i.cartKey || buildCartKey(i.productId, i.selectedColor, i.selectedSize)) !== cartKey
        )
        .reduce((sum, i) => sum + i.quantity, 0);
      const maxForThisLine = Math.max(0, product.availableStock - otherLinesQty);

      if (existing) {
        const nextQty = Math.min(maxForThisLine, existing.quantity + quantity);
        return prev.map((i) =>
          (i.cartKey || buildCartKey(i.productId, i.selectedColor, i.selectedSize)) === cartKey
            ? {
                ...i,
                cartKey,
                quantity: Math.max(existing.quantity, nextQty),
                image: itemImage || i.image,
                sellingPrice: product.sellingPrice,
                onlinePrice: product.onlinePrice,
                originalPrice: product.originalPrice,
                availableStock: product.availableStock,
                productCode: product.productCode,
                ...(resolvedColor ? { selectedColor: resolvedColor } : {}),
                ...(resolvedSize ? { selectedSize: resolvedSize } : {}),
              }
            : i
        );
      }

      const addQty = Math.min(maxForThisLine, quantity);
      if (addQty <= 0) return prev;

      return [
        ...prev,
        {
          cartKey,
          productId: product.id,
          productCode: product.productCode,
          name: product.name,
          category: product.category,
          image: itemImage,
          originalPrice: product.originalPrice,
          sellingPrice: product.sellingPrice,
          onlinePrice: product.onlinePrice,
          quantity: addQty,
          availableStock: product.availableStock,
          ...(resolvedColor ? { selectedColor: resolvedColor } : {}),
          ...(resolvedSize ? { selectedSize: resolvedSize } : {}),
        },
      ];
    });

    if (openDrawer) {
      setCartDrawerOpen(true);
    } else {
      const variantLabel = [resolvedColor, resolvedSize].filter(Boolean).join(' · ');
      showToast(
        variantLabel
          ? `Added ${product.name} (${variantLabel}) to bag`
          : `Added ${product.name} to bag`
      );
    }
  };

  const handleBuyNow = (
    product: PublicProduct,
    quantity = 1,
    variants?: SelectedVariantPayload
  ) => {
    if (product.status === 'Out of Stock' || product.availableStock <= 0) return;
    addItemToCart(product, quantity, false, variants);
    setCartDrawerOpen(false);
    setScreen('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateCartQuantity = (lineKey: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) =>
        prev.filter(
          (i) =>
            (i.cartKey || buildCartKey(i.productId, i.selectedColor, i.selectedSize)) !== lineKey
        )
      );
      return;
    }
    setCart((prev) => {
      const target = prev.find(
        (i) => (i.cartKey || buildCartKey(i.productId, i.selectedColor, i.selectedSize)) === lineKey
      );
      if (!target) return prev;
      const otherLinesQty = prev
        .filter(
          (i) =>
            i.productId === target.productId &&
            (i.cartKey || buildCartKey(i.productId, i.selectedColor, i.selectedSize)) !== lineKey
        )
        .reduce((sum, i) => sum + i.quantity, 0);
      const maxForThisLine = Math.max(1, target.availableStock - otherLinesQty);

      return prev.map((i) =>
        (i.cartKey || buildCartKey(i.productId, i.selectedColor, i.selectedSize)) === lineKey
          ? { ...i, quantity: Math.min(maxForThisLine, quantity) }
          : i
      );
    });
  };

  const handleRemoveCartItem = (lineKey: string) => {
    setCart((prev) =>
      prev.filter(
        (i) =>
          (i.cartKey || buildCartKey(i.productId, i.selectedColor, i.selectedSize)) !== lineKey
      )
    );
  };

  const navigateTo = (nextScreen: CustomerScreen) => {
    setCartDrawerOpen(false);
    setScreen(nextScreen);
    try {
      if (
        nextScreen !== 'product' &&
        (window.location.pathname.startsWith('/p/') ||
          window.location.search.includes('p=') ||
          window.location.search.includes('product='))
      ) {
        window.history.pushState({}, '', '/');
      }
    } catch {
      // ignore history API errors
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProductDetails = (product: PublicProduct) => {
    setSelectedProduct(product);
    setScreen('product');
    try {
      const targetPath = `/p/${encodeURIComponent(product.productCode || product.id)}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ productId: product.id }, '', targetPath);
      }
    } catch {
      // ignore history API errors
    }
    if (product.isSummary) {
      void hydrateFullProduct(product.id);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOrderSuccess = (order: PublicOrder) => {
    setCart([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSavedOrders(savePublicOrderToDevice(order));
    setCompletedOrder(order);
    setScreen('success');
    void refreshProducts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <CustomerHeader
        storeName={settings.storeName}
        logoUrl={settings.logoUrl}
        announcementText={settings.announcementText}
        currencySymbol={settings.currencySymbol}
        activeScreen={screen}
        cartCount={cartCount}
        savedOrdersCount={savedOrders.length}
        searchQuery={searchQuery}
        products={products}
        onSearchChange={(q) => setSearchQuery(q)}
        onSubmitSearch={() => navigateTo('shop')}
        onSelectProduct={openProductDetails}
        onNavigate={navigateTo}
        onOpenCart={() => {
          if (window.innerWidth < 768) {
            navigateTo('cart');
          } else {
            setCartDrawerOpen(true);
          }
        }}
      />

      {/* Toast Feedback */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-18 right-4 z-50 bg-[#0F172A] text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-2"
        >
          <Check className="w-4 h-4 text-[#4ADE80]" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="flex-1">
        {loading ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
            <div className="h-14 rounded-2xl bg-white border border-[#E2E8F0] animate-pulse" />
            <div className="h-11 max-w-xl rounded-xl bg-white border border-[#E2E8F0] animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden"
                >
                  <div className="aspect-[4/3] bg-[#E2E8F0]/70 animate-pulse" />
                  <div className="p-4 space-y-2.5">
                    <div className="h-3 w-1/3 rounded bg-[#E2E8F0]/80 animate-pulse" />
                    <div className="h-4 w-4/5 rounded bg-[#E2E8F0]/80 animate-pulse" />
                    <div className="h-5 w-1/2 rounded bg-[#E2E8F0]/80 animate-pulse" />
                    <div className="h-10 w-full rounded-xl bg-[#E2E8F0]/70 animate-pulse mt-2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : loadError ? (
          <div className="max-w-lg mx-auto my-20 px-4 text-center">
            <p className="text-sm text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4">
              {loadError}
            </p>
          </div>
        ) : (
          <>
            {/* HOME SCREEN — Product-First Instant Layout */}
            {screen === 'home' && (
              <div className="pb-24 md:pb-14 space-y-8 sm:space-y-12">
                {/* Returning Customer Recent Order Bar */}
                {savedOrders.length > 0 && (
                  <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 -mb-5 sm:-mb-7">
                    <div className="bg-[#F0F7FF] border border-[#0B3B6D]/25 rounded-2xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BookmarkCheck className="w-4 h-4 text-[#0B3B6D] shrink-0" />
                        <div className="min-w-0 text-xs">
                          <span className="text-[#475569]">Your Recent Order ID: </span>
                          <span className="font-mono font-bold text-[#0F172A] select-all">
                            {savedOrders[0].orderId}
                          </span>
                          <span className="ml-2 px-2 py-0.5 rounded-md bg-white border border-[#CBD5E1] text-[10px] font-semibold text-[#0B3B6D]">
                            {savedOrders[0].orderStatus}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(savedOrders[0].orderId)
                              .then(() => {
                                setCopiedBannerOrderId(true);
                                window.setTimeout(() => setCopiedBannerOrderId(false), 1800);
                              });
                          }}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white border border-[#CBD5E1] text-xs font-semibold text-[#0F172A] inline-flex items-center gap-1"
                        >
                          {copiedBannerOrderId ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-[#15803D]" />
                              <span className="text-[#15803D]">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy ID</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTrackPrefill({
                              orderId: savedOrders[0].orderId,
                              mobile: savedOrders[0].mobileNumber,
                            });
                            navigateTo('track');
                          }}
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-[#0B3B6D] text-white text-xs font-semibold hover:bg-[#082D54]"
                        >
                          {savedOrders.length > 1
                            ? `View All Orders (${savedOrders.length})`
                            : 'Track Order'}
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {/* 1. Ultra-Compact Top Strip + Direct Products Grid (Products visible immediately on Screen 1!) */}
                <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 sm:pt-5 space-y-3 sm:space-y-4">
                  {/* Single-row compact trust & quick-action bar */}
                  <div className="bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setReturnPolicyModalOpen(true)}
                      className="min-h-[36px] inline-flex items-center gap-2 text-left min-w-0"
                    >
                      <SevenDayReturnLogo size="sm" />
                      <span className="text-[11px] sm:text-xs font-semibold text-[#0F172A] truncate">
                        7-Day Return
                        <span className="text-[#0B3B6D] font-medium"> · {settings.codEnabled ? 'COD Available' : 'Fast Dispatch'}</span>
                      </span>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => navigateTo('track')}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] text-[11px] sm:text-xs font-semibold hover:bg-[#F1F5F9] transition-colors whitespace-nowrap"
                      >
                        Track Order
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateTo('shop')}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#0B3B6D] text-white text-[11px] sm:text-xs font-semibold hover:bg-[#082D54] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <span>All ({products.length})</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Desktop Inline Search Bar (Mobile already has sticky search bar in header) */}
                  <div className="hidden md:flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-xl">
                      <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search products, colors, sizes, codes..."
                        aria-label="Search featured collection"
                        className="w-full min-h-[42px] pl-10 pr-10 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#0F172A] absolute right-2 top-1/2 -translate-y-1/2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Category Filter Tabs */}
                  {categories.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                            selectedCategory === cat
                              ? 'bg-[#0F172A] text-white'
                              : 'bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Products Grid Immediately Above the Fold */}
                  {filteredProducts.length === 0 ? (
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center space-y-3">
                      {searchQuery.trim() || selectedCategory !== 'All' ? (
                        <>
                          <p className="text-base font-semibold text-[#0F172A]">
                            No products match &ldquo;{searchQuery.trim() || selectedCategory}&rdquo;
                          </p>
                          <p className="text-sm text-[#475569]">
                            Try another keyword, color, or reset filters to view all items.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              setSelectedCategory('All');
                            }}
                            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold"
                          >
                            Reset Search
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-base font-semibold text-[#0F172A]">
                            New products coming soon
                          </p>
                          <p className="text-sm text-[#475569]">
                            Our catalog is being updated with fresh deals. Please check back shortly.
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
                      {filteredProducts.slice(0, 12).map((product, index) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          currencySymbol={settings.currencySymbol}
                          priority={index < 4}
                          onSelect={openProductDetails}
                          onAddToCart={(p) => addItemToCart(p, 1, false)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* Optional Store Promo Banner (placed below products so products always show first) */}
                {settings.heroImageUrl && (
                  <section className="max-w-7xl mx-auto px-4 sm:px-6">
                    <div className="w-full max-h-[160px] sm:max-h-[240px] rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#F1F5F9]">
                      <StoreImage
                        src={settings.heroImageUrl}
                        alt={`${settings.storeName} featured collection`}
                        fallbackLabel={settings.storeName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </section>
                )}

                {/* 3. Trust & Return Policy Highlights */}
                <section className="max-w-7xl mx-auto px-4 sm:px-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-2.5">
                      <div className="flex items-center gap-3">
                        <SevenDayReturnLogo size="sm" />
                        <h3 className="text-sm font-semibold text-[#0F172A]">
                          7-Day Easy Return &amp; Exchange
                        </h3>
                      </div>
                      <p className="text-xs text-[#475569] leading-relaxed">
                        Hassle-free returns for damaged, wrong, or defective items. Uncut parcel opening video and clear product &amp; shipping label photos are required.
                      </p>
                      <button
                        type="button"
                        onClick={() => setReturnPolicyModalOpen(true)}
                        className="text-xs font-semibold text-[#0B3B6D] underline underline-offset-2 hover:text-[#C24D06]"
                      >
                        Read Return Guidelines
                      </button>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-2">
                      <Truck className="w-5 h-5 text-[#0B3B6D]" />
                      <h3 className="text-sm font-semibold text-[#0F172A]">
                        Cash on Delivery Available
                      </h3>
                      <p className="text-xs text-[#475569] leading-relaxed">
                        Pay conveniently at your doorstep. Order IDs and real-time status tracking provided for every purchase.
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-2">
                      <ShieldCheck className="w-5 h-5 text-[#0B3B6D]" />
                      <h3 className="text-sm font-semibold text-[#0F172A]">
                        Verified Order Integrity
                      </h3>
                      <p className="text-xs text-[#475569] leading-relaxed">
                        Every item carries a verified Product Code and server-checked pricing with instant stock confirmation.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* CATEGORIES SCREEN */}
            {screen === 'categories' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-28 md:pb-16 space-y-8">
                <div>
                  <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
                    Browse by Category
                  </h1>
                  <p className="text-sm text-[#475569] mt-1">
                    Select a category to jump straight to its available products.
                  </p>
                </div>

                {categories.filter((c) => c !== 'All').length === 0 ? (
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center space-y-2">
                    <p className="text-base font-semibold text-[#0F172A]">
                      No categories available yet
                    </p>
                    <p className="text-sm text-[#475569]">
                      Categories will appear here automatically once products are published.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {categories
                      .filter((c) => c !== 'All')
                      .map((cat) => {
                        const catProducts = products.filter((p) => p.category === cat);
                        const coverImage = catProducts[0]?.images[0] || '';
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat);
                              navigateTo('shop');
                            }}
                            className="group text-left bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden hover:-translate-y-0.5 hover:shadow-md transition-all"
                          >
                            <div className="aspect-[16/10] bg-[#F1F5F9] overflow-hidden">
                              <StoreImage
                                src={coverImage}
                                alt={cat}
                                fallbackLabel={cat}
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                              />
                            </div>
                            <div className="p-5 flex items-center justify-between">
                              <div>
                                <h2 className="text-base font-semibold text-[#0F172A]">{cat}</h2>
                                <p className="text-xs text-[#64748B] mt-0.5 tabular-nums">
                                  {catProducts.length} product{catProducts.length === 1 ? '' : 's'}
                                </p>
                              </div>
                              <ArrowRight className="w-4 h-4 text-[#475569] group-hover:text-[#0B3B6D]" />
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* PRODUCT LISTING / SHOP SCREEN */}
            {screen === 'shop' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-28 md:pb-16 space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
                      {selectedCategory === 'All' ? 'All Products' : selectedCategory}
                    </h1>
                    <p className="text-sm text-[#475569] mt-1 tabular-nums">
                      Showing {filteredProducts.length} product{filteredProducts.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search products..."
                        className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                      />
                    </div>

                    <select
                      value={sortOrder}
                      onChange={(e) =>
                        setSortOrder(e.target.value as 'featured' | 'price-asc' | 'price-desc')
                      }
                      aria-label="Sort products"
                      className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                    >
                      <option value="featured">Sort: Featured</option>
                      <option value="price-asc">Price: Low to High</option>
                      <option value="price-desc">Price: High to Low</option>
                    </select>
                  </div>
                </div>

                {/* Category Filter Bar */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                        selectedCategory === cat
                          ? 'bg-[#0F172A] text-white'
                          : 'bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center space-y-3">
                    <p className="text-base font-semibold text-[#0F172A]">No matching products found</p>
                    <p className="text-sm text-[#475569]">
                      Try clearing your search or switching back to all categories.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('All');
                        setSearchQuery('');
                      }}
                      className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold"
                    >
                      Reset Filters
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                    {filteredProducts.map((product, index) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        currencySymbol={settings.currencySymbol}
                        priority={index < 4}
                        onSelect={openProductDetails}
                        onAddToCart={(p) => addItemToCart(p, 1, false)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PRODUCT DETAILS SCREEN */}
            {screen === 'product' && selectedProduct && (
              <ProductDetailsView
                key={selectedProduct.id}
                product={selectedProduct}
                currencySymbol={settings.currencySymbol}
                freeShippingThreshold={settings.freeShippingThreshold}
                onBack={() => navigateTo('shop')}
                onAddToCart={(p, q, v) => addItemToCart(p, q, false, v)}
                onBuyNow={handleBuyNow}
              />
            )}

            {/* CART SCREEN */}
            {screen === 'cart' && (
              <CartView
                items={cart}
                currencySymbol={settings.currencySymbol}
                freeShippingThreshold={settings.freeShippingThreshold}
                shippingFee={settings.shippingFee}
                onUpdateQuantity={handleUpdateCartQuantity}
                onRemoveItem={handleRemoveCartItem}
                onCheckout={() => navigateTo('checkout')}
                onContinueShopping={() => navigateTo('shop')}
              />
            )}

            {/* CHECKOUT SCREEN */}
            {screen === 'checkout' && (
              <CheckoutView
                items={cart}
                settings={settings}
                onBack={() => navigateTo('cart')}
                onOrderSuccess={handleOrderSuccess}
              />
            )}

            {/* ORDER SUCCESS SCREEN */}
            {screen === 'success' && completedOrder && (
              <OrderSuccessView
                order={completedOrder}
                storeName={settings.storeName}
                currencySymbol={settings.currencySymbol}
                onTrackOrder={(id, phone) => {
                  setTrackPrefill({ orderId: id, mobile: phone });
                  navigateTo('track');
                }}
                onContinueShopping={() => navigateTo('shop')}
              />
            )}

            {/* ORDER TRACKING SCREEN */}
            {screen === 'track' && (
              <OrderTrackingView
                currencySymbol={settings.currencySymbol}
                initialOrderId={trackPrefill.orderId}
                initialMobile={trackPrefill.mobile}
                savedOrders={savedOrders}
                onSavedOrdersChange={setSavedOrders}
                onOpenSupport={() => navigateTo('support')}
              />
            )}

            {/* CUSTOMER SUPPORT SCREEN */}
            {screen === 'support' && (
              <SupportView
                settings={settings}
                onNavigateToTrack={() => navigateTo('track')}
              />
            )}
          </>
        )}
      </main>

      {/* Clean Customer-Only Footer (Strictly zero admin links or sensitive controls) */}
      <footer className="bg-white border-t border-[#E2E8F0] pb-20 md:pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <StoreLogo storeName={settings.storeName} logoUrl={settings.logoUrl} size="sm" />
            <p className="text-xs text-[#64748B] max-w-md">
              {settings.supportAddress} · {settings.supportEmail}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-[#475569]">
            <button type="button" onClick={() => navigateTo('home')} className="hover:text-[#0F172A]">
              Home
            </button>
            <button type="button" onClick={() => navigateTo('shop')} className="hover:text-[#0F172A]">
              Shop
            </button>
            <button type="button" onClick={() => navigateTo('categories')} className="hover:text-[#0F172A]">
              Categories
            </button>
            <button type="button" onClick={() => navigateTo('track')} className="hover:text-[#0F172A]">
              Track Order
            </button>
            <button type="button" onClick={() => navigateTo('support')} className="hover:text-[#0F172A]">
              Support
            </button>
          </div>
        </div>
      </footer>

      {/* Desktop Slide-over Cart Drawer */}
      {cartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setCartDrawerOpen(false)}
          />
          <aside
            aria-label="Shopping bag drawer"
            className="relative z-10 w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6"
          >
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#E2E8F0]">
              <h2 className="font-editorial text-xl font-semibold text-[#0F172A]">
                Shopping Bag ({cartCount})
              </h2>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                aria-label="Close bag drawer"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[#475569] hover:bg-[#F1F5F9]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0">
              <CartView
                compact
                items={cart}
                currencySymbol={settings.currencySymbol}
                freeShippingThreshold={settings.freeShippingThreshold}
                shippingFee={settings.shippingFee}
                onUpdateQuantity={handleUpdateCartQuantity}
                onRemoveItem={handleRemoveCartItem}
                onCheckout={() => {
                  setCartDrawerOpen(false);
                  navigateTo('checkout');
                }}
                onContinueShopping={() => {
                  setCartDrawerOpen(false);
                  navigateTo('shop');
                }}
              />
            </div>
          </aside>
        </div>
      )}
      <ReturnGuidelinesModal
        open={returnPolicyModalOpen}
        onClose={() => setReturnPolicyModalOpen(false)}
      />
    </div>
  );
}

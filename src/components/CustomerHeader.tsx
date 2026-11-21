import { useMemo, useRef, useState } from 'react';
import { Home, LayoutGrid, PackageSearch, Search, ShoppingBag, X } from 'lucide-react';
import type { CustomerScreen, PublicProduct } from '../types';
import { formatPrice } from '../utils/format';
import { StoreImage } from './StoreImage';
import { StoreLogo } from './StoreLogo';

interface CustomerHeaderProps {
  storeName: string;
  logoUrl?: string;
  announcementText?: string;
  currencySymbol: string;
  activeScreen: CustomerScreen;
  cartCount: number;
  savedOrdersCount?: number;
  searchQuery: string;
  products: PublicProduct[];
  onSearchChange: (value: string) => void;
  onSubmitSearch: () => void;
  onSelectProduct: (product: PublicProduct) => void;
  onNavigate: (screen: CustomerScreen) => void;
  onOpenCart: () => void;
}

export function CustomerHeader({
  storeName,
  logoUrl,
  announcementText,
  currencySymbol,
  activeScreen,
  cartCount,
  savedOrdersCount = 0,
  searchQuery,
  products,
  onSearchChange,
  onSubmitSearch,
  onSelectProduct,
  onNavigate,
  onOpenCart,
}: CustomerHeaderProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const blurTimerRef = useRef<number | null>(null);

  const navItems: Array<{ id: CustomerScreen; label: string }> = [
    { id: 'shop', label: 'Shop' },
    { id: 'categories', label: 'Categories' },
    { id: 'track', label: savedOrdersCount > 0 ? `My Orders (${savedOrdersCount})` : 'My Orders' },
    { id: 'support', label: 'Support' },
  ];

  const instantMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.productCode.toLowerCase().includes(q) ||
          (Array.isArray(p.colorOptions) &&
            p.colorOptions.some((c) => c.name.toLowerCase().includes(q))) ||
          (Array.isArray(p.sizeOptions) &&
            p.sizeOptions.some((s) => s.toLowerCase().includes(q)))
      )
      .slice(0, 6);
  }, [products, searchQuery]);

  const showDropdown = searchFocused && searchQuery.trim().length > 0;

  const handleFocus = () => {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setSearchFocused(true);
  };

  const handleBlur = () => {
    blurTimerRef.current = window.setTimeout(() => {
      setSearchFocused(false);
    }, 160);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchFocused(false);
    onSubmitSearch();
  };

  const renderSuggestionsDropdown = () => {
    if (!showDropdown) return null;
    return (
      <div
        role="listbox"
        aria-label="Matching products"
        className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden"
      >
        {instantMatches.length === 0 ? (
          <div className="p-4 text-xs text-[#475569] text-center">
            No products found for &ldquo;{searchQuery.trim()}&rdquo;
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#F1F5F9] max-h-80 overflow-y-auto">
              {instantMatches.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSearchFocused(false);
                    onSelectProduct(prod);
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center gap-3 text-left hover:bg-[#F8FAFC] transition-colors"
                >
                  <div className="w-11 h-11 rounded-lg bg-[#F1F5F9] overflow-hidden border border-[#E2E8F0] shrink-0">
                    <StoreImage
                      src={prod.images[0]}
                      alt={prod.name}
                      fallbackLabel={prod.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#0F172A] truncate">{prod.name}</p>
                    <p className="text-[11px] text-[#64748B] truncate">
                      {prod.category}
                      {prod.colorOptions && prod.colorOptions.length > 0
                        ? ` · ${prod.colorOptions.length} Colors`
                        : ''}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#0B3B6D] tabular-nums shrink-0">
                    {formatPrice(prod.sellingPrice, currencySymbol)}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSearchFocused(false);
                onSubmitSearch();
              }}
              className="w-full py-2.5 px-4 bg-[#F8FAFC] border-t border-[#E2E8F0] text-xs font-semibold text-[#0B3B6D] hover:bg-[#F1F5F9] text-center"
            >
              View all results in Shop
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      {announcementText && (
        <div className="hidden md:block bg-[#0B3B6D] text-white text-xs text-center py-2 px-4">
          <p className="truncate max-w-6xl mx-auto">{announcementText}</p>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-[#F8FAFC]/95 backdrop-blur-md border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-4 lg:gap-6">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3B6D] rounded-lg shrink-0"
          >
            <StoreLogo storeName={storeName} logoUrl={logoUrl} />
          </button>

          {/* Desktop Global Search Bar */}
          <form
            onSubmit={handleFormSubmit}
            className="hidden md:block relative flex-1 max-w-sm lg:max-w-md"
          >
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search products, colors, codes..."
              aria-label="Search products"
              className="w-full min-h-[40px] pl-9 pr-8 py-1.5 rounded-xl border border-[#E2E8F0] bg-white text-xs sm:text-sm text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#0F172A] absolute right-1.5 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {renderSuggestionsDropdown()}
          </form>

          <nav className="hidden md:flex items-center gap-5 lg:gap-7 text-sm font-medium text-[#475569] shrink-0">
            {navItems.map((item) => {
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    isActive
                      ? 'text-[#0B3B6D] font-semibold border-[#E8630A]'
                      : 'border-transparent hover:text-[#0B3B6D]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onOpenCart}
              className="min-h-[42px] px-3.5 sm:px-4 py-2 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#082D54] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>Bag</span>
              <span className="font-mono tabular-nums bg-[#E8630A] text-white px-1.5 py-0.5 rounded text-[11px]">
                {cartCount}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Global Search Sub-bar */}
        <div className="md:hidden px-4 pb-2.5">
          <form onSubmit={handleFormSubmit} className="relative">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search products, colors, sizes..."
              aria-label="Search products"
              className="w-full min-h-[38px] pl-9 pr-8 py-1.5 rounded-xl border border-[#E2E8F0] bg-white text-xs text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#0F172A] absolute right-1.5 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {renderSuggestionsDropdown()}
          </form>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] pb-safe"
      >
        <div className="grid grid-cols-4 h-14 items-center">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
              activeScreen === 'home' ? 'text-[#0B3B6D] font-semibold' : 'text-[#475569]'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[11px] leading-none">Home</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('shop')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
              activeScreen === 'shop' || activeScreen === 'categories'
                ? 'text-[#0B3B6D] font-semibold'
                : 'text-[#475569]'
            }`}
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="text-[11px] leading-none">Shop</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('track')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
              activeScreen === 'track' ? 'text-[#0B3B6D] font-semibold' : 'text-[#475569]'
            }`}
          >
            <span className="relative">
              <PackageSearch className="w-5 h-5" />
              {savedOrdersCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#0B3B6D] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                  {savedOrdersCount}
                </span>
              )}
            </span>
            <span className="text-[11px] leading-none">Orders</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('cart')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
              activeScreen === 'cart' || activeScreen === 'checkout'
                ? 'text-[#0B3B6D] font-semibold'
                : 'text-[#475569]'
            }`}
          >
            <span className="relative">
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#C24D06] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                  {cartCount}
                </span>
              )}
            </span>
            <span className="text-[11px] leading-none">Cart</span>
          </button>
        </div>
      </nav>
    </>
  );
}

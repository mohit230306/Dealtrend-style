import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import type { CartItem } from '../types';
import { formatPrice } from '../utils/format';
import { StoreImage } from './StoreImage';

interface CartViewProps {
  items: CartItem[];
  currencySymbol: string;
  freeShippingThreshold: number;
  shippingFee: number;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: () => void;
  onContinueShopping: () => void;
  compact?: boolean;
}

export function CartView({
  items,
  currencySymbol,
  freeShippingThreshold,
  shippingFee,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  onContinueShopping,
  compact = false,
}: CartViewProps) {
  const subtotal = items.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
  const effectiveShipping = items.length === 0 ? 0 : subtotal >= freeShippingThreshold ? 0 : shippingFee;
  const total = subtotal + effectiveShipping;
  const amountForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);

  const hasCustomOnlinePricing = items.some(
    (item) => item.onlinePrice && item.onlinePrice > 0 && item.onlinePrice !== item.sellingPrice
  );
  const onlineSubtotal = items.reduce(
    (sum, item) =>
      sum +
      (item.onlinePrice && item.onlinePrice > 0 ? item.onlinePrice : item.sellingPrice) *
        item.quantity,
    0
  );
  const onlineShipping =
    items.length === 0 ? 0 : onlineSubtotal >= freeShippingThreshold ? 0 : shippingFee;
  const onlineTotal = onlineSubtotal + onlineShipping;

  if (items.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-16 px-4' : 'py-20 px-4'}`}>
        <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mb-4">
          <ShoppingBag className="w-6 h-6 text-[#475569]" />
        </div>
        <h2 className="font-editorial text-xl font-semibold text-[#0F172A] mb-2">
          Your shopping bag is empty
        </h2>
        <p className="text-sm text-[#475569] max-w-sm mb-6">
          Explore our curated products and add items to proceed to checkout.
        </p>
        <button
          type="button"
          onClick={onContinueShopping}
          className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#0B3B6D] text-white text-sm font-semibold hover:bg-[#082D54] transition-colors"
        >
          Browse Products
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? 'flex flex-col h-full' : 'max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-28 md:pb-12'}>
      {!compact && (
        <div className="mb-6">
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
            Shopping Bag
          </h1>
          <p className="text-sm text-[#475569] mt-1 tabular-nums">
            {items.reduce((sum, i) => sum + i.quantity, 0)} item(s) ready for checkout
          </p>
        </div>
      )}

      {/* Shipping threshold notice */}
      <div className="mb-4 px-4 py-3 rounded-xl bg-[#F1F5F9] text-xs text-[#0F172A]">
        {amountForFreeShipping > 0 ? (
          <span>
            Add <strong className="tabular-nums">{formatPrice(amountForFreeShipping, currencySymbol)}</strong> more for free shipping.
          </span>
        ) : (
          <span className="font-medium text-[#0B3B6D]">
            Your order qualifies for free shipping.
          </span>
        )}
      </div>

      <div className={compact ? 'flex-1 overflow-y-auto divide-y divide-[#E2E8F0]' : 'grid grid-cols-1 lg:grid-cols-12 gap-8 items-start'}>
        <div className={compact ? 'divide-y divide-[#E2E8F0]' : 'lg:col-span-8 bg-white border border-[#E2E8F0] rounded-2xl divide-y divide-[#E2E8F0]'}>
          {items.map((item) => {
            const lineKey = item.cartKey || item.productId;
            return (
              <div key={lineKey} className="p-4 flex gap-4">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-[#F1F5F9] overflow-hidden shrink-0 border border-[#E2E8F0]">
                  <StoreImage
                    src={item.image}
                    alt={item.name}
                    fallbackLabel={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[#0F172A] truncate">
                        {item.name}
                      </h3>
                      {(item.selectedColor || item.selectedSize) && (
                        <p className="text-xs font-medium text-[#0B3B6D] mt-0.5 truncate">
                          {[
                            item.selectedColor ? `Color: ${item.selectedColor}` : '',
                            item.selectedSize ? `Size: ${item.selectedSize}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      <p className="text-xs text-[#64748B] mt-0.5 font-mono">
                        {item.productCode} · {formatPrice(item.sellingPrice, currencySymbol)}
                        {item.onlinePrice &&
                        item.onlinePrice > 0 &&
                        item.onlinePrice !== item.sellingPrice
                          ? ` · Online: ${formatPrice(item.onlinePrice, currencySymbol)}`
                          : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(lineKey)}
                      aria-label={`Remove ${item.name}`}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#64748B] hover:text-[#B91C1C] transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 mt-3">
                    <div className="inline-flex items-center border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(lineKey, item.quantity - 1)}
                        aria-label={`Decrease ${item.name} quantity`}
                        className="w-9 h-9 flex items-center justify-center text-[#0F172A]"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-xs font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={item.quantity >= item.availableStock}
                        onClick={() => onUpdateQuantity(lineKey, item.quantity + 1)}
                        aria-label={`Increase ${item.name} quantity`}
                        className="w-9 h-9 flex items-center justify-center text-[#0F172A] disabled:opacity-40"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="text-sm font-semibold text-[#0F172A] tabular-nums">
                      {formatPrice(item.sellingPrice * item.quantity, currencySymbol)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Panel */}
        <div className={compact ? 'pt-4 mt-4 border-t border-[#E2E8F0] space-y-3' : 'lg:col-span-4 bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4 lg:sticky lg:top-24'}>
          {!compact && (
            <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
              Order Summary
            </h2>
          )}
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between text-[#475569]">
              <span>Subtotal</span>
              <span className="tabular-nums font-medium text-[#0F172A]">
                {formatPrice(subtotal, currencySymbol)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[#475569]">
              <span>Delivery</span>
              <span className="tabular-nums font-medium text-[#0F172A]">
                {effectiveShipping === 0 ? 'Free' : formatPrice(effectiveShipping, currencySymbol)}
              </span>
            </div>
            <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-base font-semibold text-[#0F172A]">
              <span>Total Amount</span>
              <span className="tabular-nums">{formatPrice(total, currencySymbol)}</span>
            </div>
            {hasCustomOnlinePricing && onlineTotal !== total && (
              <div className="flex items-center justify-between text-xs font-semibold text-[#0B3B6D]">
                <span>Online / UPI Pay Total</span>
                <span className="tabular-nums">{formatPrice(onlineTotal, currencySymbol)}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onCheckout}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#0B3B6D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#082D54] active:scale-[0.98] transition-all"
          >
            <span>Continue to Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

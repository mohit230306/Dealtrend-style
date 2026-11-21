import { Plus, Star } from 'lucide-react';
import type { PublicProduct } from '../types';
import { formatPrice } from '../utils/format';
import { StoreImage } from './StoreImage';

interface ProductCardProps {
  product: PublicProduct;
  currencySymbol: string;
  priority?: boolean;
  onSelect: (product: PublicProduct) => void;
  onAddToCart: (product: PublicProduct) => void;
}

export function ProductCard({
  product,
  currencySymbol,
  priority = false,
  onSelect,
  onAddToCart,
}: ProductCardProps) {
  const isOutOfStock = product.status === 'Out of Stock' || product.availableStock <= 0;
  const hasDiscount = product.originalPrice > product.sellingPrice && product.discountPercent > 0;
  const reviews = Array.isArray(product.reviews) ? product.reviews : [];
  const totalReviewCount =
    typeof product.reviewCount === 'number' ? product.reviewCount : reviews.length;
  const avgRating =
    typeof product.averageRating === 'number' && totalReviewCount > 0
      ? product.averageRating.toFixed(1)
      : reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + (Number(r.rating) || 5), 0) / reviews.length).toFixed(1)
      : null;

  const colorOptions = Array.isArray(product.colorOptions) ? product.colorOptions : [];
  const sizeOptions = Array.isArray(product.sizeOptions) ? product.sizeOptions : [];
  const requiresVariantPick = colorOptions.length > 1 || sizeOptions.length > 1;
  const variantSummary = [
    colorOptions.length > 0
      ? `${colorOptions.length} Color${colorOptions.length === 1 ? '' : 's'}`
      : '',
    sizeOptions.length > 0
      ? `${sizeOptions.length} Size${sizeOptions.length === 1 ? '' : 's'}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="group flex flex-col bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={() => onSelect(product)}
        className="relative aspect-[4/3] w-full bg-[#F1F5F9] overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3B6D]"
      >
        <StoreImage
          src={product.images[0]}
          alt={product.name}
          fallbackLabel={product.name}
          priority={priority}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
            <span className="text-xs font-semibold tracking-wide text-[#0F172A] bg-white border border-[#E2E8F0] px-3 py-1.5 rounded-lg">
              Out of Stock
            </span>
          </div>
        )}
      </button>

      <div className="flex-1 flex flex-col p-4 sm:p-5">
        <div className="flex items-center gap-1.5 text-xs text-[#64748B] mb-1.5 truncate">
          <span className="truncate">{product.category}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-[11px] shrink-0">{product.productCode}</span>
        </div>

        <button
          type="button"
          onClick={() => onSelect(product)}
          className="text-left focus-visible:outline-none focus-visible:underline"
        >
          <h3 className="text-[15px] sm:text-base font-semibold text-[#0F172A] leading-snug line-clamp-2 min-h-[2.6rem]">
            {product.name}
          </h3>
        </button>

        <p className="mt-1 text-[11px] font-medium text-[#0B3B6D] truncate">
          {[variantSummary, '7-Day Return'].filter(Boolean).join(' · ')}
        </p>

        {avgRating && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#FEF3C7] text-[#92400E] font-semibold tabular-nums">
              <Star className="w-3 h-3 fill-[#D97706] text-[#D97706]" />
              <span>{avgRating}</span>
            </span>
            <span className="text-[#64748B] tabular-nums">
              ({totalReviewCount} {totalReviewCount === 1 ? 'review' : 'reviews'})
            </span>
          </div>
        )}

        <div className="mt-auto pt-3 border-t border-[#F1F5F9] flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold text-[#0F172A] tabular-nums">
                {formatPrice(product.sellingPrice, currencySymbol)}
              </span>
              {hasDiscount && (
                <span className="text-xs text-[#64748B] line-through tabular-nums">
                  {formatPrice(product.originalPrice, currencySymbol)}
                </span>
              )}
            </div>
            {product.onlinePrice &&
              product.onlinePrice > 0 &&
              product.onlinePrice !== product.sellingPrice && (
                <span className="text-xs font-semibold text-[#0B3B6D] tabular-nums">
                  Online Pay: {formatPrice(product.onlinePrice, currencySymbol)}
                </span>
              )}
            {hasDiscount ? (
              <span className="text-xs font-medium text-[#C24D06] tabular-nums">
                Save {product.discountPercent}%
              </span>
            ) : (
              <span className="text-xs text-[#64748B] tabular-nums">
                {isOutOfStock
                  ? 'Currently unavailable'
                  : product.availableStock >= 999
                  ? 'Ready to dispatch'
                  : `${product.availableStock} available`}
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={isOutOfStock}
            onClick={() => {
              if (requiresVariantPick) {
                onSelect(product);
              } else {
                onAddToCart(product);
              }
            }}
            aria-label={
              requiresVariantPick
                ? `Select options for ${product.name}`
                : `Add ${product.name} to cart`
            }
            className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#082D54] active:scale-[0.98] transition-all disabled:bg-[#E2E8F0] disabled:text-[#64748B] disabled:cursor-not-allowed whitespace-nowrap shrink-0"
          >
            {requiresVariantPick ? (
              <span>Select</span>
            ) : (
              <>
                <Plus className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Add</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

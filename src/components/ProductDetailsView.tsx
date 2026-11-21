import { useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, Minus, Plus, Share2, ShieldCheck, ShoppingBag, Star, Truck, X, Zap } from 'lucide-react';
import type { PublicProduct } from '../types';
import { formatPrice } from '../utils/format';
import { ReturnGuidelinesModal, ReturnGuidelinesSection, SevenDayReturnLogo } from './ReturnPolicyBadge';
import { StoreImage } from './StoreImage';

export interface SelectedVariantPayload {
  selectedColor?: string;
  selectedSize?: string;
  variantImage?: string;
}

interface ProductDetailsViewProps {
  product: PublicProduct;
  currencySymbol: string;
  freeShippingThreshold: number;
  onBack: () => void;
  onAddToCart: (product: PublicProduct, quantity: number, variants?: SelectedVariantPayload) => void;
  onBuyNow: (product: PublicProduct, quantity: number, variants?: SelectedVariantPayload) => void;
}

export function ProductDetailsView({
  product,
  currencySymbol,
  freeShippingThreshold,
  onBack,
  onAddToCart,
  onBuyNow,
}: ProductDetailsViewProps) {
  const images = product.images.length > 0 ? product.images : [''];
  const colorOptions = Array.isArray(product.colorOptions) ? product.colorOptions : [];
  const sizeOptions = Array.isArray(product.sizeOptions) ? product.sizeOptions : [];

  const initialColor = colorOptions.length === 1 ? colorOptions[0].name : '';
  const initialColorIdx =
    colorOptions.length === 1 &&
    colorOptions[0].imageIndex !== undefined &&
    colorOptions[0].imageIndex >= 0 &&
    colorOptions[0].imageIndex < images.length
      ? colorOptions[0].imageIndex
      : 0;
  const initialSize = sizeOptions.length === 1 ? sizeOptions[0] : '';

  const [activeImageIndex, setActiveImageIndex] = useState(initialColorIdx);
  const [selectedColor, setSelectedColor] = useState(initialColor);
  const [selectedSize, setSelectedSize] = useState(initialSize);
  const [variantError, setVariantError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const safeImageIndex = Math.min(activeImageIndex, Math.max(0, images.length - 1));
  const isOutOfStock = product.status === 'Out of Stock' || product.availableStock <= 0;
  const maxQty = product.availableStock >= 999 ? 25 : Math.max(1, product.availableStock);
  const hasDiscount = product.originalPrice > product.sellingPrice && product.discountPercent > 0;
  const reviews = Array.isArray(product.reviews) ? product.reviews : [];
  const totalReviewCount =
    reviews.length > 0 ? reviews.length : Number(product.reviewCount) || 0;
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (Number(r.rating) || 5), 0) / reviews.length
      : Number(product.averageRating) || 0;

  const handleShareProduct = async () => {
    const slug = encodeURIComponent(product.productCode || product.id);
    const shareUrl = `${window.location.origin}/p/${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text: `${product.name} — ${formatPrice(product.sellingPrice, currencySymbol)}`,
          url: shareUrl,
        });
        return;
      }
    } catch {
      // user cancelled or share unavailable — fallback to copy
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handlePrevImage = () => {
    setActiveImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setActiveImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleSelectColor = (optName: string, imageIndex?: number) => {
    setSelectedColor(optName);
    setVariantError('');
    if (imageIndex !== undefined && imageIndex >= 0 && imageIndex < images.length) {
      setActiveImageIndex(imageIndex);
    }
  };

  const buildValidatedVariants = (): SelectedVariantPayload | null => {
    if (colorOptions.length > 0 && !selectedColor) {
      setVariantError('Please select a Color / Design option before continuing.');
      return null;
    }
    if (sizeOptions.length > 0 && !selectedSize) {
      setVariantError('Please select a Size before continuing.');
      return null;
    }
    const matchedColor = colorOptions.find((c) => c.name === selectedColor);
    const linkedImage =
      matchedColor &&
      matchedColor.imageIndex !== undefined &&
      matchedColor.imageIndex >= 0 &&
      matchedColor.imageIndex < images.length
        ? images[matchedColor.imageIndex]
        : images[0] || '';
    return {
      ...(selectedColor ? { selectedColor } : {}),
      ...(selectedSize ? { selectedSize } : {}),
      ...(linkedImage ? { variantImage: linkedImage } : {}),
    };
  };

  const handleTriggerAddToCart = () => {
    const variants = buildValidatedVariants();
    if (!variants) return;
    onAddToCart(product, quantity, variants);
  };

  const handleTriggerBuyNow = () => {
    const variants = buildValidatedVariants();
    if (!variants) return;
    onBuyNow(product, quantity, variants);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-32 md:pb-12">
      <div className="flex items-center justify-between gap-3 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to products</span>
        </button>

        <button
          type="button"
          onClick={() => void handleShareProduct()}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0F172A] hover:border-[#0B3B6D] hover:text-[#0B3B6D] inline-flex items-center gap-1.5 transition-colors"
        >
          {copiedLink ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#15803D]" />
              <span className="text-[#15803D]">Link Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5" />
              <span>Share / Copy Link</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left: Multi-Image Product Gallery */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-[4/3] w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl overflow-hidden">
            <StoreImage
              src={images[safeImageIndex]}
              alt={`${product.name} — view ${safeImageIndex + 1}`}
              fallbackLabel={product.name}
              priority
              className="w-full h-full object-cover"
            />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevImage}
                  aria-label="Previous product image"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 border border-[#E2E8F0] text-[#0F172A] flex items-center justify-center shadow-sm hover:bg-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={handleNextImage}
                  aria-label="Next product image"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 border border-[#E2E8F0] text-[#0F172A] flex items-center justify-center shadow-sm hover:bg-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          {images.length > 1 ? (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {images.map((imgUrl, index) => (
                <button
                  key={`${imgUrl}-${index}`}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  className={`relative w-20 h-16 sm:w-24 sm:h-20 rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                    index === safeImageIndex
                      ? 'border-[#0B3B6D] ring-1 ring-[#0B3B6D]'
                      : 'border-[#E2E8F0] opacity-75 hover:opacity-100'
                  }`}
                >
                  <StoreImage
                    src={imgUrl}
                    alt={`${product.name} thumbnail ${index + 1}`}
                    fallbackLabel={product.name}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : product.isSummary ? (
            <div className="flex items-center gap-2.5 text-xs text-[#64748B]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#0B3B6D] animate-pulse" />
              <span>Loading additional product photos &amp; customer reviews...</span>
            </div>
          ) : null}
        </div>

        {/* Right: Contiguous Purchase Module */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] mb-2">
              <span className="font-medium text-[#475569]">{product.category}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">Code: {product.productCode}</span>
              <span aria-hidden="true">·</span>
              <span className={isOutOfStock ? 'text-[#B91C1C] font-medium' : 'text-[#0B3B6D] font-medium'}>
                {isOutOfStock
                  ? 'Currently Unavailable'
                  : product.availableStock >= 999
                  ? 'Available'
                  : `${product.availableStock} available`}
              </span>
            </div>

            <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A] leading-tight">
              {product.name}
            </h1>

            {totalReviewCount > 0 && averageRating > 0 && (
              <a
                href="#product-reviews"
                className="mt-2.5 inline-flex items-center gap-2 text-xs font-medium text-[#0F172A] hover:text-[#0B3B6D]"
              >
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#92400E] font-semibold tabular-nums">
                  <Star className="w-3.5 h-3.5 fill-[#D97706] text-[#D97706]" />
                  <span>{averageRating.toFixed(1)}</span>
                </span>
                <span className="text-[#475569] underline decoration-[#CBD5E1] underline-offset-2">
                  {totalReviewCount} Customer {totalReviewCount === 1 ? 'Review' : 'Reviews'}
                </span>
              </a>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl sm:text-3xl font-semibold text-[#0F172A] tabular-nums">
                {formatPrice(product.sellingPrice, currencySymbol)}
              </span>
              {hasDiscount && (
                <>
                  <span className="text-base text-[#64748B] line-through tabular-nums">
                    {formatPrice(product.originalPrice, currencySymbol)}
                  </span>
                  <span className="text-sm font-semibold text-[#C24D06] tabular-nums">
                    {product.discountPercent}% off
                  </span>
                </>
              )}
            </div>
            {product.onlinePrice &&
              product.onlinePrice > 0 &&
              product.onlinePrice !== product.sellingPrice && (
                <div className="px-3.5 py-2.5 rounded-xl bg-[#F0F7FF] border border-[#0B3B6D]/20 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#0B3B6D]">
                    Online / UPI Payment Price:{' '}
                    <span className="text-sm tabular-nums">
                      {formatPrice(product.onlinePrice, currencySymbol)}
                    </span>
                  </span>
                  {product.onlinePrice < product.sellingPrice && (
                    <span className="font-semibold text-[#15803D] tabular-nums">
                      Save extra {formatPrice(product.sellingPrice - product.onlinePrice, currencySymbol)}
                    </span>
                  )}
                </div>
              )}

            {/* 7-Day Return Seal & Mandatory Unboxing Notice (Above the fold) */}
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-3">
              <SevenDayReturnLogo size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#0F172A]">
                  7-Day Easy Return &amp; Replacement
                </p>
                <p className="text-[11px] text-[#475569] leading-snug mt-0.5">
                  Uncut parcel opening video &amp; clear product/label photos required.{' '}
                  <button
                    type="button"
                    onClick={() => setReturnModalOpen(true)}
                    className="font-semibold text-[#0B3B6D] underline underline-offset-2 hover:text-[#C24D06]"
                  >
                    Read guidelines
                  </button>
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm sm:text-[15px] leading-relaxed text-[#475569]">
            {product.description}
          </p>

          {/* Color / Design Selector (Photo-Linked) */}
          {colorOptions.length > 0 && (
            <div className="pt-2 border-t border-[#F1F5F9] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#0F172A]">
                  Color / Design:{' '}
                  <span className={selectedColor ? 'text-[#0B3B6D]' : 'text-[#C24D06]'}>
                    {selectedColor || 'Select one'}
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((opt) => {
                  const isActive = selectedColor === opt.name;
                  const thumb =
                    opt.imageIndex !== undefined &&
                    opt.imageIndex >= 0 &&
                    opt.imageIndex < images.length
                      ? images[opt.imageIndex]
                      : '';
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => handleSelectColor(opt.name, opt.imageIndex)}
                      className={`min-h-[44px] px-3 py-1.5 rounded-xl border-2 text-xs font-semibold inline-flex items-center gap-2 transition-all ${
                        isActive
                          ? 'border-[#0B3B6D] bg-[#F0F7FF] text-[#0B3B6D]'
                          : 'border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#94A3B8]'
                      }`}
                    >
                      {thumb && (
                        <span className="w-7 h-7 rounded-lg overflow-hidden border border-[#E2E8F0] shrink-0">
                          <StoreImage
                            src={thumb}
                            alt={opt.name}
                            className="w-full h-full object-cover"
                          />
                        </span>
                      )}
                      <span>{opt.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Size Selector */}
          {sizeOptions.length > 0 && (
            <div className="pt-2 border-t border-[#F1F5F9] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#0F172A]">
                  Size:{' '}
                  <span className={selectedSize ? 'text-[#0B3B6D]' : 'text-[#C24D06]'}>
                    {selectedSize || 'Select size'}
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sizeOptions.map((sz) => {
                  const isActive = selectedSize === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => {
                        setSelectedSize(sz);
                        setVariantError('');
                      }}
                      className={`min-h-[44px] min-w-[52px] px-3.5 py-1.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                        isActive
                          ? 'border-[#0B3B6D] bg-[#0B3B6D] text-white'
                          : 'border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#94A3B8]'
                      }`}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {variantError && (
            <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#991B1B]">
              {variantError}
            </div>
          )}

          {/* Quantity Stepper */}
          <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-[#0F172A]">Quantity</span>
            <div className="inline-flex items-center border border-[#E2E8F0] rounded-xl bg-[#F8FAFC]">
              <button
                type="button"
                disabled={isOutOfStock || quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="w-11 h-11 flex items-center justify-center text-[#0F172A] disabled:opacity-40"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center text-sm font-semibold tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                disabled={isOutOfStock || quantity >= maxQty}
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                aria-label="Increase quantity"
                className="w-11 h-11 flex items-center justify-center text-[#0F172A] disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Primary Actions (Desktop & Tablet) */}
          <div className="hidden md:grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={handleTriggerAddToCart}
              className="min-h-[48px] px-5 py-3 rounded-xl border-2 border-[#0B3B6D] bg-white text-[#0B3B6D] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#0B3B6D]/5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Add to Cart</span>
            </button>
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={handleTriggerBuyNow}
              className="min-h-[48px] px-5 py-3 rounded-xl bg-[#C24D06] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#A84005] active:scale-[0.98] transition-all disabled:bg-[#E2E8F0] disabled:text-[#64748B] disabled:cursor-not-allowed"
            >
              <Zap className="w-4 h-4" />
              <span>{isOutOfStock ? 'Out of Stock' : 'Buy Now'}</span>
            </button>
          </div>

          <div className="pt-4 border-t border-[#F1F5F9] space-y-2.5 text-xs text-[#475569]">
            <div className="flex items-center gap-2.5">
              <Truck className="w-4 h-4 text-[#0B3B6D] shrink-0" />
              <span>
                Free shipping on orders above {formatPrice(freeShippingThreshold, currencySymbol)} · Cash on Delivery available
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#0B3B6D] shrink-0" />
              <span>Product Code {product.productCode} automatically attached to your order</span>
            </div>
          </div>
        </div>
      </div>

      {/* 7-Day Return Policy & Unboxing Guidelines */}
      <section id="return-guidelines" className="mt-10 pt-8 border-t border-[#E2E8F0]">
        <ReturnGuidelinesSection />
      </section>

      <ReturnGuidelinesModal open={returnModalOpen} onClose={() => setReturnModalOpen(false)} />

      {/* Customer Reviews Section */}
      {reviews.length > 0 && (
        <section
          id="product-reviews"
          className="mt-12 pt-8 border-t border-[#E2E8F0] space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white border border-[#E2E8F0] rounded-2xl p-6">
            <div className="flex items-center gap-5">
              <div className="text-center px-4 py-2 rounded-xl bg-[#FEF3C7]/60 border border-[#FDE68A]">
                <span className="text-3xl font-bold text-[#0F172A] tabular-nums block">
                  {averageRating.toFixed(1)}
                </span>
                <div className="flex items-center justify-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-3.5 h-3.5 ${
                        star <= Math.round(averageRating)
                          ? 'fill-[#D97706] text-[#D97706]'
                          : 'text-[#CBD5E1]'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-[#64748B] block mt-1 tabular-nums">
                  {reviews.length} {reviews.length === 1 ? 'Rating' : 'Ratings'}
                </span>
              </div>

              <div>
                <h2 className="font-editorial text-xl sm:text-2xl font-semibold text-[#0F172A]">
                  Customer Reviews
                </h2>
                <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
                  Verified buyer feedback for {product.name}
                </p>
              </div>
            </div>

            <div className="w-full md:w-64 space-y-1.5">
              {[5, 4, 3, 2, 1].map((starValue) => {
                const count = reviews.filter((r) => Math.round(r.rating) === starValue).length;
                const pct = Math.round((count / reviews.length) * 100);
                return (
                  <div key={starValue} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-right font-medium text-[#475569] tabular-nums">
                      {starValue}★
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#D97706]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-7 text-[#64748B] tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviews.map((rev) => (
              <article
                key={rev.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#0F172A]">
                        {rev.reviewerName}
                      </span>
                      {rev.verified !== false && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#15803D] bg-[#F0FDF4] px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Verified Purchase</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#64748B] block mt-0.5">
                      {rev.dateLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${
                          star <= Math.round(rev.rating)
                            ? 'fill-[#D97706] text-[#D97706]'
                            : 'text-[#E2E8F0]'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <p className="text-sm text-[#334155] leading-relaxed whitespace-pre-line">
                  {rev.comment}
                </p>

                {rev.images && rev.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {rev.images.map((imgUrl, idx) => (
                      <button
                        key={`${rev.id}-photo-${idx}`}
                        type="button"
                        onClick={() => setLightboxImage(imgUrl)}
                        aria-label={`View review photo ${idx + 1} by ${rev.reviewerName}`}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#F1F5F9] hover:border-[#0B3B6D] transition-colors"
                      >
                        <StoreImage
                          src={imgUrl}
                          alt={`Customer review photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Review Photo Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-2xl w-full max-h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="Close photo preview"
              className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-full max-h-[85vh] flex items-center justify-center bg-[#0F172A]">
              <StoreImage
                src={lightboxImage}
                alt="Customer review photo preview"
                className="max-w-full max-h-[85vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Bottom Buy Bar (above bottom nav or replacing action area cleanly) */}
      <div className="md:hidden fixed bottom-14 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] px-4 py-3">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={handleTriggerAddToCart}
            className="min-h-[46px] px-4 rounded-xl border-2 border-[#0B3B6D] bg-white text-[#0B3B6D] text-sm font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Add to Cart</span>
          </button>
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={handleTriggerBuyNow}
            className="min-h-[46px] px-4 rounded-xl bg-[#C24D06] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] disabled:bg-[#E2E8F0] disabled:text-[#64748B]"
          >
            <Zap className="w-4 h-4" />
            <span>{isOutOfStock ? 'Out of Stock' : 'Buy Now'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  Star,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { StoreImage } from '../components/StoreImage';
import { deleteProductFromFirestore, saveProductToFirestore } from '../lib/firestoreAdmin';
import { compressImageFileToDataUrl } from '../lib/imageUpload';
import type { Product, ProductColorOption, ProductReview, ProductStatus } from '../types';
import { formatPrice } from '../utils/format';

interface AdminProductsProps {
  products: Product[];
  currencySymbol: string;
  onRefresh: () => Promise<void>;
}

interface ProductFormState {
  id?: string;
  productCode: string;
  name: string;
  category: string;
  originalPrice: string;
  sellingPrice: string;
  hasCustomOnlinePrice: boolean;
  onlinePrice: string;
  sourcePrice: string;
  sourceProductUrl: string;
  availableStock: string;
  status: ProductStatus;
  description: string;
  images: string[];
  reviews: ProductReview[];
  colorOptions: ProductColorOption[];
  sizeOptions: string[];
}

const SIZE_PRESETS = ['Free Size', 'S', 'M', 'L', 'XL', 'XXL'];

function getDefaultReviewDateLabel(): string {
  return new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const EMPTY_FORM: ProductFormState = {
  productCode: '',
  name: '',
  category: 'Kitchen & Brew',
  originalPrice: '',
  sellingPrice: '',
  hasCustomOnlinePrice: false,
  onlinePrice: '',
  sourcePrice: '',
  sourceProductUrl: '',
  availableStock: '999',
  status: 'Active',
  description: '',
  images: [],
  reviews: [],
  colorOptions: [],
  sizeOptions: [],
};

export function AdminProducts({ products, currencySymbol, onRefresh }: AdminProductsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedAdLinkId, setCopiedAdLinkId] = useState<string | null>(null);
  const [publicStoreOrigin, setPublicStoreOrigin] = useState<string>(() => {
    try {
      return localStorage.getItem('dealtrend_public_store_origin') || '';
    } catch {
      return '';
    }
  });
  const [originDraft, setOriginDraft] = useState<string>(() => {
    try {
      return localStorage.getItem('dealtrend_public_store_origin') || '';
    } catch {
      return '';
    }
  });
  const [originSavedMsg, setOriginSavedMsg] = useState('');

  const isPreviewHost =
    typeof window !== 'undefined' && /^ais-(dev|pre)-/i.test(window.location.hostname);

  const resolvedAdOrigin = (() => {
    const raw = publicStoreOrigin.trim();
    if (raw) {
      try {
        const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return parsed.origin;
        }
      } catch {
        // fall back to current origin
      }
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
  })();

  const handleSavePublicOrigin = () => {
    const trimmed = originDraft.trim();
    if (!trimmed) {
      setPublicStoreOrigin('');
      try {
        localStorage.removeItem('dealtrend_public_store_origin');
      } catch {
        // ignore
      }
      setOriginSavedMsg('Cleared custom URL');
      window.setTimeout(() => setOriginSavedMsg(''), 2000);
      return;
    }
    try {
      const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      const cleanOrigin = parsed.origin;
      setPublicStoreOrigin(cleanOrigin);
      setOriginDraft(cleanOrigin);
      try {
        localStorage.setItem('dealtrend_public_store_origin', cleanOrigin);
      } catch {
        // ignore
      }
      setOriginSavedMsg('Saved!');
      window.setTimeout(() => setOriginSavedMsg(''), 2000);
    } catch {
      setOriginSavedMsg('Invalid URL');
      window.setTimeout(() => setOriginSavedMsg(''), 2200);
    }
  };

  const buildAdUrl = (product: Product) => {
    const slug = encodeURIComponent(product.productCode || product.id);
    return `${resolvedAdOrigin}/p/${slug}`;
  };

  const handleCopyAdLink = async (product: Product) => {
    const adUrl = buildAdUrl(product);
    try {
      await navigator.clipboard.writeText(adUrl);
      setCopiedAdLinkId(product.id);
      window.setTimeout(() => {
        setCopiedAdLinkId((curr) => (curr === product.id ? null : curr));
      }, 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const [newColorName, setNewColorName] = useState('');
  const [newColorImageIndex, setNewColorImageIndex] = useState<string>('');
  const [newSizeInput, setNewSizeInput] = useState('');

  // Quick Reviews Modal & Draft State
  const [reviewsProduct, setReviewsProduct] = useState<Product | null>(null);
  const [reviewsDraftList, setReviewsDraftList] = useState<ProductReview[]>([]);
  const [savingReviews, setSavingReviews] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewDateLabel, setReviewDateLabel] = useState(getDefaultReviewDateLabel);
  const [reviewVerified, setReviewVerified] = useState(true);
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [newReviewImageUrl, setNewReviewImageUrl] = useState('');
  const [uploadingReviewImages, setUploadingReviewImages] = useState(false);

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setNewImageUrl('');
    setNewColorName('');
    setNewColorImageIndex('');
    setNewSizeInput('');
    setError('');
    setReviewerName('');
    setReviewRating(5);
    setReviewComment('');
    setReviewDateLabel(getDefaultReviewDateLabel());
    setReviewVerified(true);
    setReviewImages([]);
    setNewReviewImageUrl('');
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setForm({
      id: product.id,
      productCode: product.productCode,
      name: product.name,
      category: product.category,
      originalPrice: String(product.originalPrice),
      sellingPrice: String(product.sellingPrice),
      hasCustomOnlinePrice: Boolean(product.onlinePrice && product.onlinePrice > 0),
      onlinePrice:
        product.onlinePrice && product.onlinePrice > 0 ? String(product.onlinePrice) : '',
      sourcePrice: String(product.sourcePrice || 0),
      sourceProductUrl: product.sourceProductUrl || '',
      availableStock: String(product.availableStock ?? 999),
      status: product.status,
      description: product.description,
      images: [...product.images],
      reviews: Array.isArray(product.reviews) ? [...product.reviews] : [],
      colorOptions: Array.isArray(product.colorOptions)
        ? product.colorOptions.map((c) => ({ ...c }))
        : [],
      sizeOptions: Array.isArray(product.sizeOptions) ? [...product.sizeOptions] : [],
    });
    setNewImageUrl('');
    setNewColorName('');
    setNewColorImageIndex('');
    setNewSizeInput('');
    setError('');
    setReviewerName('');
    setReviewRating(5);
    setReviewComment('');
    setReviewDateLabel(getDefaultReviewDateLabel());
    setReviewVerified(true);
    setReviewImages([]);
    setNewReviewImageUrl('');
    setModalOpen(true);
  };

  const openReviewsModal = (product: Product) => {
    setReviewsProduct(product);
    setReviewsDraftList(Array.isArray(product.reviews) ? [...product.reviews] : []);
    setReviewerName('');
    setReviewRating(5);
    setReviewComment('');
    setReviewDateLabel(getDefaultReviewDateLabel());
    setReviewVerified(true);
    setReviewImages([]);
    setNewReviewImageUrl('');
    setReviewsError('');
  };

  const handleAddDraftReview = (target: 'form' | 'modal') => {
    const cleanName = reviewerName.trim();
    const cleanComment = reviewComment.trim();
    if (!cleanName || !cleanComment) {
      if (target === 'modal') {
        setReviewsError('Please enter both Customer Name and Review Comment.');
      } else {
        setError('Please enter both Customer Name and Review Comment before adding a review.');
      }
      return;
    }
    const currentList = target === 'modal' ? reviewsDraftList : form.reviews;
    if (currentList.length >= 20) {
      const msg = 'Maximum 20 reviews allowed per product.';
      if (target === 'modal') setReviewsError(msg);
      else setError(msg);
      return;
    }
    const newRev: ProductReview = {
      id: `rev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      reviewerName: cleanName.slice(0, 80),
      rating: Math.min(5, Math.max(1, reviewRating)),
      comment: cleanComment.slice(0, 600),
      dateLabel: (reviewDateLabel.trim() || getDefaultReviewDateLabel()).slice(0, 40),
      verified: reviewVerified,
      images: [...reviewImages],
    };
    if (target === 'modal') {
      setReviewsDraftList((prev) => [newRev, ...prev]);
      setReviewsError('');
    } else {
      setForm((prev) => ({ ...prev, reviews: [newRev, ...prev.reviews] }));
      setError('');
    }
    setReviewerName('');
    setReviewRating(5);
    setReviewComment('');
    setReviewImages([]);
    setNewReviewImageUrl('');
  };

  const handleAddReviewImageUrl = (target: 'form' | 'modal') => {
    const trimmed = newReviewImageUrl.trim();
    if (!trimmed) return;
    if (reviewImages.length >= 4) {
      const msg = 'Maximum 4 photos allowed per review.';
      if (target === 'modal') setReviewsError(msg);
      else setError(msg);
      return;
    }
    setReviewImages((prev) => [...prev, trimmed]);
    setNewReviewImageUrl('');
  };

  const handleReviewFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'form' | 'modal'
  ) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const remaining = Math.max(0, 4 - reviewImages.length);
    if (remaining === 0) {
      const msg = 'Maximum 4 photos allowed per review.';
      if (target === 'modal') setReviewsError(msg);
      else setError(msg);
      return;
    }

    setUploadingReviewImages(true);
    try {
      const selected = files.slice(0, remaining);
      const results = await Promise.allSettled(
        selected.map((file) => compressImageFileToDataUrl(file, 520, 0.62))
      );
      const added: string[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          added.push(r.value);
        }
      }
      if (added.length > 0) {
        setReviewImages((prev) => [...prev, ...added].slice(0, 4));
      }
      if (files.length > remaining) {
        const msg = `Max 4 photos allowed per review. Added ${added.length} photo(s).`;
        if (target === 'modal') setReviewsError(msg);
        else setError(msg);
      }
    } finally {
      setUploadingReviewImages(false);
    }
  };

  const handleSaveReviewsModal = async () => {
    if (!reviewsProduct) return;
    setSavingReviews(true);
    setReviewsError('');
    try {
      await saveProductToFirestore(
        {
          id: reviewsProduct.id,
          productCode: reviewsProduct.productCode,
          name: reviewsProduct.name,
          category: reviewsProduct.category,
          originalPrice: reviewsProduct.originalPrice,
          sellingPrice: reviewsProduct.sellingPrice,
          onlinePrice: reviewsProduct.onlinePrice || 0,
          sourcePrice: reviewsProduct.sourcePrice,
          sourceProductUrl: reviewsProduct.sourceProductUrl,
          availableStock: reviewsProduct.availableStock,
          status: reviewsProduct.status,
          description: reviewsProduct.description,
          images: reviewsProduct.images,
          reviews: reviewsDraftList,
          colorOptions: reviewsProduct.colorOptions || [],
          sizeOptions: reviewsProduct.sizeOptions || [],
        },
        products
      );
      await onRefresh();
      setReviewsProduct(null);
    } catch (err) {
      setReviewsError(err instanceof Error ? err.message : 'Could not save product reviews.');
    } finally {
      setSavingReviews(false);
    }
  };

  const handleGenerateCode = () => {
    const prefix =
      form.name
        .replace(/[^a-zA-Z]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'PRD';
    const rand = Math.floor(100 + Math.random() * 900);
    setForm((prev) => ({ ...prev, productCode: `DT-${prefix}-${rand}` }));
  };

  const handleAddImageUrl = () => {
    const trimmed = newImageUrl.trim();
    if (!trimmed) return;
    if (form.images.length >= 12) {
      setError('Maximum 12 photos allowed per product.');
      return;
    }
    setForm((prev) => ({ ...prev, images: [...prev.images, trimmed] }));
    setNewImageUrl('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, 12 - form.images.length);
    if (remainingSlots === 0) {
      setError('Maximum 12 photos allowed per product. Remove one before uploading more.');
      return;
    }

    const selectedFiles = files.slice(0, remainingSlots);
    setUploadingImages(true);
    setError('');

    try {
      const results = await Promise.allSettled(
        selectedFiles.map((file) => compressImageFileToDataUrl(file, 720, 0.72))
      );
      const uploadedUrls: string[] = [];
      let failedCount = 0;
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          uploadedUrls.push(r.value);
        } else {
          failedCount += 1;
        }
      }

      if (uploadedUrls.length > 0) {
        setForm((prev) => ({
          ...prev,
          images: [...prev.images, ...uploadedUrls].slice(0, 12),
        }));
      }

      if (files.length > remainingSlots) {
        setError(`Max 12 photos allowed per product. Added ${uploadedUrls.length} photo(s).`);
      } else if (failedCount > 0) {
        setError(`${failedCount} photo(s) could not be processed. Try smaller images.`);
      }
    } finally {
      setUploadingImages(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
      colorOptions: prev.colorOptions.map((opt) => {
        if (opt.imageIndex === undefined) return opt;
        if (opt.imageIndex === index) return { name: opt.name };
        if (opt.imageIndex > index) return { ...opt, imageIndex: opt.imageIndex - 1 };
        return opt;
      }),
    }));
  };

  const handleMakeCoverImage = (index: number) => {
    if (index <= 0) return;
    setForm((prev) => {
      const next = [...prev.images];
      const [picked] = next.splice(index, 1);
      if (!picked) return prev;
      return {
        ...prev,
        images: [picked, ...next],
        colorOptions: prev.colorOptions.map((opt) => {
          if (opt.imageIndex === undefined) return opt;
          if (opt.imageIndex === index) return { ...opt, imageIndex: 0 };
          if (opt.imageIndex < index) return { ...opt, imageIndex: opt.imageIndex + 1 };
          return opt;
        }),
      };
    });
  };

  const handleAddColorOption = () => {
    const clean = newColorName.trim().slice(0, 60);
    if (!clean) return;
    if (form.colorOptions.length >= 20) {
      setError('Maximum 20 color / design options allowed per product.');
      return;
    }
    if (form.colorOptions.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      setError(`Color / Design "${clean}" is already added.`);
      return;
    }
    const parsedIdx =
      newColorImageIndex !== '' &&
      Number.isInteger(Number(newColorImageIndex)) &&
      Number(newColorImageIndex) >= 0 &&
      Number(newColorImageIndex) < form.images.length
        ? Number(newColorImageIndex)
        : undefined;
    setForm((prev) => ({
      ...prev,
      colorOptions: [
        ...prev.colorOptions,
        parsedIdx !== undefined ? { name: clean, imageIndex: parsedIdx } : { name: clean },
      ],
    }));
    setNewColorName('');
    setNewColorImageIndex('');
    setError('');
  };

  const handleToggleSizePreset = (size: string) => {
    setForm((prev) => {
      const exists = prev.sizeOptions.some((s) => s.toLowerCase() === size.toLowerCase());
      if (exists) {
        return {
          ...prev,
          sizeOptions: prev.sizeOptions.filter((s) => s.toLowerCase() !== size.toLowerCase()),
        };
      }
      if (prev.sizeOptions.length >= 20) return prev;
      return { ...prev, sizeOptions: [...prev.sizeOptions, size] };
    });
  };

  const handleAddCustomSizes = () => {
    const tokens = newSizeInput
      .split(',')
      .map((s) => s.trim().slice(0, 40))
      .filter(Boolean);
    if (tokens.length === 0) return;
    setForm((prev) => {
      const next = [...prev.sizeOptions];
      for (const token of tokens) {
        if (next.length >= 20) break;
        if (!next.some((s) => s.toLowerCase() === token.toLowerCase())) {
          next.push(token);
        }
      }
      return { ...prev, sizeOptions: next };
    });
    setNewSizeInput('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    const sellingNum = Number(form.sellingPrice) || 0;
    const onlineNum = form.hasCustomOnlinePrice ? Number(form.onlinePrice) || 0 : 0;
    const originalNum = Number(form.originalPrice) || sellingNum;
    const sourceNum = Number(form.sourcePrice) || 0;

    if (form.hasCustomOnlinePrice && !(onlineNum > 0)) {
      setError('Please enter a valid Customer Online Payment Price greater than 0, or turn off the separate online price option.');
      setSaving(false);
      return;
    }

    try {
      await saveProductToFirestore(
        {
          id: form.id,
          productCode: form.productCode.trim().toUpperCase(),
          name: form.name.trim(),
          category: form.category.trim(),
          originalPrice: Math.max(sellingNum, originalNum),
          sellingPrice: sellingNum,
          onlinePrice: onlineNum > 0 ? onlineNum : 0,
          sourcePrice: sourceNum,
          sourceProductUrl: form.sourceProductUrl.trim(),
          availableStock: form.availableStock ? Number(form.availableStock) : 999,
          status: form.status,
          description: form.description.trim(),
          images: form.images,
          reviews: form.reviews,
          colorOptions: form.colorOptions,
          sizeOptions: form.sizeOptions,
        },
        products
      );
      await onRefresh();
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatusChange = async (product: Product, nextStatus: ProductStatus) => {
    await saveProductToFirestore(
      {
        id: product.id,
        productCode: product.productCode,
        name: product.name,
        category: product.category,
        originalPrice: product.originalPrice,
        sellingPrice: product.sellingPrice,
        onlinePrice: product.onlinePrice || 0,
        sourcePrice: product.sourcePrice,
        sourceProductUrl: product.sourceProductUrl,
        availableStock: product.availableStock,
        status: nextStatus,
        description: product.description,
        images: product.images,
        reviews: product.reviews || [],
        colorOptions: product.colorOptions || [],
        sizeOptions: product.sizeOptions || [],
      },
      products
    );
    await onRefresh();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteProductFromFirestore(id);
      await onRefresh();
    } finally {
      setDeletingId(null);
    }
  };

  const sellingNum = Number(form.sellingPrice) || 0;
  const onlineNum = form.hasCustomOnlinePrice ? Number(form.onlinePrice) || 0 : 0;
  const sourceNum = Number(form.sourcePrice) || 0;
  const expectedProfitPreview = Number((sellingNum - sourceNum).toFixed(2));
  const onlineProfitPreview = Number((onlineNum - sourceNum).toFixed(2));
  const profitMarginPercent =
    sellingNum > 0 ? Math.round((expectedProfitPreview / sellingNum) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
            Reseller Product Catalog
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            Set customer selling prices, private supplier source prices, expected profit, and internal Meesho/supplier links.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[#0B3B6D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#082D54] transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Fast Direct Product Ad Links & Public Domain Config */}
      <div
        className={`rounded-2xl px-4 py-3.5 space-y-2.5 border ${
          isPreviewHost && !publicStoreOrigin
            ? 'bg-[#FFFBEB] border-[#FDE68A]'
            : 'bg-[#F0F7FF] border-[#0B3B6D]/20'
        }`}
      >
        <div className="flex items-start gap-3">
          <Link2
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              isPreviewHost && !publicStoreOrigin ? 'text-[#B45309]' : 'text-[#0B3B6D]'
            }`}
          />
          <div className="text-xs text-[#334155] leading-relaxed space-y-1">
            {isPreviewHost && !publicStoreOrigin ? (
              <p>
                <span className="font-semibold text-[#92400E]">Preview Link Notice:</span>{' '}
                You are currently on a private preview URL, which asks visitors to sign in. Deploy your store to a{' '}
                <span className="font-semibold text-[#0F172A]">Public Cloud URL / Custom Domain</span>{' '}
                and paste it below so <span className="font-semibold">Copy Ad Link</span> creates direct public links with{' '}
                <span className="font-semibold">no sign-in</span> and instant product opening.
              </p>
            ) : (
              <p>
                <span className="font-semibold text-[#0F172A]">Fast Direct Ad Links:</span> Tap{' '}
                <span className="font-semibold text-[#0B3B6D]">Copy Ad Link</span> on any Active product to get a direct fast-loading link (
                <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-[#CBD5E1]">
                  {resolvedAdOrigin}/p/CODE
                </span>
                ) for Instagram, Facebook, or WhatsApp ads — customers land straight on that product with Buy Now ready immediately.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-0.5">
          <input
            type="url"
            value={originDraft}
            onChange={(e) => setOriginDraft(e.target.value)}
            placeholder="Paste your Public Live Store URL (e.g. https://yourstore.run.app or https://dealtrend.in)"
            aria-label="Public live store URL for ad links"
            className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs text-[#0F172A] font-mono placeholder:font-sans placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
          />
          <button
            type="button"
            onClick={handleSavePublicOrigin}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold hover:bg-[#082D54] whitespace-nowrap"
          >
            {originSavedMsg || 'Set Public URL'}
          </button>
        </div>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {products.map((product) => {
          const profit = product.sellingPrice - (product.sourcePrice || 0);
          return (
            <div
              key={product.id}
              className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col justify-between gap-4"
            >
              <div className="flex gap-4">
                <div className="w-20 h-20 rounded-xl bg-[#F1F5F9] overflow-hidden border border-[#E2E8F0] shrink-0">
                  <StoreImage
                    src={product.images[0]}
                    alt={product.name}
                    fallbackLabel={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-mono text-[#64748B]">
                    {product.productCode} · {product.category}
                  </p>
                  <h2 className="text-sm font-semibold text-[#0F172A] line-clamp-2 mt-0.5">
                    {product.name}
                  </h2>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1.5 text-xs">
                    <span className="text-sm font-semibold text-[#0F172A] tabular-nums">
                      COD/Regular: {formatPrice(product.sellingPrice, currencySymbol)}
                    </span>
                    {product.onlinePrice &&
                      product.onlinePrice > 0 &&
                      product.onlinePrice !== product.sellingPrice && (
                        <span className="text-xs font-semibold text-[#0B3B6D] tabular-nums">
                          Online Pay: {formatPrice(product.onlinePrice, currencySymbol)}
                        </span>
                      )}
                    <span className="text-[#64748B] tabular-nums">
                      Source: {formatPrice(product.sourcePrice || 0, currencySymbol)}
                    </span>
                  </div>
                  <p
                    className={`text-xs font-semibold tabular-nums mt-0.5 ${
                      profit >= 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                    }`}
                  >
                    Expected Profit: {profit >= 0 ? '+' : ''}
                    {formatPrice(profit, currencySymbol)}
                  </p>
                  {((product.colorOptions && product.colorOptions.length > 0) ||
                    (product.sizeOptions && product.sizeOptions.length > 0)) && (
                    <p className="text-[11px] text-[#475569] mt-1 line-clamp-1">
                      {[
                        product.colorOptions && product.colorOptions.length > 0
                          ? `Colors: ${product.colorOptions.map((c) => c.name).join(', ')}`
                          : '',
                        product.sizeOptions && product.sizeOptions.length > 0
                          ? `Sizes: ${product.sizeOptions.join(', ')}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              </div>

              {product.status === 'Active' && (
                <div className="px-3 py-2 rounded-xl bg-[#F0F7FF] border border-[#0B3B6D]/20 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#0B3B6D]">
                      Direct Fast Ad Link
                    </span>
                    <span className="block text-xs font-mono text-[#0F172A] truncate">
                      /p/{product.productCode || product.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleCopyAdLink(product)}
                      aria-label={`Copy direct ad link for ${product.name}`}
                      className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
                        copiedAdLinkId === product.id
                          ? 'bg-[#15803D] text-white'
                          : 'bg-[#0B3B6D] text-white hover:bg-[#082D54]'
                      }`}
                    >
                      {copiedAdLinkId === product.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Copy Ad Link</span>
                        </>
                      )}
                    </button>
                    <a
                      href={buildAdUrl(product)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open direct ad link for ${product.name}`}
                      className="min-h-[34px] px-2 py-1 rounded-lg border border-[#0B3B6D]/30 bg-white text-[#0B3B6D] text-xs font-semibold inline-flex items-center gap-1 hover:bg-[#E0F2FE]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <select
                    value={product.status}
                    onChange={(e) =>
                      void handleQuickStatusChange(product, e.target.value as ProductStatus)
                    }
                    aria-label={`Status for ${product.name}`}
                    className="min-h-[38px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0F172A]"
                  >
                    <option value="Active">Active</option>
                    <option value="Hidden">Hidden</option>
                    <option value="Out of Stock">Unavailable</option>
                  </select>

                  {product.sourceProductUrl && (
                    <a
                      href={product.sourceProductUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#0B3B6D] hover:bg-[#F1F5F9] inline-flex items-center gap-1"
                    >
                      <span>Source</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openReviewsModal(product)}
                    aria-label={`Manage reviews for ${product.name}`}
                    className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] text-xs font-semibold text-[#92400E] hover:bg-[#FEF3C7] inline-flex items-center gap-1"
                  >
                    <Star className="w-3.5 h-3.5 fill-[#D97706] text-[#D97706]" />
                    <span>
                      Reviews{product.reviews && product.reviews.length > 0 ? ` (${product.reviews.length})` : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(product)}
                    aria-label={`Edit ${product.name}`}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] inline-flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === product.id}
                    onClick={() => void handleDelete(product.id)}
                    aria-label={`Delete ${product.name}`}
                    className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#FECACA] text-[#991B1B] hover:bg-[#FEF2F2] inline-flex items-center justify-center disabled:opacity-50"
                  >
                    {deletingId === product.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <h2 className="font-editorial text-xl font-semibold text-[#0F172A]">
                {form.id ? 'Edit Reseller Product' : 'Add Reseller Product'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[#475569] hover:bg-[#F1F5F9]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Matte Ceramic Pour-Over Kettle"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Internal Product Code (auto-generated if blank)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.productCode}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, productCode: e.target.value.toUpperCase() }))
                      }
                      placeholder="DT-KTL-101"
                      className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-mono uppercase"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateCode}
                      title="Auto-generate code"
                      className="min-h-[44px] px-3 rounded-xl border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] inline-flex items-center gap-1"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Auto</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Category *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    placeholder="Kitchen & Brew"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                  />
                </div>

                {/* Pricing & Profit (Reseller Specific) */}
                <div>
                  <label className="block text-xs font-medium text-[#0B3B6D] font-semibold mb-1">
                    Selling Price / COD ({currencySymbol}) — Customers *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={form.sellingPrice}
                    onChange={(e) => setForm((p) => ({ ...p, sellingPrice: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#0B3B6D]/40 bg-[#F8FAFC] text-sm font-semibold tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Compare-At MRP ({currencySymbol}, optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.originalPrice}
                    onChange={(e) => setForm((p) => ({ ...p, originalPrice: e.target.value }))}
                    placeholder="Optional higher price for % off"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm tabular-nums"
                  />
                </div>

                {/* Dedicated Customer Online Payment Price Option */}
                <div className="sm:col-span-2 p-4 rounded-xl border-2 border-[#0B3B6D]/25 bg-[#F0F7FF]/70 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.hasCustomOnlinePrice}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setForm((p) => ({
                          ...p,
                          hasCustomOnlinePrice: checked,
                          onlinePrice: checked ? p.onlinePrice || p.sellingPrice : '',
                        }));
                      }}
                      className="mt-0.5 w-4 h-4 accent-[#0B3B6D]"
                    />
                    <div className="flex-1">
                      <span className="block text-xs sm:text-sm font-semibold text-[#0F172A]">
                        Set separate price for Customer Online / UPI Payment
                      </span>
                      <span className="block text-[11px] text-[#475569] mt-0.5">
                        {form.hasCustomOnlinePrice
                          ? 'Customers choosing Online / UPI at checkout will be charged the Online Payment Price below instead of the COD price.'
                          : 'Off — Customers paying Online / UPI will pay the same Selling Price as COD.'}
                      </span>
                    </div>
                  </label>

                  {form.hasCustomOnlinePrice && (
                    <div className="pt-1">
                      <label className="block text-xs font-semibold text-[#0B3B6D] mb-1">
                        Customer Online Payment Price ({currencySymbol}) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        required
                        value={form.onlinePrice}
                        onChange={(e) => setForm((p) => ({ ...p, onlinePrice: e.target.value }))}
                        placeholder="Enter price for Online / UPI payment"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#0B3B6D]/40 bg-white text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#C24D06] font-semibold mb-1">
                    Source Price ({currencySymbol}) — ADMIN ONLY *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.sourcePrice}
                    onChange={(e) => setForm((p) => ({ ...p, sourcePrice: e.target.value }))}
                    placeholder="Supplier / Meesho price"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#C24D06]/30 bg-[#FFF7ED]/50 text-sm tabular-nums"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#475569]">Expected Profit (Admin)</span>
                    <div className="flex flex-wrap items-center gap-4 text-sm font-semibold tabular-nums">
                      <span
                        className={
                          expectedProfitPreview >= 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                        }
                      >
                        COD: {expectedProfitPreview >= 0 ? '+' : ''}
                        {formatPrice(expectedProfitPreview, currencySymbol)} ({profitMarginPercent}%)
                      </span>
                      {onlineNum > 0 && onlineNum !== sellingNum && (
                        <span
                          className={
                            onlineProfitPreview >= 0 ? 'text-[#0B3B6D]' : 'text-[#B91C1C]'
                          }
                        >
                          Online Pay: {onlineProfitPreview >= 0 ? '+' : ''}
                          {formatPrice(onlineProfitPreview, currencySymbol)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#C24D06] font-semibold mb-1">
                    Internal Source / Supplier Product Reference Link (ADMIN ONLY)
                  </label>
                  <input
                    type="url"
                    value={form.sourceProductUrl}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, sourceProductUrl: e.target.value }))
                    }
                    placeholder="https://www.meesho.com/... or supplier product URL"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#C24D06]/30 bg-[#FFF7ED]/50 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Product Visibility Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, status: e.target.value as ProductStatus }))
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                  >
                    <option value="Active">Active (Visible to customers)</option>
                    <option value="Hidden">Hidden (Admin only)</option>
                    <option value="Out of Stock">Unavailable (Shown as unavailable)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Order Quantity Cap (999 = unlimited reseller)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.availableStock}
                    onChange={(e) => setForm((p) => ({ ...p, availableStock: e.target.value }))}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm tabular-nums"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Customer-Facing Description
                  </label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Product details, dimensions, and benefits shown to customers..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                  />
                </div>

                {/* Multiple Product Images */}
                <div className="sm:col-span-2 space-y-3 pt-2 border-t border-[#F1F5F9]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-[#0F172A]">
                      Product Photos ({form.images.length}/12) — Select multiple photos at once or paste URLs
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="Paste Google Drive link or direct image URL..."
                      className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleAddImageUrl}
                      className="min-h-[44px] px-4 py-2 rounded-xl border border-[#0F172A] text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9] whitespace-nowrap"
                    >
                      Add URL
                    </button>
                    <label
                      className={`min-h-[44px] px-4 py-2 rounded-xl border border-[#0B3B6D]/30 bg-[#F0F7FF] text-xs font-semibold text-[#0B3B6D] hover:bg-[#0B3B6D]/10 inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        uploadingImages ? 'opacity-60 pointer-events-none' : ''
                      }`}
                    >
                      {uploadingImages ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{uploadingImages ? 'Uploading...' : 'Upload Multiple Photos'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={uploadingImages}
                        onChange={(e) => void handleFileUpload(e)}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {form.images.length > 0 && (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {form.images.map((img, index) => (
                        <div
                          key={`${img.slice(0, 24)}-${index}`}
                          className="relative w-24 h-24 rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#F1F5F9] group"
                        >
                          <StoreImage
                            src={img}
                            alt={`Product image ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {index === 0 ? (
                            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-[#0B3B6D] text-white text-[10px] font-semibold">
                              Cover
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleMakeCoverImage(index)}
                              className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium hover:bg-[#0B3B6D]"
                            >
                              Make Cover
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(index)}
                            aria-label="Remove image"
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Product Variants: Color / Design (with Photo Link) & Size Options */}
                <div className="sm:col-span-2 space-y-4 pt-3 border-t border-[#F1F5F9]">
                  <div>
                    <span className="text-xs font-semibold text-[#0F172A] block">
                      Product Variants (Optional — Color / Design &amp; Size)
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      Add color/design options (linked to uploaded photos) and sizes so customers pick their exact choice before ordering.
                    </span>
                  </div>

                  {/* Color / Design Options */}
                  <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                    <span className="block text-xs font-semibold text-[#0F172A]">
                      Color / Design Options ({form.colorOptions.length}/20)
                    </span>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={newColorName}
                        onChange={(e) => setNewColorName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddColorOption();
                          }
                        }}
                        placeholder="Color or design name (e.g. Maroon Floral, Sky Blue)"
                        className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                      />
                      {form.images.length > 0 && (
                        <select
                          value={newColorImageIndex}
                          onChange={(e) => setNewColorImageIndex(e.target.value)}
                          aria-label="Link product photo to color option"
                          className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#0F172A]"
                        >
                          <option value="">Link to Photo (Optional)</option>
                          {form.images.map((_, idx) => (
                            <option key={`opt-photo-${idx}`} value={String(idx)}>
                              Photo #{idx + 1} {idx === 0 ? '(Cover)' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={handleAddColorOption}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#0B3B6D] text-white text-xs font-semibold hover:bg-[#082D54] whitespace-nowrap"
                      >
                        + Add Color
                      </button>
                    </div>

                    {form.images.length > 0 && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        <span className="text-[11px] text-[#64748B] shrink-0">Tap photo to link:</span>
                        {form.images.map((img, idx) => (
                          <button
                            key={`quick-link-${idx}`}
                            type="button"
                            onClick={() =>
                              setNewColorImageIndex((curr) =>
                                curr === String(idx) ? '' : String(idx)
                              )
                            }
                            className={`relative w-10 h-10 rounded-lg overflow-hidden border-2 shrink-0 ${
                              newColorImageIndex === String(idx)
                                ? 'border-[#0B3B6D] ring-1 ring-[#0B3B6D]'
                                : 'border-[#E2E8F0] opacity-80 hover:opacity-100'
                            }`}
                            title={`Link Photo #${idx + 1}`}
                          >
                            <StoreImage
                              src={img}
                              alt={`Photo ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-0 right-0 px-1 bg-black/70 text-white text-[9px] font-mono">
                              #{idx + 1}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {form.colorOptions.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {form.colorOptions.map((opt, idx) => (
                          <div
                            key={`${opt.name}-${idx}`}
                            className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-[#E2E8F0] text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {opt.imageIndex !== undefined && form.images[opt.imageIndex] ? (
                                <div className="w-8 h-8 rounded-md overflow-hidden border border-[#E2E8F0] shrink-0">
                                  <StoreImage
                                    src={form.images[opt.imageIndex]}
                                    alt={opt.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-md bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center text-[10px] text-[#64748B] shrink-0">
                                  —
                                </div>
                              )}
                              <span className="font-semibold text-[#0F172A] truncate">
                                {opt.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {form.images.length > 0 && (
                                <select
                                  value={
                                    opt.imageIndex !== undefined ? String(opt.imageIndex) : ''
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setForm((prev) => ({
                                      ...prev,
                                      colorOptions: prev.colorOptions.map((c, cIdx) =>
                                        cIdx === idx
                                          ? val === ''
                                            ? { name: c.name }
                                            : { name: c.name, imageIndex: Number(val) }
                                          : c
                                      ),
                                    }));
                                  }}
                                  aria-label={`Linked photo for ${opt.name}`}
                                  className="min-h-[32px] px-2 py-1 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-[11px]"
                                >
                                  <option value="">No photo link</option>
                                  {form.images.map((_, pIdx) => (
                                    <option key={`${opt.name}-p-${pIdx}`} value={String(pIdx)}>
                                      Photo #{pIdx + 1}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setForm((prev) => ({
                                    ...prev,
                                    colorOptions: prev.colorOptions.filter((_, i) => i !== idx),
                                  }))
                                }
                                aria-label={`Remove ${opt.name}`}
                                className="p-1.5 rounded-md text-[#991B1B] hover:bg-[#FEF2F2]"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Size Options */}
                  <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                    <span className="block text-xs font-semibold text-[#0F172A]">
                      Size Options ({form.sizeOptions.length}/20)
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {SIZE_PRESETS.map((preset) => {
                        const active = form.sizeOptions.some(
                          (s) => s.toLowerCase() === preset.toLowerCase()
                        );
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleToggleSizePreset(preset)}
                            className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                              active
                                ? 'border-[#0B3B6D] bg-[#0B3B6D] text-white'
                                : 'border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0F172A]'
                            }`}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSizeInput}
                        onChange={(e) => setNewSizeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomSizes();
                          }
                        }}
                        placeholder="Custom size(s), e.g. 28, 30, 32 or Pack of 2"
                        className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomSizes}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-[#0F172A] bg-white text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9] whitespace-nowrap"
                      >
                        + Add Size
                      </button>
                    </div>

                    {form.sizeOptions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {form.sizeOptions.map((sz, idx) => (
                          <span
                            key={`${sz}-${idx}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#E2E8F0] text-xs font-semibold text-[#0F172A]"
                          >
                            <span>{sz}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  sizeOptions: prev.sizeOptions.filter((_, i) => i !== idx),
                                }))
                              }
                              aria-label={`Remove size ${sz}`}
                              className="text-[#64748B] hover:text-[#B91C1C]"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline Customer Reviews Editor inside Product Modal */}
                <div className="sm:col-span-2 space-y-3 pt-3 border-t border-[#F1F5F9]">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-[#0F172A] block">
                        Customer Reviews ({form.reviews.length}/20) — Shown on Store to Boost Sales
                      </span>
                      <span className="text-[11px] text-[#64748B]">
                        Add verified buyer reviews or manage them anytime via the Reviews button on each product card.
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        value={reviewerName}
                        onChange={(e) => setReviewerName(e.target.value)}
                        placeholder="Customer Name (e.g. Priya Sharma)"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                      />
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white">
                        <span className="text-xs text-[#475569]">Rating:</span>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewRating(star)}
                              aria-label={`${star} star rating`}
                              className="p-0.5"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  star <= reviewRating
                                    ? 'fill-[#D97706] text-[#D97706]'
                                    : 'text-[#CBD5E1]'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Write review comment (e.g. Very good quality and fast delivery!)"
                      className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                    />

                    {/* Review Photos Attachment (Optional, Max 4) */}
                    <div className="space-y-2 pt-1">
                      <span className="block text-[11px] font-medium text-[#475569]">
                        Review Photos ({reviewImages.length}/4, optional)
                      </span>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={newReviewImageUrl}
                          onChange={(e) => setNewReviewImageUrl(e.target.value)}
                          placeholder="Paste review photo URL / Drive link..."
                          className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddReviewImageUrl('form')}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#0F172A] text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9] whitespace-nowrap"
                        >
                          Add URL
                        </button>
                        <label
                          className={`min-h-[38px] px-3 py-1.5 rounded-lg border border-[#0B3B6D]/30 bg-white text-xs font-semibold text-[#0B3B6D] hover:bg-[#F0F7FF] inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                            uploadingReviewImages ? 'opacity-60 pointer-events-none' : ''
                          }`}
                        >
                          {uploadingReviewImages ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>{uploadingReviewImages ? 'Uploading...' : 'Upload Photo(s)'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={uploadingReviewImages}
                            onChange={(e) => void handleReviewFileUpload(e, 'form')}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {reviewImages.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {reviewImages.map((img, idx) => (
                            <div
                              key={`${img.slice(0, 20)}-${idx}`}
                              className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#E2E8F0] bg-white"
                            >
                              <StoreImage
                                src={img}
                                alt={`Draft review photo ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setReviewImages((prev) => prev.filter((_, i) => i !== idx))
                                }
                                aria-label="Remove review photo"
                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={reviewDateLabel}
                          onChange={(e) => setReviewDateLabel(e.target.value)}
                          placeholder="Date (e.g. 17 Nov 2026)"
                          className="w-32 min-h-[36px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                        />
                        <label className="inline-flex items-center gap-1.5 text-xs text-[#0F172A] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reviewVerified}
                            onChange={(e) => setReviewVerified(e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#15803D]"
                          />
                          <span>Verified Purchase</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddDraftReview('form')}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#0F172A] text-white text-xs font-semibold hover:bg-[#1E293B]"
                      >
                        + Add Review
                      </button>
                    </div>
                  </div>

                  {form.reviews.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {form.reviews.map((rev) => (
                        <div
                          key={rev.id}
                          className="p-3 rounded-xl border border-[#E2E8F0] bg-white flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[#0F172A]">{rev.reviewerName}</span>
                              <span className="text-[#D97706] font-semibold">
                                {'★'.repeat(rev.rating)}
                              </span>
                              <span className="text-[11px] text-[#64748B]">{rev.dateLabel}</span>
                            </div>
                            <p className="text-[#475569] break-words">{rev.comment}</p>
                            {rev.images && rev.images.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {rev.images.map((img, i) => (
                                  <div
                                    key={`${rev.id}-img-${i}`}
                                    className="w-11 h-11 rounded-lg overflow-hidden border border-[#E2E8F0] bg-[#F1F5F9]"
                                  >
                                    <StoreImage
                                      src={img}
                                      alt={`Review by ${rev.reviewerName}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                reviews: prev.reviews.filter((r) => r.id !== rev.id),
                              }))
                            }
                            aria-label="Delete review"
                            className="p-1.5 rounded-lg text-[#991B1B] hover:bg-[#FEF2F2] shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#991B1B] break-words">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] px-5 py-2 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#475569]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImages}
                  className="min-h-[44px] px-6 py-2 rounded-xl bg-[#0B3B6D] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{form.id ? 'Save Product' : 'Create Product'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Manage Reviews Modal */}
      {reviewsProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
              <div>
                <h2 className="font-editorial text-xl font-semibold text-[#0F172A]">
                  Product Reviews
                </h2>
                <p className="text-xs text-[#475569] mt-0.5 line-clamp-1">
                  {reviewsProduct.name} ({reviewsDraftList.length}/20)
                </p>
              </div>
              <button
                type="button"
                disabled={savingReviews}
                onClick={() => setReviewsProduct(null)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[#475569] hover:bg-[#F1F5F9]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#475569] mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="e.g. Ananya Verma"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#475569] mb-1">
                    Star Rating *
                  </label>
                  <div className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          aria-label={`${star} star rating`}
                          className="p-0.5"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              star <= reviewRating
                                ? 'fill-[#D97706] text-[#D97706]'
                                : 'text-[#CBD5E1]'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-semibold text-[#0F172A]">{reviewRating}.0</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Review Comment *
                </label>
                <textarea
                  rows={2}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Product quality bahut acchi hai, packaging aur delivery bhi fast thi!"
                  className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                />
              </div>

              {/* Review Photos Attachment (Optional, Max 4) */}
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-[#475569]">
                  Review Photos ({reviewImages.length}/4, optional — select multiple at once or paste URL)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newReviewImageUrl}
                    onChange={(e) => setNewReviewImageUrl(e.target.value)}
                    placeholder="Paste review photo URL / Drive link..."
                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddReviewImageUrl('modal')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#0F172A] text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9] whitespace-nowrap"
                  >
                    Add URL
                  </button>
                  <label
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg border border-[#0B3B6D]/30 bg-white text-xs font-semibold text-[#0B3B6D] hover:bg-[#F0F7FF] inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      uploadingReviewImages ? 'opacity-60 pointer-events-none' : ''
                    }`}
                  >
                    {uploadingReviewImages ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>{uploadingReviewImages ? 'Uploading...' : 'Upload Photo(s)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={uploadingReviewImages}
                      onChange={(e) => void handleReviewFileUpload(e, 'modal')}
                      className="hidden"
                    />
                  </label>
                </div>

                {reviewImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {reviewImages.map((img, idx) => (
                      <div
                        key={`${img.slice(0, 20)}-${idx}`}
                        className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#E2E8F0] bg-white"
                      >
                        <StoreImage
                          src={img}
                          alt={`Draft review photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setReviewImages((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="Remove review photo"
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={reviewDateLabel}
                    onChange={(e) => setReviewDateLabel(e.target.value)}
                    placeholder="17 Nov 2026"
                    className="w-32 min-h-[38px] px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs"
                  />
                  <label className="inline-flex items-center gap-1.5 text-xs text-[#0F172A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reviewVerified}
                      onChange={(e) => setReviewVerified(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#15803D]"
                    />
                    <span>Verified Purchase</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddDraftReview('modal')}
                  className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#0F172A] text-white text-xs font-semibold hover:bg-[#1E293B]"
                >
                  + Add Review
                </button>
              </div>
            </div>

            {reviewsError && (
              <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
                {reviewsError}
              </div>
            )}

            {reviewsDraftList.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-[#CBD5E1] text-center text-xs text-[#64748B]">
                No reviews added for this product yet. Add reviews above and click Save Reviews.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {reviewsDraftList.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-3.5 rounded-xl border border-[#E2E8F0] bg-white flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[#0F172A]">{rev.reviewerName}</span>
                        <span className="text-[#D97706] font-semibold">
                          {'★'.repeat(rev.rating)}
                        </span>
                        {rev.verified !== false && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#15803D] bg-[#F0FDF4] px-1.5 py-0.5 rounded">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Verified</span>
                          </span>
                        )}
                        <span className="text-[11px] text-[#64748B]">{rev.dateLabel}</span>
                      </div>
                      <p className="text-[#334155] break-words leading-relaxed">{rev.comment}</p>
                      {rev.images && rev.images.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {rev.images.map((img, i) => (
                            <div
                              key={`${rev.id}-modal-img-${i}`}
                              className="w-12 h-12 rounded-lg overflow-hidden border border-[#E2E8F0] bg-[#F1F5F9]"
                            >
                              <StoreImage
                                src={img}
                                alt={`Review by ${rev.reviewerName}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setReviewsDraftList((prev) => prev.filter((r) => r.id !== rev.id))
                      }
                      aria-label="Delete review"
                      className="p-1.5 rounded-lg text-[#991B1B] hover:bg-[#FEF2F2] shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
              <button
                type="button"
                disabled={savingReviews}
                onClick={() => setReviewsProduct(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#475569]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingReviews}
                onClick={() => void handleSaveReviewsModal()}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              >
                {savingReviews && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Reviews</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

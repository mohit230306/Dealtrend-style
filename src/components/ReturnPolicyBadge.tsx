import { Camera, CheckCircle2, Clock, PackageCheck, Video, X } from 'lucide-react';

interface SevenDayReturnLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SevenDayReturnLogo({ size = 'md', className = '' }: SevenDayReturnLogoProps) {
  const dimensions =
    size === 'sm' ? 'w-11 h-11' : size === 'lg' ? 'w-16 h-16' : 'w-14 h-14';

  return (
    <svg
      viewBox="0 0 88 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="7 Days Easy Return Seal"
      className={`${dimensions} shrink-0 ${className}`}
    >
      {/* Subtle outer circle backdrop */}
      <circle cx="44" cy="44" r="41" fill="#F8FAFC" />
      <circle cx="44" cy="44" r="32" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />

      {/* Top return arc (Navy) */}
      <path
        d="M17.5 34.5A28.5 28.5 0 0 1 68.5 28"
        stroke="#0B3B6D"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      {/* Top arrowhead */}
      <path
        d="M69.8 19.5L70.8 29.8L60.6 28.4"
        stroke="#0B3B6D"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bottom return arc (Terracotta Accent) */}
      <path
        d="M70.5 53.5A28.5 28.5 0 0 1 19.5 60"
        stroke="#C24D06"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      {/* Bottom arrowhead */}
      <path
        d="M18.2 68.5L17.2 58.2L27.4 59.6"
        stroke="#C24D06"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Center Numeral: 7 */}
      <text
        x="44"
        y="43"
        textAnchor="middle"
        fill="#0B3B6D"
        fontSize="26"
        fontWeight="800"
        fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
      >
        7
      </text>

      {/* Center Label: DAYS */}
      <text
        x="44"
        y="55"
        textAnchor="middle"
        fill="#C24D06"
        fontSize="9.5"
        fontWeight="800"
        letterSpacing="1.1"
        fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
      >
        DAYS
      </text>

      {/* Sub Label: RETURN */}
      <text
        x="44"
        y="65"
        textAnchor="middle"
        fill="#334155"
        fontSize="7"
        fontWeight="700"
        letterSpacing="0.9"
        fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
      >
        RETURN
      </text>
    </svg>
  );
}

export const RETURN_GUIDELINES = [
  {
    id: 'unboxing-video',
    icon: Video,
    title: 'Uncut Parcel Opening Video (Mandatory)',
    description:
      'Record a continuous, unedited 360° opening video before breaking the seal—clearly showing the shipping label and the product inside. Required for damaged, wrong, or missing item claims.',
  },
  {
    id: 'proper-photos',
    icon: Camera,
    title: 'Clear Product & Shipping Label Photos',
    description:
      'Capture well-lit photos of the outer parcel shipping label, original tag, and the exact defect, damage, or wrong item received.',
  },
  {
    id: 'original-packaging',
    icon: PackageCheck,
    title: 'Original Tags & Unused Condition',
    description:
      'Keep the product unused, unwashed, and packed inside its original box/polybag with all tags and accessories intact for reverse pickup.',
  },
  {
    id: 'seven-day-window',
    icon: Clock,
    title: 'Submit Within 7 Days of Delivery',
    description:
      'Raise a Return or Replacement request from the Track Order page within 7 days of delivery. Approved refunds are transferred directly to your UPI ID after pickup.',
  },
];

interface ReturnGuidelinesSectionProps {
  compact?: boolean;
  className?: string;
}

export function ReturnGuidelinesSection({
  compact = false,
  className = '',
}: ReturnGuidelinesSectionProps) {
  return (
    <div
      className={`bg-white border border-[#E2E8F0] rounded-2xl ${
        compact ? 'p-4 sm:p-5 space-y-4' : 'p-5 sm:p-6 space-y-5'
      } ${className}`}
    >
      <div className="flex items-center gap-3.5">
        <SevenDayReturnLogo size={compact ? 'sm' : 'md'} />
        <div>
          <h3
            className={`font-editorial font-semibold text-[#0F172A] leading-snug ${
              compact ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'
            }`}
          >
            7-Day Easy Return &amp; Replacement Guidelines
          </h3>
          <p className="text-xs text-[#475569] mt-0.5">
            Mandatory unboxing video &amp; photo proof policy for fast, hassle-free verification.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1 border-t border-[#F1F5F9]">
        {RETURN_GUIDELINES.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 space-y-1.5"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    idx < 2 ? 'text-[#C24D06]' : 'text-[#0B3B6D]'
                  }`}
                />
                <span>{item.title}</span>
              </div>
              <p className="text-xs text-[#475569] leading-relaxed">{item.description}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 text-xs text-[#0B3B6D] bg-[#F0F7FF] border border-[#0B3B6D]/20 rounded-xl px-3.5 py-2.5">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>Tip:</strong> Please record the parcel opening video as soon as you receive your order so your return or exchange is approved without delay.
        </span>
      </div>
    </div>
  );
}

interface ReturnGuidelinesModalProps {
  open: boolean;
  onClose: () => void;
}

export function ReturnGuidelinesModal({ open, onClose }: ReturnGuidelinesModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="7-Day Return Policy and Guidelines"
    >
      <div
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-[#E2E8F0] p-5 sm:p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <SevenDayReturnLogo size="md" />
            <div>
              <h2 className="font-editorial text-xl font-semibold text-[#0F172A]">
                7-Day Return &amp; Replacement Policy
              </h2>
              <p className="text-xs text-[#475569] mt-0.5">
                Follow these verification guidelines when receiving your parcel
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close return guidelines"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[#475569] hover:bg-[#F1F5F9] shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {RETURN_GUIDELINES.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-1.5"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      idx < 2 ? 'text-[#C24D06]' : 'text-[#0B3B6D]'
                    }`}
                  />
                  <span>{item.title}</span>
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">{item.description}</p>
              </div>
            );
          })}
        </div>

        <div className="p-3.5 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] text-xs text-[#9A3412] leading-relaxed">
          <strong>Important:</strong> Return or replacement requests without a continuous parcel opening video (showing the sealed package &amp; shipping label) and clear product photos may not be eligible for approval.
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold hover:bg-[#082D54]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
  label?: string;
}

export function PWAInstallButton({
  variant = 'compact',
  label = 'Install Admin App',
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B3B6D]/10 text-[#0B3B6D] text-xs font-semibold">
          Installed as Standalone App
        </span>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          variant === 'card'
            ? 'min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#082D54] transition-colors'
            : 'min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#082D54] transition-colors'
        }
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className={
            variant === 'card'
              ? 'min-h-[44px] px-4 py-2.5 rounded-xl border border-[#0B3B6D] text-[#0B3B6D] text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#F8FAFC]'
              : 'min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#0F172A] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#F8FAFC]'
          }
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>Install on iPhone</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-editorial text-lg font-semibold text-[#0F172A]">
                  Install Admin on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Close"
                  className="p-1.5 rounded-lg text-[#64748B] hover:bg-[#F1F5F9]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-sm text-[#475569] space-y-2 list-decimal pl-4">
                <li>
                  Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Confirm <strong>Add</strong> — only your Admin Panel opens directly.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-full min-h-[42px] rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

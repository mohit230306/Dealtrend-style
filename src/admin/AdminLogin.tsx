import { useState } from 'react';
import { AlertCircle, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { auth, AUTHORIZED_ADMIN_EMAIL, googleProvider } from '../lib/firebase';

interface AdminLoginProps {
  unauthorizedEmail?: string | null;
}

export function AdminLogin({ unauthorizedEmail }: AdminLoginProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('popup-closed-by-user')
          ? 'Sign-in window was closed. Please try again.'
          : err instanceof Error
          ? err.message
          : 'Could not complete Google Sign-In.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    setError('');
    await signOut(auth);
    await handleGoogleSignIn();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="w-11 h-11 rounded-xl bg-[#0B3B6D] text-white flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <PWAInstallButton label="Install App" />
          </div>
          <h1 className="font-editorial text-2xl font-semibold text-[#0F172A]">
            DealTrend Admin Console
          </h1>
          <p className="text-sm text-[#475569]">
            Sign in with your authorized store owner Google account to manage products, reseller profits, orders, and Google Sheets sync.
          </p>
        </div>

        {unauthorizedEmail && (
          <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B] space-y-2">
            <div className="flex items-start gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Signed in as <strong className="font-mono">{unauthorizedEmail}</strong>, which is not authorized for this store admin panel. Please sign in with{' '}
                <strong className="font-mono">{AUTHORIZED_ADMIN_EMAIL}</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleSwitchAccount()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold underline"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Switch Google Account</span>
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#991B1B]">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleGoogleSignIn()}
          className="w-full min-h-[50px] px-5 py-3 rounded-xl bg-[#0B3B6D] text-white text-sm font-semibold inline-flex items-center justify-center gap-3 hover:bg-[#082D54] active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Signing in with Google...</span>
            </>
          ) : (
            <span>Sign in with Google</span>
          )}
        </button>

        <div className="pt-4 border-t border-[#F1F5F9] text-xs text-[#475569] space-y-1.5">
          <p className="font-medium text-[#0F172A]">Cloud Database &amp; Role Protection</p>
          <p className="leading-relaxed">
            Protected by Firebase Authentication and Firestore Security Rules. Only your verified owner account (<span className="font-mono">{AUTHORIZED_ADMIN_EMAIL}</span>) can read or modify products, source prices, orders, and Google Apps Script settings.
          </p>
        </div>
      </div>
      <OfflineIndicator />
    </div>
  );
}

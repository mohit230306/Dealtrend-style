/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { CustomerStore } from './components/CustomerStore';

const AdminApp = lazy(() =>
  import('./admin/AdminApp').then((mod) => ({ default: mod.AdminApp }))
);

export default function App() {
  const isAdminRoute =
    typeof window !== 'undefined' &&
    window.location.pathname.replace(/\/+$/, '').startsWith('/admin');

  useEffect(() => {
    if (isAdminRoute) {
      let reloading = false;
      const handleControllerChange = () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      };

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      }

      void import('virtual:pwa-register').then(({ registerSW }) => {
        registerSW({
          immediate: true,
          onRegisteredSW(_swUrl, r) {
            if (r) void r.update();
          },
        });
      });

      return () => {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        }
      };
    }

    // Keep customer storefront strictly browser-only (no app install prompt or stale SW cache for customers)
    document.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove());
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          if (!reg.scope.includes('/admin')) {
            void reg.unregister();
          }
        }
      });
    }
  }, [isAdminRoute]);

  if (isAdminRoute) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#0B3B6D]" />
          </div>
        }
      >
        <AdminApp />
      </Suspense>
    );
  }

  return <CustomerStore />;
}

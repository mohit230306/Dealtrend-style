import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-[#C24D06] px-3 py-1.5 text-xs font-medium text-white shadow-lg">
      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
      <span>Offline Mode — Reconnect to sync Firestore &amp; Google Sheets.</span>
    </div>
  );
}

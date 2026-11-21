import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Link2,
  Loader2,
  Save,
  Shield,
  Smartphone,
  Upload,
  Wifi,
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { StoreLogo } from '../components/StoreLogo';
import { auth } from '../lib/firebase';
import { saveAdminSettingsToFirestore } from '../lib/firestoreAdmin';
import { compressImageFileToDataUrl } from '../lib/imageUpload';
import type { AdminStoreSettings } from '../types';

interface AdminSettingsProps {
  settings: AdminStoreSettings;
  adminEmail: string;
  onRefresh: () => Promise<void>;
}

const APPS_SCRIPT_TEMPLATE = `// Google Apps Script (Code.gs) for DealTrend Reseller Google Sheet
// Deploy as Web App -> Execute as: Me | Who has access: Anyone
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders')
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet('Orders');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Order ID', 'Date & Time', 'Customer Name', 'Mobile Number', 'Email',
      'Full Delivery Address', 'City', 'State', 'Pincode', 'Landmark',
      'Product Names', 'Internal Product Code', 'Quantity', 'Customer Selling Price',
      'Customer Order Amount', 'Source Order Amount', 'Expected Profit',
      'Payment Method', 'Payment Status', 'COD Amount', 'Order Status'
    ]);
  }

  var data = JSON.parse(e.postData.contents || '{}');

  if (data.action === 'ping') {
    return ContentService.createTextOutput(JSON.stringify({
      success: true, message: 'DealTrend Apps Script Connected'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (data.action === 'createOrder') {
    sheet.appendRow([
      data.orderId, data.timestamp, data.customerName, data.mobileNumber, data.email || '',
      data.fullAddress, data.city, data.state, data.pincode, data.landmark || '',
      data.productNames, data.productCodes, data.quantity, data.customerSellingPrice,
      data.customerOrderAmount, data.sourceOrderAmount, data.expectedProfit,
      data.paymentMethod, data.paymentStatus, data.codAmount, data.orderStatus
    ]);
    return ContentService.createTextOutput(JSON.stringify({
      success: true, orderId: data.orderId
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (data.action === 'updateOrderStatus') {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.orderId)) {
        sheet.getRange(i + 1, 19).setValue(data.paymentStatus);
        sheet.getRange(i + 1, 21).setValue(data.orderStatus);
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

export function AdminSettings({
  settings,
  adminEmail,
  onRefresh,
}: AdminSettingsProps) {
  const [form, setForm] = useState<AdminStoreSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  const [showScriptGuide, setShowScriptGuide] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedAdminUrl, setCopiedAdminUrl] = useState(false);

  const adminAppUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/admin` : '/admin';

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFileToDataUrl(file, 480, 0.85);
      setForm((prev) => ({ ...prev, logoUrl: compressed }));
    } catch {
      setSaveError('Could not process selected logo image.');
    }
  };

  const handleHeroBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFileToDataUrl(file, 1080, 0.8);
      setForm((prev) => ({ ...prev, heroImageUrl: compressed }));
    } catch {
      setSaveError('Could not process selected banner image.');
    }
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveMessage('');
    setSaveError('');

    try {
      const saved = await saveAdminSettingsToFirestore(form);
      setForm(saved);
      setSaveMessage('Configuration saved permanently to Firebase Cloud Firestore.');
      await onRefresh();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Network error while saving configuration.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/test-apps-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ url: form.appsScriptUrl, storeName: form.storeName }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        latencyMs?: number;
        lastConnectionStatus?: 'Connected' | 'Failed' | 'Not Configured';
        lastConnectionTestAt?: string;
        error?: string;
      };

      if (!res.ok && data.error) {
        setTestResult({ ok: false, message: data.error });
      } else {
        const nextStatus = data.lastConnectionStatus || (data.ok ? 'Connected' : 'Failed');
        const nextMessage = data.message || (data.ok ? 'Connected' : 'Connection failed');
        const nextTestedAt = data.lastConnectionTestAt || new Date().toISOString();

        setTestResult({
          ok: Boolean(data.ok),
          message: nextMessage,
          latencyMs: data.latencyMs,
        });

        const updatedForm: AdminStoreSettings = {
          ...form,
          lastConnectionStatus: nextStatus,
          lastConnectionMessage: nextMessage,
          lastConnectionTestAt: nextTestedAt,
        };
        setForm(updatedForm);
        await saveAdminSettingsToFirestore(updatedForm);
        await onRefresh();
      }
    } catch {
      setTestResult({ ok: false, message: 'Network error testing Apps Script endpoint.' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const connectionStatus =
    testResult?.ok === true
      ? 'Connected'
      : testResult?.ok === false
      ? 'Failed'
      : form.lastConnectionStatus || (form.appsScriptUrl ? 'Not Tested' : 'Not Configured');

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
          Store &amp; Google Sheets Settings
        </h1>
        <p className="text-sm text-[#475569] mt-1">
          Configure your Google Apps Script Web App URL, store branding, payment methods, and admin security.
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* 1. GOOGLE APPS SCRIPT + GOOGLE SHEETS INTEGRATION */}
        <section
          id="apps-script-config"
          className="bg-white border-2 border-[#0B3B6D]/30 rounded-2xl p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
            <div>
              <h2 className="font-editorial text-lg font-semibold text-[#0F172A] flex items-center gap-2">
                <Link2 className="w-5 h-5 text-[#0B3B6D]" />
                <span>Google Apps Script Integration</span>
              </h2>
              <p className="text-xs text-[#475569] mt-1">
                Stored strictly on the server—never exposed to customers. Orders are automatically pushed to your Google Sheet as your permanent order database.
              </p>
            </div>

            <div
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 ${
                connectionStatus === 'Connected'
                  ? 'bg-[#0B3B6D]/10 text-[#0B3B6D]'
                  : connectionStatus === 'Failed'
                  ? 'bg-[#FEF2F2] text-[#991B1B]'
                  : 'bg-[#F1F5F9] text-[#475569]'
              }`}
            >
              {connectionStatus === 'Connected' ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : connectionStatus === 'Failed' ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : (
                <Wifi className="w-3.5 h-3.5" />
              )}
              <span>Status: {connectionStatus}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="apps-script-url-input"
              className="block text-xs font-semibold text-[#0F172A]"
            >
              Google Apps Script Web App URL:{' '}
              <span className="text-[#C24D06]">[ PASTE MY URL HERE ]</span>
            </label>
            <input
              id="apps-script-url-input"
              type="url"
              value={form.appsScriptUrl}
              onChange={(e) => setForm((p) => ({ ...p, appsScriptUrl: e.target.value }))}
              placeholder="https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
              className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
            />
            <p className="text-[11px] text-[#475569] leading-relaxed">
              Getting <strong>HTTP 403</strong>? In Google Apps Script click{' '}
              <strong>Deploy → Manage deployments → Edit (pencil)</strong>, set{' '}
              <strong>Execute as: Me</strong> and <strong>Who has access: Anyone</strong>, click{' '}
              <strong>Deploy</strong>, then paste the <code className="font-mono">/exec</code> URL and test.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#082D54] disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save URL</span>
            </button>

            <button
              type="button"
              disabled={testingConnection || !form.appsScriptUrl.trim()}
              onClick={() => void handleTestConnection()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[#0F172A] bg-white text-[#0F172A] text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#F1F5F9] disabled:opacity-50"
            >
              {testingConnection ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4" />
              )}
              <span>Test Connection</span>
            </button>
          </div>

          {(testResult || form.lastConnectionMessage) && (
            <div
              className={`p-3.5 rounded-xl text-xs border ${
                (testResult ? testResult.ok : form.lastConnectionStatus === 'Connected')
                  ? 'bg-[#0B3B6D]/5 border-[#0B3B6D]/20 text-[#0B3B6D]'
                  : (testResult && !testResult.ok) || form.lastConnectionStatus === 'Failed'
                  ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                  : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569]'
              }`}
            >
              {testResult ? testResult.message : form.lastConnectionMessage}
            </div>
          )}

          <div className="pt-2 border-t border-[#F1F5F9]">
            <button
              type="button"
              onClick={() => setShowScriptGuide((v) => !v)}
              className="text-xs font-semibold text-[#0B3B6D] hover:underline inline-flex items-center gap-1.5"
            >
              {showScriptGuide ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              <span>
                Google Sheet Columns &amp; Ready-to-Use Apps Script Template (includes Customer Amt, Source Amt &amp; Profit)
              </span>
            </button>

            {showScriptGuide && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-[#475569]">
                    Paste this into your Google Apps Script <code className="font-mono">Code.gs</code> to log all 21 reseller order columns automatically:
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyScript()}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-medium text-[#0F172A] inline-flex items-center gap-1.5 shrink-0"
                  >
                    {copiedScript ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#15803D]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Script</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-[#0F172A] text-[#F8FAFC] text-[11px] font-mono overflow-x-auto leading-relaxed">
                  {APPS_SCRIPT_TEMPLATE}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* 2. BRANDING & LOGO */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-5">
          <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
            Branding &amp; Store Logo
          </h2>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-4">
            <div>
              <span className="text-[11px] text-[#64748B] block mb-1.5">Header Preview</span>
              <StoreLogo storeName={form.storeName || 'Store'} logoUrl={form.logoUrl} />
            </div>
            {form.logoUrl && (
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, logoUrl: '' }))}
                className="text-xs font-medium text-[#991B1B] hover:underline"
              >
                Use Default Emblem
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Store Name
              </label>
              <input
                type="text"
                required
                value={form.storeName}
                onChange={(e) => setForm((p) => ({ ...p, storeName: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Currency Symbol
              </label>
              <input
                type="text"
                maxLength={4}
                value={form.currencySymbol}
                onChange={(e) => setForm((p) => ({ ...p, currencySymbol: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="store-description-input"
                  className="block text-xs font-medium text-[#475569]"
                >
                  Store Description (Shown on Customer Home Page)
                </label>
                <span className="text-[11px] text-[#64748B] tabular-nums">
                  {(form.storeDescription || '').length}/600
                </span>
              </div>
              <textarea
                id="store-description-input"
                rows={3}
                maxLength={600}
                value={form.storeDescription || ''}
                onChange={(e) => setForm((p) => ({ ...p, storeDescription: e.target.value }))}
                placeholder="Write a short welcome description about your store, deals, and delivery promise shown on the Home page..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Upload Store Logo or Paste Logo Image URL (Google Drive or Direct URL)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={form.logoUrl}
                  onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="Paste Google Drive image link or direct logo URL..."
                  className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                />
                <label className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9] inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap">
                  <Upload className="w-4 h-4" />
                  <span>Upload Logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-xs font-medium text-[#475569]">
                  Home Page Banner Photo (Optional — leave blank for clean text hero)
                </label>
                {form.heroImageUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, heroImageUrl: '' }))}
                    className="text-xs font-medium text-[#991B1B] hover:underline"
                  >
                    Remove Banner Photo
                  </button>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={form.heroImageUrl}
                  onChange={(e) => setForm((p) => ({ ...p, heroImageUrl: e.target.value }))}
                  placeholder="Optional: Paste banner image URL or leave empty..."
                  className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
                />
                <label className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9] inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap">
                  <Upload className="w-4 h-4" />
                  <span>Upload Banner</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleHeroBannerUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Top Announcement Bar Text
              </label>
              <input
                type="text"
                value={form.announcementText}
                onChange={(e) => setForm((p) => ({ ...p, announcementText: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
              />
            </div>
          </div>
        </section>

        {/* 3. PAYMENT & SHIPPING SETTINGS */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-5">
          <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
            Payment &amp; Shipping Settings
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] cursor-pointer">
              <input
                type="checkbox"
                checked={form.codEnabled}
                onChange={(e) => setForm((p) => ({ ...p, codEnabled: e.target.checked }))}
                className="w-4 h-4 accent-[#0B3B6D]"
              />
              <span className="text-sm font-medium text-[#0F172A]">
                Enable Cash on Delivery (COD)
              </span>
            </label>

            <label className="flex items-center gap-3 p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] cursor-pointer">
              <input
                type="checkbox"
                checked={form.onlinePaymentEnabled}
                onChange={(e) =>
                  setForm((p) => ({ ...p, onlinePaymentEnabled: e.target.checked }))
                }
                className="w-4 h-4 accent-[#0B3B6D]"
              />
              <span className="text-sm font-medium text-[#0F172A]">
                Enable Online Payment / UPI Option
              </span>
            </label>

            <div className="sm:col-span-2 p-4 rounded-xl border-2 border-[#0B3B6D]/25 bg-[#F0F7FF]/60 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label
                    htmlFor="admin-upi-id-input"
                    className="block text-xs font-semibold text-[#0F172A]"
                  >
                    Your UPI ID (Receive Online Customer Payments)
                  </label>
                  <p className="text-[11px] text-[#475569] mt-0.5">
                    Customers choosing Online Payment will see this UPI ID with a Copy button and direct UPI App Pay link.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#082D54] disabled:opacity-60 self-start sm:self-auto shrink-0"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save UPI ID</span>
                </button>
              </div>
              <input
                id="admin-upi-id-input"
                type="text"
                value={form.upiId}
                onChange={(e) => setForm((p) => ({ ...p, upiId: e.target.value }))}
                placeholder="e.g. yourname@okaxis or 9876543210@ybl"
                className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-[#0B3B6D]/30 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B3B6D]"
              />
              {form.onlinePaymentEnabled && !form.upiId.trim() && (
                <p className="text-[11px] font-medium text-[#C24D06]">
                  Online Payment is enabled — enter your UPI ID above and click Save UPI ID so customers can pay you directly.
                </p>
              )}
              {!form.onlinePaymentEnabled && form.upiId.trim() && (
                <p className="text-[11px] font-medium text-[#C24D06]">
                  Note: Tick &quot;Enable Online Payment / UPI Option&quot; above to show UPI payment on checkout.
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Online Payment Option Label
              </label>
              <input
                type="text"
                value={form.paymentGatewayName}
                onChange={(e) => setForm((p) => ({ ...p, paymentGatewayName: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Free Shipping Threshold ({form.currencySymbol})
              </label>
              <input
                type="number"
                min="0"
                value={form.freeShippingThreshold}
                onChange={(e) =>
                  setForm((p) => ({ ...p, freeShippingThreshold: Number(e.target.value) || 0 }))
                }
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Standard Shipping Fee ({form.currencySymbol})
              </label>
              <input
                type="number"
                min="0"
                value={form.shippingFee}
                onChange={(e) =>
                  setForm((p) => ({ ...p, shippingFee: Number(e.target.value) || 0 }))
                }
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm tabular-nums"
              />
            </div>
          </div>
        </section>

        {/* 4. GOOGLE DRIVE & SUPPORT DETAILS */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-4">
          <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
            Google Drive &amp; Customer Support
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Google Drive Asset Folder Link (for admin reference)
              </label>
              <input
                type="url"
                value={form.googleDriveFolderUrl}
                onChange={(e) => setForm((p) => ({ ...p, googleDriveFolderUrl: e.target.value }))}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Support Phone
              </label>
              <input
                type="text"
                value={form.supportPhone}
                onChange={(e) => setForm((p) => ({ ...p, supportPhone: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Support Email
              </label>
              <input
                type="email"
                value={form.supportEmail}
                onChange={(e) => setForm((p) => ({ ...p, supportEmail: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Store / Dispatch Address
              </label>
              <input
                type="text"
                value={form.supportAddress}
                onChange={(e) => setForm((p) => ({ ...p, supportAddress: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm"
              />
            </div>
          </div>

          {saveError && (
            <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#991B1B]">
              {saveError}
            </div>
          )}

          {saveMessage && (
            <div className="p-3.5 rounded-xl bg-[#0B3B6D]/10 border border-[#0B3B6D]/20 text-xs font-medium text-[#0B3B6D]">
              {saveMessage}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#0B3B6D] text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#082D54] disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save All Store Settings</span>
            </button>
          </div>
        </section>
      </form>

      {/* 5. CLOUD DATABASE & ADMIN SECURITY */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-3">
        <h2 className="font-editorial text-lg font-semibold text-[#0F172A] flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#0B3B6D]" />
          <span>Cloud Database &amp; Admin Security</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[#64748B] block">Authorized Store Owner</span>
            <span className="font-mono font-semibold text-[#0F172A] mt-0.5 block">
              {adminEmail}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[#64748B] block">Cloud Persistence</span>
            <span className="font-semibold text-[#15803D] mt-0.5 block">
              Firebase Firestore Connected (Persistent Across Restarts)
            </span>
          </div>
        </div>
      </section>

      {/* 6. OWNER-ONLY ADMIN MOBILE APP & APK */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-editorial text-lg font-semibold text-[#0F172A] flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-[#0B3B6D]" />
              <span>Private Admin App &amp; APK (Owner Only)</span>
            </h2>
            <p className="text-xs text-[#475569] mt-1">
              Configured exclusively for <code className="font-mono">/admin</code> — customers on the storefront will never see any app install prompt.
            </p>
          </div>
          <PWAInstallButton variant="card" label="Install Admin App Now" />
        </div>

        <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[#64748B] block">Your Private Admin App URL</span>
              <code className="font-mono text-[11px] text-[#0F172A] break-all">{adminAppUrl}</code>
            </div>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(adminAppUrl).then(() => {
                  setCopiedAdminUrl(true);
                  window.setTimeout(() => setCopiedAdminUrl(false), 2000);
                });
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0F172A] inline-flex items-center gap-1.5 shrink-0"
            >
              {copiedAdminUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#15803D]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Admin URL</span>
                </>
              )}
            </button>
          </div>

          <ol className="text-[#475569] space-y-1 list-decimal pl-4 pt-1 border-t border-[#E2E8F0]">
            <li>
              <strong>Instant Phone Install (No APK file needed):</strong> Open your published Admin URL in Chrome on Android and tap <strong>Install Admin App Now</strong> (or Chrome menu <strong>⋮ → Add to Home screen / Install app</strong>).
            </li>
            <li>
              <strong>To Download an `.apk` File:</strong> Deploy/Publish the app, copy the published <code className="font-mono">/admin</code> URL above, paste it into <code className="font-mono">pwabuilder.com</code>, and package Android APK — it opens directly into your private Admin Panel.
            </li>
          </ol>
        </div>
      </section>
    </div>
  );
}

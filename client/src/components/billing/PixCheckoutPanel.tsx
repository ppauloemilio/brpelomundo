import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

type Props = {
  orderId: string;
  amountLabel: string;
  pixCopyPaste: string;
  qrDataUrl: string;
  onPaid: () => void;
  onError: (message: string) => void;
};

export function PixCheckoutPanel({
  orderId,
  amountLabel,
  pixCopyPaste,
  qrDataUrl,
  onPaid,
  onError,
}: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (expired) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await api<{ status: string }>(`/billing/mercadopago/status/${orderId}`);
        if (cancelled) return;
        if (res.status === 'paid') onPaid();
        if (res.status === 'expired') {
          setExpired(true);
          onError(t('billing.pixExpired'));
        }
      } catch {
        /* keep polling */
      }
    };

    const id = window.setInterval(tick, 5000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [orderId, onPaid, onError, t, expired]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(pixCopyPaste);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const res = await api<{ status: string }>(`/billing/mercadopago/status/${orderId}`);
      if (res.status === 'paid') onPaid();
      else if (res.status === 'expired') {
        setExpired(true);
        onError(t('billing.pixExpired'));
      } else onError(t('billing.pixWaiting'));
    } catch (err) {
      onError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-900">{t('billing.pixTitle')}</h4>
        <span
          className={
            expired
              ? 'rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700'
              : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
          }
        >
          {expired ? t('billing.statusExpired') : t('billing.pixWaitingBadge')}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900">{amountLabel}</p>
      <p className="text-xs text-slate-500">
        {expired ? t('billing.pixExpired') : t('billing.pixHint')}
      </p>

      {!expired && (
        <>
          <div className="flex justify-center rounded-lg bg-white p-4">
            <img src={qrDataUrl} alt="QR Code PIX" className="h-56 w-56" />
          </div>

          <div className="rounded-lg bg-white p-3">
            <p className="mb-1 text-xs font-medium text-slate-500">{t('billing.pixCopyLabel')}</p>
            <p className="break-all text-xs text-slate-700">{pixCopyPaste}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="flex-1" onClick={() => void handleCopy()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t('billing.pixCopied') : t('billing.pixCopy')}
            </Button>
            <Button type="button" className="flex-1" disabled={checking} onClick={() => void handleCheckNow()}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('billing.pixCheck')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

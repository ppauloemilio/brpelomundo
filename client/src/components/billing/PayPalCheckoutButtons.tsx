import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type PaypalButtonsInstance = {
  render: (el: HTMLElement) => Promise<void>;
  close?: () => void;
};

type PaypalNamespace = {
  Buttons: (config: {
    style?: Record<string, string>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onError?: (err: unknown) => void;
    onCancel?: () => void;
  }) => PaypalButtonsInstance;
};

declare global {
  interface Window {
    paypal?: PaypalNamespace;
  }
}

type Props = {
  clientId: string;
  currency: string;
  disabled?: boolean;
  onCreateOrder: () => Promise<string>;
  onApprove: (paypalOrderId: string) => Promise<void>;
  onError: (message: string) => void;
  onCancel?: () => void;
};

const SCRIPT_ID = 'paypal-sdk-brpelomundo';

function loadPaypalScript(clientId: string, currency: string): Promise<PaypalNamespace> {
  if (window.paypal) return Promise.resolve(window.paypal);

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => {
        if (window.paypal) resolve(window.paypal);
        else reject(new Error('PayPal SDK failed to load'));
      });
      existing.addEventListener('error', () => reject(new Error('PayPal SDK failed to load')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture`;
    script.async = true;
    script.onload = () => {
      if (window.paypal) resolve(window.paypal);
      else reject(new Error('PayPal SDK failed to load'));
    };
    script.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.body.appendChild(script);
  });
}

export function PayPalCheckoutButtons({
  clientId,
  currency,
  disabled,
  onCreateOrder,
  onApprove,
  onError,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loadingSdk, setLoadingSdk] = useState(true);
  const callbacksRef = useRef({ onCreateOrder, onApprove, onError, onCancel, disabled });
  callbacksRef.current = { onCreateOrder, onApprove, onError, onCancel, disabled };

  useEffect(() => {
    let cancelled = false;
    let buttons: PaypalButtonsInstance | null = null;

    (async () => {
      try {
        setLoadingSdk(true);
        const paypal = await loadPaypalScript(clientId, currency);
        if (cancelled || !hostRef.current) return;

        hostRef.current.innerHTML = '';
        buttons = paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'pay',
          },
          createOrder: async () => {
            if (callbacksRef.current.disabled) {
              throw new Error(t('billing.paypalIncomplete'));
            }
            return callbacksRef.current.onCreateOrder();
          },
          onApprove: async (data) => {
            await callbacksRef.current.onApprove(data.orderID);
          },
          onError: (err) => {
            if (String(err).includes('FREE_CHECKOUT')) return;
            callbacksRef.current.onError(t('billing.paypalError'));
          },
          onCancel: () => {
            callbacksRef.current.onCancel?.();
          },
        });

        await buttons.render(hostRef.current);
        if (!cancelled) {
          setReady(true);
          setLoadingSdk(false);
        }
      } catch {
        if (!cancelled) {
          setLoadingSdk(false);
          onError(t('billing.paypalSdkError'));
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        buttons?.close?.();
      } catch {
        /* ignore */
      }
    };
  }, [clientId, currency, onError, t]);

  return (
    <div className="space-y-2">
      {loadingSdk && !ready && (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      )}
      <div
        ref={hostRef}
        className={disabled ? 'pointer-events-none opacity-50' : undefined}
        aria-disabled={disabled || undefined}
      />
    </div>
  );
}

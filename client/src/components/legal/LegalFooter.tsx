import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export const legalLinks = [
  { to: '/sobre', labelKey: 'legal.navAbout' },
  { to: '/privacidade', labelKey: 'legal.navPrivacy' },
  { to: '/termos', labelKey: 'legal.navTerms' },
  { to: '/seguranca', labelKey: 'legal.navSafety' },
] as const;

export function LegalFooter({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <nav className={cn('flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-500', className)}>
      {legalLinks.map((link) => (
        <Link key={link.to} to={link.to} className="hover:text-brand-700 hover:underline">
          {t(link.labelKey)}
        </Link>
      ))}
    </nav>
  );
}

export function TermsConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
      <input
        id="terms-consent"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-brand-700"
      />
      <p className="text-sm leading-relaxed text-slate-600">
        <label htmlFor="terms-consent" className="cursor-pointer">
          {t('auth.termsBefore')}
        </label>{' '}
        <Link to="/termos" className="font-medium text-brand-700 hover:underline">
          {t('legal.navTerms')}
        </Link>{' '}
        {t('auth.termsMid')}{' '}
        <Link to="/privacidade" className="font-medium text-brand-700 hover:underline">
          {t('legal.navPrivacy')}
        </Link>
        {t('auth.termsAfter')}
      </p>
    </div>
  );
}

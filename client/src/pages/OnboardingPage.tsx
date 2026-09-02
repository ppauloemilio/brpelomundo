import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LocationCascade, resolveLocationForSave } from '@/components/profile/LocationCascade';
import { INTEREST_OPTIONS } from '@/lib/profileConstants';
import { cn } from '@/lib/utils';

type GeoItem = { code: string; name: string };

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState('US');
  const [stateIso, setStateIso] = useState('');
  const [stateCustom, setStateCustom] = useState('');
  const [citySelect, setCitySelect] = useState('');
  const [cityCustom, setCityCustom] = useState('');
  const [originCity, setOriginCity] = useState('');
  const [primarySkill, setPrimarySkill] = useState('');
  const [interests, setInterests] = useState<string[]>([]);

  const { data: states = [] } = useQuery({
    queryKey: ['geo-states', country],
    queryFn: () => api<GeoItem[]>(`/geo/states?country=${country}`),
    enabled: !!country,
  });

  const toggleInterest = (key: string) => {
    setInterests((prev) =>
      prev.includes(key) ? prev.filter((i) => i !== key) : [...prev, key]
    );
  };

  const handleFinish = async () => {
    setError('');
    const { state, city } = resolveLocationForSave(stateIso, stateCustom, states, citySelect, cityCustom);
    if (!country || !city.trim()) {
      setError(t('onboarding.errorLocation'));
      setStep(1);
      return;
    }
    if (interests.length === 0) {
      setError(t('onboarding.errorInterests'));
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      await api('/auth/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          current_country: country,
          current_state: state,
          current_city: city,
          origin_city: originCity || undefined,
          primary_skill: primarySkill || undefined,
          interests,
        }),
      });
      await refreshUser();
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-10">
      <div>
        <p className="text-sm font-medium text-brand-700">
          {t('onboarding.step', { current: step, total: 2 })}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {step === 1 ? t('onboarding.titleLocation') : t('onboarding.titleInterests')}
        </h1>
        <p className="mt-1 text-slate-500">
          {step === 1
            ? t('onboarding.subtitleLocation')
            : t('onboarding.subtitleInterests')}
        </p>
      </div>

      {step === 1 && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <LocationCascade
            country={country}
            stateIso={stateIso}
            stateCustom={stateCustom}
            citySelect={citySelect}
            cityCustom={cityCustom}
            onChange={(patch) => {
              if (patch.country !== undefined) setCountry(patch.country);
              if (patch.stateIso !== undefined) setStateIso(patch.stateIso);
              if (patch.stateCustom !== undefined) setStateCustom(patch.stateCustom);
              if (patch.citySelect !== undefined) setCitySelect(patch.citySelect);
              if (patch.cityCustom !== undefined) setCityCustom(patch.cityCustom);
            }}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('onboarding.originCity')}</label>
            <Input
              value={originCity}
              onChange={(e) => setOriginCity(e.target.value)}
              placeholder={t('profile.originCity')}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('onboarding.primarySkill')}</label>
            <Input
              value={primarySkill}
              onChange={(e) => setPrimarySkill(e.target.value)}
              placeholder={t('profile.primarySkill')}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-800">{t('onboarding.whatLookingFor')}</p>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((key) => {
              const active = interests.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleInterest(key)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50'
                  )}
                >
                  {t(`onboarding.interest.${key}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>
      )}

      <div className="flex gap-3">
        {step === 2 && (
          <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
            {t('common.back')}
          </Button>
        )}
        {step === 1 ? (
          <Button type="button" className="flex-1" onClick={() => setStep(2)}>
            {t('onboarding.continue')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" className="flex-1" disabled={loading} onClick={handleFinish}>
            {loading ? t('common.loading') : t('onboarding.finish')}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

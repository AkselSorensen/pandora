'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, Locale, TranslationKey, translations } from '@/lib/i18n';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const saved = window.localStorage.getItem('pandora.locale');
  if (saved === 'fr' || saved === 'en') return saved;
  return window.navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('pandora.locale', nextLocale);
      document.documentElement.lang = nextLocale;
    }
  };

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    toggleLocale: () => setLocale(locale === 'fr' ? 'en' : 'fr'),
    t: (key) => translations[locale][key] || translations.en[key] || key,
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export function LanguageToggle() {
  const { locale, toggleLocale, t } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleLocale}
      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-sm border border-[var(--border-primary)] bg-black/30 px-2 py-0.5 text-[var(--text-secondary)] transition hover:border-[var(--gold-primary)]/40 hover:text-[var(--gold-primary)]"
      title={t('lang.label')}
    >
      <span className="text-[10px] font-mono font-bold tracking-[0.14em]">🌐 {locale.toUpperCase()}</span>
    </button>
  );
}
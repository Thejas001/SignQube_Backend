import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'हिं' },
] as const;

const stored = typeof window === 'undefined' ? null : window.localStorage.getItem('ss-admin-lang');

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: stored ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  try {
    window.localStorage.setItem('ss-admin-lang', lng);
    document.documentElement.lang = lng;
  } catch {
    /* storage can be unavailable */
  }
});

export default i18n;

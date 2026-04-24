import React, { createContext, useContext, useState, useCallback } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState('EN');

  const toggleLanguage = useCallback(() => {
    const next = lang === 'EN' ? 'AR' : 'EN';
    setLang(next);
    document.documentElement.dir  = next === 'AR' ? 'rtl' : 'ltr';
    document.documentElement.lang = next.toLowerCase();
  }, [lang]);

  /**
   * t(key) — returns a static UI translation string.
   *
   * ✅ Use for: panel titles, button labels, placeholders, instructions.
   * ❌ Never pass: layer.title, API response fields, coordinates, scale numbers.
   */
  const t = useCallback((key) => {
    return translations[lang][key] ?? key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
};

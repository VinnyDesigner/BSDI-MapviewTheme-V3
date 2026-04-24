import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import './Header.css';
import logo from '../assets/logo.png';

const Header = () => {
  const { t, toggleLanguage } = useLanguage();
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  return (
    <header className="header-container">
      {/* Organic Red Gradient Blobs */}
      <div className="header-blob blob-1" />
      <div className="header-blob blob-2" />
      <div className="header-blob blob-3" />
      
      <div className="header-left">
        <img src={logo} alt="Bahrain Logo" className="header-logo-image" />
      </div>
      
      <div className="header-center">
        {/* ✅ Static UI title — translated */}
        <h1 className="header-title">{t('appTitle')}</h1>
      </div>

      <div className="header-right">
        <motion.div 
          className={`header-search-wrapper ${isSearchExpanded ? 'expanded' : ''}`}
          animate={{ width: isSearchExpanded ? 240 : 36 }}
          transition={{ type: 'spring', damping: 20, stiffness: 150 }}
        >
          <button 
            className="header-action-btn search-btn" 
            onClick={() => setIsSearchExpanded(!isSearchExpanded)}
            aria-label={t('tools').search}
          >
            <Search size={20} />
          </button>
          
          {isSearchExpanded && (
            <motion.input
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              type="text"
              className="header-search-input"
              placeholder={t('searchPlaceholder')}
              autoFocus
            />
          )}
        </motion.div>

        <div className="header-divider" />

        {/* ✅ Lang toggle label — from translations (shows opposite language name) */}
        <button className="lang-text-toggle" onClick={toggleLanguage} aria-label="Toggle Language">
          {t('langToggle')}
        </button>

        <div className="header-divider" />

        <div className="header-avatar" aria-label="User Profile">
          AK
        </div>
      </div>
    </header>
  );
};

export default Header;

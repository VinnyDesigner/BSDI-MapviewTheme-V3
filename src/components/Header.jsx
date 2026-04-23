import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { motion } from 'framer-motion';
import './Header.css';
import logo from '../assets/logo.png';
const Header = () => {
  const [lang, setLang] = useState('EN');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const toggleLanguage = () => {
    const newLang = lang === 'EN' ? 'AR' : 'EN';
    setLang(newLang);
    document.documentElement.dir = newLang === 'AR' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang.toLowerCase();
  };
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
        <h1 className="header-title">BSDI Smart Map viewer</h1>
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
            aria-label="Toggle Search"
          >
            <Search size={20} />
          </button>
          
          {isSearchExpanded && (
            <motion.input
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              type="text"
              className="header-search-input"
              placeholder="Search..."
              autoFocus
            />
          )}
        </motion.div>

        <div className="header-divider" />

        <button className="lang-text-toggle" onClick={toggleLanguage} aria-label="Toggle Language">
          {lang === 'EN' ? 'العربية' : 'English'}
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

import React, { useState, useEffect, useRef } from 'react';
import { Search, Menu, X, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import './Header.css';

const Header = ({ onMenuClick, view }) => {
  const { t, toggleLanguage, lang } = useLanguage();
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  
  const searchVMRef = useRef(null);
  const debounceRef = useRef(null);
  const suggestionsRef = useRef(null);

  useEffect(() => {
    let active = true;
    const initSearch = async () => {
      const { default: SearchViewModel } = await import('@arcgis/core/widgets/Search/SearchViewModel');
      if (!active) return;
      
      try {
        const vm = new SearchViewModel({
          view: view,
          maxSuggestions: 6,
          includeDefaultSources: true
        });
        if (vm.defaultSources) {
          vm.defaultSources.forEach(source => {
            if (source) {
              source.countryCode = "BHR";
            }
          });
        }
        searchVMRef.current = vm;
      } catch (err) {
        console.warn("Failed to initialize SearchViewModel or set default country code:", err);
      }
    };
    if (view) {
      initSearch();
    }
    return () => {
      active = false;
      if (searchVMRef.current) {
        try {
          searchVMRef.current.destroy();
        } catch (e) {}
        searchVMRef.current = null;
      }
    };
  }, [view]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    setNoResults(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!val.trim()) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (!searchVMRef.current) return;
      try {
        const response = await searchVMRef.current.suggest(val);
        let allSuggestions = [];
        if (response && response.results) {
          response.results.forEach(res => {
            if (res.results) {
              allSuggestions = allSuggestions.concat(res.results);
            }
          });
        }
        setSuggestions(allSuggestions);
        setNoResults(allSuggestions.length === 0);
      } catch (err) {
        console.error("Search suggestion error", err);
        setSuggestions([]);
      }
    }, 300);
  };

  const executeSearch = async (suggestionOrTerm) => {
    if (!searchVMRef.current) return;
    setIsSearching(true);
    setSuggestions([]);
    
    try {
      const response = await searchVMRef.current.search(suggestionOrTerm);
      if (response && response.results && response.results.length > 0) {
        response.results.forEach(res => {
          if (res.results && res.results.length > 0) {
            res.results.forEach(innerRes => {
              if (innerRes.feature && innerRes.feature.geometry) {
                console.log("Extent:", innerRes.feature.geometry.extent);
                console.log("Spatial Reference:", innerRes.feature.geometry.spatialReference);
                if (view) {
                  console.log("Scale:", view.scale);
                }
              }
            });
          }
        });
      }
      if (response && response.numResults === 0) {
        setNoResults(true);
      }
    } catch (err) {
      console.error("Search error", err);
    }
    setIsSearching(false);
  };

  const handleSelectSuggestion = (suggestion) => {
    setSearchTerm(suggestion.text);
    executeSearch(suggestion);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && searchTerm.trim()) {
      executeSearch(searchTerm);
    }
  };

  const handleClear = () => {
    setSearchTerm('');
    setSuggestions([]);
    setNoResults(false);
    if (searchVMRef.current) {
      searchVMRef.current.clear();
    }
  };

  const logoSrc = lang === 'AR' ? '/assets/iGA-logo-ar.png' : '/assets/iGA-logo.png';

  return (
    <header className="header-container">
      
      <div className="header-left">
        <img src={logoSrc} alt="Information & eGovernment Authority" className="header-logo" />
      </div>
      
      <div className="header-center">
        <h1 className="header-title">{t('appTitle')}</h1>
      </div>

      <div className="header-right">
        <motion.div 
          className={`header-search-wrapper ${isSearchExpanded ? 'expanded' : ''}`}
          animate={{ width: isSearchExpanded ? 240 : 36 }}
          transition={{ type: 'spring', damping: 20, stiffness: 150 }}
          ref={suggestionsRef}
        >
          <button 
            className="header-action-btn search-btn" 
            onClick={() => {
              if (isSearchExpanded && searchTerm) {
                executeSearch(searchTerm);
              } else {
                setIsSearchExpanded(!isSearchExpanded);
              }
            }}
            aria-label={t('tools').search}
          >
            <Search size={20} />
          </button>
          
          {isSearchExpanded && (
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <motion.input
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                type="text"
                className="header-search-input"
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={handleSearchInput}
                onKeyDown={handleKeyDown}
                autoFocus
                dir={lang === 'AR' ? 'rtl' : 'ltr'}
              />
              
              {searchTerm && (
                <button 
                  className="header-action-btn clear-btn"
                  onClick={handleClear}
                  style={{ width: '24px', height: '24px', minWidth: '24px', position: 'absolute', right: lang === 'AR' ? 'auto' : '4px', left: lang === 'AR' ? '4px' : 'auto' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* Suggestions Dropdown */}
          <AnimatePresence>
            {isSearchExpanded && (suggestions.length > 0 || noResults) && (
              <motion.div 
                className="header-suggestions-dropdown"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
              >
                {suggestions.map((sug, idx) => (
                  <div 
                    key={idx} 
                    className="header-suggestion-item"
                    onClick={() => handleSelectSuggestion(sug)}
                    dir={lang === 'AR' ? 'rtl' : 'ltr'}
                  >
                    <MapPin size={16} className="sug-icon" />
                    <span className="sug-text">{sug.text}</span>
                  </div>
                ))}
                {noResults && searchTerm && (
                  <div className="header-suggestion-empty" dir={lang === 'AR' ? 'rtl' : 'ltr'}>
                    {lang === 'AR' ? 'لم يتم العثور على مواقع' : 'No locations found'}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="header-divider" />

        <button className="lang-text-toggle" onClick={toggleLanguage} aria-label="Toggle Language">
          {t('langToggle')}
        </button>

        <div className="header-divider" />

        <div className="header-avatar" aria-label="User Profile">
          AK
        </div>

        <button 
          className="header-action-btn hamburger-menu-btn"
          onClick={onMenuClick}
          aria-label="Open Menu"
        >
          <Menu size={22} />
        </button>
      </div>
    </header>
  );
};

export default Header;

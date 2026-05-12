import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import './CustomSelect.css';

const CustomSelect = ({ options, value, onChange, placeholder = "Select...", label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value || opt.id === value || opt === value);
  const displayLabel = selectedOption ? (selectedOption.title || selectedOption.label || selectedOption) : placeholder;

  const filteredOptions = options.filter(opt => {
    const text = (opt.title || opt.label || opt || "").toString().toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="custom-select-container" ref={containerRef}>
      <div 
        className={`custom-select-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="selected-value">{displayLabel}</span>
        <ChevronDown size={16} className={`chevron ${isOpen ? 'open' : ''}`} />
      </div>

      {isOpen && (
        <div className="custom-select-dropdown">
          {options.length > 10 && (
            <div className="select-search-wrapper">
              <Search size={14} className="search-icon" />
              <input 
                type="text" 
                className="select-search-input"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="options-list">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, index) => {
                const val = opt.value || opt.id || opt;
                const label = opt.title || opt.label || opt;
                const isSelected = val === value;
                
                return (
                  <div 
                    key={index} 
                    className={`option-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onChange(val);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                  >
                    <span>{label}</span>
                    {isSelected && <Check size={14} className="check-icon" />}
                  </div>
                );
              })
            ) : (
              <div className="no-options">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomSelect;

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import './CustomSelect.css';

const CustomSelect = ({ options, value, onChange, placeholder = "Select...", label, multi = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);

  const getSelectedOptions = () => {
    if (multi) {
      return options.filter(opt => {
        const val = opt.value || opt.id || opt;
        return Array.isArray(value) && value.includes(val);
      });
    }
    return options.filter(opt => opt.value === value || opt.id === value || opt === value);
  };

  const selectedOptions = getSelectedOptions();
  
  let displayLabel = placeholder;
  if (selectedOptions.length > 0) {
    if (multi) {
      displayLabel = selectedOptions.length === 1 
        ? (selectedOptions[0].title || selectedOptions[0].label || selectedOptions[0])
        : `${selectedOptions.length} items selected`;
    } else {
      const selected = selectedOptions[0];
      displayLabel = selected.title || selected.label || selected;
    }
  }

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
                const isSelected = multi 
                  ? (Array.isArray(value) && value.includes(val))
                  : val === value;
                
                return (
                  <div 
                    key={index} 
                    className={`option-item ${isSelected ? 'selected' : ''} ${multi ? 'multi' : ''}`}
                    onClick={(e) => {
                      if (multi) {
                        e.stopPropagation();
                        const newValue = Array.isArray(value) ? [...value] : [];
                        if (newValue.includes(val)) {
                          onChange(newValue.filter(v => v !== val));
                        } else {
                          onChange([...newValue, val]);
                        }
                      } else {
                        onChange(val);
                        setIsOpen(false);
                        setSearchTerm('');
                      }
                    }}
                  >
                    {multi && (
                      <div className={`select-checkbox ${isSelected ? 'checked' : ''}`}>
                        {isSelected && <Check size={10} color="white" strokeWidth={4} />}
                      </div>
                    )}
                    <span>{label}</span>
                    {!multi && isSelected && <Check size={14} className="check-icon" />}
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

import React from 'react';
import { Lock, X, AlertTriangle, Send } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './DownloadRestrictedModal.css';

const DownloadRestrictedModal = ({ isOpen, onClose, onRequestData }) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="restricted-modal">
        <button className="modal-close" onClick={onClose} aria-label={t('closePanel') || 'Close'}>
          <X size={20} />
        </button>
        
        <div className="modal-content">
          <div className="restricted-icon-container">
            <Lock size={40} className="lock-icon" />
            <AlertTriangle size={24} className="warning-badge" />
          </div>
          
          <h2>{t('downloadRestrictedTitle')}</h2>
          <p>
            {t('downloadRestrictedDesc')}
          </p>
          
          <div className="modal-actions">
            <button className="modal-btn secondary" onClick={onClose}>
              {t('cancelBtn')}
            </button>
            <button className="modal-btn primary" onClick={() => {
              onRequestData();
              onClose();
            }}>
              <Send size={16} />
              {t('requestDataBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadRestrictedModal;

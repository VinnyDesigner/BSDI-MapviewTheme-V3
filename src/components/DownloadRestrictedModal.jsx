import React from 'react';
import { Lock, X, AlertTriangle, Send } from 'lucide-react';
import './DownloadRestrictedModal.css';

const DownloadRestrictedModal = ({ isOpen, onClose, onRequestData }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="restricted-modal">
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className="modal-content">
          <div className="restricted-icon-container">
            <Lock size={40} className="lock-icon" />
            <AlertTriangle size={24} className="warning-badge" />
          </div>
          
          <h2>Download Restricted</h2>
          <p>
            Direct download is not permitted for this dataset. 
            Please submit a spatial data request for administrative approval.
          </p>
          
          <div className="modal-actions">
            <button className="modal-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="modal-btn primary" onClick={() => {
              onRequestData();
              onClose();
            }}>
              <Send size={16} />
              Request Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadRestrictedModal;

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { 
  FileText, 
  Send, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Lock, 
  ChevronRight,
  Info,
  AlertCircle,
  Mail,
  User,
  Building,
  MapPin,
  Square,
  Circle,
  Hexagon,
  ArrowLeft,
  ArrowRight,
  Check
} from 'lucide-react';
import './DataRequestPanel.css';

const DataRequestPanel = ({ 
  step, 
  setStep, 
  aoi, 
  intersectingLayers = [], 
  selectedLayers = [], 
  setSelectedLayers,
  onDrawingToolSelect,
  activeDrawingTool,
  lastRequestRef,
  onRequestSubmit,
  requestHistory = [],
  onReset
}) => {
  const { t, lang } = useLanguage();
  const isRtl = lang === 'AR';
  const [activeTab, setActiveTab] = useState('new');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    organization: '',
    description: ''
  });

  const toggleLayerSelection = (layerId) => {
    if (selectedLayers.includes(layerId)) {
      setSelectedLayers(prev => prev.filter(id => id !== layerId));
    } else {
      setSelectedLayers(prev => [...prev, layerId]);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    onRequestSubmit({
      ...formData,
      aoi: aoi,
      layers: selectedLayers,
      submittedDate: new Date().toLocaleDateString(),
      status: 'Pending'
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Approved': return <CheckCircle size={16} color="#16a34a" />;
      case 'Rejected': return <XCircle size={16} color="#dc2626" />;
      default: return <Clock size={16} color="#f59e0b" />;
    }
  };

  return (
    <div className={`data-request-panel ${isRtl ? 'rtl' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="tool-tabs">
        <button 
          className={`tool-tab ${activeTab === 'new' ? 'active' : ''}`}
          onClick={() => setActiveTab('new')}
        >
          {t('dataRequestTabRequest')}
        </button>
        <button 
          className={`tool-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          {t('dataRequestTabHistory')}
        </button>
      </div>

      <div className="panel-main-area">
        {activeTab === 'new' ? (
          <div className="request-flow">
            {step === 'drawing' && (
              <div className="step-container">
                <div className="step-content">
                  <p className="instruction-text">
                    {t('dataRequestDrawInstruction')}
                  </p>

                  <div className="drawing-tools">
                    <button 
                      className={`draw-tool-btn ${activeDrawingTool === 'circle' ? 'active' : ''}`}
                      onClick={() => onDrawingToolSelect('circle')}
                    >
                      <Circle size={24} />
                      <span>{t('dataRequestToolCircle')}</span>
                    </button>
                    <button 
                      className={`draw-tool-btn ${activeDrawingTool === 'rectangle' ? 'active' : ''}`}
                      onClick={() => onDrawingToolSelect('rectangle')}
                    >
                      <Square size={24} />
                      <span>{t('dataRequestToolRectangle')}</span>
                    </button>
                    <button 
                      className={`draw-tool-btn ${activeDrawingTool === 'polygon' ? 'active' : ''}`}
                      onClick={() => onDrawingToolSelect('polygon')}
                    >
                      <Hexagon size={24} />
                      <span>{t('dataRequestToolPolygon')}</span>
                    </button>
                  </div>

                </div>
              </div>
            )}

            {step === 'selection' && (
              <div className="step-container">
                <div className="step-content">
                  <div className="selection-summary-top">
                    <span>{selectedLayers.length}/{intersectingLayers.length} {t('dataRequestSelectedLayers')}</span>
                  </div>

                  <div className="dataset-list">
                    {intersectingLayers.map(layer => (
                      <div 
                        key={layer.id} 
                        className={`dataset-item ${selectedLayers.includes(layer.id) ? 'selected' : ''}`}
                        onClick={() => toggleLayerSelection(layer.id)}
                      >
                        <div className="checkbox">
                          {selectedLayers.includes(layer.id) && <Check size={12} />}
                        </div>
                        <span className="layer-title">{layer.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="step-footer-right">
                  <button className="secondary-btn" onClick={() => setStep('drawing')}>
                    {t('dataRequestRedraw')}
                  </button>
                  <button 
                    className="primary-btn" 
                    disabled={selectedLayers.length === 0}
                    onClick={() => setStep('form')}
                  >
                    {t('dataRequestNext')}
                  </button>
                </div>
              </div>
            )}

             {step === 'form' && (
              <form className="step-container" onSubmit={handleFormSubmit}>
                <div className="step-content">
                  <div className="form-group">
                    <label>{t('dataRequestMatchedLayers')} ({selectedLayers.length} / {intersectingLayers.length})</label>
                    <div className="dataset-list no-scrollbar" style={{ 
                      maxHeight: '140px', 
                      overflowY: 'auto', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '8px', 
                      padding: '6px', 
                      background: '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      {intersectingLayers.length === 0 ? (
                        <span style={{ fontSize: '12px', color: '#64748b', padding: '8px', textAlign: 'center' }}>
                          {t('dataRequestNoIntersect')}
                        </span>
                      ) : (
                        intersectingLayers.map(layer => (
                          <div 
                            key={layer.id} 
                            className={`dataset-item ${selectedLayers.includes(layer.id) ? 'selected' : ''}`}
                            onClick={() => toggleLayerSelection(layer.id)}
                            style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s', background: 'white' }}
                          >
                            <div className="checkbox" style={{ width: '14px', height: '14px', flexShrink: 0 }}>
                              {selectedLayers.includes(layer.id) && <Check size={10} />}
                            </div>
                            <span className="layer-title" style={{ fontSize: '12px', fontWeight: '500', color: '#1e293b' }}>{layer.title}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>{t('dataRequestFullName')}</label>
                    <input 
                      className="form-input"
                      type="text" 
                      required 
                      placeholder={t('dataRequestFullNamePlaceholder')}
                      value={formData.fullName}
                      onChange={e => setFormData({...formData, fullName: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t('dataRequestEmail')}</label>
                    <input 
                      className="form-input"
                      type="email" 
                      required 
                      placeholder={t('dataRequestEmailPlaceholder')}
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t('dataRequestOrganization')}</label>
                    <input 
                      className="form-input"
                      type="text" 
                      required 
                      placeholder={t('dataRequestOrganizationPlaceholder')}
                      value={formData.organization}
                      onChange={e => setFormData({...formData, organization: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t('dataRequestDescription')}</label>
                    <textarea 
                      className="tool-textarea"
                      required
                      placeholder={t('dataRequestDescriptionPlaceholder')}
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                </div>

                <div className="step-footer-right">
                  <button type="button" className="secondary-btn" onClick={() => setStep('drawing')}>
                    {t('dataRequestRedraw')}
                  </button>
                  <button type="submit" className="primary-btn" disabled={selectedLayers.length === 0}>
                    {t('dataRequestSubmit')}
                  </button>
                </div>
              </form>
            )}

            {step === 'success' && (
              <div className="step-container success-state">
                <div className="step-content centered">
                  <div className="success-icon-large">
                    <CheckCircle size={40} color="#16a34a" />
                  </div>
                  <h2>{t('dataRequestSuccessTitle')}</h2>
                  <p>
                    {lang === 'AR' 
                      ? `تم تسجيل طلب البيانات المكانية الخاص بك لـ ${selectedLayers.length} من الطبقات بنجاح. ستتلقى رسالة بريد إلكتروني قريباً تحتوي على تفاصيل المتابعة.`
                      : `Your spatial data request for ${selectedLayers.length} layers has been logged. You will receive an email shortly with tracking details.`}
                  </p>

                  <div className="reference-card">
                    <span className="ref-label">{t('dataRequestRefNumber')}</span>
                    <span className="ref-value">{lastRequestRef}</span>
                  </div>

                  <button className="primary-btn success-action-btn" onClick={onReset}>
                    {t('dataRequestStartNew')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="history-container">
            <div className="history-list">
              {requestHistory.length === 0 ? (
                <div className="empty-state">
                  <FileText size={40} opacity={0.2} />
                  <p>{t('dataRequestHistoryEmpty')}</p>
                </div>
              ) : (
                requestHistory.map(req => (
                  <div key={req.id} className={`history-card status-${req.status.toLowerCase()}`}>
                    <div className="history-card-top">
                      <span className="history-ref">{req.reference}</span>
                      <span className="history-date">{req.submittedDate}</span>
                    </div>
                    <div className="history-card-mid">
                      <span className="history-layer-count">{req.layers?.length || 0} {t('dataRequestLayersRequested')}</span>
                      <span className={`history-status-badge ${req.status.toLowerCase()}`}>
                        {getStatusIcon(req.status)}
                        {req.status}
                      </span>
                    </div>
                    {req.description && (
                      <div className="history-card-desc">{req.description}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataRequestPanel;

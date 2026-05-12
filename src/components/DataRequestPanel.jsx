import React, { useState, useEffect } from 'react';
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
    <div className="data-request-panel">
      <div className="tool-tabs">
        <button 
          className={`tool-tab ${activeTab === 'new' ? 'active' : ''}`}
          onClick={() => setActiveTab('new')}
        >
          Request Data
        </button>
        <button 
          className={`tool-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      <div className="panel-main-area">
        {activeTab === 'new' ? (
          <div className="request-flow">
            {step === 'drawing' && (
              <div className="step-container">
                <div className="step-content">
                  <p className="instruction-text">
                    Select a shape tool and draw on the map to define your area of interest.
                  </p>

                  <div className="drawing-tools">
                    <button 
                      className={`draw-tool-btn ${activeDrawingTool === 'circle' ? 'active' : ''}`}
                      onClick={() => onDrawingToolSelect('circle')}
                    >
                      <Circle size={24} />
                      <span>Circle</span>
                    </button>
                    <button 
                      className={`draw-tool-btn ${activeDrawingTool === 'rectangle' ? 'active' : ''}`}
                      onClick={() => onDrawingToolSelect('rectangle')}
                    >
                      <Square size={24} />
                      <span>Rectangle</span>
                    </button>
                    <button 
                      className={`draw-tool-btn ${activeDrawingTool === 'polygon' ? 'active' : ''}`}
                      onClick={() => onDrawingToolSelect('polygon')}
                    >
                      <Hexagon size={24} />
                      <span>Polygon</span>
                    </button>
                  </div>

                </div>
              </div>
            )}

            {step === 'selection' && (
              <div className="step-container">
                <div className="step-content">
                  <div className="selection-summary-top">
                    <span>{selectedLayers.length}/{intersectingLayers.length} Layers Selected</span>
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
                    Redraw
                  </button>
                  <button 
                    className="primary-btn" 
                    disabled={selectedLayers.length === 0}
                    onClick={() => setStep('form')}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {step === 'form' && (
              <form className="step-container" onSubmit={handleFormSubmit}>
                <div className="step-content">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      className="form-input"
                      type="text" 
                      required 
                      placeholder="Enter your full name"
                      value={formData.fullName}
                      onChange={e => setFormData({...formData, fullName: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label>Email Address</label>
                    <input 
                      className="form-input"
                      type="email" 
                      required 
                      placeholder="Enter your email address"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label>Organization</label>
                    <input 
                      className="form-input"
                      type="text" 
                      required 
                      placeholder="Enter your organization"
                      value={formData.organization}
                      onChange={e => setFormData({...formData, organization: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label>Description</label>
                    <textarea 
                      className="tool-textarea"
                      required
                      placeholder="Describe the intended use for this data..."
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                </div>

                <div className="step-footer-right">
                  <button type="button" className="secondary-btn" onClick={() => setStep('selection')}>
                    Back
                  </button>
                  <button type="submit" className="primary-btn">
                    Submit Request
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
                  <h2>Request submitted for approval</h2>
                  <p>
                    Your spatial data request for {selectedLayers.length} layers has been logged. 
                    You will receive an email shortly with tracking details.
                  </p>

                  <div className="reference-card">
                    <span className="ref-label">Reference Number</span>
                    <span className="ref-value">{lastRequestRef}</span>
                  </div>

                  <button className="primary-btn success-action-btn" onClick={onReset}>
                    Start New Request
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
                  <p>No request history found.</p>
                </div>
              ) : (
                requestHistory.map(req => (
                  <div key={req.id} className={`history-card status-${req.status.toLowerCase()}`}>
                    <div className="history-card-top">
                      <span className="history-ref">{req.reference}</span>
                      <span className="history-date">{req.submittedDate}</span>
                    </div>
                    <div className="history-card-mid">
                      <span className="history-layer-count">{req.layers?.length || 0} Layers Requested</span>
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

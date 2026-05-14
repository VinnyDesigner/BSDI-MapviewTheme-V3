import React, { useState, useRef } from 'react';
import { 
  Upload, 
  File, 
  Trash2, 
  Maximize2, 
  AlertCircle, 
  CheckCircle2,
  RefreshCw,
  Search,
  Database
} from 'lucide-react';
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer';
import CSVLayer from '@arcgis/core/layers/CSVLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import * as XLSX from 'xlsx';
import shp from 'shpjs';
import './AddDataPanel.css';

const AddDataPanel = ({ view }) => {
  const [activeTab, setActiveTab] = useState('add');
  const [fileType, setFileType] = useState('GeoJSON');
  const [wkid, setWkid] = useState('20439');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const onFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = async (file) => {
    setError(null);
    setIsUploading(true);
    
    try {
      const fileName = file.name;
      const fileExt = fileName.split('.').pop().toLowerCase();
      let layer = null;

      if (fileType === 'GeoJSON' && fileExt === 'geojson') {
        const url = URL.createObjectURL(file);
        layer = new GeoJSONLayer({ url, title: fileName });
      } 
      else if (fileType === 'CSV' && fileExt === 'csv') {
        const url = URL.createObjectURL(file);
        layer = new CSVLayer({ url, title: fileName });
      }
      else if (fileType === 'Shapefile' && fileExt === 'zip') {
        const arrayBuffer = await file.arrayBuffer();
        const geojson = await shp(arrayBuffer);
        const blob = new Blob([JSON.stringify(geojson)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        layer = new GeoJSONLayer({ url, title: fileName });
      }
      else if (fileType === 'Excel' && (fileExt === 'xlsx' || fileExt === 'xls')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        // Find Lat/Long columns
        const latCol = Object.keys(jsonData[0]).find(k => k.toLowerCase().includes('lat'));
        const lonCol = Object.keys(jsonData[0]).find(k => k.toLowerCase().includes('lon') || k.toLowerCase().includes('lng'));

        if (!latCol || !lonCol) {
          throw new Error("Could not find Latitude/Longitude columns in Excel.");
        }

        const graphics = jsonData.map(row => {
          return new Graphic({
            geometry: {
              type: "point",
              x: parseFloat(row[lonCol]),
              y: parseFloat(row[latCol]),
              spatialReference: { wkid: parseInt(wkid) }
            },
            attributes: row,
            symbol: {
              type: "simple-marker",
              color: [223, 38, 28],
              outline: { color: [255, 255, 255], width: 1 }
            }
          });
        });

        layer = new GraphicsLayer({ 
          title: fileName,
          graphics: graphics
        });
      }
      else {
        throw new Error(`Unsupported file or mismatch with selected type: ${fileType}`);
      }

      if (layer) {
        view.map.add(layer);
        const newResult = {
          id: crypto.randomUUID(),
          name: fileName,
          layer: layer,
          date: new Date().toLocaleString()
        };
        setResults(prev => [newResult, ...prev]);
        setActiveTab('results');

        // Zoom to layer
        if (layer.fullExtent) {
          view.goTo(layer.fullExtent);
        } else if (layer.graphics && layer.graphics.length > 0) {
          view.goTo(layer.graphics.toArray());
        }
      }

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleZoom = (result) => {
    if (result.layer.fullExtent) {
      view.goTo(result.layer.fullExtent);
    } else if (result.layer.graphics) {
      view.goTo(result.layer.graphics.toArray());
    }
  };

  const handleDelete = (resultId) => {
    const result = results.find(r => r.id === resultId);
    if (result) {
      view.map.remove(result.layer);
      setResults(prev => prev.filter(r => r.id !== resultId));
    }
  };

  return (
    <div className="add-data-panel">
      {/* Tabs */}
      <div className="tool-tabs">
        <button 
          className={`tool-tab ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
        >
          Add Data
        </button>
        <button 
          className={`tool-tab ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => setActiveTab('results')}
        >
          Results {results.length > 0 && <span className="tab-badge">{results.length}</span>}
        </button>
      </div>

      <div className="panel-content-scroll">
        {activeTab === 'add' ? (
          <div className="add-data-form">
            <div className="form-group">
              <label>File Type</label>
              <select 
                className="tool-select"
                value={fileType}
                onChange={(e) => setFileType(e.target.value)}
              >
                <option>GeoJSON</option>
                <option>Shapefile</option>
                <option>CSV</option>
                <option>Excel</option>
                <option>KML</option>
                <option>DXF</option>
                <option>DWG</option>
                <option>DGN</option>
              </select>
            </div>

            <div 
              className={`upload-zone ${isUploading ? 'uploading' : ''}`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={onFileChange}
                accept=".geojson,.zip,.csv,.xlsx,.xls,.kml,.dxf,.dwg,.dgn"
              />
              <div className="upload-content">
                <div className="upload-icon-wrapper">
                  <Upload size={24} color="#df261c" />
                </div>
                <p className="upload-title">Choose a file or drag & drop it here</p>
                <p className="upload-formats">Supported: .dwg, .dxf, .shp, .kml, .xls</p>
                
                <button className="browse-btn tertiary" onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current.click();
                }}>
                  Browse Files
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Coordinate System (WKID)</label>
              <input 
                type="text" 
                className="tool-input"
                placeholder="e.g. 20439"
                value={wkid}
                onChange={(e) => setWkid(e.target.value)}
              />
              <span className="form-hint">Default CRS: Ain el Abd / UTM zone 39N (EPSG: 20439)</span>
            </div>

            {error && (
              <div className="error-alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="results-list">
            {results.length === 0 ? (
              <div className="empty-state">
                <div className="empty-card">
                  <div className="empty-icon-wrapper">
                    <Database size={32} />
                  </div>
                  <h3 className="empty-title">No Uploaded Data</h3>
                  <p className="empty-desc">Uploaded datasets will appear here.</p>
                </div>
              </div>
            ) : (
              results.map(item => (
                <div key={item.id} className="result-row">
                  <div className="result-info">
                    <File size={18} className="result-icon" />
                    <div className="result-text">
                      <span className="result-name">{item.name}</span>
                      <span className="result-date">{item.date}</span>
                    </div>
                  </div>
                  <div className="result-actions">
                    <button className="action-btn" onClick={() => handleZoom(item)} title="Zoom to layer">
                      <Maximize2 size={16} />
                    </button>
                    <button className="action-btn delete-btn" onClick={() => handleDelete(item.id)} title="Remove">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AddDataPanel;

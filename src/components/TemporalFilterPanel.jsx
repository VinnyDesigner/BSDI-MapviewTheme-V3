import React, { useState, useEffect } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw, Info, Calendar } from 'lucide-react';
import CustomSelect from './CustomSelect';
import './TemporalFilterPanel.css';

const TemporalFilterPanel = ({ 
  layersConfig, 
  timelapseSettings, 
  setTimelapseSettings
}) => {
  const [availableFields, setAvailableFields] = useState([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);

  // Filter layers that have time properties or are marked as time-enabled
  const temporalLayers = layersConfig.filter(l => l.timeEnabled || l.startYear || l.timeField);

  const activeLayer = temporalLayers.find(l => l.id === timelapseSettings.layerId);

  // Detect time fields when layer changes
  useEffect(() => {
    if (!activeLayer) return;

    const detectFields = async () => {
      setIsLoadingFields(true);
      try {
        // In a real app, we would query the layer metadata here
        // For now, we use the config or mock detection
        const mockFields = [
          { name: activeLayer.timeField || 'SURVEY_YEAR', alias: 'Survey Year' },
          { name: 'Created_Date', alias: 'Created Date' },
          { name: 'Record_Year', alias: 'Record Year' }
        ];
        setAvailableFields(mockFields);
        
        // If current field is not in available fields, pick the first one
        if (!timelapseSettings.timeField) {
          setTimelapseSettings(prev => ({ ...prev, timeField: mockFields[0].name }));
        }
      } catch (err) {
        console.error("Error detecting time fields:", err);
      } finally {
        setIsLoadingFields(false);
      }
    };

    detectFields();
  }, [activeLayer?.id]);

  // Playback Loop Logic
  useEffect(() => {
    let intervalId;
    if (timelapseSettings.isPlaying) {
      const delay = 1500; // Default speed
      intervalId = setInterval(() => {
        setTimelapseSettings(prev => {
          const nextYear = prev.toYear + 1;
          if (nextYear > prev.endYear) {
            return { ...prev, toYear: prev.startYear }; // Loop back to start
          }
          return { ...prev, toYear: nextYear };
        });
      }, delay);
    }
    return () => clearInterval(intervalId);
  }, [timelapseSettings.isPlaying, timelapseSettings.endYear]);

  const handleReset = () => {
    if (!activeLayer) return;
    setTimelapseSettings({
      ...timelapseSettings,
      fromYear: activeLayer.startYear || 2018,
      toYear: activeLayer.endYear || 2024,
      isPlaying: false
    });
  };

  const handleApply = () => {
    setTimelapseSettings(prev => ({ ...prev, lastApply: Date.now() }));
  };

  const togglePlay = () => {
    setTimelapseSettings(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const stepForward = () => {
    setTimelapseSettings(prev => ({ 
      ...prev, 
      toYear: Math.min(prev.endYear, prev.toYear + 1), 
      isPlaying: false 
    }));
  };

  const stepBack = () => {
    setTimelapseSettings(prev => ({ 
      ...prev, 
      toYear: Math.max(prev.startYear, prev.toYear - 1), 
      isPlaying: false 
    }));
  };

  return (
    <div className="temporal-filter-container">
      <div className="temporal-filter-body">
        
        {/* 1. SELECT TEMPORAL LAYER */}
        <div className="temporal-section">
          <label className="temporal-label">Select Temporal Layer</label>
          <CustomSelect 
            options={temporalLayers.map(l => ({ id: l.id, title: l.title }))}
            value={timelapseSettings.layerId}
            onChange={(val) => {
              const layer = temporalLayers.find(l => l.id === val);
              if (!layer) return;
              setTimelapseSettings({
                ...timelapseSettings,
                layerId: val,
                startYear: layer.startYear || 2018,
                endYear: layer.endYear || 2024,
                fromYear: layer.startYear || 2018,
                toYear: layer.endYear || 2024,
                timeField: layer.timeField || '',
                isPlaying: false
              });
            }}
            placeholder="Choose a layer..."
          />
        </div>

        {/* 2. DETECT TIME FIELD */}
        <div className="temporal-section">
          <label className="temporal-label">Time Field</label>
          <CustomSelect 
            options={availableFields.map(f => ({ id: f.name, title: f.alias || f.name }))}
            value={timelapseSettings.timeField}
            onChange={(val) => setTimelapseSettings({ ...timelapseSettings, timeField: val })}
            placeholder={isLoadingFields ? "Detecting..." : "Select time field..."}
          />
        </div>

        {/* 3. TIMELINE SLIDER (DUAL HANDLE) */}
        <div className="temporal-section timeline-range-section">
          <div className="timeline-header">
            <label className="temporal-label">Time Range</label>
            <div className="range-display">
              {timelapseSettings.fromYear} — {timelapseSettings.toYear}
            </div>
          </div>
          
          <div className="timeline-slider-wrapper">
            <div className="timeline-track">
              <div 
                className="timeline-highlight"
                style={{
                  left: `${((timelapseSettings.fromYear - timelapseSettings.startYear) / (timelapseSettings.endYear - timelapseSettings.startYear)) * 100}%`,
                  right: `${100 - ((timelapseSettings.toYear - timelapseSettings.startYear) / (timelapseSettings.endYear - timelapseSettings.startYear)) * 100}%`
                }}
              />
              <input 
                type="range"
                className="range-thumb thumb-left"
                min={timelapseSettings.startYear}
                max={timelapseSettings.endYear}
                value={timelapseSettings.fromYear}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), timelapseSettings.toYear);
                  setTimelapseSettings({ ...timelapseSettings, fromYear: val });
                }}
              />
              <input 
                type="range"
                className="range-thumb thumb-right"
                min={timelapseSettings.startYear}
                max={timelapseSettings.endYear}
                value={timelapseSettings.toYear}
                onChange={(e) => {
                  const val = Math.max(Number(e.target.value), timelapseSettings.fromYear);
                  setTimelapseSettings({ ...timelapseSettings, toYear: val });
                }}
              />
            </div>
            <div className="timeline-labels">
              <span>{timelapseSettings.startYear}</span>
              <span>{timelapseSettings.endYear}</span>
            </div>
          </div>
        </div>

        {/* 4. PLAYBACK INTERVAL */}
        <div className="temporal-section">
          <label className="temporal-label">Playback Interval</label>
          <CustomSelect 
            options={[
              { id: 'Yearly', title: 'Yearly' },
              { id: 'Monthly', title: 'Monthly' },
              { id: 'Daily', title: 'Daily' }
            ]}
            value={timelapseSettings.playbackInterval || 'Yearly'}
            onChange={(val) => setTimelapseSettings({ ...timelapseSettings, playbackInterval: val })}
          />
        </div>

        {/* 5. PLAYBACK CONTROLS */}
        <div className="temporal-section playback-controls-section">
          <div className="playback-group">
            <button className="playback-btn secondary" onClick={stepBack} title="Step Back">
              <ChevronLeft size={20} />
            </button>
            <button className={`playback-btn primary ${timelapseSettings.isPlaying ? 'active' : ''}`} onClick={togglePlay}>
              {timelapseSettings.isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
            </button>
            <button className="playback-btn secondary" onClick={stepForward} title="Step Forward">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="info-box-v4">
          <Info size={14} />
          <span>Filters layer content based on attribute values using definitionExpression.</span>
        </div>

      </div>

      <div className="temporal-footer">
        <button className="temporal-btn-secondary" onClick={handleReset}>
          <RotateCcw size={15} /> Reset
        </button>
        <button className="temporal-btn-primary" onClick={handleApply} disabled={!timelapseSettings.layerId}>
          Apply Filter
        </button>
      </div>
    </div>
  );
};

export default TemporalFilterPanel;

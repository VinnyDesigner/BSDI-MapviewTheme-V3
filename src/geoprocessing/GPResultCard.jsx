/**
 * GPResultCard
 * ──────────────────────────────────────────────────────────────────────────
 * Renders one completed GP run in the Results tab.
 * Handles all renderMode types: MapLayer, Table, Text, Download.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Eye, EyeOff, Trash2, Download, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, Table2, AlertCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const GPResultCard = ({ run, onToggle, onDelete, onZoom, onExport }) => {
  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';
  const [expanded, setExpanded] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportMenuPos, setExportMenuPos] = useState(null);

  const openExport = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setExportMenuPos({ top: rect.bottom + 4, left: rect.left - 100 });
    setExportMenuOpen(true);
  };

  const hasMapLayer = run.rendered?.some(r => r.renderMode === 'MapLayer');
  const tableOutputs = run.rendered?.filter(r => r.renderMode === 'Table') || [];
  const textOutputs  = run.rendered?.filter(r => r.renderMode === 'Text') || [];

  return (
    <div className="result-tree-node">
      <div className={`result-row ${run.visible ? '' : 'hidden-layer'}`} style={{ padding: '8px 12px' }}>
        {/* Row 1 — main info + actions */}
        <div className="result-row-first" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="result-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Far-Left Expand/Collapse Accordion Arrow */}
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                margin: 0
              }}
            >
              {expanded ? (
                <ChevronDown size={14} />
              ) : (
                isRTL ? <ChevronLeft size={14} /> : <ChevronRight size={14} />
              )}
            </button>

            {/* Layer Visibility Checkbox */}
            <input
              type="checkbox"
              className="custom-checkbox"
              checked={run.visible}
              onChange={() => onToggle(run.id)}
              style={{ margin: 0 }}
            />

            {/* Dynamic colour swatch */}
            <div style={{
              width: 10, height: 10, borderRadius: 2, flexShrink: 0,
              background: run.colour || '#268FFF',
              boxShadow: `0 0 0 2px ${(run.colour || '#268FFF')}44`,
            }} />

            {/* Layer / Tool Name */}
            <span className="result-name" title={run.toolName} style={{ fontWeight: 600, fontSize: '12px', color: '#1a2f4d' }}>
              {run.toolName}
            </span>
          </div>

          <div className="result-actions" style={{ display: 'flex', alignItems: 'center', gap: 3, position: 'relative' }}>
            {hasMapLayer && (
              <button className="action-btn" onClick={() => onZoom(run.id)} title="Zoom to result">
                <Maximize2 size={14} />
              </button>
            )}
            <button className="action-btn" onClick={openExport} title="Export">
              <Download size={14} />
            </button>
            <button className="action-btn delete-btn" onClick={() => onDelete(run.id)} title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Row 2 — metadata summary */}
        <div className="result-row-second" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingLeft: isRTL ? 0 : 26, paddingRight: isRTL ? 26 : 0 }}>
          <span className="result-feature-count" style={{ fontSize: '11px', color: '#64748b' }}>
            {run.totalFeatures != null ? `${run.totalFeatures} ${t('gpFeatures')}` : run.status}
          </span>
          <span className="result-upload-date" style={{ fontSize: '10.5px', color: '#94a3b8' }}>
            {run.date}
          </span>
        </div>

        {/* Structured execution metadata parameters details (Expanded State Only) */}
        {expanded && run.metadata && (
          <div style={{
            margin: '10px 0 4px', padding: '6px 12px',
            background: '#f8fafc', borderRadius: 8,
            border: '1px solid #e2e8f0',
            fontSize: '11px',
            direction: isRTL ? 'rtl' : 'ltr',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {(() => {
              const entries = Object.entries(run.metadata).filter(([_, val]) => val !== null && val !== undefined && val !== '');
              return entries.map(([key, val], idx) => {
                const displayKey = key.replace(/_/g, ' ');
                return (
                  <div key={key} style={{
                    display: 'flex',
                    fontSize: '11px',
                    borderBottom: idx === entries.length - 1 ? 'none' : '1px solid #e2e8f0',
                    padding: '6px 0',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}>
                    <span style={{
                      color: '#64748b',
                      fontWeight: '500',
                      width: '45%',
                      flexShrink: 0,
                      textAlign: isRTL ? 'right' : 'left'
                    }}>
                      {t(displayKey) || displayKey}
                    </span>
                    <span style={{
                      color: '#1a2f4d',
                      fontWeight: '600',
                      wordBreak: 'break-all',
                      flex: 1,
                      textAlign: isRTL ? 'left' : 'right'
                    }}>
                      {String(val)}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {expanded && run.hasFeaturesButNoGeom && (
          <div style={{
            margin: '8px 0 4px', padding: '10px 12px',
            background: '#fef2f2', borderRadius: 8,
            border: '1px solid #fee2e2',
            fontSize: '11px', color: '#991b1b',
            display: 'flex', alignItems: 'center', gap: 6,
            direction: isRTL ? 'rtl' : 'ltr',
            textAlign: isRTL ? 'right' : 'left'
          }}>
            <AlertCircle size={13} style={{ flexShrink: 0 }} />
            <span>Result record created but no output geometry was generated.</span>
          </div>
        )}

        {/* Text outputs inline (Expanded State Only) */}
        {expanded && textOutputs.map((t, i) => (
          <div key={i} style={{
            margin: '6px 0 0', padding: '6px 10px',
            background: '#f8fafc', borderRadius: 6,
            fontSize: 11, color: '#334155', borderLeft: isRTL ? 'none' : '3px solid #268FFF', borderRight: isRTL ? '3px solid #268FFF' : 'none',
          }}>
            <strong>{t.label}:</strong> {t.text}
          </div>
        ))}
      </div>

      {/* Expanded table output */}
      {expanded && tableOutputs.map((tbl, i) => (
        <div key={i} className="gp-result-table-wrapper" style={{
          marginTop: 4, maxHeight: 200, overflowY: 'auto',
          borderRadius: 6, border: '1px solid #e2e8f0',
        }}>
          <GPResultTable rows={tbl.rows} label={tbl.label} />
        </div>
      ))}

      {/* Export dropdown portal */}
      {exportMenuOpen && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
          onClick={() => setExportMenuOpen(false)}
        >
          <div
            style={{
              position: 'absolute',
              top: exportMenuPos.top, left: exportMenuPos.left,
              background: 'white', border: '1px solid #e2e8f0',
              borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              zIndex: 99999, minWidth: 150,
              display: 'flex', flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            {['GeoJSON', 'CSV', 'Excel', 'Image'].map(fmt => (
              <button
                key={fmt}
                style={{
                  padding: '8px 14px', fontSize: 12, cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  textAlign: 'left', color: '#1e293b', width: '100%',
                  borderBottom: '1px solid #f1f5f9',
                }}
                onClick={() => { setExportMenuOpen(false); onExport(run.id, fmt); }}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// ── Inline table for Table-typed outputs ──────────────────────────────────

function GPResultTable({ rows, label }) {
  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';

  if (!rows?.length) return <p style={{ padding: 8, fontSize: 12 }}>No data.</p>;
  const cols = Object.keys(rows[0] || {});
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: isRTL ? 'right' : 'left' }}>
      <thead>
        <tr style={{ background: '#f1f5f9' }}>
          {cols.map(c => (
            <th key={c} style={{ padding: '5px 8px', textAlign: isRTL ? 'right' : 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
            {cols.map(c => (
              <td key={c} style={{ padding: '4px 8px', color: '#334155' }}>
                {String(row[c] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default GPResultCard;

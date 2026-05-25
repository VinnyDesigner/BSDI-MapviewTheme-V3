/**
 * GPResultCard
 * ──────────────────────────────────────────────────────────────────────────
 * Renders one completed GP run in the Results tab.
 * Handles all renderMode types: MapLayer, Table, Text, Download.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Eye, EyeOff, Trash2, Download, ChevronDown, ChevronUp, Table2 } from 'lucide-react';
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
      <div className={`result-row ${run.visible ? '' : 'hidden-layer'}`}>
        {/* Row 1 — main info + actions */}
        <div className="result-row-first">
          <div className="result-info">
            <input
              type="checkbox"
              className="custom-checkbox"
              checked={run.visible}
              onChange={() => onToggle(run.id)}
            />
            {/* Dynamic colour swatch based on tool category */}
            <div style={{
              width: 10, height: 10, borderRadius: 2, flexShrink: 0,
              background: run.colour || '#268FFF',
              boxShadow: `0 0 0 2px ${(run.colour || '#268FFF')}44`,
            }} />
            <span className="result-name" title={run.toolName}>{run.toolName}</span>
          </div>

          <div className="result-actions" style={{ position: 'relative' }}>
            {hasMapLayer && (
              <button className="action-btn" onClick={() => onZoom(run.id)} title="Zoom to result">
                <Maximize2 size={14} />
              </button>
            )}
            {(tableOutputs.length > 0) && (
              <button
                className="action-btn"
                onClick={() => setExpanded(!expanded)}
                title={expanded ? 'Collapse table' : 'Expand table'}
              >
                {expanded ? <ChevronUp size={14} /> : <Table2 size={14} />}
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

        {/* Row 2 — metadata */}
        <div className="result-row-second">
          <span className="result-feature-count">
            {run.totalFeatures != null ? `${run.totalFeatures} ${t('gpFeatures')}` : run.status}
          </span>
          <span className="result-upload-date">{run.date}</span>
        </div>

        {/* Text outputs inline */}
        {textOutputs.map((t, i) => (
          <div key={i} style={{
            margin: '4px 0 0', padding: '6px 10px',
            background: '#f8fafc', borderRadius: 6,
            fontSize: 12, color: '#334155', borderLeft: '3px solid #268FFF',
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

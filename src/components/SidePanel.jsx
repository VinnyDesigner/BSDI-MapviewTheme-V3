import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './SidePanel.css';

const SidePanel = ({ isOpen, title, children, onClose, onMinimize }) => {
  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';
  
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [snapState, setSnapState] = useState('default'); // 'collapsed', 'default', 'expanded'
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSnapState('default');
    }
  }, [isOpen, children]);

  const slideX = isRTL ? '-100%' : '100%';
  const initialAnim = isMobile ? { y: '100%', opacity: 0 } : { x: slideX, opacity: 0 };
  const animateAnim = isMobile ? { y: '0%', opacity: 1 } : { x: '0%', opacity: 1 };
  const exitAnim = isMobile ? { y: '100%', opacity: 0 } : { x: slideX, opacity: 0 };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="side-panel-container">
          <motion.div 
            className={`side-panel ${isMobile ? `snap-${snapState}` : ''}`}
            initial={initialAnim}
            animate={animateAnim}
            exit={exitAnim}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            drag={isMobile ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, info) => {
              if (isMobile) {
                const threshold = 50;
                if (info.offset.y > threshold) {
                  // Dragged down
                  if (snapState === 'expanded') setSnapState('default');
                  else if (snapState === 'default') setSnapState('collapsed');
                } else if (info.offset.y < -threshold) {
                  // Dragged up
                  if (snapState === 'collapsed') setSnapState('default');
                  else if (snapState === 'default') setSnapState('expanded');
                }
              }
            }}
          >
            {/* Minimize Handle */}
            <button 
              className="side-panel-handle" 
              onClick={onMinimize}
              aria-label={t('minimizePanel')}
            >
              {isRTL ? <ChevronLeft size={24} /> : <ChevronRight size={24} />}
            </button>

            <div className="side-panel-inner">
              <div className="side-panel-glow" />
              {isMobile && (
                <div 
                  className="side-panel-mobile-handle" 
                  onClick={() => {
                    if (snapState === 'collapsed') setSnapState('default');
                    else if (snapState === 'default') setSnapState('expanded');
                    else setSnapState('default');
                  }}
                />
              )}
              <div className="side-panel-header">
                <h3>{title}</h3>
                <button className="close-button" onClick={onClose} aria-label={t('closePanel')}>
                  <X size={18} />
                </button>
              </div>
              <div className="side-panel-content">
                {children}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SidePanel;

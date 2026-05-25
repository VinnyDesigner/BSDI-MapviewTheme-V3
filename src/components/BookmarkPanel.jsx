import React, { useState, useEffect, useRef } from 'react';
import { motion, Reorder } from 'framer-motion';
import { 
  Bookmark, 
  ArrowLeft, 
  Trash2, 
  Pencil, 
  GripVertical,
  Image as ImageIcon,
  RefreshCw,
  Check,
  X
} from 'lucide-react';
import './BookmarkPanel.css';

const BookmarkPanel = ({ 
  view, 
  layerVisibility, 
  setLayerVisibility, 
  is3D, 
  setIs3D, 
  currentBasemap, 
  setCurrentBasemap,
  t = (k) => k,
  lang = 'EN'
}) => {
  const [bookmarks, setBookmarks] = useState(() => {
    const saved = localStorage.getItem('bsdi-bookmarks');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [viewState, setViewState] = useState('list'); // 'list', 'add'
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [title, setTitle] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [pendingFlyTo, setPendingFlyTo] = useState(null);

  // Apply pending fly-to when view becomes ready after a 2D/3D transition
  useEffect(() => {
    if (view && pendingFlyTo) {
      view.goTo({
        center: [pendingFlyTo.camera.lng, pendingFlyTo.camera.lat],
        zoom: pendingFlyTo.camera.zoom,
        heading: pendingFlyTo.camera.bearing,
        tilt: pendingFlyTo.camera.pitch
      }, {
        duration: 2000,
        easing: "ease-in-out"
      });
      setPendingFlyTo(null);
    }
  }, [view, pendingFlyTo]);

  // Persist bookmarks whenever they change
  useEffect(() => {
    localStorage.setItem('bsdi-bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const captureMapState = async () => {
    if (!view) return null;
    
    setIsCapturing(true);
    let thumbnail = '';
    
    try {
      const screenshot = await view.takeScreenshot({
        width: 300,
        height: 200,
        format: 'jpg',
        quality: 70
      });
      thumbnail = screenshot.dataUrl;
    } catch (err) {
      console.warn("Screenshot capture failed, using fallback:", err);
      thumbnail = '/assets/fallback.jpg'; // or empty
    }
    
    setIsCapturing(false);

    return {
      thumbnail,
      camera: {
        lat: view.center.latitude,
        lng: view.center.longitude,
        zoom: view.zoom,
        bearing: view.camera ? view.camera.heading : 0,
        pitch: view.camera ? view.camera.tilt : 0
      },
      layers: { ...layerVisibility },
      mapMode: is3D ? "3D" : "2D",
      basemap: currentBasemap,
      terrain: is3D // Implicit based on requirements
    };
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || title.length > 50) return;
    
    const isDuplicate = bookmarks.some(b => b.title.toLowerCase() === title.trim().toLowerCase());
    if (isDuplicate) {
      showToast(t('bookmarkDuplicateMsg'));
      return;
    }

    const stateData = await captureMapState();
    if (!stateData) return;

    const newBookmark = {
      id: crypto.randomUUID(),
      title: title.trim(),
      ...stateData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setBookmarks(prev => [newBookmark, ...prev]);
    setTitle('');
    setViewState('list');
    showToast(t('bookmarkAddedMsg'));
  };

  const handleUpdateMapState = async (id) => {
    const stateData = await captureMapState();
    if (!stateData) return;

    setBookmarks(prev => prev.map(b => 
      b.id === id 
        ? { ...b, ...stateData, updatedAt: new Date().toISOString() }
        : b
    ));
    showToast(t('bookmarkUpdatedMsg'));
  };

  const handleSaveInlineEdit = () => {
    if (!editTitle.trim() || editTitle.length > 50 || !editingId) return;

    const isDuplicate = bookmarks.some(b => b.id !== editingId && b.title.toLowerCase() === editTitle.trim().toLowerCase());
    if (isDuplicate) {
      showToast(t('bookmarkDuplicateMsg'));
      return;
    }

    setBookmarks(prev => prev.map(b => 
      b.id === editingId 
        ? { ...b, title: editTitle.trim(), updatedAt: new Date().toISOString() }
        : b
    ));
    
    setEditingId(null);
  };

  const handleDelete = (id) => {
    if (window.confirm(t('bookmarkDeleteConfirm'))) {
      setBookmarks(prev => prev.filter(b => b.id !== id));
      if (editingId === id) {
        setEditingId(null);
      }
    }
  };


  const applyBookmark = (bookmark) => {
    if (!view) return;
    
    // Restore basemap
    setCurrentBasemap(bookmark.basemap);
    
    // Restore 2D/3D mode
    const target3D = bookmark.mapMode === "3D";
    if (target3D !== is3D) {
      setIs3D(target3D);
    }
    
    // Restore layers
    setLayerVisibility(bookmark.layers);

    if (target3D !== is3D) {
      setPendingFlyTo(bookmark);
    } else {
      view.goTo({
        center: [bookmark.camera.lng, bookmark.camera.lat],
        zoom: bookmark.camera.zoom,
        heading: bookmark.camera.bearing,
        tilt: bookmark.camera.pitch
      }, {
        duration: 2000,
        easing: "ease-in-out"
      });
    }
  };

  // Render Add Form
  const renderForm = () => {
    const isInvalid = !title.trim() || title.length > 50;

    return (
      <div className="bookmark-form-container">
        <div className="bookmark-form-body">
          <div className="form-group">
            <label>{t('bookmarkTitleLabel')}</label>
            <input 
              type="text" 
              className="tool-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('bookmarkTitlePlaceholder')}
              maxLength={50}
            />
          </div>
          
          {isCapturing && (
            <div className="capture-loading">
              <div className="spinner"></div>
              <span>{t('bookmarkCapturing')}</span>
            </div>
          )}

          <div className="form-actions">
            <button className="secondary-btn" onClick={() => setViewState('list')} disabled={isCapturing}>
              {t('bookmarkCancelBtn')}
            </button>
            <button 
              className="primary-btn" 
              onClick={handleAddSubmit}
              disabled={isInvalid || isCapturing}
            >
              {t('bookmarkAddBtn')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render List / Empty State
  const renderList = () => {
    if (bookmarks.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-card">
            <div className="empty-icon-wrapper">
              <Bookmark size={32} />
            </div>
            <h3 className="empty-title">{t('bookmarkEmptyTitle')}</h3>
            <p className="empty-desc">{t('bookmarkEmptyDesc')}</p>
            <button className="primary-btn add-first-btn" onClick={() => { setTitle(''); setViewState('add'); }}>
              {t('bookmarkAddFirst')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="bookmark-list-container">
        <Reorder.Group axis="y" values={bookmarks} onReorder={setBookmarks} className="bookmark-list">
          {bookmarks.map((bookmark) => (
            <Reorder.Item key={bookmark.id} value={bookmark} className="bookmark-item">
              <div className="drag-handle">
                <GripVertical size={16} color="#94a3b8" />
              </div>
              
              <div className="bookmark-content" onClick={() => { if (editingId !== bookmark.id) applyBookmark(bookmark); }}>
                <div className="bookmark-thumb">
                  {bookmark.thumbnail && !bookmark.thumbnail.includes('fallback') ? (
                    <img src={bookmark.thumbnail} alt={bookmark.title} />
                  ) : (
                    <ImageIcon size={20} color="#cbd5e1" />
                  )}
                </div>
                
                {editingId === bookmark.id ? (
                  <div className="inline-edit-form">
                    <input 
                      type="text" 
                      className="inline-edit-input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveInlineEdit();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  </div>
                ) : (
                  <div className="bookmark-info">
                    <span className="bookmark-title">{bookmark.title}</span>
                    <span className="bookmark-meta">{bookmark.mapMode} • {bookmark.basemap.replace(/-/g, ' ')}</span>
                  </div>
                )}
              </div>
              
              <div className="bookmark-actions">
                {editingId === bookmark.id ? (
                  <>
                    <button 
                      className="action-btn update-state-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateMapState(bookmark.id);
                      }}
                      title={t('bookmarkUpdateTitle')}
                      disabled={isCapturing}
                    >
                      <RefreshCw size={14} className={isCapturing ? 'spinning' : ''} />
                    </button>
                    <button 
                      className="action-btn save-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveInlineEdit();
                      }}
                      title="Save"
                    >
                      <Check size={16} />
                    </button>
                    <button 
                      className="action-btn cancel-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                      title="Cancel"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      className="action-btn edit-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(bookmark.id);
                        setEditTitle(bookmark.title);
                      }}
                      title={t('bookmarkEditTitle')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button 
                      className="action-btn delete-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(bookmark.id);
                      }}
                      title={t('bookmarkDeleteTitle')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>

        <div className="bookmark-footer">
          <button className="primary-btn" onClick={() => { setTitle(''); setViewState('add'); }}>
            {t('bookmarkAddMore')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bookmark-panel-wrapper" dir={lang === 'AR' ? 'rtl' : 'ltr'}>
      {toastMessage && (
        <div className="bookmark-toast">
          {toastMessage}
        </div>
      )}
      {viewState === 'list' ? renderList() : renderForm()}
    </div>
  );
};

export default BookmarkPanel;

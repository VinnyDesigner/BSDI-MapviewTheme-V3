/**
 * UI Translations — Static text ONLY.
 * Dynamic data (layer.title, API values, coordinates) must NEVER be translated here.
 */

export const translations = {
  EN: {
    // ── Header ──────────────────────────────────────────
    appTitle:       'BSDI Smart Map Viewer',
    langToggle:     'العربية',

    // ── Bottom Toolbar — Tool names (tooltips) ───────────
    tools: {
      layers:       'Layers',
      search:       'Search',
      navigation:   'Navigation',
      measure:      'Measure',
      draw:         'Draw',
      cad:          'CAD',
      data_request: 'Data Request',
      external_data:'External Data',
      print:        'Print',
      bookmark:     'Bookmark',
      identify:     'Identify',
      split:        'Swipe',
      basemap:      'Basemaps',
    },

    // ── Panel titles ─────────────────────────────────────
    panelTitles: {
      layers:       'Layers',
      search:       'Search',
      measure:      'Measure',
      draw:         'Draw',
      print:        'Print',
      bookmark:     'Bookmark',
      navigation:   'Navigation',
      cad:          'CAD',
      data_request: 'Data Request',
      external_data:'External Data',
      identify:     'Identify',
      split:        'Swipe',
      basemap:      'Basemaps',
    },

    // ── Layers panel ─────────────────────────────────────
    layersPanelDesc:  'Manage map layer visibility:',

    // ── Basemap panel ────────────────────────────────────
    basemapDesc:      'Select a basemap style:',

    // ── Search panel ─────────────────────────────────────
    searchPlaceholder: 'Search locations...',
    searchBtn:         'Search',
    searchHint:        'Try searching for "Bahrain" or "Manama"',

    // ── Measure panel ────────────────────────────────────
    measureDistance:   'Distance',
    measureArea:       'Area',
    measureHint:       'Select a measurement type and click on the map.',

    // ── Draw panel ───────────────────────────────────────
    drawPoint:    'Point',
    drawLine:     'Line',
    drawPolygon:  'Polygon',

    // ── Print panel ──────────────────────────────────────
    printFormat:      'Format',
    printExportBtn:   'Export Map',

    // ── Identify panel ───────────────────────────────────
    identifyHint:     'Click on the map to identify features and view detailed information.',
    identifyActive:   'Identify mode active',

    // ── Split Map panel ──────────────────────────────────
    splitPanelDesc:   'Swipe between layers or time periods using the divider.',
    splitLeftLayer:   'Left Side Layer / Year',
    splitRightLayer:  'Right Side Layer / Year',
    splitTimeLabel:   'Time-Based Comparison',
    splitLayerLabel:  'Standard Layer Comparison',

    // ── Generic panel ────────────────────────────────────
    comingSoon:       'Configuration for',
    comingSoonSuffix: 'will be available soon.',

    // ── Map Info Widget ──────────────────────────────────
    coordX:     'X:',
    coordY:     'Y:',
    scale:      'Scale 1:',
    unitKm:     'km',
    unitM:      'm',

    // ── Map Controls ─────────────────────────────────────
    zoomIn:     'Zoom In',
    zoomOut:    'Zoom Out',
    home:       'Home',
    identify:   'Identify',
    pan:        'Pan',
    view2D:     '2D View',
    view3D:     '3D View',

    // ── Side Panel ───────────────────────────────────────
    closePanel:     'Close panel',
    minimizePanel:  'Minimize panel',
  },

  AR: {
    // ── Header ──────────────────────────────────────────
    appTitle:       'عارض الخرائط الذكي BSDI',
    langToggle:     'English',

    // ── Bottom Toolbar — Tool names (tooltips) ───────────
    tools: {
      layers:       'الطبقات',
      search:       'بحث',
      navigation:   'التنقل',
      measure:      'قياس',
      draw:         'رسم',
      cad:          'CAD',
      data_request: 'طلب البيانات',
      external_data:'بيانات خارجية',
      print:        'طباعة',
      bookmark:     'إشارة مرجعية',
      identify:     'تحديد',
      split:        'مسح',
      basemap:      'خرائط الأساس',
    },

    // ── Panel titles ─────────────────────────────────────
    panelTitles: {
      layers:       'الطبقات',
      search:       'بحث',
      measure:      'قياس',
      draw:         'رسم',
      print:        'طباعة',
      bookmark:     'إشارة مرجعية',
      navigation:   'التنقل',
      cad:          'CAD',
      data_request: 'طلب البيانات',
      external_data:'بيانات خارجية',
      identify:     'تحديد',
      split:        'مسح',
      basemap:      'خرائط الأساس',
    },

    // ── Layers panel ─────────────────────────────────────
    layersPanelDesc:  'إدارة رؤية طبقات الخريطة:',

    // ── Basemap panel ────────────────────────────────────
    basemapDesc:      'اختر نمط خريطة الأساس:',

    // ── Search panel ─────────────────────────────────────
    searchPlaceholder: 'البحث عن مواقع...',
    searchBtn:         'بحث',
    searchHint:        'جرّب البحث عن "البحرين" أو "المنامة"',

    // ── Measure panel ────────────────────────────────────
    measureDistance:   'المسافة',
    measureArea:       'المساحة',
    measureHint:       'اختر نوع القياس ثم انقر على الخريطة.',

    // ── Draw panel ───────────────────────────────────────
    drawPoint:    'نقطة',
    drawLine:     'خط',
    drawPolygon:  'مضلع',

    // ── Print panel ──────────────────────────────────────
    printFormat:      'التنسيق',
    printExportBtn:   'تصدير الخريطة',

    // ── Identify panel ───────────────────────────────────
    identifyHint:     'انقر على الخريطة لتحديد المعالم وعرض معلومات تفصيلية.',
    identifyActive:   'وضع التحديد نشط',

    // ── Split Map panel ──────────────────────────────────
    splitPanelDesc:   'امسح بين الطبقات أو الفترات الزمنية باستخدام الفاصل.',
    splitLeftLayer:   'طبقة / سنة الجانب الأيسر',
    splitRightLayer:  'طبقة / سنة الجانب الأيمن',
    splitTimeLabel:   'مقارنة زمنية',
    splitLayerLabel:  'مقارنة الطبقات القياسية',

    // ── Generic panel ────────────────────────────────────
    comingSoon:       'إعدادات',
    comingSoonSuffix: 'ستكون متاحة قريباً.',

    // ── Map Info Widget ──────────────────────────────────
    coordX:     ':X',
    coordY:     ':Y',
    scale:      'المقياس 1:',
    unitKm:     'كم',
    unitM:      'م',

    // ── Map Controls ─────────────────────────────────────
    zoomIn:     'تكبير',
    zoomOut:    'تصغير',
    home:       'الرئيسية',
    identify:   'تحديد',
    pan:        'تحريك',
    view2D:     'عرض ثنائي الأبعاد',
    view3D:     'عرض ثلاثي الأبعاد',

    // ── Side Panel ───────────────────────────────────────
    closePanel:     'إغلاق اللوحة',
    minimizePanel:  'تصغير اللوحة',
  },
};

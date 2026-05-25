/**
 * GP Parameter Parser
 * ──────────────────────────────────────────────────────────────────────────
 * Converts raw ArcGIS GP service parameter metadata (from ?f=pjson) into
 * normalized descriptor objects understood by GPFormRenderer.
 *
 * ESRI dataType → internal widgetType mapping:
 *
 *   GPDouble, GPFloat, GPLong, GPLinearUnit
 *     → NumberInput
 *   GPString
 *     → TextInput | Select (when choiceList is present)
 *   GPBoolean
 *     → Toggle
 *   GPDate
 *     → DatePicker
 *   GPFeatureRecordSetLayer, GPRecordSet
 *     → LayerPicker
 *   GPRasterDataLayer, GPRasterLayer
 *     → RasterPicker (falls back to TextInput for URL)
 *   GPDataFile, GPComposite
 *     → FileUpload
 *   DEWorkspace, DEFile
 *     → TextInput (path entry)
 *   GPMultiValue (wraps another type)
 *     → MultiInput (array of the inner widgetType)
 *   (unknown)
 *     → TextInput
 *
 * Also applied to hand-authored manifest parameter descriptors that already
 * use `widgetType` — those pass through unchanged.
 */

const DATA_TYPE_MAP = {
  GPDouble: 'NumberInput',
  GPFloat: 'NumberInput',
  GPLong: 'NumberInput',
  GPLinearUnit: 'NumberInput',
  GPString: 'TextInput',
  GPBoolean: 'Toggle',
  GPDate: 'DatePicker',
  GPFeatureRecordSetLayer: 'LayerPicker',
  GPRecordSet: 'LayerPicker',
  GPRasterDataLayer: 'RasterPicker',
  GPRasterLayer: 'RasterPicker',
  GPDataFile: 'FileUpload',
  GPComposite: 'FileUpload',
  DEWorkspace: 'TextInput',
  DEFile: 'TextInput',
};

/**
 * Normalize a single raw ESRI parameter descriptor (from ?f=pjson).
 * @param {Object} raw  – raw parameter object from ArcGIS rest API
 * @returns {Object}    – normalized param descriptor
 */
export function parseGPParam(raw) {
  // Pass through already-normalized descriptors
  if (raw.widgetType) return raw;

  const isMultiValue = raw.dataType?.startsWith('GPMultiValue:');
  const innerType = isMultiValue ? raw.dataType.replace('GPMultiValue:', '') : raw.dataType;
  let widgetType = DATA_TYPE_MAP[innerType] || 'TextInput';
  if (isMultiValue) widgetType = 'MultiInput';

  // Demote GPString to Select when a choiceList is provided
  if (widgetType === 'TextInput' && raw.choiceList?.length > 0) {
    widgetType = 'Select';
  }

  return {
    name: raw.name,
    label: raw.displayName || raw.name,
    widgetType,
    innerWidgetType: isMultiValue ? (DATA_TYPE_MAP[innerType] || 'TextInput') : undefined,
    required: raw.parameterType === 'esriGPParameterTypeRequired',
    direction: raw.direction || 'esriGPParameterDirectionInput',
    defaultValue: raw.defaultValue ?? raw.value ?? null,
    choiceList: raw.choiceList || [],
    category: raw.category || '',
    description: raw.description || '',
    dataType: raw.dataType,
    // preserve original for debugging
    _raw: raw,
  };
}

/**
 * Fetch GP service metadata and return normalized parameter descriptors.
 * @param {string} serviceUrl  – base GP service URL (no trailing slash, no ?f=pjson)
 * @returns {Promise<{ serviceInfo: Object, params: Object[] }>}
 */
export async function fetchAndParseGPMetadata(serviceUrl) {
  const url = serviceUrl.endsWith('/') ? serviceUrl.slice(0, -1) : serviceUrl;
  const resp = await fetch(`${url}?f=pjson`);
  if (!resp.ok) throw new Error(`GP metadata fetch failed: ${resp.status}`);
  const json = await resp.json();

  const rawParams = json.parameters || [];
  const inputParams = rawParams
    .filter(p => p.direction !== 'esriGPParameterDirectionOutput')
    .map(parseGPParam);

  const outputParams = rawParams
    .filter(p => p.direction === 'esriGPParameterDirectionOutput')
    .map(parseGPParam);

  return {
    serviceInfo: json,
    inputParams,
    outputParams,
  };
}

export default parseGPParam;

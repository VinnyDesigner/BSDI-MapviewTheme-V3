/**
 * CRS Utilities for GeoJSON Export
 * ──────────────────────────────────────────────────────────────────────────
 * Converts ArcGIS spatialReference WKIDs into the GeoJSON CRS member format
 * understood by QGIS, ArcGIS Pro, FME, and other GIS software.
 *
 * GeoJSON spec (RFC 7946) uses WGS84 (EPSG:4326) by default and deprecated
 * the `crs` key, but the named CRS object is still widely supported and
 * required by many GIS tools to correctly identify non-WGS84 projections.
 *
 * CRS format used:
 *   {
 *     "type": "name",
 *     "properties": { "name": "urn:ogc:def:crs:EPSG::4326" }
 *   }
 */

/**
 * Well-known WKID → EPSG code overrides.
 * ArcGIS uses its own WKIDs that differ from EPSG for some projections.
 */
const WKID_TO_EPSG = {
  // Web Mercator variants
  102100: 3857,
  102113: 3857,
  3857:   3857,
  900913: 3857,

  // Geographic WGS84
  4326:   4326,
  4269:   4269,   // NAD83

  // Bahrain / Arabian Peninsula
  20439: 20439,  // Ain el Abd / UTM Zone 39N
  20440: 20440,  // Ain el Abd / UTM Zone 40N
  32639: 32639,  // WGS84 / UTM Zone 39N
  32640: 32640,  // WGS84 / UTM Zone 40N
  4087:  4087,   // WGS 84 / Equal Earth Greenwich
};

/**
 * Resolve the EPSG code from an ArcGIS spatialReference object or raw WKID.
 * @param {Object|number|null} spatialRef  – ArcGIS spatialReference or WKID integer
 * @returns {number}  – EPSG code (defaults to 4326)
 */
export function resolveEpsg(spatialRef) {
  if (!spatialRef) return 4326;
  const wkid = typeof spatialRef === 'number'
    ? spatialRef
    : (spatialRef.latestWkid || spatialRef.wkid || 4326);
  return WKID_TO_EPSG[wkid] ?? wkid;
}

/**
 * Build a GeoJSON CRS member object for a given EPSG code.
 * @param {number} epsg
 * @returns {Object}  – GeoJSON CRS object
 */
export function buildCrsObject(epsg) {
  return {
    type: 'name',
    properties: {
      name: `urn:ogc:def:crs:EPSG::${epsg}`,
    },
  };
}

/**
 * Wrap a features array into a GeoJSON FeatureCollection with proper CRS.
 * @param {Object[]} features           – GeoJSON Feature array
 * @param {Object|number|null} spatialRef – ArcGIS spatialReference or WKID
 * @returns {Object}  – GeoJSON FeatureCollection with crs member
 */
export function buildGeoJSON(features, spatialRef) {
  const epsg = resolveEpsg(spatialRef);
  const crs  = buildCrsObject(epsg);

  // Validate and filter features to ensure they have valid, finite coordinates
  const validFeatures = (features || []).filter(feat => {
    if (!feat || typeof feat !== 'object') return false;
    if (feat.type !== 'Feature') return false;
    if (!feat.geometry || !feat.geometry.coordinates) return false;
    
    const coords = feat.geometry.coordinates;
    if (Array.isArray(coords)) {
      if (coords.length === 0) return false;
      const checkCoords = (c) => {
        if (typeof c === 'number') return isFinite(c);
        if (Array.isArray(c)) return c.every(checkCoords);
        return false;
      };
      return checkCoords(coords);
    }
    return false;
  });

  return {
    type: 'FeatureCollection',
    crs,
    features: validFeatures,
  };
}

/**
 * Convert an ArcGIS Graphic's geometry to a GeoJSON geometry object.
 * Handles point, polyline, polygon, and multipoint.
 * For projected CRS (not 4326), coordinates remain in native projection units.
 *
 * @param {Object} geometry  – ArcGIS geometry object
 * @returns {Object|null}    – GeoJSON geometry or null
 */
export function esriGeometryToGeoJSON(geometry) {
  if (!geometry) return null;

  switch (geometry.type) {
    case 'point':
      return {
        type: 'Point',
        coordinates: [
          geometry.longitude ?? geometry.x,
          geometry.latitude  ?? geometry.y,
        ],
      };

    case 'multipoint':
      return {
        type: 'MultiPoint',
        coordinates: (geometry.points || []).map(p => [p[0], p[1]]),
      };

    case 'polyline':
      if (geometry.paths?.length === 1) {
        return { type: 'LineString',      coordinates: geometry.paths[0] };
      }
      return { type: 'MultiLineString',   coordinates: geometry.paths || [] };

    case 'polygon':
      if (geometry.rings?.length === 1) {
        return { type: 'Polygon',         coordinates: geometry.rings };
      }
      return { type: 'MultiPolygon',      coordinates: (geometry.rings || []).map(r => [r]) };

    default:
      return null;
  }
}

/**
 * Convert an array of ArcGIS Graphics to a GeoJSON FeatureCollection
 * with correct CRS metadata derived from the first graphic's spatialReference.
 *
 * @param {Object[]} graphics       – array of ArcGIS Graphic objects
 * @param {Object|null} viewSpatialRef – fallback from view.spatialReference
 * @returns {Object}  – GeoJSON FeatureCollection
 */
export function graphicsToGeoJSON(graphics, viewSpatialRef = null) {
  const firstSR = graphics[0]?.geometry?.spatialReference ?? viewSpatialRef;

  const features = graphics.map(g => ({
    type: 'Feature',
    geometry: esriGeometryToGeoJSON(g.geometry),
    properties: { ...(g.attributes || {}) },
  }));

  return buildGeoJSON(features, firstSR);
}

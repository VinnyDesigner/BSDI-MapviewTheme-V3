/**
 * GP Tool Registry
 * ──────────────────────────────────────────────────────────────────────────
 * Central manifest store for every Geoprocessing tool.
 * Tools are keyed by a stable toolId string.
 *
 * Each manifest contains:
 *  - meta        : display metadata
 *  - execution   : how/where to run the tool
 *  - parameters  : array of parameter descriptors (drives dynamic form)
 *  - outputs     : describes what the tool produces (drives result renderer)
 *
 * The registry is intentionally data-driven — no tool-specific React code lives here.
 */

const GP_TOOL_REGISTRY = {};

/**
 * Register one or more tool manifests.
 * @param {Object|Object[]} manifests
 */
export function registerGPTool(manifests) {
  const arr = Array.isArray(manifests) ? manifests : [manifests];
  arr.forEach(m => {
    if (!m.toolId) throw new Error('GP manifest must have a toolId');
    GP_TOOL_REGISTRY[m.toolId] = m;
  });
}

/** Return all registered manifests as an array */
export function getAllGPTools() {
  return Object.values(GP_TOOL_REGISTRY);
}

/** Return a single manifest by toolId */
export function getGPTool(toolId) {
  return GP_TOOL_REGISTRY[toolId] || null;
}

/** Check whether any tools are registered */
export function hasGPTools() {
  return Object.keys(GP_TOOL_REGISTRY).length > 0;
}

export default GP_TOOL_REGISTRY;

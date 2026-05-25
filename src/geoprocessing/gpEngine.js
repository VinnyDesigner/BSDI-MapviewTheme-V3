/**
 * GP Execution Engine
 * ──────────────────────────────────────────────────────────────────────────
 * Handles both synchronous and asynchronous (job-based) GP service execution.
 *
 * Supports:
 *  - ArcGIS Server GP Services  (REST API, synchronous & async)
 *  - Custom REST APIs           (via `executionMode: 'custom'` in manifest)
 *
 * Usage:
 *   const engine = new GPExecutionEngine(manifest);
 *   const result = await engine.run(paramValues, { onStatusUpdate });
 */

/** Default polling interval for async jobs (ms) */
const POLL_INTERVAL_MS = 2000;

/** How many times to retry a failing status poll */
const MAX_POLL_RETRIES = 3;

export class GPExecutionEngine {
  /**
   * @param {Object} manifest  – tool manifest from gpRegistry
   */
  constructor(manifest) {
    this.manifest = manifest;
    this._abortController = null;
  }

  /**
   * Execute the tool.
   * @param {Object} paramValues       – { paramName: value, ... }
   * @param {Object} [opts]
   * @param {Function} [opts.onStatusUpdate]   – called with { status, jobId?, message, progress? }
   * @returns {Promise<Object>}        – { success, outputs, jobId?, raw }
   */
  async run(paramValues, opts = {}) {
    const { onStatusUpdate = () => {} } = opts;
    this._abortController = new AbortController();

    const { execution } = this.manifest;

    if (execution.mode === 'custom') {
      return this._runCustom(paramValues, onStatusUpdate);
    }

    // ArcGIS GP REST
    const serviceUrl = execution.serviceUrl.replace(/\/$/, '');
    const isAsync = execution.executionType === 'esriExecutionTypeAsynchronous';

    onStatusUpdate({ status: 'submitting', message: 'Submitting job…' });

    if (isAsync) {
      return this._runAsync(serviceUrl, paramValues, onStatusUpdate);
    } else {
      return this._runSync(serviceUrl, paramValues, onStatusUpdate);
    }
  }

  /** Cancel any in-flight request or polling */
  cancel() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._cancelled = true;
  }

  // ── Synchronous execution ──────────────────────────────────────────────

  async _runSync(serviceUrl, paramValues, onStatusUpdate) {
    const body = this._buildFormBody(paramValues);
    const resp = await fetch(`${serviceUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: this._abortController?.signal,
    });
    if (!resp.ok) throw new Error(`GP execute failed: ${resp.status}`);
    const json = await resp.json();

    if (json.error) throw new Error(json.error.message || 'GP error');

    onStatusUpdate({ status: 'succeeded', message: 'Completed' });
    return this._normalizeOutputs(json.results || [], json.messages || []);
  }

  // ── Asynchronous job execution ─────────────────────────────────────────

  async _runAsync(serviceUrl, paramValues, onStatusUpdate) {
    // 1. Submit job
    const body = this._buildFormBody(paramValues);
    const submitResp = await fetch(`${serviceUrl}/submitJob`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: this._abortController?.signal,
    });
    if (!submitResp.ok) throw new Error(`GP submitJob failed: ${submitResp.status}`);
    const submitJson = await submitResp.json();
    if (submitJson.error) throw new Error(submitJson.error.message || 'GP submitJob error');

    const jobId = submitJson.jobId;
    onStatusUpdate({ status: 'submitted', jobId, message: `Job submitted (${jobId})`, progress: 0 });

    // 2. Poll status
    const finalStatus = await this._pollJobStatus(serviceUrl, jobId, onStatusUpdate);

    // 3. Fetch output results
    const outputDefs = this.manifest.outputs || [];
    const outputs = [];
    for (const out of outputDefs) {
      try {
        const outResp = await fetch(
          `${serviceUrl}/jobs/${jobId}/results/${out.name}?f=pjson`,
          { signal: this._abortController?.signal }
        );
        if (outResp.ok) {
          const outJson = await outResp.json();
          outputs.push({ name: out.name, value: outJson.value, paramType: outJson.paramType });
        }
      } catch (_) { /* skip failed output */ }
    }

    return {
      success: finalStatus === 'esriJobSucceeded',
      jobId,
      outputs,
      messages: finalStatus.messages || [],
      raw: { finalStatus },
    };
  }

  async _pollJobStatus(serviceUrl, jobId, onStatusUpdate) {
    let retries = 0;
    let progress = 5;

    while (!this._cancelled) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      let statusJson;
      try {
        const statusResp = await fetch(
          `${serviceUrl}/jobs/${jobId}?f=pjson`,
          { signal: this._abortController?.signal }
        );
        statusJson = await statusResp.json();
        retries = 0;
      } catch (err) {
        if (this._cancelled) break;
        retries++;
        if (retries >= MAX_POLL_RETRIES) throw new Error('GP polling exceeded max retries');
        continue;
      }

      const jobStatus = statusJson.jobStatus;
      const messages = statusJson.messages || [];
      progress = Math.min(progress + 10, 90);

      onStatusUpdate({ status: jobStatus, jobId, messages, progress });

      if (jobStatus === 'esriJobSucceeded') return jobStatus;
      if (
        jobStatus === 'esriJobFailed' ||
        jobStatus === 'esriJobTimedOut' ||
        jobStatus === 'esriJobCancelled'
      ) {
        const msg = messages[messages.length - 1]?.description || jobStatus;
        throw new Error(`GP job failed: ${msg}`);
      }
    }
    throw new Error('GP job was cancelled');
  }

  // ── Custom REST API execution ──────────────────────────────────────────

  async _runCustom(paramValues, onStatusUpdate) {
    const { execution } = this.manifest;
    const url = execution.customUrl;
    const method = execution.method || 'POST';

    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(execution.headers || {}) },
      body: method !== 'GET' ? JSON.stringify(paramValues) : undefined,
      signal: this._abortController?.signal,
    });
    if (!resp.ok) throw new Error(`Custom GP API failed: ${resp.status}`);
    const json = await resp.json();

    onStatusUpdate({ status: 'succeeded', message: 'Completed' });
    return {
      success: true,
      outputs: execution.outputMapper ? execution.outputMapper(json) : [{ name: 'result', value: json }],
      raw: json,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  _buildFormBody(paramValues) {
    const params = new URLSearchParams();
    params.append('f', 'pjson');
    params.append('env:outSR', '102100'); // Web Mercator by default

    for (const [key, value] of Object.entries(paramValues)) {
      if (value === null || value === undefined || value === '') continue;
      // Feature record sets need to be serialized as JSON
      if (typeof value === 'object' && !Array.isArray(value)) {
        params.append(key, JSON.stringify(value));
      } else {
        params.append(key, String(value));
      }
    }
    return params.toString();
  }

  _normalizeOutputs(rawResults, messages) {
    return {
      success: true,
      outputs: rawResults.map(r => ({
        name: r.paramName,
        value: r.value,
        dataType: r.dataType,
      })),
      messages,
      raw: rawResults,
    };
  }
}

export default GPExecutionEngine;

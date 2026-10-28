/**
 * SheetMind 协作服务 — 前端 GAS Web App 通信层
 * 
 * 功能：
 * - 连接 GAS Web App 进行协作读写
 * - 自动轮询 SM_ 列变更
 * - 合并去重逻辑（与 GAS 端一致）
 */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SMRowData {
  __rowIndex: number;
  SM_ID?: string;
  SM_分类?: string;
  SM_备注?: string;
  SM_标签?: string;
  SM_用户?: string;
  [key: string]: string | number | undefined;
}

export interface PullResponse {
  columns: string[];
  rows: Array<Record<string, string> & { __rowIndex: number }>;
  sheetName: string;
  smColumns: string[];
  timestamp: string;
}

export interface PullSMResponse {
  rows: SMRowData[];
  sheetName: string;
  timestamp: string;
}

export interface UpdateResult {
  ok: boolean;
  id: string;
  rowIndex?: number;
  updated: Record<string, string>;
  error?: string;
}

export interface BatchUpdateResult {
  ok: boolean;
  count: number;
  results: Array<{ id: string; rowIndex?: number; updated?: Record<string, string>; error?: string }>;
}

export interface ExportGroupSheetsResult {
  ok: boolean;
  count: number;
  totalRows: number;
  results: Array<{ name: string; ok: boolean; rows?: number; error?: string }>;
  error?: string;
}

export type CollabStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface CollabConfig {
  webAppUrl: string;
  sheetName?: string;
  sheetNames?: string[];   // 合并模式下的多分页名称列表
  userName: string;
  pollIntervalMs: number;  // 轮询间隔（毫秒）
}

type SMChangeListener = (data: SMRowData[]) => void;
type StatusChangeListener = (status: CollabStatus, error?: string) => void;

// ─────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────

const COLLAB_CONFIG_KEY = 'sheetmind_collab_config';

export function saveCollabConfig(config: Partial<CollabConfig>): void {
  try {
    const existing = loadCollabConfig();
    const merged = { ...existing, ...config };
    localStorage.setItem(COLLAB_CONFIG_KEY, JSON.stringify(merged));
  } catch { /* ignore */ }
}

export function loadCollabConfig(): Partial<CollabConfig> {
  try {
    const saved = localStorage.getItem(COLLAB_CONFIG_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return {};
}

export function clearCollabConfig(): void {
  try {
    localStorage.removeItem(COLLAB_CONFIG_KEY);
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────
// GAS Collab Service
// ─────────────────────────────────────────────

export class GASCollabService {
  private config: CollabConfig;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  private consecutivePollFailures = 0;
  private status: CollabStatus = 'disconnected';
  private lastTimestamp: string = '';
  private lastTimestamps: Map<string, string> = new Map(); // 多分页各自的时间戳

  private smListeners: Set<SMChangeListener> = new Set();
  private statusListeners: Set<StatusChangeListener> = new Set();

  constructor(config?: Partial<CollabConfig>) {
    const saved = loadCollabConfig();
    this.config = {
      webAppUrl: config?.webAppUrl || saved.webAppUrl || '',
      sheetName: config?.sheetName || saved.sheetName,
      sheetNames: config?.sheetNames || saved.sheetNames,
      userName: config?.userName || saved.userName || '匿名用户',
      pollIntervalMs: config?.pollIntervalMs || saved.pollIntervalMs || 5000,
    };
  }

  // ── 配置 ──

  getConfig(): CollabConfig {
    return { ...this.config };
  }

  setConfig(updates: Partial<CollabConfig>): void {
    Object.assign(this.config, updates);
    saveCollabConfig(this.config);
  }

  getStatus(): CollabStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  // ── 事件监听 ──

  onSMChange(listener: SMChangeListener): () => void {
    this.smListeners.add(listener);
    return () => this.smListeners.delete(listener);
  }

  onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: CollabStatus, error?: string): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach(fn => fn(status, error));
  }

  private markConnectionError(message: string): void {
    this.stopPolling();
    this.setStatus('error', message.startsWith('连接失败') ? message : `连接失败: ${message}`);
  }

  private notifySMChange(data: SMRowData[]): void {
    this.smListeners.forEach(fn => fn(data));
  }

  // ── 连接管理 ──

  async connect(): Promise<boolean> {
    if (!this.config.webAppUrl) {
      this.setStatus('error', '未配置 Web App URL');
      return false;
    }

    const urlError = this.getWebAppUrlError();
    if (urlError) {
      this.setStatus('error', urlError);
      return false;
    }

    this.setStatus('connecting');

    try {
      // 测试连接
      const response = await this.fetchGAS('GET', { action: 'ping' });
      if (response.ok) {
        const capabilities = Array.isArray(response.capabilities)
          ? response.capabilities.map(String)
          : [];
        if (!capabilities.includes('exportGroupSheets')) {
          this.markConnectionError(
            '后端脚本不是最新版。请重新复制 Code.gs，并在“管理部署”中选择新版本后部署'
          );
          return false;
        }
        this.setStatus('connected');
        saveCollabConfig(this.config);
        this.startPolling();
        return true;
      } else {
        this.setStatus('error', '连接失败');
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = msg.includes('Failed to fetch')
        ? '连接失败: 网络错误。请检查：1) URL 以 /exec 结尾 2) 部署为"任何人"可访问 3) 已部署新版本'
        : `连接失败: ${msg}`;
      this.setStatus('error', hint);
      return false;
    }
  }

  disconnect(): void {
    this.stopPolling();
    this.setStatus('disconnected');
  }

  // ── 轮询 ──

  /**
   * 获取需要轮询的分页列表
   * 合并模式下返回所有选中的分页；否则返回单个分页
   */
  private getActiveSheetNames(): string[] {
    if (this.config.sheetNames && this.config.sheetNames.length > 0) {
      return this.config.sheetNames;
    }
    return this.config.sheetName ? [this.config.sheetName] : [];
  }

  startPolling(): void {
    this.stopPolling();
    // 连接成功先让界面完成响应，协作数据在下一轮后台同步。
    this.pollTimer = setInterval(() => {
      this.pollSMColumns();
    }, this.config.pollIntervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollSMColumns(): Promise<void> {
    if (!this.config.webAppUrl || this.status === 'disconnected' || this.pollInFlight) return;

    const sheets = this.getActiveSheetNames();
    if (sheets.length === 0) return;

    // 多分页并行轮询，合并所有 SM_ 数据
    this.pollInFlight = true;
    try {
      const allRows: SMRowData[] = [];
      let anyChanged = false;
      let successfulRequests = 0;

      const results = await Promise.allSettled(
        sheets.map(async (sheetName) => {
          const response = await this.fetchGAS('POST', {
            action: 'pullSM',
            sheet: sheetName,
          }, 20000, false) as unknown as PullSMResponse;
          return { sheetName, response };
        })
      );

      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        successfulRequests += 1;
        const { sheetName, response } = result.value;

        if (response.rows && response.rows.length > 0) {
          const newTimestamp: string = response.timestamp || '';
          const prevTimestamp = this.lastTimestamps.get(sheetName) || '';
          if (newTimestamp !== prevTimestamp) {
            this.lastTimestamps.set(sheetName, newTimestamp);
            anyChanged = true;
          }
          // 为每行标记来源分页，使上层能区分
          response.rows.forEach(row => {
            (row as SMRowData & { _sourceSheet?: string })._sourceSheet = sheetName;
            allRows.push(row);
          });
        }
      }

      if (anyChanged && allRows.length > 0) {
        this.notifySMChange(allRows);
      }

      // 兼容旧逻辑：单分页时保持 lastTimestamp
      if (sheets.length === 1) {
        this.lastTimestamp = this.lastTimestamps.get(sheets[0]) || '';
      }

      if (successfulRequests === 0) {
        this.consecutivePollFailures += 1;
        if (this.consecutivePollFailures >= 3) {
          this.markConnectionError('连续 3 次后台同步均失败');
        }
      } else {
        this.consecutivePollFailures = 0;
        if (this.status === 'error') {
          this.setStatus('connected');
        }
      }
    } catch (err) {
      console.warn('[Collab] 轮询失败:', err);
    } finally {
      this.pollInFlight = false;
    }
  }

  // ── 数据操作 ──

  /**
   * 拉取完整数据（首次加载用）
   */
  async pullFullData(sheetName?: string): Promise<PullResponse | null> {
    const sheet = sheetName || this.config.sheetName || '';
    try {
      const response = await this.fetchGAS('GET', {
        action: 'pull',
        sheet,
      });
      return response as unknown as PullResponse;
    } catch (err) {
      console.error('[Collab] 拉取数据失败:', err);
      return null;
    }
  }

  /**
   * 列出所有 Sheet
   */
  async listSheets(): Promise<Array<{ name: string; rowCount: number; colCount: number }>> {
    try {
      const response = await this.fetchGAS('GET', { action: 'sheets' }) as unknown as { sheets?: Array<{ name: string; rowCount: number; colCount: number }> };
      return response.sheets || [];
    } catch (err) {
      console.error('[Collab] 获取 Sheet 列表失败:', err);
      return [];
    }
  }

  /**
   * 在协作连接的真实 Google Spreadsheet 中创建分页并写入分组数据。
   */
  async exportGroupSheets(
    sheets: Array<{ name: string; columns: string[]; rows: Array<Record<string, unknown>> }>,
    conflictMode: 'copy' | 'append' | 'replace' = 'copy'
  ): Promise<ExportGroupSheetsResult | null> {
    try {
      const totalCells = sheets.reduce(
        (sum, sheet) => sum + sheet.columns.length * Math.max(1, sheet.rows.length),
        0
      );
      const writeTimeoutMs = Math.min(
        300000,
        Math.max(30000, 30000 + Math.ceil(totalCells / 10000) * 4000)
      );
      const response = await this.fetchGAS('POST', {
        action: 'exportGroupSheets',
        sheets,
        conflictMode,
        user: this.config.userName || '匿名用户',
      }, writeTimeoutMs, false);
      return response as unknown as ExportGroupSheetsResult;
    } catch (err) {
      console.error('[Collab] exportGroupSheets failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        count: 0,
        totalRows: 0,
        results: [],
        error: errorMessage,
      };
    }
  }

  /**
   * 更新单行 SM_ 数据（支持 SM_ID 或 rowIndex）
   * @param targetSheet 可选：目标分页名。合并模式下从 _sourceSheet 传入
   */
  async updateRow(
    target: { id?: string; rowIndex?: number },
    updates: { SM_分类?: string; SM_备注?: string; SM_标签?: string },
    targetSheet?: string
  ): Promise<UpdateResult | null> {
    try {
      const sheet = targetSheet || this.config.sheetName || '';
      const response = await this.fetchGAS('POST', {
        action: 'update',
        sheet,
        id: target.id || '',
        rowIndex: target.rowIndex || 0,
        updates,
        user: this.config.userName || '匿名用户',
      });
      return response as unknown as UpdateResult;
    } catch (err) {
      console.error('[Collab] 更新行失败:', err);
      return null;
    }
  }

  /**
   * 批量更新多行 SM_ 数据
   * @param targetSheet 可选：目标分页名。合并模式下按分页分组调用
   */
  async batchUpdateRows(
    rows: Array<{
      id?: string;
      rowIndex?: number;
      updates: { SM_分类?: string; SM_备注?: string; SM_标签?: string };
      _sourceSheet?: string; // 合并模式下行的来源分页
    }>,
    targetSheet?: string
  ): Promise<BatchUpdateResult | null> {
    // 如果行带有 _sourceSheet 且没有统一 targetSheet，按分页分组发送
    const hasMultipleSheets = !targetSheet && rows.some(r => r._sourceSheet);
    if (hasMultipleSheets) {
      return this.batchUpdateMultiSheet(rows);
    }

    try {
      const sheet = targetSheet || this.config.sheetName || '';
      const response = await this.fetchGAS('POST', {
        action: 'batchUpdate',
        sheet,
        user: this.config.userName || '匿名用户',
        rows: rows.map(({ _sourceSheet, ...rest }) => rest), // 清除内部字段
      });
      return response as unknown as BatchUpdateResult;
    } catch (err) {
      console.error('[Collab] 批量更新失败:', err);
      return null;
    }
  }

  /**
   * 多分页批量更新：按 _sourceSheet 分组，分别发送请求
   */
  private async batchUpdateMultiSheet(
    rows: Array<{
      id?: string;
      rowIndex?: number;
      updates: { SM_分类?: string; SM_备注?: string; SM_标签?: string };
      _sourceSheet?: string;
    }>
  ): Promise<BatchUpdateResult | null> {
    // 按分页分组
    const bySheet = new Map<string, typeof rows>();
    const fallbackSheet = this.config.sheetName || '';
    for (const row of rows) {
      const sheet = row._sourceSheet || fallbackSheet;
      if (!bySheet.has(sheet)) bySheet.set(sheet, []);
      bySheet.get(sheet)!.push(row);
    }

    let totalOk = true;
    let totalCount = 0;
    const allResults: Array<{ id: string; rowIndex?: number; updated?: Record<string, string>; error?: string }> = [];

    // 并发执行各分页的 batchUpdate
    const entries = Array.from(bySheet.entries());
    const results = await Promise.allSettled(
      entries.map(async ([sheet, sheetRows]) => {
        const response = await this.fetchGAS('POST', {
          action: 'batchUpdate',
          sheet,
          user: this.config.userName || '匿名用户',
          rows: sheetRows.map(({ _sourceSheet, ...rest }) => rest),
        });
        return response as unknown as BatchUpdateResult;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        if (!result.value.ok) totalOk = false;
        totalCount += result.value.count || 0;
        allResults.push(...(result.value.results || []));
      } else {
        totalOk = false;
      }
    }

    return { ok: totalOk, count: totalCount, results: allResults };
  }

  /**
   * 快捷方法：分类
   * @param targetSheet 可选：目标分页名（合并模式下使用）
   */
  async classify(target: { id?: string; rowIndex?: number }, category: string, targetSheet?: string): Promise<UpdateResult | null> {
    return this.updateRow(target, { SM_分类: category }, targetSheet);
  }

  /**
   * 快捷方法：备注
   * @param targetSheet 可选：目标分页名（合并模式下使用）
   */
  async addNote(target: { id?: string; rowIndex?: number }, note: string, targetSheet?: string): Promise<UpdateResult | null> {
    return this.updateRow(target, { SM_备注: note }, targetSheet);
  }

  /**
   * 快捷方法：标签
   * @param targetSheet 可选：目标分页名（合并模式下使用）
   */
  async addTag(target: { id?: string; rowIndex?: number }, tag: string, targetSheet?: string): Promise<UpdateResult | null> {
    return this.updateRow(target, { SM_标签: tag }, targetSheet);
  }

  /**
   * 快捷方法：批量分类
   * 支持 _sourceSheet 字段实现多分页路由
   */
  async batchClassify(
    items: Array<{ id?: string; rowIndex?: number; category: string; _sourceSheet?: string }>
  ): Promise<BatchUpdateResult | null> {
    return this.batchUpdateRows(
      items.map(item => ({
        id: item.id,
        rowIndex: item.rowIndex,
        updates: { SM_分类: item.category },
        _sourceSheet: item._sourceSheet,
      }))
    );
  }

  /**
   * 批量写入指定列（任意列，不限于 SM_ 列）
   * 通过 GAS batchWriteColumn action 实现
   * @param targetColumn 目标列名或列字母（如 "分类", "B"）
   * @param rows 要写入的数据 [{ rowIndex, value, _sourceSheet? }]
   * @param overwrite 是否覆盖（默认 true）
   */
  async batchWriteColumn(
    targetColumn: string,
    rows: Array<{ id?: string; rowIndex: number; value: string; _sourceSheet?: string; image?: string }>,
    overwrite = true,
    targetSheet?: string
  ): Promise<{ ok: boolean; count: number; targetColumn: string; results: Array<{ rowIndex: number; value?: string; error?: string }>; error?: string } | null> {
    // 如果行带有 _sourceSheet 且没有统一 targetSheet，按分页分组发送
    const hasMultipleSheets = !targetSheet && rows.some(r => r._sourceSheet);
    if (hasMultipleSheets) {
      return this.batchWriteColumnMultiSheet(targetColumn, rows, overwrite);
    }

    try {
      const sheet = targetSheet || this.config.sheetName || '';
      const response = await this.fetchGAS('POST', {
        action: 'batchWriteColumn',
        sheet,
        targetColumn,
        overwrite,
        rows: rows.map(({ _sourceSheet, ...rest }) => rest),
      });
      return response as unknown as { ok: boolean; count: number; targetColumn: string; results: Array<{ rowIndex: number; value?: string; error?: string }> };
    } catch (err) {
      console.error('[Collab] batchWriteColumn failed:', err);
      return null;
    }
  }

  /**
   * 多分页批量写入：按 _sourceSheet 分组，分别发送
   */
  private async batchWriteColumnMultiSheet(
    targetColumn: string,
    rows: Array<{ id?: string; rowIndex: number; value: string; _sourceSheet?: string; image?: string }>,
    overwrite: boolean
  ): Promise<{ ok: boolean; count: number; targetColumn: string; results: Array<{ rowIndex: number; value?: string; error?: string }>; error?: string } | null> {
    const bySheet = new Map<string, typeof rows>();
    const fallbackSheet = this.config.sheetName || '';
    for (const row of rows) {
      const sheet = row._sourceSheet || fallbackSheet;
      if (!bySheet.has(sheet)) bySheet.set(sheet, []);
      bySheet.get(sheet)!.push(row);
    }

    let totalOk = true;
    let totalCount = 0;
    const allResults: Array<{ rowIndex: number; value?: string; error?: string }> = [];
    let firstErrorMsg = '';

    const entries = Array.from(bySheet.entries());
    const results = await Promise.allSettled(
      entries.map(async ([sheet, sheetRows]) => {
        const response = await this.fetchGAS('POST', {
          action: 'batchWriteColumn',
          sheet,
          targetColumn,
          overwrite,
          rows: sheetRows.map(({ _sourceSheet, ...rest }) => rest),
        });
        return response as unknown as { ok?: boolean; count?: number; results?: Array<{ rowIndex: number; value?: string; error?: string }>; error?: string };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        if (!result.value.ok) {
          totalOk = false;
          if (result.value.error && !firstErrorMsg) firstErrorMsg = result.value.error;
        }
        totalCount += result.value.count || 0;
        allResults.push(...(result.value.results || []));
      } else {
        totalOk = false;
        if (result.status === 'rejected' && !firstErrorMsg) {
          firstErrorMsg = result.reason?.message || String(result.reason) || 'Network/Fetch Error';
        }
      }
    }

    return { ok: totalOk, count: totalCount, targetColumn, results: allResults, error: firstErrorMsg };
  }

  // ── 网络请求 ──

  private async fetchGAS(
    method: 'GET' | 'POST',
    params: Record<string, unknown>,
    timeoutMs = 10000,
    affectConnection = true
  ): Promise<Record<string, unknown>> {
    const url = this.config.webAppUrl;
    if (!url) throw new Error('Web App URL 未配置');

    let response: Response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const useLocalProxy = typeof window !== 'undefined'
      && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    try {
      if (method === 'GET') {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            queryParams.set(key, String(val));
          }
        });
        const targetUrl = `${url}${url.includes('?') ? '&' : '?'}${queryParams.toString()}`;
        const requestUrl = useLocalProxy
          ? `/api/gas-proxy?url=${encodeURIComponent(targetUrl)}`
          : targetUrl;
        response = await fetch(requestUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
        });
      } else {
        const requestUrl = useLocalProxy
          ? `/api/gas-proxy?url=${encodeURIComponent(url)}`
          : url;
        response = await fetch(requestUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(params),
          signal: controller.signal,
        });
      }
    } catch (err) {
      const message = err instanceof DOMException && err.name === 'AbortError'
        ? `请求超时（${Math.round(timeoutMs / 1000)} 秒）`
        : err instanceof Error ? err.message : String(err);
      if (affectConnection) {
        this.markConnectionError(
          message.includes('Failed to fetch')
            ? '网络请求失败，请检查部署地址和 Web 应用访问权限'
            : message
        );
      }
      throw new Error(message);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      if (response.status === 404) {
        const message = 'HTTP 404：当前 Apps Script 部署地址已失效。请重新部署为 Web 应用，并粘贴新的 /exec 地址';
        if (affectConnection) this.markConnectionError(message);
        throw new Error(message);
      }
      if (response.status === 401 || response.status === 403) {
        const message = `HTTP ${response.status}：无访问权限。请将 Web 应用的访问权限设为“任何人”后重新部署`;
        if (affectConnection) this.markConnectionError(message);
        throw new Error(message);
      }
      const message = `HTTP ${response.status}: ${response.statusText || '请求失败'}`;
      if (affectConnection) this.markConnectionError(message);
      throw new Error(message);
    }

    // Apps Script returns an HTML page for a sign-in prompt, a permissions page,
    // or an invalid deployment. Parsing it directly as JSON hides the real cause.
    const responseText = await response.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      const message = this.describeNonJsonResponse(response.url, responseText);
      if (affectConnection) this.markConnectionError(message);
      throw new Error(message);
    }
    if (payload.error) {
      const message = String(payload.error);
      if (affectConnection) this.markConnectionError(message);
      throw new Error(message);
    }
    return payload;
  }

  private getWebAppUrlError(): string | null {
    try {
      const parsed = new URL(this.config.webAppUrl.trim());
      const isGoogleScript = parsed.hostname === 'script.google.com'
        || parsed.hostname.endsWith('.script.google.com')
        || parsed.hostname.endsWith('.googleusercontent.com');
      if (parsed.protocol !== 'https:' || !isGoogleScript || !parsed.pathname.includes('/macros/')) {
        return 'URL 格式不正确。请粘贴 Apps Script「部署 → 管理部署」中 Web 应用的完整 HTTPS 地址';
      }
      if (!/\/exec\/?$/.test(parsed.pathname)) {
        return '请使用部署 URL 中以 /exec 结尾的地址，不要使用编辑器地址或 /dev 测试地址';
      }
      return null;
    } catch {
      return 'URL 格式不正确。请粘贴 Apps Script「部署 → 管理部署」中 Web 应用的完整 HTTPS 地址';
    }
  }

  private describeNonJsonResponse(responseUrl: string, body: string): string {
    const sample = body.slice(0, 2000).toLowerCase();
    const finalUrl = responseUrl.toLowerCase();
    if (finalUrl.includes('accounts.google.com') || sample.includes('sign in') || sample.includes('登录')) {
      return 'Google 返回了登录页面：请将 Web 应用的“有权访问”设为“任何人”，更新部署后重新复制 /exec 地址';
    }
    if (sample.includes('authorization required') || sample.includes('permission')) {
      return 'Google 返回了权限页面：请在 Apps Script 中重新部署 Web 应用，并将“有权访问”设为“任何人”';
    }
    return 'GAS 没有返回 JSON，而是返回了网页。请确认粘贴的是已发布的 /exec 地址，并在“管理部署”中更新为最新版本（有权访问：任何人）';
  }

  // ── 销毁 ──

  destroy(): void {
    this.stopPolling();
    this.smListeners.clear();
    this.statusListeners.clear();
    this.setStatus('disconnected');
  }
}

// ─────────────────────────────────────────────
// 单例
// ─────────────────────────────────────────────

let _instance: GASCollabService | null = null;

export function getCollabService(): GASCollabService {
  if (!_instance) {
    _instance = new GASCollabService();
  }
  return _instance;
}

export function resetCollabService(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}

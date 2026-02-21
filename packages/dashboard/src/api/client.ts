/**
 * API Client for SecureYeoman Dashboard
 *
 * All requests go to the local gateway
 */

import type {
  MetricsSnapshot,
  Task,
  SecurityEvent,
  HealthStatus,
  Personality,
  PersonalityCreate,
  Skill,
  SkillCreate,
  OnboardingStatus,
  PromptPreview,
  ApiKey,
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
  SoulConfig,
  IntegrationInfo,
  ChatResponse,
  ModelInfoResponse,
  McpServerConfig,
  McpToolDef,
  McpResourceDef,
  Passion,
  Inspiration,
  Pain,
  KnowledgeEntry,
  HeartbeatTask,
  HeartbeatStatus,
  HeartbeatLogEntry,
  Memory,
} from '../types.js';

const API_BASE = '/api/v1';

class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// ── Auth token management ─────────────────────────────────────────────

let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _onAuthFailure: (() => void) | null = null;
let _isRefreshing = false;
let _refreshPromise: Promise<boolean> | null = null;

export function setAuthTokens(accessToken: string, refreshToken: string): void {
  _accessToken = accessToken;
  _refreshToken = refreshToken;
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearAuthTokens(): void {
  _accessToken = null;
  _refreshToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export function getAccessToken(): string | null {
  if (!_accessToken) {
    _accessToken = localStorage.getItem('accessToken');
  }
  return _accessToken;
}

export function getRefreshToken(): string | null {
  if (!_refreshToken) {
    _refreshToken = localStorage.getItem('refreshToken');
  }
  return _refreshToken;
}

export function setOnAuthFailure(callback: () => void): void {
  _onAuthFailure = callback;
}

// ── Token refresh ─────────────────────────────────────────────────────

async function attemptTokenRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    setAuthTokens(data.accessToken, data.refreshToken ?? refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ── Core request function ─────────────────────────────────────────────

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  skipAuth = false
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const token = getAccessToken();

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (token && !skipAuth) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && !skipAuth) {
    // Attempt token refresh (deduplicate concurrent refreshes)
    if (!_isRefreshing) {
      _isRefreshing = true;
      _refreshPromise = attemptTokenRefresh();
    }

    const refreshed = await _refreshPromise;
    _isRefreshing = false;
    _refreshPromise = null;

    if (refreshed) {
      // Retry the original request with new token
      const newToken = getAccessToken();
      headers.Authorization = `Bearer ${newToken}`;
      const retryResponse = await fetch(url, { ...options, headers });

      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ message: 'Unknown error' }));
        throw new APIError(
          error.message || `HTTP ${retryResponse.status}`,
          retryResponse.status,
          error.code
        );
      }
      return retryResponse.json();
    }

    // Refresh failed — clear auth and notify
    clearAuthTokens();
    _onAuthFailure?.();
    throw new APIError('Authentication failed', 401);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new APIError(
      error.message || error.error || `HTTP ${response.status}`,
      response.status,
      error.code
    );
  }

  return response.json();
}

// ── Login / Logout ────────────────────────────────────────────────────

export async function login(
  password: string,
  rememberMe = false
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}> {
  return request(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ password, rememberMe }),
    },
    true
  );
}

export async function logout(): Promise<void> {
  try {
    await request<{ message: string }>('/auth/logout', { method: 'POST' });
  } catch {
    // Logout should clear local state regardless of server response
  }
  clearAuthTokens();
}

// ── Health check (unauthenticated) ────────────────────────────────────

export async function fetchHealth(): Promise<HealthStatus> {
  try {
    const response = await fetch('/health');
    if (!response.ok) {
      return {
        status: 'error',
        version: 'unknown',
        uptime: 0,
        checks: { database: false, auditChain: false },
      };
    }
    return response.json();
  } catch {
    return {
      status: 'error',
      version: 'unknown',
      uptime: 0,
      checks: { database: false, auditChain: false },
    };
  }
}

// ── Metrics ───────────────────────────────────────────────────────────

export async function fetchMetrics(): Promise<MetricsSnapshot> {
  try {
    return await request<MetricsSnapshot>('/metrics');
  } catch {
    return {
      timestamp: Date.now(),
      tasks: {
        total: 0,
        byStatus: {},
        byType: {},
        successRate: 0,
        failureRate: 0,
        avgDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
        p50DurationMs: 0,
        p95DurationMs: 0,
        p99DurationMs: 0,
        queueDepth: 0,
        inProgress: 0,
      },
      resources: {
        cpuPercent: 0,
        memoryUsedMb: 0,
        memoryLimitMb: 0,
        memoryPercent: 0,
        diskUsedMb: 0,
        tokensUsedToday: 0,
        tokensCachedToday: 0,
        costUsdToday: 0,
        costUsdMonth: 0,
        apiCallsTotal: 0,
        apiErrorsTotal: 0,
        apiLatencyAvgMs: 0,
      },
      security: {
        authAttemptsTotal: 0,
        authSuccessTotal: 0,
        authFailuresTotal: 0,
        activeSessions: 0,
        permissionChecksTotal: 0,
        permissionDenialsTotal: 0,
        blockedRequestsTotal: 0,
        rateLimitHitsTotal: 0,
        injectionAttemptsTotal: 0,
        eventsBySeverity: {},
        eventsByType: {},
        auditEntriesTotal: 0,
        auditChainValid: false,
      },
    };
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────

export async function fetchTasks(params?: {
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ tasks: Task[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.type) query.set('type', params.type);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());

  const queryString = query.toString();
  try {
    return await request<{ tasks: Task[]; total: number }>(
      `/tasks${queryString ? `?${queryString}` : ''}`
    );
  } catch {
    return { tasks: [], total: 0 };
  }
}

export async function fetchTask(id: string): Promise<Task | null> {
  try {
    return await request<Task>(`/tasks/${id}`);
  } catch {
    return null;
  }
}

export async function createTask(data: {
  name: string;
  type?: string;
  description?: string;
  input?: unknown;
  timeoutMs?: number;
}): Promise<Task> {
  return await request<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteTask(id: string): Promise<void> {
  await request(`/tasks/${id}`, {
    method: 'DELETE',
  });
}

export async function updateTask(
  id: string,
  data: { name?: string; type?: string; description?: string }
): Promise<Task> {
  return request(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ── Security ──────────────────────────────────────────────────────────

export async function fetchSecurityEvents(params?: {
  severity?: string;
  limit?: number;
}): Promise<{ events: SecurityEvent[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.severity) query.set('severity', params.severity);
  if (params?.limit) query.set('limit', params.limit.toString());

  const queryString = query.toString();
  try {
    const raw = await request<{ events: Record<string, unknown>[]; total: number }>(
      `/security/events${queryString ? `?${queryString}` : ''}`
    );
    // Map audit-chain entries to the dashboard SecurityEvent shape
    const events: SecurityEvent[] = (raw.events ?? []).map((e) => ({
      id: (e.id as string) ?? '',
      type: (e.type as string) ?? (e.event as string) ?? 'unknown',
      severity: mapLevelToSeverity((e.severity as string) ?? (e.level as string)),
      message: (e.message as string) ?? '',
      userId:
        (e.userId as string) ??
        ((e.metadata as Record<string, unknown>)?.userId as string | undefined),
      ipAddress:
        (e.ipAddress as string) ??
        ((e.metadata as Record<string, unknown>)?.ip as string | undefined),
      timestamp: (e.timestamp as number) ?? 0,
      acknowledged: false,
    }));
    return { events, total: raw.total };
  } catch {
    return { events: [], total: 0 };
  }
}

function mapLevelToSeverity(level: string): SecurityEvent['severity'] {
  switch (level) {
    case 'error':
    case 'fatal':
      return 'error';
    case 'warn':
      return 'warn';
    case 'security':
      return 'critical';
    default:
      return 'info';
  }
}

export async function fetchAuditEntries(params?: {
  from?: number;
  to?: number;
  level?: string;
  event?: string;
  userId?: string;
  taskId?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  entries: import('../types').AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}> {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from.toString());
  if (params?.to) query.set('to', params.to.toString());
  if (params?.level) query.set('level', params.level);
  if (params?.event) query.set('event', params.event);
  if (params?.userId) query.set('userId', params.userId);
  if (params?.taskId) query.set('taskId', params.taskId);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset !== undefined) query.set('offset', params.offset.toString());

  const queryString = query.toString();
  try {
    return await request(`/audit${queryString ? `?${queryString}` : ''}`);
  } catch {
    return { entries: [], total: 0, limit: params?.limit ?? 50, offset: params?.offset ?? 0 };
  }
}

export async function verifyAuditChain(): Promise<{
  valid: boolean;
  entriesChecked: number;
  error?: string;
}> {
  try {
    return await request<{ valid: boolean; entriesChecked: number; error?: string }>(
      '/audit/verify',
      { method: 'POST' }
    );
  } catch {
    return { valid: false, entriesChecked: 0, error: 'Failed to verify' };
  }
}

// ─── Soul API ──────────────────────────────────────────────────────

export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  return request<OnboardingStatus>('/soul/onboarding/status');
}

export async function completeOnboarding(
  data: PersonalityCreate & { agentName?: string }
): Promise<{
  agentName: string;
  personality: Personality;
}> {
  return request('/soul/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchAgentName(): Promise<{ agentName: string }> {
  return request('/soul/agent-name');
}

export async function updateAgentName(agentName: string): Promise<{ agentName: string }> {
  return request('/soul/agent-name', {
    method: 'PUT',
    body: JSON.stringify({ agentName }),
  });
}

export async function fetchPersonalities(): Promise<{ personalities: Personality[] }> {
  return request('/soul/personalities');
}

export async function fetchActivePersonality(): Promise<{ personality: Personality | null }> {
  return request('/soul/personality');
}

export async function createPersonality(
  data: PersonalityCreate
): Promise<{ personality: Personality }> {
  return request('/soul/personalities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePersonality(
  id: string,
  data: Partial<PersonalityCreate>
): Promise<{ personality: Personality }> {
  return request(`/soul/personalities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePersonality(id: string): Promise<void> {
  await request(`/soul/personalities/${id}`, { method: 'DELETE' });
}

export async function activatePersonality(id: string): Promise<{ personality: Personality }> {
  return request(`/soul/personalities/${id}/activate`, { method: 'POST' });
}

export async function fetchSkills(params?: {
  status?: string;
  source?: string;
}): Promise<{ skills: Skill[] }> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.source) query.set('source', params.source);
  const qs = query.toString();
  return request(`/soul/skills${qs ? `?${qs}` : ''}`);
}

export async function createSkill(data: SkillCreate): Promise<{ skill: Skill }> {
  return request('/soul/skills', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSkill(
  id: string,
  data: Partial<SkillCreate>
): Promise<{ skill: Skill }> {
  return request(`/soul/skills/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSkill(id: string): Promise<void> {
  await request(`/soul/skills/${id}`, { method: 'DELETE' });
}

export async function enableSkill(id: string): Promise<void> {
  await request(`/soul/skills/${id}/enable`, { method: 'POST' });
}

export async function disableSkill(id: string): Promise<void> {
  await request(`/soul/skills/${id}/disable`, { method: 'POST' });
}

export async function approveSkill(id: string): Promise<{ skill: Skill }> {
  return request(`/soul/skills/${id}/approve`, { method: 'POST' });
}

export async function rejectSkill(id: string): Promise<void> {
  await request(`/soul/skills/${id}/reject`, { method: 'POST' });
}

export async function fetchPromptPreview(personalityId?: string): Promise<PromptPreview> {
  const query = personalityId ? `?personalityId=${personalityId}` : '';
  return request(`/soul/prompt/preview${query}`);
}

// ─── API Keys ─────────────────────────────────────────────────────────

export async function fetchApiKeys(): Promise<{ keys: ApiKey[] }> {
  return request('/auth/api-keys');
}

export async function createApiKey(data: ApiKeyCreateRequest): Promise<ApiKeyCreateResponse> {
  return request('/auth/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revokeApiKey(id: string): Promise<void> {
  await request(`/auth/api-keys/${id}`, { method: 'DELETE' });
}

// ─── Soul Config ──────────────────────────────────────────────────────

export async function fetchSoulConfig(): Promise<SoulConfig> {
  const data = await request<{ config: SoulConfig }>('/soul/config');
  return data.config;
}

// ─── Integrations ─────────────────────────────────────────────────────

export async function fetchIntegrations(): Promise<{
  integrations: IntegrationInfo[];
  total: number;
  running: number;
}> {
  try {
    return await request('/integrations');
  } catch {
    return { integrations: [], total: 0, running: 0 };
  }
}

export async function fetchAvailablePlatforms(): Promise<{ platforms: string[] }> {
  try {
    return await request('/integrations/platforms');
  } catch {
    return { platforms: [] };
  }
}

export async function createIntegration(data: {
  platform: string;
  displayName: string;
  enabled: boolean;
  config: Record<string, unknown>;
}): Promise<IntegrationInfo> {
  return request('/integrations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateIntegration(
  id: string,
  data: Partial<{ displayName: string; enabled: boolean; config: Record<string, unknown> }>
): Promise<IntegrationInfo> {
  return request(`/integrations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteIntegration(id: string): Promise<void> {
  await request(`/integrations/${id}`, { method: 'DELETE' });
}

export async function claimGmailOAuth(data: {
  connectionToken: string;
  displayName: string;
  enableRead: boolean;
  enableSend: boolean;
  labelFilter: 'all' | 'label' | 'custom';
  labelName?: string;
}): Promise<{
  success: boolean;
  config: {
    platform: string;
    displayName: string;
    enabled: boolean;
    config: Record<string, unknown>;
  };
}> {
  return request(
    '/auth/oauth/claim',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    true
  );
}

export async function testIntegration(id: string): Promise<{ ok: boolean; message: string }> {
  return request(`/integrations/${id}/test`, { method: 'POST' });
}

export async function startIntegration(id: string): Promise<{ message: string }> {
  return request(`/integrations/${id}/start`, { method: 'POST' });
}

export async function stopIntegration(id: string): Promise<{ message: string }> {
  return request(`/integrations/${id}/stop`, { method: 'POST' });
}

// ─── Auth Roles ───────────────────────────────────────────────────

export interface RoleInfo {
  id: string;
  name: string;
  description?: string;
  permissions: { resource: string; action: string }[];
  inheritFrom?: string[];
  isBuiltin: boolean;
}

export async function fetchRoles(): Promise<{ roles: RoleInfo[] }> {
  try {
    return await request('/auth/roles');
  } catch {
    return { roles: [] };
  }
}

export async function createRole(data: {
  name: string;
  description?: string;
  permissions: { resource: string; action: string }[];
  inheritFrom?: string[];
}): Promise<{ role: RoleInfo }> {
  return request('/auth/roles', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateRole(
  id: string,
  data: {
    name?: string;
    description?: string;
    permissions?: { resource: string; action: string }[];
    inheritFrom?: string[];
  }
): Promise<{ role: RoleInfo }> {
  return request(`/auth/roles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteRole(id: string): Promise<{ message: string }> {
  return request(`/auth/roles/${id}`, { method: 'DELETE' });
}

export interface AssignmentInfo {
  userId: string;
  roleId: string;
}

export async function fetchAssignments(): Promise<{ assignments: AssignmentInfo[] }> {
  try {
    return await request('/auth/assignments');
  } catch {
    return { assignments: [] };
  }
}

export async function assignRole(data: {
  userId: string;
  roleId: string;
}): Promise<{ assignment: AssignmentInfo }> {
  return request('/auth/assignments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revokeAssignment(userId: string): Promise<{ message: string }> {
  return request(`/auth/assignments/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

// ─── Audit Stats ──────────────────────────────────────────────────

export async function fetchAuditStats(): Promise<{
  totalEntries: number;
  oldestEntry?: number;
  lastVerification?: number;
  chainValid: boolean;
  dbSizeEstimateMb?: number;
}> {
  try {
    return await request('/audit/stats');
  } catch {
    return { totalEntries: 0, chainValid: false };
  }
}

// ─── Audit Retention & Export ─────────────────────────────────

export async function enforceRetention(data: {
  maxAgeDays?: number;
  maxEntries?: number;
}): Promise<{ deletedCount: number; remainingCount: number }> {
  return request('/audit/retention', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function exportAuditBackup(): Promise<Blob> {
  const base =
    (window as any).__FRIDAY_API_BASE__ ||
    `${window.location.protocol}//${window.location.hostname}:18789/api/v1`;
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}/audit/export`, { headers });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
}

// ─── Chat ─────────────────────────────────────────────────────

export async function sendChatMessage(data: {
  message: string;
  history?: { role: string; content: string }[];
  personalityId?: string;
  editorContent?: string;
  saveAsMemory?: boolean;
  memoryEnabled?: boolean;
  conversationId?: string;
}): Promise<ChatResponse> {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function rememberChatMessage(
  content: string,
  context?: Record<string, string>
): Promise<{ memory: Memory }> {
  return request('/chat/remember', {
    method: 'POST',
    body: JSON.stringify({ content, context }),
  });
}

export async function submitFeedback(
  conversationId: string,
  messageId: string,
  feedback: 'positive' | 'negative' | 'correction',
  details?: string
): Promise<{ stored: boolean }> {
  return request('/chat/feedback', {
    method: 'POST',
    body: JSON.stringify({ conversationId, messageId, feedback, details }),
  });
}

export async function fetchMemories(query?: string): Promise<{ memories: Memory[] }> {
  const params = query ? `?search=${encodeURIComponent(query)}` : '';
  try {
    return await request(`/brain/memories${params}`);
  } catch {
    return { memories: [] };
  }
}

export async function addMemory(data: {
  type: 'episodic' | 'semantic' | 'procedural' | 'preference';
  content: string;
  source: string;
  context?: Record<string, string>;
  importance?: number;
}): Promise<{ memory: Memory }> {
  return request('/brain/memories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteMemory(id: string): Promise<{ message: string }> {
  return request(`/brain/memories/${id}`, { method: 'DELETE' });
}

// ─── Model Info ───────────────────────────────────────────────

export async function fetchModelInfo(): Promise<ModelInfoResponse> {
  return request('/model/info');
}

export async function switchModel(data: {
  provider: string;
  model: string;
}): Promise<{ success: boolean; model: string }> {
  return request('/model/switch', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Model Default (persistent) ───────────────────────────────

export interface ModelDefaultResponse {
  provider: string | null;
  model: string | null;
}

export async function fetchModelDefault(): Promise<ModelDefaultResponse> {
  try {
    return await request<ModelDefaultResponse>('/model/default');
  } catch {
    return { provider: null, model: null };
  }
}

export async function setModelDefault(data: {
  provider: string;
  model: string;
}): Promise<{ success: boolean }> {
  return request('/model/default', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function clearModelDefault(): Promise<{ success: boolean }> {
  return request('/model/default', { method: 'DELETE' });
}

// ─── Spirit API ───────────────────────────────────────────────

export async function fetchPassions(): Promise<{ passions: Passion[] }> {
  try {
    return await request('/spirit/passions');
  } catch {
    return { passions: [] };
  }
}

export async function createPassion(data: {
  name: string;
  description?: string;
  intensity?: number;
  isActive?: boolean;
}): Promise<{ passion: Passion }> {
  return request('/spirit/passions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePassion(
  id: string,
  data: Partial<{ name: string; description: string; intensity: number; isActive: boolean }>
): Promise<{ passion: Passion }> {
  return request(`/spirit/passions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePassion(id: string): Promise<void> {
  await request(`/spirit/passions/${id}`, { method: 'DELETE' });
}

export async function fetchInspirations(): Promise<{ inspirations: Inspiration[] }> {
  try {
    return await request('/spirit/inspirations');
  } catch {
    return { inspirations: [] };
  }
}

export async function createInspiration(data: {
  source: string;
  description?: string;
  impact?: number;
  isActive?: boolean;
}): Promise<{ inspiration: Inspiration }> {
  return request('/spirit/inspirations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateInspiration(
  id: string,
  data: Partial<{ source: string; description: string; impact: number; isActive: boolean }>
): Promise<{ inspiration: Inspiration }> {
  return request(`/spirit/inspirations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteInspiration(id: string): Promise<void> {
  await request(`/spirit/inspirations/${id}`, { method: 'DELETE' });
}

export async function fetchPains(): Promise<{ pains: Pain[] }> {
  try {
    return await request('/spirit/pains');
  } catch {
    return { pains: [] };
  }
}

export async function createPainEntry(data: {
  trigger: string;
  description?: string;
  severity?: number;
  isActive?: boolean;
}): Promise<{ pain: Pain }> {
  return request('/spirit/pains', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePain(
  id: string,
  data: Partial<{ trigger: string; description: string; severity: number; isActive: boolean }>
): Promise<{ pain: Pain }> {
  return request(`/spirit/pains/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePain(id: string): Promise<void> {
  await request(`/spirit/pains/${id}`, { method: 'DELETE' });
}

// ─── Brain API ────────────────────────────────────────────────

export async function fetchKnowledge(): Promise<{ knowledge: KnowledgeEntry[] }> {
  try {
    return await request('/brain/knowledge');
  } catch {
    return { knowledge: [] };
  }
}

export async function learnKnowledge(
  topic: string,
  content: string
): Promise<{ entry: KnowledgeEntry }> {
  return request('/brain/knowledge', {
    method: 'POST',
    body: JSON.stringify({ topic, content }),
  });
}

export async function updateKnowledge(
  id: string,
  data: { content?: string; confidence?: number }
): Promise<{ knowledge: KnowledgeEntry }> {
  return request(`/brain/knowledge/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteKnowledge(id: string): Promise<{ message: string }> {
  return request(`/brain/knowledge/${id}`, { method: 'DELETE' });
}

export async function fetchHeartbeatTasks(): Promise<{ tasks: HeartbeatTask[] }> {
  try {
    return await request('/brain/heartbeat/tasks');
  } catch {
    return { tasks: [] };
  }
}

export async function fetchHeartbeatStatus(): Promise<HeartbeatStatus> {
  try {
    return await request<HeartbeatStatus>('/brain/heartbeat/status');
  } catch {
    return {
      running: false,
      enabled: false,
      intervalMs: 0,
      beatCount: 0,
      lastBeat: null,
      tasks: [],
    };
  }
}

export async function updateHeartbeatTask(
  name: string,
  data: { intervalMs?: number; enabled?: boolean; config?: Record<string, unknown> }
): Promise<{ task: HeartbeatTask }> {
  return request(`/brain/heartbeat/tasks/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function fetchHeartbeatLog(params?: {
  checkName?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: HeartbeatLogEntry[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.checkName) q.set('checkName', params.checkName);
  if (params?.status) q.set('status', params.status);
  if (params?.limit !== undefined) q.set('limit', String(params.limit));
  if (params?.offset !== undefined) q.set('offset', String(params.offset));
  const qs = q.toString();
  try {
    return await request(`/proactive/heartbeat/log${qs ? `?${qs}` : ''}`);
  } catch {
    return { entries: [], total: 0 };
  }
}

export async function fetchExternalSyncStatus(): Promise<{
  configured: boolean;
  provider?: string;
  path?: string;
  lastSync?: { timestamp: number; entriesExported: number; errors: string[] } | null;
  error?: string;
}> {
  try {
    const result = await request<Record<string, unknown>>('/brain/sync/status');
    return { configured: true, ...result } as {
      configured: boolean;
      provider?: string;
      path?: string;
      lastSync?: { timestamp: number; entriesExported: number; errors: string[] } | null;
    };
  } catch {
    return { configured: false };
  }
}

export async function triggerExternalSync(): Promise<{ result: Record<string, unknown> }> {
  return request('/brain/sync', { method: 'POST' });
}

export interface ExternalBrainConfig {
  configured: boolean;
  enabled?: boolean;
  provider?: string;
  path?: string;
}

export async function fetchExternalBrainConfig(): Promise<ExternalBrainConfig> {
  try {
    const result = await request<ExternalBrainConfig>('/brain/sync/config');
    return result;
  } catch {
    return { configured: false };
  }
}

export async function updateExternalBrainConfig(config: {
  enabled?: boolean;
  provider?: string;
  path?: string;
  subdir?: string;
  syncIntervalMs?: number;
}): Promise<{ success: boolean }> {
  return request('/brain/sync/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// ─── MCP Servers ──────────────────────────────────────────────

export async function fetchMcpServers(): Promise<{ servers: McpServerConfig[]; total: number }> {
  try {
    return await request('/mcp/servers');
  } catch {
    return { servers: [], total: 0 };
  }
}

export async function addMcpServer(data: {
  name: string;
  description?: string;
  transport?: 'stdio' | 'sse' | 'streamable-http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled?: boolean;
}): Promise<{ server: McpServerConfig }> {
  return request('/mcp/servers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteMcpServer(id: string): Promise<void> {
  await request(`/mcp/servers/${id}`, { method: 'DELETE' });
}

export async function patchMcpServer(
  id: string,
  data: { enabled: boolean }
): Promise<{ server: McpServerConfig }> {
  return request(`/mcp/servers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function fetchMcpTools(): Promise<{ tools: McpToolDef[]; total: number }> {
  try {
    return await request('/mcp/tools');
  } catch {
    return { tools: [], total: 0 };
  }
}

export async function fetchMcpResources(): Promise<{ resources: McpResourceDef[] }> {
  try {
    return await request('/mcp/resources');
  } catch {
    return { resources: [] };
  }
}

export interface McpConfigResponse {
  exposeGit: boolean;
  exposeFilesystem: boolean;
  exposeWeb: boolean;
  exposeWebScraping: boolean;
  exposeWebSearch: boolean;
  exposeBrowser: boolean;
  allowedUrls: string[];
  webRateLimitPerMinute: number;
  proxyEnabled: boolean;
  proxyProviders: string[];
  proxyStrategy: string;
  proxyDefaultCountry: string;
}

export async function fetchMcpConfig(): Promise<McpConfigResponse> {
  try {
    return await request('/mcp/config');
  } catch {
    return {
      exposeGit: false,
      exposeFilesystem: false,
      exposeWeb: false,
      exposeWebScraping: true,
      exposeWebSearch: true,
      exposeBrowser: false,
      allowedUrls: [],
      webRateLimitPerMinute: 10,
      proxyEnabled: false,
      proxyProviders: [],
      proxyStrategy: 'round-robin',
      proxyDefaultCountry: '',
    };
  }
}

export async function updateMcpConfig(data: Partial<McpConfigResponse>): Promise<McpConfigResponse> {
  return request('/mcp/config', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── MCP Health ─────────────────────────────────────────────

export async function fetchMcpHealth(): Promise<{
  health: import('../types').McpServerHealth[];
}> {
  try {
    return await request('/mcp/health');
  } catch {
    return { health: [] };
  }
}

export async function fetchMcpServerHealth(
  serverId: string
): Promise<import('../types').McpServerHealth | null> {
  try {
    return await request(`/mcp/servers/${serverId}/health`);
  } catch {
    return null;
  }
}

export async function triggerMcpHealthCheck(
  serverId: string
): Promise<import('../types').McpServerHealth> {
  return request(`/mcp/servers/${serverId}/health/check`, { method: 'POST' });
}

// ─── MCP Credentials ───────────────────────────────────────

export async function fetchMcpCredentialKeys(serverId: string): Promise<{ keys: string[] }> {
  try {
    return await request(`/mcp/servers/${serverId}/credentials`);
  } catch {
    return { keys: [] };
  }
}

export async function storeMcpCredential(
  serverId: string,
  key: string,
  value: string
): Promise<void> {
  await request(`/mcp/servers/${serverId}/credentials/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

export async function deleteMcpCredential(serverId: string, key: string): Promise<void> {
  await request(`/mcp/servers/${serverId}/credentials/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

// ─── Marketplace API ────────────────────────────────────────────

export async function fetchMarketplaceSkills(
  query?: string,
  source?: string
): Promise<{ skills: import('../types').MarketplaceSkill[]; total: number }> {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (source) params.set('source', source);
  const qs = params.toString();
  return request(`/marketplace${qs ? `?${qs}` : ''}`);
}

export async function installMarketplaceSkill(
  id: string,
  personalityId?: string
): Promise<{ message: string }> {
  return request(`/marketplace/${id}/install`, {
    method: 'POST',
    body: personalityId ? JSON.stringify({ personalityId }) : undefined,
  });
}

export async function uninstallMarketplaceSkill(id: string): Promise<{ message: string }> {
  return request(`/marketplace/${id}/uninstall`, { method: 'POST' });
}

export async function syncCommunitySkills(): Promise<{
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  return request('/marketplace/community/sync', { method: 'POST' });
}

export async function fetchCommunityStatus(): Promise<{
  communityRepoPath: string | null;
  skillCount: number;
  lastSyncedAt: number | null;
}> {
  return request('/marketplace/community/status');
}

// ─── Reports API ────────────────────────────────────────────────

export interface ReportSummary {
  id: string;
  title: string;
  format: string;
  generatedAt: number;
  entryCount: number;
  sizeBytes: number;
}

export async function fetchReports(): Promise<{ reports: ReportSummary[]; total: number }> {
  try {
    return await request('/reports');
  } catch {
    return { reports: [], total: 0 };
  }
}

export async function generateReport(opts: {
  title: string;
  format: string;
}): Promise<{ report: ReportSummary }> {
  return request('/reports/generate', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export async function downloadReport(reportId: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/reports/${reportId}/download`, { headers });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}

// ─── Terminal API ───────────────────────────────────────────────

export interface TerminalCommandResult {
  output: string;
  error: string;
  exitCode: number;
  cwd: string;
}

export async function executeTerminalCommand(
  command: string,
  cwd: string
): Promise<TerminalCommandResult> {
  return request('/terminal/execute', {
    method: 'POST',
    body: JSON.stringify({ command, cwd }),
  });
}

// ─── Conversations API ────────────────────────────────────────

import type { Conversation, ConversationDetail, ConversationMessageResponse } from '../types.js';
export type { Conversation, ConversationDetail, ConversationMessageResponse };

export async function fetchConversations(options?: {
  limit?: number;
  offset?: number;
}): Promise<{ conversations: Conversation[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const qs = params.toString();
  return request(`/conversations${qs ? `?${qs}` : ''}`);
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  return request(`/conversations/${id}`);
}

export async function createConversation(
  title: string,
  personalityId?: string
): Promise<Conversation> {
  return request('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, personalityId }),
  });
}

export async function deleteConversation(id: string): Promise<{ success: boolean }> {
  return request(`/conversations/${id}`, { method: 'DELETE' });
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  return request(`/conversations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  });
}

// ─── Semantic Search API ──────────────────────────────────────────

export async function searchSimilar(params: {
  query: string;
  threshold?: number;
  type?: string;
  limit?: number;
}): Promise<{ results: { id: string; score: number; metadata?: Record<string, unknown> }[] }> {
  const queryParams = new URLSearchParams();
  queryParams.set('query', params.query);
  if (params.threshold !== undefined) queryParams.set('threshold', String(params.threshold));
  if (params.type) queryParams.set('type', params.type);
  if (params.limit) queryParams.set('limit', String(params.limit));
  return request(`/brain/search/similar?${queryParams.toString()}`);
}

export async function reindexBrain(): Promise<{
  message: string;
  memoriesCount: number;
  knowledgeCount: number;
}> {
  return request('/brain/reindex', { method: 'POST' });
}

// ─── Consolidation API ─────────────────────────────────────────

export async function runConsolidation(): Promise<{ report: unknown }> {
  return request('/brain/consolidation/run', { method: 'POST' });
}

export async function fetchConsolidationSchedule(): Promise<{ schedule: string }> {
  return request('/brain/consolidation/schedule');
}

export async function updateConsolidationSchedule(schedule: string): Promise<{ schedule: string }> {
  return request('/brain/consolidation/schedule', {
    method: 'PUT',
    body: JSON.stringify({ schedule }),
  });
}

export async function fetchConsolidationHistory(): Promise<{
  history: {
    timestamp: number;
    totalCandidates: number;
    summary: Record<string, number>;
    dryRun: boolean;
    durationMs: number;
  }[];
}> {
  try {
    return await request('/brain/consolidation/history');
  } catch {
    return { history: [] };
  }
}

// ─── History Compression API ──────────────────────────────────────

export interface HistoryEntry {
  id: string;
  conversationId: string;
  tier: 'message' | 'topic' | 'bulk';
  content: string;
  tokenCount: number;
  sequence: number;
  createdAt: number;
  sealedAt: number | null;
}

export interface CompressedContext {
  messages: unknown[];
  topics: unknown[];
  bulk: unknown[];
  totalTokens: number;
  tokenBudget: { messages: number; topics: number; bulk: number };
}

export async function fetchConversationHistory(
  conversationId: string,
  tier?: string
): Promise<{ entries: HistoryEntry[]; total: number }> {
  const params = tier ? `?tier=${tier}` : '';
  try {
    return await request(`/conversations/${conversationId}/history${params}`);
  } catch {
    return { entries: [], total: 0 };
  }
}

export async function sealConversationTopic(conversationId: string): Promise<{ message: string }> {
  return request(`/conversations/${conversationId}/seal-topic`, { method: 'POST' });
}

export async function fetchCompressedContext(
  conversationId: string,
  maxTokens?: number
): Promise<CompressedContext> {
  const params = maxTokens ? `?maxTokens=${maxTokens}` : '';
  return request(`/conversations/${conversationId}/compressed-context${params}`);
}

// ─── Sub-Agent Delegation API ─────────────────────────────────────

export interface AgentProfileInfo {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  maxTokenBudget: number;
  allowedTools: string[];
  defaultModel: string | null;
  isBuiltin: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface DelegationInfo {
  id: string;
  parentDelegationId: string | null;
  profileId: string;
  task: string;
  context: string | null;
  status: string;
  result: string | null;
  error: string | null;
  depth: number;
  maxDepth: number;
  tokenBudget: number;
  tokensUsedPrompt: number;
  tokensUsedCompletion: number;
  timeoutMs: number;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  initiatedBy: string | null;
  correlationId: string | null;
}

export interface DelegationResultInfo {
  delegationId: string;
  profile: string;
  status: string;
  result: string | null;
  error: string | null;
  tokenUsage: { prompt: number; completion: number; total: number };
  durationMs: number;
  subDelegations: DelegationResultInfo[];
}

export interface ActiveDelegationInfo {
  delegationId: string;
  profileId: string;
  profileName: string;
  task: string;
  status: string;
  depth: number;
  tokensUsed: number;
  tokenBudget: number;
  startedAt: number;
  elapsedMs: number;
}

export async function fetchAgentProfiles(): Promise<{ profiles: AgentProfileInfo[] }> {
  try {
    return await request('/agents/profiles');
  } catch {
    return { profiles: [] };
  }
}

export async function createAgentProfile(data: {
  name: string;
  description?: string;
  systemPrompt: string;
  maxTokenBudget?: number;
  allowedTools?: string[];
  defaultModel?: string | null;
}): Promise<{ profile: AgentProfileInfo }> {
  return request('/agents/profiles', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAgentProfile(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    systemPrompt: string;
    maxTokenBudget: number;
    allowedTools: string[];
    defaultModel: string | null;
  }>
): Promise<{ profile: AgentProfileInfo }> {
  return request(`/agents/profiles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAgentProfile(id: string): Promise<{ success: boolean }> {
  return request(`/agents/profiles/${id}`, { method: 'DELETE' });
}

export async function delegateTask(data: {
  profile: string;
  task: string;
  context?: string;
  maxTokenBudget?: number;
  maxDepth?: number;
  timeout?: number;
}): Promise<DelegationResultInfo> {
  return request('/agents/delegate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchDelegations(params?: {
  status?: string;
  profileId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ delegations: DelegationInfo[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.profileId) query.set('profileId', params.profileId);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const qs = query.toString();
  try {
    return await request(`/agents/delegations${qs ? `?${qs}` : ''}`);
  } catch {
    return { delegations: [], total: 0 };
  }
}

export async function fetchActiveDelegations(): Promise<{ delegations: ActiveDelegationInfo[] }> {
  try {
    return await request('/agents/delegations/active');
  } catch {
    return { delegations: [] };
  }
}

export async function fetchDelegation(
  id: string
): Promise<{ delegation: DelegationInfo; tree: DelegationInfo[] } | null> {
  try {
    return await request(`/agents/delegations/${id}`);
  } catch {
    return null;
  }
}

export async function cancelDelegation(id: string): Promise<{ success: boolean }> {
  return request(`/agents/delegations/${id}/cancel`, { method: 'POST' });
}

export async function fetchDelegationMessages(
  delegationId: string
): Promise<{ messages: Record<string, unknown>[] }> {
  try {
    return await request(`/agents/delegations/${delegationId}/messages`);
  } catch {
    return { messages: [] };
  }
}

export async function fetchAgentConfig(): Promise<{
  config: Record<string, unknown>;
  allowedBySecurityPolicy: boolean;
}> {
  try {
    return await request('/agents/config');
  } catch {
    return { config: {}, allowedBySecurityPolicy: false };
  }
}

export interface SecurityPolicy {
  allowSubAgents: boolean;
  allowA2A: boolean;
  allowSwarms: boolean;
  allowExtensions: boolean;
  allowExecution: boolean;
  allowProactive: boolean;
  allowExperiments: boolean;
  allowStorybook: boolean;
  allowMultimodal: boolean;
  allowDynamicTools: boolean;
  sandboxDynamicTools: boolean;
  allowAnomalyDetection: boolean;
  sandboxGvisor: boolean;
  sandboxWasm: boolean;
}

export async function fetchSecurityPolicy(): Promise<SecurityPolicy> {
  try {
    return await request('/security/policy');
  } catch {
    return {
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
      allowDynamicTools: false,
      sandboxDynamicTools: true,
      allowAnomalyDetection: false,
      sandboxGvisor: false,
      sandboxWasm: false,
    };
  }
}

export async function updateSecurityPolicy(data: Partial<SecurityPolicy>): Promise<SecurityPolicy> {
  return request('/security/policy', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── Extensions API (Phase 6.4a) ──────────────────────────────────

export async function fetchExtensions(): Promise<{
  extensions: {
    id: string;
    name: string;
    version: string;
    enabled: boolean;
    createdAt: number;
  }[];
}> {
  try {
    return await request('/extensions');
  } catch {
    return { extensions: [] };
  }
}

export async function registerExtension(data: {
  id: string;
  name: string;
  version: string;
  hooks: { point: string; semantics: string; priority?: number }[];
}): Promise<{ extension: Record<string, unknown> }> {
  return request('/extensions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removeExtension(id: string): Promise<{ success: boolean }> {
  return request(`/extensions/${id}`, { method: 'DELETE' });
}

export async function fetchExtensionHooks(): Promise<{
  hooks: {
    id: string;
    extensionId: string;
    hookPoint: string;
    semantics: string;
    priority: number;
    enabled: boolean;
  }[];
}> {
  try {
    return await request('/extensions/hooks');
  } catch {
    return { hooks: [] };
  }
}

export async function registerExtensionHook(data: {
  extensionId: string;
  hookPoint: string;
  semantics: string;
  priority?: number;
}): Promise<{ hook: Record<string, unknown> }> {
  return request('/extensions/hooks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removeExtensionHook(id: string): Promise<{ success: boolean }> {
  return request(`/extensions/hooks/${id}`, { method: 'DELETE' });
}

export async function fetchExtensionWebhooks(): Promise<{
  webhooks: { id: string; url: string; hookPoints: string[]; enabled: boolean }[];
}> {
  try {
    return await request('/extensions/webhooks');
  } catch {
    return { webhooks: [] };
  }
}

export async function registerExtensionWebhook(data: {
  url: string;
  hookPoints: string[];
  secret?: string;
  enabled?: boolean;
}): Promise<{ webhook: Record<string, unknown> }> {
  return request('/extensions/webhooks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateExtensionWebhook(
  id: string,
  data: Partial<{ url: string; hookPoints: string[]; enabled: boolean }>
): Promise<{ webhook: Record<string, unknown> }> {
  return request(`/extensions/webhooks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function removeExtensionWebhook(id: string): Promise<{ success: boolean }> {
  return request(`/extensions/webhooks/${id}`, { method: 'DELETE' });
}

export async function discoverExtensions(): Promise<{
  extensions: Record<string, unknown>[];
}> {
  return request('/extensions/discover', { method: 'POST' });
}

export async function fetchExtensionConfig(): Promise<{ config: Record<string, unknown> }> {
  try {
    return await request('/extensions/config');
  } catch {
    return { config: {} };
  }
}

export async function fetchHookExecutionLog(hookPoint?: string, limit = 100): Promise<{
  entries: {
    id: string;
    hookPoint: string;
    handlerCount: number;
    durationMs: number;
    vetoed: boolean;
    errors: string[];
    timestamp: number;
    isTest: boolean;
  }[];
}> {
  const params = new URLSearchParams();
  if (hookPoint) params.set('hookPoint', hookPoint);
  params.set('limit', String(limit));
  try {
    return await request(`/extensions/hooks/log?${params.toString()}`);
  } catch {
    return { entries: [] };
  }
}

export async function testHookPoint(data: {
  hookPoint: string;
  data?: unknown;
}): Promise<{
  result: { vetoed: boolean; errors: string[]; transformed?: unknown };
  durationMs: number;
}> {
  return request('/extensions/hooks/test', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Code Execution API (Phase 6.4b) ──────────────────────────────

export async function executeCode(data: {
  runtime: string;
  code: string;
  sessionId?: string;
  timeout?: number;
}): Promise<{
  id: string;
  sessionId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  truncated: boolean;
}> {
  return request('/execution/run', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchExecutionSessions(): Promise<{
  sessions: {
    id: string;
    runtime: string;
    status: string;
    createdAt: number;
    lastActivity: number;
  }[];
}> {
  try {
    return await request('/execution/sessions');
  } catch {
    return { sessions: [] };
  }
}

export async function fetchExecutionSession(id: string): Promise<{
  id: string;
  runtime: string;
  status: string;
  createdAt: number;
  lastActivity: number;
} | null> {
  try {
    return await request(`/execution/sessions/${id}`);
  } catch {
    return null;
  }
}

export async function terminateExecutionSession(id: string): Promise<{ success: boolean }> {
  return request(`/execution/sessions/${id}`, { method: 'DELETE' });
}

export async function fetchExecutionHistory(params?: {
  sessionId?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  executions: {
    id: string;
    sessionId: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
    createdAt: number;
  }[];
  total: number;
}> {
  const query = new URLSearchParams();
  if (params?.sessionId) query.set('sessionId', params.sessionId);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const qs = query.toString();
  try {
    return await request(`/execution/history${qs ? `?${qs}` : ''}`);
  } catch {
    return { executions: [], total: 0 };
  }
}

export async function approveExecution(id: string): Promise<{ approval: Record<string, unknown> }> {
  return request(`/execution/approve/${id}`, { method: 'POST' });
}

export async function rejectExecution(id: string): Promise<{ approval: Record<string, unknown> }> {
  return request(`/execution/approve/${id}`, { method: 'DELETE' });
}

export async function fetchExecutionConfig(): Promise<{ config: Record<string, unknown> }> {
  try {
    return await request('/execution/config');
  } catch {
    return { config: {} };
  }
}

// ─── A2A Protocol API (Phase 6.5) ─────────────────────────────────

export async function fetchA2APeers(): Promise<{
  peers: {
    id: string;
    name: string;
    url: string;
    trustLevel: string;
    status: string;
    lastSeen: number;
    capabilities: { name: string; description: string; version: string }[];
  }[];
}> {
  try {
    return await request('/a2a/peers');
  } catch {
    return { peers: [] };
  }
}

export async function addA2APeer(data: {
  url: string;
  name?: string;
}): Promise<{ peer: Record<string, unknown> }> {
  return request('/a2a/peers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removeA2APeer(id: string): Promise<{ success: boolean }> {
  return request(`/a2a/peers/${id}`, { method: 'DELETE' });
}

export async function updateA2ATrust(
  id: string,
  level: string
): Promise<{ peer: Record<string, unknown> }> {
  return request(`/a2a/peers/${id}/trust`, {
    method: 'PUT',
    body: JSON.stringify({ level }),
  });
}

export async function discoverA2APeers(): Promise<{ peers: Record<string, unknown>[] }> {
  return request('/a2a/discover', { method: 'POST' });
}

export async function fetchA2ACapabilities(): Promise<{
  capabilities: { name: string; description: string; version: string }[];
}> {
  try {
    return await request('/a2a/capabilities');
  } catch {
    return { capabilities: [] };
  }
}

export async function delegateA2ATask(data: {
  peerId: string;
  task: string;
}): Promise<{ message: Record<string, unknown> }> {
  return request('/a2a/delegate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchA2AMessages(params?: {
  peerId?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  messages: {
    id: string;
    type: string;
    fromPeerId: string;
    toPeerId: string;
    payload: unknown;
    timestamp: number;
  }[];
  total: number;
}> {
  const query = new URLSearchParams();
  if (params?.peerId) query.set('peerId', params.peerId);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const qs = query.toString();
  try {
    return await request(`/a2a/messages${qs ? `?${qs}` : ''}`);
  } catch {
    return { messages: [], total: 0 };
  }
}

export async function fetchA2AConfig(): Promise<{ config: Record<string, unknown> }> {
  try {
    return await request('/a2a/config');
  } catch {
    return { config: {} };
  }
}

// ─── Proactive Assistance API (Phase 7.2) ──────────────────────────

export interface ProactiveTriggerData {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  type: 'schedule' | 'event' | 'pattern' | 'webhook' | 'llm';
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  approvalMode: 'auto' | 'suggest' | 'manual';
  cooldownMs: number;
  limitPerDay: number;
  builtin: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProactiveSuggestionData {
  id: string;
  triggerId: string;
  triggerName: string;
  action: Record<string, unknown>;
  context: Record<string, unknown>;
  confidence: number;
  suggestedAt: string;
  status: 'pending' | 'approved' | 'dismissed' | 'executed' | 'expired';
  expiresAt: string;
  approvedAt?: string;
  executedAt?: string;
  dismissedAt?: string;
  result?: Record<string, unknown>;
}

export interface ProactivePatternData {
  id: string;
  type: 'temporal' | 'sequential' | 'contextual';
  description: string;
  confidence: number;
  occurrences: number;
  lastSeen: number;
  context: Record<string, unknown>;
}

export async function fetchProactiveTriggers(filter?: {
  type?: string;
  enabled?: boolean;
}): Promise<{ triggers: ProactiveTriggerData[] }> {
  const query = new URLSearchParams();
  if (filter?.type) query.set('type', filter.type);
  if (filter?.enabled !== undefined) query.set('enabled', String(filter.enabled));
  const qs = query.toString();
  try {
    return await request(`/proactive/triggers${qs ? `?${qs}` : ''}`);
  } catch {
    return { triggers: [] };
  }
}

export async function fetchBuiltinTriggers(): Promise<{ triggers: ProactiveTriggerData[] }> {
  try {
    return await request('/proactive/triggers/builtin');
  } catch {
    return { triggers: [] };
  }
}

export async function createProactiveTrigger(
  data: Omit<ProactiveTriggerData, 'id' | 'createdAt' | 'updatedAt' | 'builtin'>
): Promise<ProactiveTriggerData> {
  return request('/proactive/triggers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProactiveTrigger(
  id: string,
  data: Partial<ProactiveTriggerData>
): Promise<ProactiveTriggerData> {
  return request(`/proactive/triggers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteProactiveTrigger(id: string): Promise<{ success: boolean }> {
  return request(`/proactive/triggers/${id}`, { method: 'DELETE' });
}

export async function enableProactiveTrigger(id: string): Promise<ProactiveTriggerData> {
  return request(`/proactive/triggers/${id}/enable`, { method: 'POST' });
}

export async function disableProactiveTrigger(id: string): Promise<ProactiveTriggerData> {
  return request(`/proactive/triggers/${id}/disable`, { method: 'POST' });
}

export async function testProactiveTrigger(
  id: string
): Promise<{ success: boolean; message: string }> {
  return request(`/proactive/triggers/${id}/test`, { method: 'POST' });
}

export async function enableBuiltinTrigger(id: string): Promise<ProactiveTriggerData> {
  return request(`/proactive/triggers/builtin/${id}/enable`, { method: 'POST' });
}

export async function fetchProactiveSuggestions(filter?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ suggestions: ProactiveSuggestionData[]; total: number }> {
  const query = new URLSearchParams();
  if (filter?.status) query.set('status', filter.status);
  if (filter?.limit) query.set('limit', String(filter.limit));
  if (filter?.offset) query.set('offset', String(filter.offset));
  const qs = query.toString();
  try {
    return await request(`/proactive/suggestions${qs ? `?${qs}` : ''}`);
  } catch {
    return { suggestions: [], total: 0 };
  }
}

export async function approveProactiveSuggestion(
  id: string
): Promise<{ success: boolean; message: string }> {
  return request(`/proactive/suggestions/${id}/approve`, { method: 'POST' });
}

export async function dismissProactiveSuggestion(id: string): Promise<{ success: boolean }> {
  return request(`/proactive/suggestions/${id}/dismiss`, { method: 'POST' });
}

export async function clearExpiredSuggestions(): Promise<{ deleted: number }> {
  return request('/proactive/suggestions/expired', { method: 'DELETE' });
}

export async function fetchProactivePatterns(): Promise<{ patterns: ProactivePatternData[] }> {
  try {
    return await request('/proactive/patterns');
  } catch {
    return { patterns: [] };
  }
}

export async function convertPatternToTrigger(patternId: string): Promise<ProactiveTriggerData> {
  return request(`/proactive/patterns/${patternId}/convert`, { method: 'POST' });
}

export async function fetchProactiveStatus(): Promise<Record<string, unknown>> {
  try {
    return await request('/proactive/status');
  } catch {
    return { initialized: false, enabled: false };
  }
}

export async function fetchProactiveConfig(): Promise<{ config: Record<string, unknown> }> {
  try {
    return await request('/proactive/status');
  } catch {
    return { config: {} };
  }
}

// ─── Multimodal API (Phase 7.3) ───────────────────────────────────

export async function fetchMultimodalConfig(): Promise<Record<string, unknown>> {
  try {
    return await request('/multimodal/config');
  } catch {
    return { enabled: false };
  }
}

export async function fetchMultimodalJobs(params?: {
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: Record<string, unknown>[]; total: number }> {
  try {
    const query = new URLSearchParams();
    if (params?.type) query.set('type', params.type);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return await request(`/multimodal/jobs${qs ? `?${qs}` : ''}`);
  } catch {
    return { jobs: [], total: 0 };
  }
}

export async function analyzeImage(data: {
  imageBase64: string;
  mimeType: string;
  prompt?: string;
}): Promise<{ description: string; labels: string[]; durationMs: number }> {
  return request('/multimodal/vision/analyze', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function transcribeAudio(data: {
  audioBase64: string;
  format?: string;
  language?: string;
}): Promise<{ text: string; language?: string; durationMs: number }> {
  return request('/multimodal/audio/transcribe', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function synthesizeSpeech(data: {
  text: string;
  voice?: string;
  model?: string;
  responseFormat?: string;
}): Promise<{ audioBase64: string; format: string; durationMs: number }> {
  return request('/multimodal/audio/speak', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function generateImage(data: {
  prompt: string;
  size?: string;
  quality?: string;
  style?: string;
}): Promise<{ imageUrl: string; revisedPrompt?: string; durationMs: number }> {
  return request('/multimodal/image/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Browser Automation (Phase 13) ─────────────────────────────────

export async function fetchBrowserSessions(params?: {
  status?: string;
  toolName?: string;
  limit?: number;
  offset?: number;
}): Promise<{ sessions: Record<string, unknown>[]; total: number }> {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.toolName) query.set('toolName', params.toolName);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return await request(`/browser/sessions${qs ? `?${qs}` : ''}`);
  } catch {
    return { sessions: [], total: 0 };
  }
}

export async function fetchBrowserSession(id: string): Promise<Record<string, unknown> | null> {
  try {
    return await request(`/browser/sessions/${id}`);
  } catch {
    return null;
  }
}

export async function closeBrowserSession(id: string): Promise<Record<string, unknown> | null> {
  try {
    return await request(`/browser/sessions/${id}/close`, { method: 'POST' });
  } catch {
    return null;
  }
}

export async function fetchBrowserConfig(): Promise<Record<string, unknown>> {
  try {
    return await request('/browser/config');
  } catch {
    return { exposeBrowser: false };
  }
}

// ─── Cost Analytics (Phase 10) ─────────────────────────────────────

export interface CostProviderBreakdown {
  tokensUsed: number;
  costUsd: number;
  calls: number;
  errors: number;
}

export interface CostBreakdownResponse {
  byProvider: Record<string, CostProviderBreakdown>;
  recommendations: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    estimatedSavingsUsd: number;
    currentCostUsd: number;
    suggestedAction: string;
    category: string;
  }[];
}

export async function fetchCostBreakdown(): Promise<CostBreakdownResponse> {
  try {
    return await request<CostBreakdownResponse>('/costs/breakdown');
  } catch {
    return { byProvider: {}, recommendations: [] };
  }
}

export interface CostHistoryRow {
  date: string;
  provider: string;
  model: string;
  personalityId: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
  calls: number;
}

export interface CostHistoryResponse {
  records: CostHistoryRow[];
  totals: { totalTokens: number; costUsd: number; calls: number };
}

export interface CostHistoryParams {
  from?: string;
  to?: string;
  provider?: string;
  model?: string;
  personalityId?: string;
  groupBy?: 'day' | 'hour';
}

export async function fetchCostHistory(params: CostHistoryParams = {}): Promise<CostHistoryResponse> {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.provider) qs.set('provider', params.provider);
  if (params.model) qs.set('model', params.model);
  if (params.personalityId) qs.set('personalityId', params.personalityId);
  if (params.groupBy) qs.set('groupBy', params.groupBy);

  const query = qs.toString();
  try {
    return await request<CostHistoryResponse>(`/costs/history${query ? `?${query}` : ''}`);
  } catch {
    return { records: [], totals: { totalTokens: 0, costUsd: 0, calls: 0 } };
  }
}

export async function resetUsageStat(stat: 'errors' | 'latency'): Promise<{ success: boolean }> {
  return request('/costs/reset', {
    method: 'POST',
    body: JSON.stringify({ stat }),
  });
}

// ─── Agent Swarms API (Phase 17) ───────────────────────────────────

export interface SwarmRoleInfo {
  role: string;
  profileName: string;
  description: string;
}

export interface SwarmTemplate {
  id: string;
  name: string;
  description: string;
  strategy: 'sequential' | 'parallel' | 'dynamic';
  roles: SwarmRoleInfo[];
  coordinatorProfile: string | null;
  isBuiltin: boolean;
  createdAt: number;
}

export interface SwarmMember {
  id: string;
  swarmRunId: string;
  role: string;
  profileName: string;
  delegationId: string | null;
  status: string;
  result: string | null;
  seqOrder: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface SwarmRun {
  id: string;
  templateId: string;
  templateName: string;
  task: string;
  context: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  strategy: 'sequential' | 'parallel' | 'dynamic';
  result: string | null;
  error: string | null;
  tokenBudget: number;
  tokensUsedPrompt: number;
  tokensUsedCompletion: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  initiatedBy: string | null;
  members?: SwarmMember[];
}

export async function fetchSwarmTemplates(): Promise<{ templates: SwarmTemplate[] }> {
  try {
    return await request('/agents/swarms/templates');
  } catch {
    return { templates: [] };
  }
}

export async function createSwarmTemplate(data: {
  name: string;
  description?: string;
  strategy: string;
  roles: SwarmRoleInfo[];
  coordinatorProfile?: string | null;
}): Promise<{ template: SwarmTemplate }> {
  return request('/agents/swarms/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteSwarmTemplate(id: string): Promise<{ success: boolean }> {
  return request(`/agents/swarms/templates/${id}`, { method: 'DELETE' });
}

export async function executeSwarm(data: {
  templateId: string;
  task: string;
  context?: string;
  tokenBudget?: number;
}): Promise<{ run: SwarmRun }> {
  return request('/agents/swarms', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchSwarmRuns(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ runs: SwarmRun[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const qs = query.toString();
  try {
    return await request(`/agents/swarms${qs ? `?${qs}` : ''}`);
  } catch {
    return { runs: [], total: 0 };
  }
}

export async function fetchSwarmRun(id: string): Promise<{ run: SwarmRun } | null> {
  try {
    return await request(`/agents/swarms/${id}`);
  } catch {
    return null;
  }
}

export async function cancelSwarmRun(id: string): Promise<{ success: boolean }> {
  return request(`/agents/swarms/${id}/cancel`, { method: 'POST' });
}

// ─── Group Chat View (ADR 086) ─────────────────────────────────

export interface GroupChatChannel {
  integrationId: string;
  chatId: string;
  platform: string;
  integrationName: string;
  lastMessageAt: number | null;
  lastMessageText: string | null;
  messageCount: number;
  unrepliedCount: number;
  personalityId: string | null;
  personalityName: string | null;
}

export interface GroupChatMessage {
  id: string;
  integrationId: string;
  platform: string;
  direction: 'inbound' | 'outbound';
  senderId: string;
  senderName: string;
  chatId: string;
  text: string;
  attachments: unknown[];
  replyToMessageId?: string;
  platformMessageId?: string;
  metadata: Record<string, unknown>;
  timestamp: number;
  personalityId: string | null;
  personalityName: string | null;
}

export async function fetchGroupChatChannels(params?: {
  platform?: string;
  integrationId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ channels: GroupChatChannel[]; total: number }> {
  try {
    const qs = new URLSearchParams();
    if (params?.platform) qs.set('platform', params.platform);
    if (params?.integrationId) qs.set('integrationId', params.integrationId);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return await request(`/group-chat/channels${query ? `?${query}` : ''}`);
  } catch {
    return { channels: [], total: 0 };
  }
}

export async function fetchGroupChatMessages(
  integrationId: string,
  chatId: string,
  params?: { limit?: number; offset?: number; before?: number }
): Promise<{ messages: GroupChatMessage[]; total: number }> {
  try {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.before) qs.set('before', String(params.before));
    const query = qs.toString();
    return await request(
      `/group-chat/channels/${encodeURIComponent(integrationId)}/${encodeURIComponent(chatId)}/messages${query ? `?${query}` : ''}`
    );
  } catch {
    return { messages: [], total: 0 };
  }
}

export async function sendGroupChatMessage(
  integrationId: string,
  chatId: string,
  text: string
): Promise<{ success: boolean; integrationId: string; chatId: string; text: string }> {
  return request(
    `/group-chat/channels/${encodeURIComponent(integrationId)}/${encodeURIComponent(chatId)}/messages`,
    { method: 'POST', body: JSON.stringify({ text }) }
  );
}

// ─── Routing Rules (ADR 087) ───────────────────────────────────

export interface RoutingRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  triggerPlatforms: string[];
  triggerIntegrationIds: string[];
  triggerChatIdPattern: string | null;
  triggerSenderIdPattern: string | null;
  triggerKeywordPattern: string | null;
  triggerDirection: 'inbound' | 'outbound' | 'both';
  actionType: 'forward' | 'reply' | 'personality' | 'notify';
  actionTargetIntegrationId: string | null;
  actionTargetChatId: string | null;
  actionPersonalityId: string | null;
  actionWebhookUrl: string | null;
  actionMessageTemplate: string | null;
  matchCount: number;
  lastMatchedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export async function fetchRoutingRules(params?: {
  enabled?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ rules: RoutingRule[]; total: number }> {
  try {
    const qs = new URLSearchParams();
    if (params?.enabled !== undefined) qs.set('enabled', String(params.enabled));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return await request(`/routing-rules${query ? `?${query}` : ''}`);
  } catch {
    return { rules: [], total: 0 };
  }
}

export async function createRoutingRule(
  data: Omit<RoutingRule, 'id' | 'matchCount' | 'lastMatchedAt' | 'createdAt' | 'updatedAt'>
): Promise<RoutingRule> {
  return request('/routing-rules', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateRoutingRule(
  id: string,
  data: Partial<Omit<RoutingRule, 'id' | 'matchCount' | 'lastMatchedAt' | 'createdAt' | 'updatedAt'>>
): Promise<RoutingRule> {
  return request(`/routing-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteRoutingRule(id: string): Promise<void> {
  await request(`/routing-rules/${id}`, { method: 'DELETE' });
}

export async function testRoutingRule(
  id: string,
  params: {
    platform: string;
    integrationId?: string;
    chatId?: string;
    senderId?: string;
    text?: string;
    direction?: 'inbound' | 'outbound';
  }
): Promise<{ rule: RoutingRule; matched: boolean; reason?: string }> {
  return request(`/routing-rules/${id}/test`, { method: 'POST', body: JSON.stringify(params) });
}

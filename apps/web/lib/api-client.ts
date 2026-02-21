/**
 * API Client for Cloudflare Worker Backend
 */

const PRODUCTION_API_URL = 'https://cattle-management-api.andrewskea-as.workers.dev';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || PRODUCTION_API_URL;

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    // Safety guard: block localhost browsers from accidentally hitting production data.
    // This can happen if the static build was made without NEXT_PUBLIC_API_URL set.
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      this.baseUrl === PRODUCTION_API_URL
    ) {
      throw new Error(
        'Local app is configured to use the PRODUCTION API.\n' +
        'Set NEXT_PUBLIC_API_URL=http://localhost:8787 in apps/web/.env.local, then rebuild: cd apps/web && pnpm build'
      );
    }

    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (response.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Cattle endpoints
  async getCattle(params?: { search?: string; breed?: string; sex?: string; onFarm?: string }) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/api/cattle${query ? `?${query}` : ''}`);
  }

  async getCattleById(id: number) {
    return this.request(`/api/cattle/${id}`);
  }

  async createCattle(data: any) {
    return this.request('/api/cattle', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCattle(id: number, data: any) {
    return this.request(`/api/cattle/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCattle(id: number) {
    return this.request(`/api/cattle/${id}`, {
      method: 'DELETE',
    });
  }

  // Family endpoints
  async getLineage(id: number, generations: number = 5) {
    return this.request(`/api/family/lineage/${id}?generations=${generations}`);
  }

  async getDescendants(id: number, generations: number = 10) {
    return this.request(`/api/family/descendants/${id}?generations=${generations}`);
  }

  async getFamilyTree(id: number) {
    return this.request(`/api/family/tree/${id}`);
  }

  async getFamilyOverview(id: number) {
    return this.request(`/api/family/overview/${id}`);
  }

  async getFoundationMothers() {
    return this.request('/api/family/foundation');
  }

  async getEnhancedFamilyStats(id: number) {
    return this.request(`/api/family/enhanced-stats/${id}`);
  }

  // Upload endpoints
  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/api/upload/excel`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  }

  // Analytics endpoints
  async getDashboardStats() {
    return this.request('/api/analytics/dashboard');
  }

  async getHerdStatistics() {
    return this.request('/api/analytics/herd-statistics');
  }

  async getBreedingMetrics() {
    return this.request('/api/analytics/breeding-metrics');
  }

  async getFinancialSummary() {
    return this.request('/api/analytics/financial-summary');
  }

  async getHerdTrends(params?: { period?: string }) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/api/analytics/trends${query ? `?${query}` : ''}`);
  }

  // Breeding endpoints
  async getServiceRecords(params?: { cattleId?: number; limit?: number }) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/api/breeding/services${query ? `?${query}` : ''}`);
  }

  async createServiceRecord(data: any) {
    return this.request('/api/breeding/services', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateServiceRecord(id: number, data: any) {
    return this.request(`/api/breeding/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteServiceRecord(id: number) {
    return this.request(`/api/breeding/services/${id}`, {
      method: 'DELETE',
    });
  }

  async getCalvingPredictions() {
    return this.request('/api/breeding/predictions');
  }

  async getBreedingCalendar(params?: { year?: number; month?: number }) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/api/breeding/calendar${query ? `?${query}` : ''}`);
  }

  // Calving endpoints
  async getCalvings(params?: { limit?: number; recent?: boolean }) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/api/calvings${query ? `?${query}` : ''}`);
  }

  async getCalvingById(id: number) {
    return this.request(`/api/calvings/${id}`);
  }

  async createCalving(data: any) {
    return this.request('/api/calvings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCalving(id: number, data: any) {
    return this.request(`/api/calvings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Sales endpoints
  async getSales(params?: { startDate?: string; endDate?: string; sortBy?: string; order?: string }) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/api/sales${query ? `?${query}` : ''}`);
  }

  async getSaleById(id: number) {
    return this.request(`/api/sales/${id}`);
  }

  async createSale(data: any) {
    return this.request('/api/sales', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSale(id: number, data: any) {
    return this.request(`/api/sales/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getSalesMetrics(params?: { period?: string }) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/api/sales/metrics${query ? `?${query}` : ''}`);
  }

  // Health endpoints
  async getHealthRecordsList(params?: { animalId?: string; eventType?: string }) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/api/health${query ? `?${query}` : ''}`);
  }

  async getHealthSummary() {
    return this.request('/api/health/summary');
  }

  async getHealthTypes() {
    return this.request('/api/health/types');
  }

  async getHealthRecords(cattleId: number) {
    return this.request(`/api/health/animal/${cattleId}`);
  }

  async createHealthRecord(data: any) {
    return this.request('/api/health', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateHealthRecord(id: number, data: any) {
    return this.request(`/api/health/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteHealthRecord(id: number) {
    return this.request(`/api/health/${id}`, {
      method: 'DELETE',
    });
  }

  async getWeightHistory(cattleId: number) {
    return this.request(`/api/health/animal/${cattleId}/weights`);
  }

  async createCalvingWithCalf(data: {
    motherId: number;
    calvingDate: string;
    calfTagNo: string;
    calfSex?: string;
    sire?: string;
    sireType?: 'natural' | 'ai';
    notes?: string;
  }) {
    return this.request('/api/calvings/with-calf', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async pronounceDead(id: number, data: { date?: string; notes?: string }) {
    return this.updateCattle(id, {
      onFarm: false,
      currentStatus: 'Dead',
      notes: data.notes || undefined,
    });
  }
  // Fields endpoints
  async getFields() {
    return this.request('/api/fields');
  }

  async getFieldById(id: number) {
    return this.request(`/api/fields/${id}`);
  }

  async createField(data: any) {
    return this.request('/api/fields', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateField(id: number, data: any) {
    return this.request(`/api/fields/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteField(id: number) {
    return this.request(`/api/fields/${id}`, {
      method: 'DELETE',
    });
  }

  async assignCattleToField(fieldId: number, data: { cattleIds: number[]; assignedDate: string }) {
    return this.request(`/api/fields/${fieldId}/assign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeCattleFromField(fieldId: number, data: { cattleIds: number[]; removedDate?: string }) {
    return this.request(`/api/fields/${fieldId}/remove`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getFieldHistory(fieldId: number) {
    return this.request(`/api/fields/${fieldId}/history`);
  }

  async getCattleMovements(cattleId: number) {
    return this.request(`/api/cattle/${cattleId}/movements`);
  }

  // Batch operations
  async batchUpdateStatus(ids: number[], currentStatus: string, onFarm?: boolean) {
    return this.request('/api/cattle/batch-update-status', {
      method: 'POST',
      body: JSON.stringify({ ids, currentStatus, onFarm }),
    });
  }

  async batchSell(sales: Array<{ animalId: number; eventDate: string; weightKg?: number; salePrice?: number; notes?: string }>) {
    return this.request('/api/sales/batch', {
      method: 'POST',
      body: JSON.stringify({ sales }),
    });
  }
  // Auth endpoints
  async getLoginUrl(turnstileToken: string) {
    return this.request(`/api/auth/login?turnstile_token=${encodeURIComponent(turnstileToken)}`);
  }

  async logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // Farm endpoints
  async createFarm(data: { name: string }) {
    return this.request('/api/farms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getFarms() {
    return this.request('/api/farms');
  }

  async switchFarm(farmId: number) {
    return this.request(`/api/farms/${farmId}/switch`, { method: 'POST' });
  }

  async updateFarm(farmId: number, data: { name?: string }) {
    return this.request(`/api/farms/${farmId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteFarm(farmId: number) {
    return this.request(`/api/farms/${farmId}`, { method: 'DELETE' });
  }

  async getFarmMembers(farmId: number) {
    return this.request(`/api/farms/${farmId}/members`);
  }

  async updateFarmMember(farmId: number, userId: number, data: { role?: string; expiresAt?: string | null }) {
    return this.request(`/api/farms/${farmId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async removeFarmMember(farmId: number, userId: number) {
    return this.request(`/api/farms/${farmId}/members/${userId}`, { method: 'DELETE' });
  }

  async createInvite(farmId: number, data: { role: string; maxUses?: number | null; expiresAt?: string | null; accessDuration?: number | null }) {
    return this.request(`/api/farms/${farmId}/invites`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getInvites(farmId: number) {
    return this.request(`/api/farms/${farmId}/invites`);
  }

  async deleteInvite(farmId: number, inviteId: number) {
    return this.request(`/api/farms/${farmId}/invites/${inviteId}`, { method: 'DELETE' });
  }

  async getInviteDetails(code: string) {
    return this.request(`/api/invite/${code}`);
  }

  async acceptInvite(code: string) {
    return this.request(`/api/invite/${code}/accept`, { method: 'POST' });
  }

  // ==================== MACHINERY ====================

  async getMachinery() {
    return this.request('/api/machinery');
  }

  async createMachinery(data: {
    name: string; type: string; make?: string; model?: string;
    year?: number; purchaseDate?: string; purchasePrice?: number;
    serialNumber?: string; notes?: string;
  }) {
    return this.request('/api/machinery', { method: 'POST', body: JSON.stringify(data) });
  }

  async getMachineryById(id: number) {
    return this.request(`/api/machinery/${id}`);
  }

  async updateMachinery(id: number, data: Partial<{
    name: string; type: string; make: string; model: string; year: number;
    purchaseDate: string; purchasePrice: number; serialNumber: string;
    status: string; soldDate: string; salePrice: number; notes: string;
  }>) {
    return this.request(`/api/machinery/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteMachinery(id: number) {
    return this.request(`/api/machinery/${id}`, { method: 'DELETE' });
  }

  async getMachineryEvents(machineryId: number) {
    return this.request(`/api/machinery/${machineryId}/events`);
  }

  async createMachineryEvent(machineryId: number, data: {
    type: string; date: string; cost?: number; description?: string;
    hoursOrMileage?: number; fieldId?: number; notes?: string;
  }) {
    return this.request(`/api/machinery/${machineryId}/events`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateMachineryEvent(machineryId: number, eventId: number, data: object) {
    return this.request(`/api/machinery/${machineryId}/events/${eventId}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteMachineryEvent(machineryId: number, eventId: number) {
    return this.request(`/api/machinery/${machineryId}/events/${eventId}`, { method: 'DELETE' });
  }

  // ==================== WORKERS ====================

  async getWorkers() {
    return this.request('/api/workers');
  }

  async createWorker(data: { name: string; role?: string; startDate?: string; notes?: string }) {
    return this.request('/api/workers', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateWorker(id: number, data: Partial<{ name: string; role: string; startDate: string; endDate: string; notes: string }>) {
    return this.request(`/api/workers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteWorker(id: number) {
    return this.request(`/api/workers/${id}`, { method: 'DELETE' });
  }

  async getPayroll(workerId: number) {
    return this.request(`/api/workers/${workerId}/payroll`);
  }

  async createPayrollEvent(workerId: number, data: {
    date: string; amount: number; type: string;
    periodStart?: string; periodEnd?: string; notes?: string;
  }) {
    return this.request(`/api/workers/${workerId}/payroll`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updatePayrollEvent(workerId: number, payrollId: number, data: object) {
    return this.request(`/api/workers/${workerId}/payroll/${payrollId}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deletePayrollEvent(workerId: number, payrollId: number) {
    return this.request(`/api/workers/${workerId}/payroll/${payrollId}`, { method: 'DELETE' });
  }

  // ==================== SUPPLIES ====================

  async getSupplies(params?: { category?: string; fieldId?: number }) {
    const q = new URLSearchParams(params as any).toString();
    return this.request(`/api/supplies${q ? `?${q}` : ''}`);
  }

  async createSupply(data: {
    category: string; name: string; date: string; totalCost: number;
    quantity?: number; unit?: string; unitCost?: number;
    supplier?: string; fieldId?: number; notes?: string;
  }) {
    return this.request('/api/supplies', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateSupply(id: number, data: object) {
    return this.request(`/api/supplies/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteSupply(id: number) {
    return this.request(`/api/supplies/${id}`, { method: 'DELETE' });
  }

  // ==================== FIELD TIMELINE ====================

  async getFieldTimeline(fieldId: number) {
    return this.request(`/api/fields/${fieldId}/timeline`);
  }

  // ==================== FINANCIALS P&L ====================

  async getFinancialPL(params?: { start?: string; end?: string }) {
    const q = new URLSearchParams(params as any).toString();
    return this.request(`/api/analytics/financial${q ? `?${q}` : ''}`);
  }
}

export const apiClient = new ApiClient();

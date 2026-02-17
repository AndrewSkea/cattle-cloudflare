/**
 * API Client for Cloudflare Worker Backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cattle-management-api.andrewskea-as.workers.dev';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

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
}

export const apiClient = new ApiClient();

import { dashboardRepository, DashboardSummaryData, DashboardActivityFeedItem, TimePeriod } from '../repositories/dashboard.repository.js';

export class DashboardService {
  async getSummary(period?: string): Promise<DashboardSummaryData> {
    const validPeriods: TimePeriod[] = ['24h', '7d', '30d', 'all'];
    const p: TimePeriod = validPeriods.includes(period as TimePeriod) ? (period as TimePeriod) : '24h';
    return dashboardRepository.getSummary(p);
  }

  async getActivityFeed(page = 1, limit = 20): Promise<{ items: DashboardActivityFeedItem[]; total: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    return dashboardRepository.getActivityFeed(safePage, safeLimit);
  }
}

export const dashboardService = new DashboardService();

/**
 * Analytics computation for the stats dashboard (Pro feature).
 * Pure functions — no DOM manipulation here.
 */

import type { Application } from '../shared/types';

export interface PlatformStat {
  platform: string;
  count: number;
  responseRate: number;
}

export interface WeeklyBucket {
  weekLabel: string;
  count: number;
}

export interface AnalyticsData {
  totalApps: number;
  thisWeek: number;
  lastWeek: number;
  velocityTrend: number;       // % change vs last week (positive = up)
  responseRate: number;         // % moved past 'applied'
  interviewRate: number;        // % reached 'interviewing'
  offerRate: number;            // % reached 'offer'
  platformBreakdown: PlatformStat[];
  weeklyVelocity: WeeklyBucket[];  // last 8 weeks
  avgDaysToResponse: number | null;
}

export function computeAnalytics(apps: Application[]): AnalyticsData {
  const now = new Date();
  const totalApps = apps.length;

  // ── Weekly counts ──────────────────────────────────
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const thisWeekStart = new Date(now.getTime() - weekMs);
  const lastWeekStart = new Date(now.getTime() - 2 * weekMs);

  const thisWeek = apps.filter(a => new Date(a.dateApplied + 'T00:00:00') >= thisWeekStart).length;
  const lastWeek = apps.filter(a => {
    const d = new Date(a.dateApplied + 'T00:00:00');
    return d >= lastWeekStart && d < thisWeekStart;
  }).length;

  const velocityTrend = lastWeek > 0
    ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
    : thisWeek > 0 ? 100 : 0;

  // ── Response rates ─────────────────────────────────
  // Only count interviewing/offer as actual responses (not manually closed)
  const gotResponse = apps.filter(a => a.status === 'interviewing' || a.status === 'offer').length;
  const responseRate = totalApps > 0 ? Math.round((gotResponse / totalApps) * 100) : 0;

  const interviewing = apps.filter(a => a.status === 'interviewing' || a.status === 'offer').length;
  const interviewRate = totalApps > 0 ? Math.round((interviewing / totalApps) * 100) : 0;

  const offers = apps.filter(a => a.status === 'offer').length;
  const offerRate = totalApps > 0 ? Math.round((offers / totalApps) * 100) : 0;

  // ── Platform breakdown ─────────────────────────────
  const platformMap = new Map<string, { count: number; responded: number }>();
  for (const app of apps) {
    const p = app.sourcePlatform || 'unknown';
    const existing = platformMap.get(p) || { count: 0, responded: 0 };
    existing.count++;
    if (app.status === 'interviewing' || app.status === 'offer') existing.responded++;
    platformMap.set(p, existing);
  }
  const platformBreakdown: PlatformStat[] = Array.from(platformMap.entries())
    .map(([platform, data]) => ({
      platform,
      count: data.count,
      responseRate: data.count > 0 ? Math.round((data.responded / data.count) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Weekly velocity (last 8 weeks) ─────────────────
  const weeklyVelocity: WeeklyBucket[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - (i + 1) * weekMs);
    const weekEnd = new Date(now.getTime() - i * weekMs);
    const count = apps.filter(a => {
      const d = new Date(a.dateApplied + 'T00:00:00');
      return d >= weekStart && d < weekEnd;
    }).length;

    // Short week label (e.g., "Jan 6")
    const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    weeklyVelocity.push({ weekLabel: label, count });
  }

  // ── Avg days to response ───────────────────────────
  const respondedApps = apps.filter(a => a.status !== 'applied' && a.status !== 'closed');
  let avgDaysToResponse: number | null = null;
  if (respondedApps.length > 0) {
    const totalDays = respondedApps.reduce((sum, a) => {
      const applied = new Date(a.dateApplied + 'T00:00:00').getTime();
      const updated = new Date(a.updatedAt).getTime();
      return sum + (updated - applied) / (1000 * 60 * 60 * 24);
    }, 0);
    avgDaysToResponse = Math.round((totalDays / respondedApps.length) * 10) / 10;
  }

  return {
    totalApps,
    thisWeek,
    lastWeek,
    velocityTrend,
    responseRate,
    interviewRate,
    offerRate,
    platformBreakdown,
    weeklyVelocity,
    avgDaysToResponse,
  };
}

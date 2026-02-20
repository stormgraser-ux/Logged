/**
 * CSV export for job applications (Pro feature).
 */

import type { Application } from '../shared/types';
import { STATUS_LABELS } from '../shared/constants';

function escapeCSV(value: string): string {
  if (!value) return '';
  // If the value contains quotes, commas, or newlines, wrap in quotes
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function exportToCSV(apps: Application[]): void {
  const headers = ['Company', 'Role', 'Status', 'Date Applied', 'Source URL', 'Platform', 'Salary', 'Notes', 'Detected By'];

  const rows = apps.map(app => [
    escapeCSV(app.company),
    escapeCSV(app.role),
    escapeCSV(STATUS_LABELS[app.status] || app.status),
    escapeCSV(app.dateApplied),
    escapeCSV(app.sourceUrl),
    escapeCSV(app.sourcePlatform),
    escapeCSV(app.salary || ''),
    escapeCSV(app.notes),
    escapeCSV(app.detectedBy),
  ]);

  const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const filename = `logged-applications-${new Date().toISOString().split('T')[0]}.csv`;

  // Use chrome.downloads API for proper save-as dialog
  chrome.downloads.download({
    url,
    filename,
    saveAs: true,
  }, () => {
    // Clean up the blob URL after download starts
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
}

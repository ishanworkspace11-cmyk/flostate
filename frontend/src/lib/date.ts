export function formatDate(timestamp: string | number | Date | null | undefined): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatRelativeTime(timestamp: string | number | Date | null | undefined): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  if (diffMs < 0) return 'in the future';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return 'just now';
  if (diffSec < 90) return '1 minute ago';
  
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 45) return `${diffMin}m ago`;
  if (diffMin < 90) return '1 hour ago';
  
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return 'yesterday';
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined || isNaN(durationMs)) return '—';
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const seconds = (durationMs / 1000).toFixed(1);
  if (durationMs < 60000) return `${seconds}s`;
  const minutes = Math.floor(durationMs / 60000);
  const remSec = Math.round((durationMs % 60000) / 1000);
  return `${minutes}m ${remSec}s`;
}

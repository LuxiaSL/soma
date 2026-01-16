/**
 * Timezone Utilities
 * 
 * All daily reset logic (rewards, transfers, etc.) should use PST (Pacific Standard Time)
 * to ensure consistent behavior regardless of server timezone.
 * 
 * PST = UTC-8 (standard time) / PDT = UTC-7 (daylight saving)
 * We use 'America/Los_Angeles' which handles DST automatically.
 */

/** PST/PDT timezone identifier */
export const PST_TIMEZONE = 'America/Los_Angeles'

/**
 * Get today's date string in YYYY-MM-DD format, in PST timezone.
 * Used for daily reset logic (rewards, transfers, etc.)
 * 
 * The day resets at midnight PST, not UTC.
 */
export function getTodayDateStringPST(): string {
  const now = new Date()
  // Format as YYYY-MM-DD in PST timezone
  return now.toLocaleDateString('en-CA', { timeZone: PST_TIMEZONE })
}

/**
 * Get the current Date object representing "now" in PST context.
 * Note: JavaScript Date objects are always UTC internally, but this helps
 * when you need to reason about PST time.
 */
export function getNowInPST(): Date {
  return new Date()
}

/**
 * Format a Date or ISO string to a display string in PST timezone.
 * Returns format like "2025-01-15 3:45:30 PM PST"
 */
export function formatDateTimePST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  
  const formatted = d.toLocaleString('en-US', {
    timeZone: PST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  
  // Determine if we're in PDT or PST
  const tzAbbr = getPSTAbbreviation(d)
  
  return `${formatted} ${tzAbbr}`
}

/**
 * Get the current PST/PDT abbreviation based on whether DST is in effect.
 */
export function getPSTAbbreviation(date?: Date): string {
  const d = date || new Date()
  
  // Get the timezone offset for this date in LA
  // During PST: UTC-8 (480 minutes)
  // During PDT: UTC-7 (420 minutes)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PST_TIMEZONE,
    timeZoneName: 'short',
  })
  
  const parts = formatter.formatToParts(d)
  const tzPart = parts.find(p => p.type === 'timeZoneName')
  
  return tzPart?.value || 'PST'
}


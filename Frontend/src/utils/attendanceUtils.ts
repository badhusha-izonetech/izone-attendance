export const STANDARD_IN = '10:00'
export const STANDARD_OUT = '18:30'
export const STANDARD_IN_MINS = 10 * 60       // 600 mins
export const STANDARD_OUT_MINS = 18 * 60 + 30 // 1110 mins
export const REQUIRED_WORK_MINS = 8 * 60 + 30 // 510 mins (8h 30m)

export interface AttendanceMetrics {
  workingHours: number | null
  workingMins: number
  permissionMins: number
  permissionHours: number
  earlyInMins: number
  lateInMins: number
  earlyOutMins: number
  overtimeMins: number
  isOvernight: boolean
}

export function toMinutes(t: string | null | undefined): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return 0
  return h * 60 + m
}

export function parsePermissionData(tagStr: string | null | undefined): { start: string, end: string } | null {
  if (!tagStr) return null
  const match = tagStr.match(/permission_([0-9:]*)_([0-9:]*)/)
  if (match && (match[1] || match[2])) {
    return { start: match[1] || '', end: match[2] || '' }
  }
  return null
}

export function calcPermissionHours(start: string, end: string): number | null {
  if (!start || !end) return null
  let outMins = toMinutes(end)
  const inMins = toMinutes(start)
  if (outMins <= inMins) outMins += 24 * 60
  const diff = (outMins - inMins) / 60
  return diff > 0 ? diff : null
}

export function calcPermissionMinutes(tagStr: string | null | undefined): number {
  const pData = parsePermissionData(tagStr)
  if (!pData) return 0
  const pHrs = calcPermissionHours(pData.start, pData.end)
  return pHrs ? Math.round(pHrs * 60) : 0
}

/**
 * Calculates complete attendance metrics following Option B (Permission deducts from Working Hours):
 * 1. Working Hours = (Check Out - Check In) - Permission Overlap
 * 2. Early In = 10:00 AM - Check In (only for normal same-day shifts, 0 for overnight)
 * 3. Late In = Check In - 10:00 AM (if Check In > 10:00 AM and not covered by permission)
 * 4. Early Out = 6:30 PM - Check Out (if Check Out < 6:30 PM and not covered by permission)
 * 5. Overtime = Check Out - 6:30 PM (for normal day shifts) OR Working Hours - Required Hours (for overnight shifts)
 * 6. Permission: Deducts from Working Hours and removes Late In / Early Out penalties.
 */
export function getAttendanceMetrics(
  inT: string | null | undefined,
  outT: string | null | undefined,
  work_tag?: string | null
): AttendanceMetrics {
  const pMins = calcPermissionMinutes(work_tag)
  const pHrs = pMins / 60

  if (!inT || !outT) {
    return {
      workingHours: null,
      workingMins: 0,
      permissionMins: pMins,
      permissionHours: pHrs,
      earlyInMins: 0,
      lateInMins: 0,
      earlyOutMins: 0,
      overtimeMins: 0,
      isOvernight: false,
    }
  }

  const inMins = toMinutes(inT)
  let outMins = toMinutes(outT)
  const rawCrossMidnight = outMins <= inMins

  if (rawCrossMidnight) {
    outMins += 24 * 60
  }

  const totalDuration = outMins - inMins

  // Calculate permission overlap with the worked shift
  const pData = parsePermissionData(work_tag)
  let permOverlap = 0
  if (pData) {
    const pStart = toMinutes(pData.start)
    let pEnd = toMinutes(pData.end)
    if (pEnd <= pStart) pEnd += 24 * 60
    const overlapStart = Math.max(inMins, pStart)
    const overlapEnd = Math.min(outMins, pEnd)
    if (overlapEnd > overlapStart) {
      permOverlap = overlapEnd - overlapStart
    }
  } else if (pMins > 0) {
    permOverlap = pMins
  }

  const workingMins = Math.max(0, totalDuration - permOverlap)
  const workingHours = workingMins / 60

  // Overnight / Continuous Shift Classification
  const isOvernight = rawCrossMidnight || (inMins <= 6 * 60 && totalDuration > REQUIRED_WORK_MINS)

  if (isOvernight) {
    return {
      workingHours,
      workingMins,
      permissionMins: pMins,
      permissionHours: pHrs,
      earlyInMins: 0,
      lateInMins: 0,
      earlyOutMins: 0,
      overtimeMins: Math.max(0, Math.round(workingMins - Math.max(0, REQUIRED_WORK_MINS - pMins))),
      isOvernight: true,
    }
  }

  // 1. Early In
  const earlyInMins = inMins < STANDARD_IN_MINS ? STANDARD_IN_MINS - inMins : 0

  // 2. Late In
  let lateInMins = 0
  if (inMins > STANDARD_IN_MINS) {
    const baseLate = inMins - STANDARD_IN_MINS
    if (pData) {
      const pStart = toMinutes(pData.start)
      let pEnd = toMinutes(pData.end)
      if (pEnd <= pStart) pEnd += 24 * 60
      const overlap = Math.max(0, Math.min(inMins, pEnd) - Math.max(STANDARD_IN_MINS, pStart))
      lateInMins = Math.max(0, baseLate - overlap)
    } else {
      lateInMins = Math.max(0, baseLate - pMins)
    }
  }

  // 3. Early Out
  let earlyOutMins = 0
  if (outMins < STANDARD_OUT_MINS) {
    const baseEarlyOut = STANDARD_OUT_MINS - outMins
    if (pData) {
      const pStart = toMinutes(pData.start)
      let pEnd = toMinutes(pData.end)
      if (pEnd <= pStart) pEnd += 24 * 60
      const overlap = Math.max(0, Math.min(STANDARD_OUT_MINS, pEnd) - Math.max(outMins, pStart))
      earlyOutMins = Math.max(0, baseEarlyOut - overlap)
    } else {
      earlyOutMins = Math.max(0, baseEarlyOut - pMins)
    }
  }

  // 4. Overtime
  const overtimeMins = outMins > STANDARD_OUT_MINS ? outMins - STANDARD_OUT_MINS : 0

  return {
    workingHours,
    workingMins,
    permissionMins: pMins,
    permissionHours: pHrs,
    earlyInMins,
    lateInMins,
    earlyOutMins,
    overtimeMins,
    isOvernight: false,
  }
}

export function calcHours(inT: string, outT: string, work_tag?: string | null): number | null {
  return getAttendanceMetrics(inT, outT, work_tag).workingHours
}

export function getEarlyInMinutes(inT: string, outT?: string, work_tag?: string | null): number {
  return getAttendanceMetrics(inT, outT || STANDARD_OUT, work_tag).earlyInMins
}

export function getLateInMinutes(inT: string, work_tag?: string | null): number {
  return getAttendanceMetrics(inT, STANDARD_OUT, work_tag).lateInMins
}

export function getEarlyOutMinutes(inT: string, outT: string, work_tag?: string | null): number {
  return getAttendanceMetrics(inT, outT, work_tag).earlyOutMins
}

export function getOvertimeMinutes(inT: string, outT: string, work_tag?: string | null): number {
  return getAttendanceMetrics(inT, outT, work_tag).overtimeMins
}

export function formatMins(mins: number): string {
  if (mins <= 0) return '—'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/* Auto-generate tag string: support comma-separated multiple tags */
export function autoTag(inT: string, outT: string, work_tag?: string | null): string | null {
  const metrics = getAttendanceMetrics(inT, outT, work_tag)
  const tags: string[] = []

  if (metrics.earlyInMins > 0) {
    tags.push('earlycome')
  }
  if (metrics.lateInMins > 0) {
    tags.push('latein')
  }
  if (metrics.earlyOutMins > 0) {
    tags.push('earlyout')
  }
  if (metrics.overtimeMins > 0) {
    tags.push('overtime')
  }

  if (work_tag && work_tag.includes('permission_')) {
    const pData = parsePermissionData(work_tag)
    if (pData) {
      tags.push(`permission_${pData.start}_${pData.end}`)
    }
  }

  return tags.length > 0 ? tags.join(',') : null
}

export function upsertPermission(tagStr: string | null, start: string, end: string): string {
  const newTag = `permission_${start}_${end}`
  if (!tagStr) return newTag
  if (tagStr.includes('permission_')) {
    return tagStr.replace(/permission_[^,.]*/, newTag)
  }
  return `${tagStr},${newTag}`
}

export function removePermission(tagStr: string | null): string | null {
  if (!tagStr) return null
  const cleaned = tagStr.split(',').filter(t => !t.startsWith('permission_')).join(',')
  return cleaned || null
}

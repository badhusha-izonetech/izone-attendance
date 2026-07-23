

export const STANDARD_IN = '10:00'
export const STANDARD_OUT = '18:30'

export function toMinutes(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function calcHours(inT: string, outT: string, work_tag?: string | null): number | null {
  if (!inT || !outT) return null
  let outMins = toMinutes(outT)
  const inMins = toMinutes(inT)
  // Handle overnight shift: if checkout is before check-in, assume next day
  if (outMins <= inMins) outMins += 24 * 60
  
  let diff = (outMins - inMins) / 60
  
  if (work_tag && work_tag.includes('permission_')) {
    const match = work_tag.match(/permission_([0-9:]*)_([0-9:]*)/)
    if (match && match[1] && match[2]) {
      let pOut = toMinutes(match[2])
      const pIn = toMinutes(match[1])
      if (pOut <= pIn) pOut += 24 * 60
      
      const overlapStart = Math.max(inMins, pIn)
      const overlapEnd = Math.min(outMins, pOut)
      
      if (overlapEnd > overlapStart) {
        diff -= (overlapEnd - overlapStart) / 60
      }
    }
  }

  return diff > 0 ? diff : null
}

export function getEarlyInMinutes(inT: string): number {
  if (!inT) return 0
  const diff = toMinutes(STANDARD_IN) - toMinutes(inT)
  return diff > 0 ? diff : 0
}

export function getLateInMinutes(inT: string, work_tag?: string | null): number {
  if (!inT) return 0
  if (work_tag && work_tag.includes('permission_')) return 0
  const diff = toMinutes(inT) - toMinutes(STANDARD_IN)
  return diff > 0 ? diff : 0
}

export function getEarlyOutMinutes(inT: string, outT: string): number {
  if (!inT || !outT) return 0
  let outMins = toMinutes(outT)
  const inMins = toMinutes(inT)
  if (outMins <= inMins) outMins += 24 * 60
  const diff = toMinutes(STANDARD_OUT) - outMins
  return diff > 0 ? diff : 0
}

export function getOvertimeMinutes(inT: string, outT: string, work_tag?: string | null): number {
  if (!inT || !outT) return 0
  let outMins = toMinutes(outT)
  const inMins = toMinutes(inT)
  if (outMins <= inMins) outMins += 24 * 60

  // Check out must be after 18:30
  if (outMins <= toMinutes(STANDARD_OUT)) return 0

  const workedHrs = calcHours(inT, outT, work_tag)
  if (workedHrs === null || workedHrs <= 8.5) return 0

  const otHrs = workedHrs - 8.5
  return Math.round(otHrs * 60)
}

export function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/* Auto-generate tag string: support comma-separated multiple tags */
export function autoTag(inT: string, outT: string, work_tag?: string | null): string | null {
  const tags: string[] = []
  if (inT) {
    if (toMinutes(inT) < toMinutes(STANDARD_IN)) {
      tags.push('earlycome')
    } else if (toMinutes(inT) > toMinutes(STANDARD_IN) && (!work_tag || !work_tag.includes('permission_'))) {
      tags.push('latein')
    }
  }
  if (outT) {
    const otMins = getOvertimeMinutes(inT, outT, work_tag)
    if (otMins > 0) {
      tags.push('overtime')
    } else if (toMinutes(outT) < toMinutes(STANDARD_OUT)) {
      tags.push('earlyout')
    }
  }
  return tags.length > 0 ? tags.join(',') : null
}

export function parsePermissionData(tagStr: string | null): { start: string, end: string } | null {
  if (!tagStr) return null
  const match = tagStr.match(/permission_([0-9:]*)_([0-9:]*)/)
  if (match) {
    return { start: match[1] || '', end: match[2] || '' }
  }
  return null
}

export function upsertPermission(tagStr: string | null, start: string, end: string): string {
  const newTag = `permission_${start}_${end}`
  if (!tagStr) return newTag
  if (tagStr.includes('permission_')) {
    return tagStr.replace(/permission_[0-9:]*_[0-9:]*/, newTag)
  }
  return `${tagStr},${newTag}`
}

export function removePermission(tagStr: string | null): string | null {
  if (!tagStr) return null
  const cleaned = tagStr.split(',').filter(t => !t.startsWith('permission_')).join(',')
  return cleaned || null
}

export function calcPermissionHours(start: string, end: string): number | null {
  if (!start || !end) return null
  let outMins = toMinutes(end)
  const inMins = toMinutes(start)
  if (outMins <= inMins) outMins += 24 * 60
  const diff = (outMins - inMins) / 60
  return diff > 0 ? diff : null
}

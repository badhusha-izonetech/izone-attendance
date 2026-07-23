import { memo } from 'react'

interface StatusBadgeProps {
  status: string
}

const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
  const cls =
    status === 'Present'  ? 'badge-present'  :
    status === 'Leave'    ? 'badge-leave'    :
    status === 'Holiday'  ? 'badge-holiday'  :
    status === 'Weekend Working' ? 'badge-weekend' :
    'badge-halfday'
  return <span className={`badge ${cls}`}>{status}</span>
}
)

export default StatusBadge

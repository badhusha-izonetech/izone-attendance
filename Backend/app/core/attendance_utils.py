import re
from typing import Optional, Dict, Any

STANDARD_IN_MINS = 10 * 60        # 10:00 AM = 600 mins
STANDARD_OUT_MINS = 18 * 60 + 30  # 06:30 PM = 1110 mins
REQUIRED_WORK_MINS = 8 * 60 + 30  # 8h 30m = 510 mins

def to_minutes(t_str: Optional[str]) -> int:
    """Convert HH:MM format string to minutes from midnight."""
    if not t_str:
        return 0
    try:
        parts = t_str.split(':')
        h, m = int(parts[0]), int(parts[1])
        return h * 60 + m
    except Exception:
        return 0

def parse_permission_data(tag_str: Optional[str]) -> Optional[Dict[str, str]]:
    """Extract permission start and end times from work_tag string."""
    if not tag_str:
        return None
    match = re.search(r'permission_([0-9]{1,2}:[0-9]{2})_([0-9]{1,2}:[0-9]{2})', tag_str)
    if match:
        return {"start": match.group(1), "end": match.group(2)}
    return None

def calc_permission_minutes(tag_str: Optional[str]) -> int:
    """Calculate total permission duration in minutes."""
    p_data = parse_permission_data(tag_str)
    if not p_data:
        return 0
    p_in = to_minutes(p_data["start"])
    p_out = to_minutes(p_data["end"])
    if p_out <= p_in:
        p_out += 24 * 60
    diff = p_out - p_in
    return max(0, diff)

def calculate_attendance(in_t: Optional[str], out_t: Optional[str], work_tag: Optional[str] = None) -> Dict[str, Any]:
    """
    Calculate attendance metrics following Option B (Permission deducts from Working Hours):
    - Working Hours = (Check Out - Check In) - Permission Overlap
    - Early In: 10:00 AM - Check In (normal same-day shift only, 0 for overnight)
    - Late In: Check In - 10:00 AM (if Check In > 10:00 AM and not covered by permission)
    - Early Out: 6:30 PM - Check Out (if Check Out < 6:30 PM and not covered by permission)
    - Overtime: Check Out - 6:30 PM (normal day shift) OR Working Hours - Required Hours (overnight shift)
    - Permission: Deducts from Working Hours and removes Late In / Early Out penalties.
    """
    p_mins = calc_permission_minutes(work_tag)
    p_hrs = p_mins / 60.0

    if not in_t or not out_t:
        return {
            "working_hours": None,
            "working_mins": 0,
            "permission_mins": p_mins,
            "permission_hours": p_hrs,
            "early_in_mins": 0,
            "late_in_mins": 0,
            "early_out_mins": 0,
            "overtime_mins": 0,
            "is_overnight": False
        }

    in_mins = to_minutes(in_t)
    out_mins = to_minutes(out_t)
    raw_cross_midnight = out_mins <= in_mins

    if raw_cross_midnight:
        out_mins += 24 * 60

    total_duration = out_mins - in_mins

    # Calculate permission overlap with the worked shift
    p_data = parse_permission_data(work_tag)
    perm_overlap = 0
    if p_data:
        p_start = to_minutes(p_data["start"])
        p_end = to_minutes(p_data["end"])
        if p_end <= p_start:
            p_end += 24 * 60
        overlap_start = max(in_mins, p_start)
        overlap_end = min(out_mins, p_end)
        if overlap_end > overlap_start:
            perm_overlap = overlap_end - overlap_start
    elif p_mins > 0:
        perm_overlap = p_mins

    working_mins = max(0, total_duration - perm_overlap)
    working_hours = working_mins / 60.0

    # Overnight / Continuous Shift Classification
    is_overnight = raw_cross_midnight or (in_mins <= 6 * 60 and total_duration > REQUIRED_WORK_MINS)

    if is_overnight:
        early_in_mins = 0
        late_in_mins = 0
        early_out_mins = 0
        overtime_mins = max(0, round(working_mins - max(0, REQUIRED_WORK_MINS - p_mins)))
    else:
        # 1. Early In: 10:00 AM - Check In (if Check In < 10:00 AM)
        early_in_mins = max(0, STANDARD_IN_MINS - in_mins) if in_mins < STANDARD_IN_MINS else 0

        # 2. Late In: Check In - 10:00 AM (if Check In > 10:00 AM)
        late_in_mins = 0
        if in_mins > STANDARD_IN_MINS:
            base_late = in_mins - STANDARD_IN_MINS
            if p_data:
                p_start = to_minutes(p_data["start"])
                p_end = to_minutes(p_data["end"])
                if p_end <= p_start:
                    p_end += 24 * 60
                overlap = max(0, min(in_mins, p_end) - max(STANDARD_IN_MINS, p_start))
                late_in_mins = max(0, base_late - overlap)
            else:
                late_in_mins = max(0, base_late - p_mins)

        # 3. Early Out: 6:30 PM - Check Out (if Check Out < 6:30 PM)
        early_out_mins = 0
        if out_mins < STANDARD_OUT_MINS:
            base_early_out = STANDARD_OUT_MINS - out_mins
            if p_data:
                p_start = to_minutes(p_data["start"])
                p_end = to_minutes(p_data["end"])
                if p_end <= p_start:
                    p_end += 24 * 60
                overlap = max(0, min(STANDARD_OUT_MINS, p_end) - max(out_mins, p_start))
                early_out_mins = max(0, base_early_out - overlap)
            else:
                early_out_mins = max(0, base_early_out - p_mins)

        # 4. Overtime: Check Out - 6:30 PM (if Check Out > 6:30 PM)
        overtime_mins = max(0, out_mins - STANDARD_OUT_MINS) if out_mins > STANDARD_OUT_MINS else 0

    return {
        "working_hours": working_hours,
        "working_mins": working_mins,
        "permission_mins": p_mins,
        "permission_hours": p_hrs,
        "early_in_mins": early_in_mins,
        "late_in_mins": late_in_mins,
        "early_out_mins": early_out_mins,
        "overtime_mins": overtime_mins,
        "is_overnight": is_overnight
    }

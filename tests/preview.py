"""Print the first N weeks of the .ics as a readable list, parsed independently of make_ics.py."""
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events

LONDON = ZoneInfo("Europe/London")
path = Path(__file__).resolve().parent.parent / "calendar" / "training_plan.ics"
weeks = int(sys.argv[1]) if len(sys.argv) > 1 else 3
cal = icalendar.Calendar.from_ical(path.read_bytes())
start = date(2026, 10, 5)
evs = recurring_ical_events.of(cal).between(start, start + timedelta(days=7 * weeks))


def key(e):
    d = e["DTSTART"].dt
    if not isinstance(d, datetime):
        return (d, "00:00")
    d = d.astimezone(LONDON)
    return (d.date(), d.strftime("%H:%M"))


day = None
for e in sorted(evs, key=key):
    d, t = key(e)
    if d != day:
        wk = (d - start).days // 7 + 1
        print(f"\n{d:%a %d %b} (week {wk})")
        day = d
    dt = e["DTSTART"].dt
    label = "all day" if not isinstance(dt, datetime) else f"{t} {dt.astimezone(LONDON).tzname()}"
    print(f"  {label:<10} {e['SUMMARY']}")

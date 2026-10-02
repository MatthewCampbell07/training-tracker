"""Build training_plan.ics from app/plan.json. Standard library only.

Usage:
  python3 calendar/make_ics.py                          # normal 3 day plan
  python3 calendar/make_ics.py --golf-from 2026-11-16   # 2 sessions a week from that date
  python3 calendar/make_ics.py --start 2026-10-08       # move week 1 (any weekday)
"""
import argparse
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
LONDON = ZoneInfo("Europe/London")
TZID = "Europe/London"
DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]  # index = date.weekday()
PRIORITY_WEEKS = (7, 11)  # same as app/logic.js

# Europe/London rules: BST from last Sunday of March 01:00 UTC, GMT from last Sunday of October 01:00 UTC.
VTIMEZONE = """BEGIN:VTIMEZONE
TZID:Europe/London
BEGIN:DAYLIGHT
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
TZNAME:BST
DTSTART:19700329T010000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
TZNAME:GMT
DTSTART:19701025T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE"""


def js_dow(d: date) -> str:
    """plan.json uses JavaScript day numbers: 0 = Sunday, 1 = Monday."""
    return str((d.weekday() + 1) % 7)


def escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line: str) -> str:
    """Fold lines longer than 75 octets, as the iCalendar spec requires."""
    out, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > (75 if not out else 74):
            out.append(cur.decode("utf-8"))
            cur = b""
        cur += b
    out.append(cur.decode("utf-8"))
    return "\r\n ".join(out)


def local(d: date, hhmm: str) -> str:
    h, m = hhmm.split(":")
    return f"{d:%Y%m%d}T{h}{m}00"


def add_minutes(d: date, hhmm: str, minutes: int) -> str:
    h, m = map(int, hhmm.split(":"))
    end = datetime(d.year, d.month, d.day, h, m) + timedelta(minutes=minutes)
    return end.strftime("%Y%m%dT%H%M%S")


def alarm(minutes_before: int, text: str) -> list[str]:
    return ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{escape(text)}", f"TRIGGER:-PT{minutes_before}M", "END:VALARM"]


def event(uid, summary, start_date, start_time, minutes, description="", rrule=None, alarm_before=None, stamp=""):
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}@training-tracker",
        f"DTSTAMP:{stamp}",
        f"DTSTART;TZID={TZID}:{local(start_date, start_time)}",
        f"DTEND;TZID={TZID}:{add_minutes(start_date, start_time, minutes)}",
        f"SUMMARY:{escape(summary)}",
    ]
    if description:
        lines.append(f"DESCRIPTION:{escape(description)}")
    if rrule:
        lines.append(f"RRULE:{rrule}")
    if alarm_before is not None:
        lines += alarm(alarm_before, summary)
    lines.append("END:VEVENT")
    return lines


def all_day(uid, summary, first: date, days: int, description="", stamp=""):
    return [
        "BEGIN:VEVENT",
        f"UID:{uid}@training-tracker",
        f"DTSTAMP:{stamp}",
        f"DTSTART;VALUE=DATE:{first:%Y%m%d}",
        f"DTEND;VALUE=DATE:{first + timedelta(days=days):%Y%m%d}",
        f"SUMMARY:{escape(summary)}",
        f"DESCRIPTION:{escape(description)}",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
    ]


def phase_for(week, plan):
    return next(p for p in plan["phases"] if p["from"] <= week <= p["to"])


def sets_for(ex, week, plan, golf):
    if ex["sets"] == 1:
        return 1
    if golf or week == 1:
        return 2
    if week in plan["deloadWeeks"]:
        return -(-ex["sets"] // 2)
    if ex.get("priority") and PRIORITY_WEEKS[0] <= week <= PRIORITY_WEEKS[1]:
        return ex["sets"] + 1
    return ex["sets"]


def session_description(letter, week, plan, golf):
    session = plan["sessions"][letter]
    phase = phase_for(week, plan)
    lines = [f"Week {week}: {phase['name']}. {phase['note']}"]
    if golf:
        lines.append("Golf mode: 2 sets per exercise.")
    lines.append("")
    if not session.get("retest"):
        lines.append("Warm up: " + "; ".join(w["name"] for w in plan["warmup"]))
        lines.append("")
    for ex in session["exercises"]:
        n = sets_for(ex, week, plan, golf)
        rng = "max" if ex["max"] is None else (str(ex["max"]) if ex["min"] == ex["max"] else f"{ex['min']}-{ex['max']}")
        unit = " sec" if ex["unit"] == "sec" else ""
        each = " each" if ex.get("each") else ""
        star = " *" if ex.get("priority") else ""
        lines.append(f"{ex['name']}: {n} x {rng}{unit}{each}{star}")
    lines.append("")
    lines.append("* upper body priority (4 sets in weeks 7 to 11)")
    lines.append("Log every set in the Training app. Tap How to do it on any exercise for steps and videos.")
    return "\n".join(lines)


def build(plan, start: date, golf_from: date | None, stamp: str) -> str:
    cal = plan["calendar"]
    weeks = plan["weeks"]
    end = start + timedelta(days=weeks * 7 - 1)
    # UNTIL must be UTC. The plan ends in winter (GMT) so local end of day equals UTC.
    until_local = datetime(end.year, end.month, end.day, 23, 59, 59, tzinfo=LONDON)
    until = until_local.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//training-tracker//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Training",
        f"X-WR-TIMEZONE:{TZID}",
        VTIMEZONE,
    ]

    # The retest replaces the last session of the retest week.
    rw_start = start + timedelta(days=(plan["retestWeek"] - 1) * 7)
    retest_day = max(rw_start + timedelta(days=k) for k in range(7)
                     if plan["schedule"]["normal"].get(js_dow(rw_start + timedelta(days=k))))

    # Lifting sessions: one event each so the title can carry the week and phase.
    for i in range(weeks * 7):
        d = start + timedelta(days=i)
        week = i // 7 + 1
        golf = golf_from is not None and d >= golf_from
        letter = plan["schedule"]["golf" if golf else "normal"].get(js_dow(d))
        if not letter:
            continue
        if d == retest_day and not golf:
            letter = "R"
        tag = " (deload)" if week in plan["deloadWeeks"] else ""
        name = "Retest" if letter == "R" else f"Session {letter}"
        summary = f"{name}, week {week}{tag}"
        out += event(f"lift-{d:%Y%m%d}", summary, d, cal["liftTimes"][js_dow(d)], cal["liftMinutes"],
                     session_description(letter, week, plan, golf), alarm_before=30, stamp=stamp)

    # Morning check-in and physio: group days that share a time and a weigh in.
    groups: dict[tuple[str, bool], list[date]] = {}
    for i in range(7):
        d = start + timedelta(days=i)
        key = (cal["physioAm"][js_dow(d)], (int(js_dow(d)) in cal["weighInDays"]))
        groups.setdefault(key, []).append(d)
    for (time, weigh), days in sorted(groups.items()):
        byday = ",".join(DAY_CODES[d.weekday()] for d in days)
        summary = "Weigh in, check-in, physio" if weigh else "Check-in, physio"
        desc = ("Weigh in after the toilet, before food. " if weigh else "") + \
            "Open the Training app: sleep and wake time, tick last night's habits. Then the physio block."
        out += event(f"am-{byday.replace(',', '')}", summary, days[0], time, cal["physioMinutes"], desc,
                     rrule=f"FREQ=WEEKLY;BYDAY={byday};UNTIL={until}", alarm_before=0, stamp=stamp)

    out += event("pm-physio", "Physio, evening", start, cal["physioPm"], cal["physioMinutes"],
                 "Evening physio block. Tick it in the Training app.",
                 rrule=f"FREQ=DAILY;UNTIL={until}", alarm_before=0, stamp=stamp)

    out += event("phone-away", "Phone away", start, cal["phoneAway"], 15,
                 "Start the sleep music timer, phone across the room, Sleep Focus on. "
                 "Aim for 7+ hours asleep: on a 06:15 alarm, asleep by 23:15.",
                 rrule=f"FREQ=DAILY;UNTIL={until}", alarm_before=0, stamp=stamp)

    first_review = start + timedelta(days=(6 - start.weekday()) % 7)
    out += event("weekly-review", "Weekly review", first_review, cal["reviewTime"], 15,
                 "Training app, Week tab: sessions, weigh in average, add load list, gym check. "
                 "Then Settings, Save backup to iCloud Drive.",
                 rrule=f"FREQ=WEEKLY;BYDAY=SU;UNTIL={until}", alarm_before=0, stamp=stamp)

    for w in plan["deloadWeeks"]:
        first = start + timedelta(days=(w - 1) * 7)
        note = "Half the sets, same weights. Keep the daily physio work."
        if w == plan["retestWeek"]:
            note += f" Retest on {retest_day:%A %d %B}."
        out += all_day(f"deload-w{w}", f"Deload week {w}", first, 7, note, stamp)

    out.append("END:VCALENDAR")
    lines = []
    for block in out:
        lines += block.split("\n")
    return "\r\n".join(fold(l) for l in lines) + "\r\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", help="First day of week 1, YYYY-MM-DD (default from plan.json)")
    ap.add_argument("--golf-from", help="Switch to 2 sessions a week from this date, YYYY-MM-DD")
    ap.add_argument("--out", default=str(ROOT / "calendar" / "training_plan.ics"))
    args = ap.parse_args()

    plan = json.loads((ROOT / "app" / "plan.json").read_text())
    start = date.fromisoformat(args.start or plan["startDate"])
    golf_from = date.fromisoformat(args.golf_from) if args.golf_from else None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    Path(args.out).write_text(build(plan, start, golf_from, stamp), newline="")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()

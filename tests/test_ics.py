"""Checks the .ics with independent parsers (icalendar + recurring_ical_events), not with make_ics itself."""
import json
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import icalendar
import pytest
import recurring_ical_events

ROOT = Path(__file__).resolve().parent.parent
LONDON = ZoneInfo("Europe/London")
START = date(2026, 10, 5)
END = date(2026, 12, 27)
PLAN = json.loads((ROOT / "app" / "plan.json").read_text())


def build(tmp_path, *extra):
    out = tmp_path / "t.ics"
    subprocess.run([sys.executable, str(ROOT / "calendar" / "make_ics.py"), "--out", str(out), *extra], check=True)
    return icalendar.Calendar.from_ical(out.read_bytes())


def expand(cal):
    return recurring_ical_events.of(cal).between(datetime(2026, 9, 1, tzinfo=LONDON), datetime(2027, 3, 1, tzinfo=LONDON))


def starts(events, prefix):
    return sorted(e["DTSTART"].dt for e in events if str(e["SUMMARY"]).startswith(prefix))


@pytest.fixture(scope="module")
def events(tmp_path_factory):
    return expand(build(tmp_path_factory.mktemp("ics")))


def test_36_lifts_on_mon_wed_fri_with_right_week_numbers(events):
    lifts = [e for e in events if str(e["SUMMARY"]).startswith(("Session", "Retest"))]
    assert len(lifts) == 36
    expected = {0: "Session A", 2: "Session B", 4: "Session C"}
    for e in lifts:
        d = e["DTSTART"].dt.date()
        week = (d - START).days // 7 + 1
        title = str(e["SUMMARY"])
        assert f"week {week}" in title
        if d == date(2026, 12, 25):
            assert title.startswith("Retest")
        else:
            assert title.startswith(expected[d.weekday()])


def test_deload_tag_only_on_weeks_6_and_12(events):
    for e in events:
        title = str(e["SUMMARY"])
        if title.startswith(("Session", "Retest")):
            week = (e["DTSTART"].dt.date() - START).days // 7 + 1
            assert ("(deload)" in title) == (week in (6, 12)), title


def test_deload_all_day_banners(events):
    deloads = sorted((e["DTSTART"].dt, e["DTEND"].dt) for e in events if str(e["SUMMARY"]).startswith("Deload"))
    assert deloads == [(date(2026, 11, 9), date(2026, 11, 16)), (date(2026, 12, 21), date(2026, 12, 28))]


def test_clock_change_keeps_local_times(events):
    """Clocks go back at 02:00 on Sun 25 Oct 2026. Local times stay put, UTC shifts by an hour."""
    a = {d.date(): d for d in starts(events, "Session A")}
    assert a[date(2026, 10, 19)].astimezone(timezone.utc).hour == 16  # 17:30 BST
    assert a[date(2026, 10, 26)].astimezone(timezone.utc).hour == 17  # 17:30 GMT
    pm = {d.date(): d for d in starts(events, "Physio, evening")}
    assert pm[date(2026, 10, 24)].astimezone(timezone.utc).strftime("%H:%M") == "20:30"
    assert pm[date(2026, 10, 25)].astimezone(timezone.utc).strftime("%H:%M") == "21:30"
    assert all(d.astimezone(LONDON).strftime("%H:%M") == "21:30" for d in pm.values())


def test_daily_routines_cover_all_84_days(events):
    for prefix in ("Physio, evening", "Phone away"):
        days = [d.date() for d in starts(events, prefix)]
        assert len(days) == 84 and days[0] == START and days[-1] == END
    mornings = [d.date() for d in starts(events, "Weigh in") + starts(events, "Check-in")]
    assert sorted(mornings) == [START + timedelta(days=i) for i in range(84)]


def test_morning_times_match_office_and_home_days(events):
    for d in starts(events, "Weigh in") + starts(events, "Check-in"):
        key = str((d.weekday() + 1) % 7)
        assert d.astimezone(LONDON).strftime("%H:%M") == PLAN["calendar"]["physioAm"][key]


def test_weigh_ins_four_a_week_and_12_reviews(events):
    weigh = starts(events, "Weigh in")
    assert len(weigh) == 48
    assert {d.weekday() for d in weigh} == {0, 2, 4, 6}
    reviews = starts(events, "Weekly review")
    assert len(reviews) == 12 and all(d.weekday() == 6 for d in reviews)


def test_nothing_after_week_12(events):
    for e in events:
        d = e["DTSTART"].dt
        d = d.date() if isinstance(d, datetime) else d
        assert d <= END, e["SUMMARY"]


def test_timed_events_have_alerts(tmp_path):
    cal = build(tmp_path)
    for ev in cal.walk("VEVENT"):
        timed = isinstance(ev["DTSTART"].dt, datetime)
        assert bool(ev.walk("VALARM")) == timed, ev["SUMMARY"]


def test_golf_mode_drops_fridays_and_uses_2_sets(tmp_path):
    events = expand(build(tmp_path, "--golf-from", "2026-11-16"))
    lifts = [e for e in events if str(e["SUMMARY"]).startswith(("Session", "Retest"))]
    before = [e for e in lifts if e["DTSTART"].dt.date() < date(2026, 11, 16)]
    after = [e for e in lifts if e["DTSTART"].dt.date() >= date(2026, 11, 16)]
    assert len(before) == 18
    assert len(after) == 12 and {e["DTSTART"].dt.weekday() for e in after} == {0, 2}
    assert all("Golf mode" in str(e["DESCRIPTION"]) for e in after)


def test_start_must_be_monday(tmp_path):
    r = subprocess.run([sys.executable, str(ROOT / "calendar" / "make_ics.py"), "--start", "2026-10-06",
                        "--out", str(tmp_path / "x.ics")], capture_output=True, text=True)
    assert r.returncode != 0 and "must be a Monday" in r.stderr

# Training Tracker

This project has two parts:
- a 12 week calendar for Apple Calendar
- an iPhone app for daily habits, session logging and stats

Everything you log stays on your phone. There are no accounts except GitHub, and GitHub only hosts the app. It never sees your data.

## 1. Import the calendar (5 min)

1. On your Mac, open Calendar. Choose File > New Calendar and name it **Training**.
2. File > Import, then pick `calendar/training_plan.ics`. When asked which calendar, choose **Training**.
3. The events sync to your iPhone through iCloud. Alerts are built in: 30 minutes before each session, and at the start of physio, phone away and the weekly review.

What's in it:
- **Sessions:** Mon A at 17:30, Wed B at 17:30, Fri C at 16:30
- **Morning check-in and physio:** 06:25 on office days, 07:40 at home, 08:30 at weekends. Weigh in on Mon, Wed, Fri and Sun.
- **Every evening:** physio at 21:30, phone away at 22:30
- **Sundays:** weekly review at 19:00
- **Banners:** deload weeks 6 and 12, and a note in week 2 to show your physio the plan

The clocks go back on 25 Oct. Every event keeps its local time.

## 2. Put the app on your iPhone (2 min, once)

The app is live at **https://matthewcampbell07.github.io/training-tracker/**

1. On your iPhone, open that address in **Safari**.
2. Tap Share > **Add to Home Screen**.
3. Always open it from the home screen icon. Safari keeps the home screen app's data separate from its normal tabs.

The repo is public because free GitHub Pages needs that. It only holds the plan and the code, not your logs.

## 3. Daily use

- **Morning (2 min):** on the Today tab, enter when you fell asleep, when you woke, and your weight on weigh-in days. Tick last night's habits. "Up by wake time" ticks itself.
- **Physio:** tick the morning and evening blocks when they're done.
- **Lift days:** tap the blue session card. Enter kg and reps for each set. A red label tells you when to add weight. Tick "2+ reps left" on goblet squat and RDL so the gym check works. Tap **Finish session**.
- **Sunday review:** look at the Week tab, then Settings > **Save backup** to iCloud Drive.
- **Stats:** badges, streaks, a 12 week heatmap, key lifts against the 20 kg line, body weight and sleep.

To fill in a missed day, use the arrows at the top of Today.

**Screen Time (2 min, once):**
1. Settings > Screen Time > App Limits > Add Limit. Pick Instagram and TikTok and set 30 minutes.
2. Screen Time > Downtime: 22:30 to 06:15.
3. Tap Ignore Limit on any day you need to switch it off.

## 4. When golf picks up

1. **App:** Settings > Golf mode, pick the Monday it starts, then tap Turn on. From that date it's A on Monday and B on Wednesday, 2 sets each.
2. **Calendar:** rebuild it with the same date:
   ```bash
   python3 calendar/make_ics.py --golf-from 2026-11-16
   ```
3. On your Mac, delete the **Training** calendar and import the new file again, as in step 1.

Other changes:
- **Move week 1:** run `python3 calendar/make_ics.py --start 2026-10-12` and change the start date in the app's Settings.
- **Change times or exercises:** edit `app/plan.json`, which both the app and the calendar read. Rebuild the calendar. Bump `VERSION` in `app/sw.js`, then run `git commit -am "update plan" && git push`. The phone picks up the change the second time you open the app.

## Checks

```bash
npm test
```

```bash
.venv/bin/python -m pytest tests/
```

```bash
.venv/bin/python tests/preview.py 3
```

- `npm test`: 13 tests covering week numbers, the schedule, sets per week, the progression rule, streaks, the gym check and badges
- `pytest`: 11 tests that read the .ics with an independent parser. They cover 36 sessions on the right days, the deload weeks, the clock change on 25 Oct, the 84 daily events, alerts and golf mode.
- `preview.py 3`: prints the first 3 weeks of events

To set up the Python test environment for the first time:
```bash
python3 -m venv .venv && .venv/bin/pip install icalendar recurring-ical-events pytest
```

## Files

| Path | What |
|---|---|
| `app/` | The iPhone app. `plan.json` is the plan, the `.js` files are the logic and screens. |
| `calendar/make_ics.py` | Builds `training_plan.ics` from `plan.json` |
| `tests/` | App logic tests (Node), calendar tests (pytest), calendar preview |
| `HABITS.md` | The sleep and screen habits, with sources |

# Bringing your Garmin workouts into HealthCal

HealthCal can read the workout files you export from Garmin Connect. Each workout becomes a session in Train, with the calories your watch measured. You see every workout before anything is added, and the files are read on your device: nothing is uploaded.

Open it from **Train > Import workouts from Garmin**, or **Profile > Your data > Import from Garmin**.

## 1. Get your files out of Garmin Connect

Use the Garmin Connect **website** (connect.garmin.com). The Garmin Connect phone app cannot export workouts. On a phone, open the website in your browser and turn on the desktop site.

**One workout**

1. Open the activity.
2. Tap the gear icon at the top right.
3. Choose **Export Original**. You get a ZIP file with the original FIT file inside. Choose that ZIP in HealthCal; there is no need to unzip it.

The same menu also has **Export to TCX** and **Export to GPX**. Both work, but the original FIT file carries the most.

**Many workouts at once**

1. Open **Activities**, then **All Activities**.
2. Scroll down until every workout you want is on the page. Garmin exports only the rows it has loaded.
3. Choose **Export CSV** at the top right.

You can choose several files at once, and mix formats.

## 2. What each format carries

| Format | Where it comes from | What HealthCal reads |
|---|---|---|
| FIT | Export Original (inside a ZIP) | Sport, start time, moving time, distance, Garmin's calories, heart rate. Every leg of a multisport event (a triathlon) is its own workout. |
| TCX | Export to TCX | Start time, moving time, distance, calories and heart rate, summed over the laps. TCX only knows Running, Biking and Other, so an "Other" workout asks you which activity it was. |
| GPX | Export to GPX | The route and its times. **No calories and no moving time**: the duration includes pauses, the distance is measured from the map points, and the calories are estimated the way a session you log by hand is. |
| CSV | Activities > Export CSV | One row per workout: type, date, time, distance, calories, heart rate. No route. English, German, French, Spanish, Italian, Dutch and Portuguese exports are understood. |
| ZIP | Any of the above, as Garmin downloads it | The FIT, TCX, GPX and CSV files inside, including ZIPs inside ZIPs. |

### Two questions for a CSV

The Activities CSV does not say which units or time zone it uses, so HealthCal asks:

- **Distances in this file are in kilometres or miles.** This follows the units in your Garmin Connect account settings when you exported. HealthCal suggests your own unit setting, but check it: a wrong answer makes every distance 1.6 times too long or too short.
- **Times in this file are local time in** your device's time zone. Change it only if you exported while travelling, or the workouts were somewhere else. A wrong zone moves every workout by whole hours, and a late-evening workout can land on the wrong day.

### Old watches whose clock was never set

Some older watches record their own running time instead of the date and time. HealthCal works the start out from the watch's local time and asks you to check the day, with arrows to move it a day earlier or later.

## 3. How calories are counted, and why

Garmin's calorie figure for a workout is the **total** your body burned during it, including the energy you would have burned anyway just being alive (resting energy). HealthCal's daily budget already includes your resting energy. Adding Garmin's full figure would count that part twice.

So for each workout HealthCal shows two numbers:

- **"658 by watch"**: Garmin's own figure, exactly as the file has it. It is stored with the session.
- **"+561 kcal"**: what is added to that day's budget. This is Garmin's figure minus your resting energy for the same minutes, worked out from the same profile numbers HealthCal uses for a session you log yourself. A very easy session can add little or nothing.

The effort level stored with the session (light, moderate, hard) is the one that matches the calories Garmin measured, so minutes toward the weekly activity guideline follow what your watch saw.

A GPX file has no calories. Its workout shows an estimate with a range, for example "~512 kcal, est. 410–614", and you can choose the effort it is estimated at.

## 4. Duplicates

Importing the same file twice adds nothing. HealthCal recognises a workout by its start time to the second, so the FIT, TCX and CSV versions of one workout are the same workout.

In the list:

- **Already imported**: this workout is already in HealthCal. It cannot be ticked. If you imported it before and then deleted it, a **Restore it** link brings it back.
- **Listed twice**: the same workout is in two of the files you chose (for example its FIT and its GPX). The richer one is used: FIT, then TCX, then CSV, then GPX.
- **Possible duplicate**: it looks like a session you logged by hand at the same time, or it covers the same time as another workout in this import (for example a CSV "Multisport" row next to the legs from the FIT file). It is unticked so nothing is counted twice; tick it if it really is a separate workout.

After importing, a message offers **Undo**, which takes out exactly the workouts that were just added.

## 5. What is not supported yet

- **Automatic sync.** Workouts do not arrive by themselves. Syncing through Apple Health or Health Connect, and Garmin's own developer API, are not built yet. For now, export and import files.
- **The full account export** (Garmin account > Data Management > Export Your Data) is untested. It can be hundreds of megabytes, which may be too much for a phone. Use Export Original or the Activities CSV instead.
- **"Export Splits to CSV"** files (one row per lap) are not recognised: they do not say which day the workout was.
- **Mile-account CSV files** follow Garmin's documented format, but no real one was available to test.
- **Editing an imported session** keeps it linked to the Garmin workout, so importing the same file again still recognises it. Notes, date and distance can be changed freely. Changing the activity, the effort or the duration replaces Garmin's measured calories with the app's estimate for the new values, and the session is then shown as an estimate.

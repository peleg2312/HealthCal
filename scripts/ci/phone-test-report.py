#!/usr/bin/env python3
"""What a phone test run did, for someone who cannot open the pictures one by one.

    python3 scripts/ci/phone-test-report.py <ios|android> <results dir>

Reads the folders scripts/ci/run-flows.sh wrote and
  - prints one line per flow: its name and passed or failed, and for a failure the step that
    failed and Maestro's message (from debug/commands-*.json, else report.xml, else console.txt);
  - adds the same as a table to the job's summary page when GITHUB_STEP_SUMMARY is set;
  - makes ONE contact sheet, <results dir>/contact-<platform>.jpg: every screenshot about 240 px
    wide in a grid, in the order the flows ran, each with "<flow>/<picture>" under it.

The lines need only the standard library. The contact sheet needs Pillow (pip install pillow);
without it the lines are still printed and the sheet is skipped with a note.
Always exits 0: it reports, the flows' own step decides whether the job failed.
"""

import glob
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

THUMB_W = 240
COLUMNS = 6
LABEL_H = 34
GAP = 8
FLOW_ORDER_FILE = "order.txt"


def flows_in_order(root):
    names = []
    path = os.path.join(root, FLOW_ORDER_FILE)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                name = line.strip()
                if name and name not in names:
                    names.append(name)
    # Other folders count only when they hold a flow's result.txt (crash-reports/ and the like are not flows).
    for d in sorted(os.listdir(root)):
        p = os.path.join(root, d)
        if os.path.isdir(p) and d not in names and os.path.exists(os.path.join(p, "result.txt")):
            names.append(d)
    return names


def short(value, limit=220):
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def describe_command(command):
    """A readable form of one Maestro command as commands-*.json stores it."""
    if not isinstance(command, dict) or not command:
        return short(command)
    key, body = next(iter(command.items()))
    if isinstance(body, dict):
        for field in ("description", "label"):
            if body.get(field):
                return short(f"{key}: {body[field]}")
        selector = body.get("selector") or body.get("element") or {}
        if isinstance(selector, dict):
            parts = [f"{k}={v}" for k, v in selector.items() if k in ("idRegex", "textRegex", "id", "text", "index") and v not in (None, "")]
            if parts:
                return short(f"{key}: " + ", ".join(parts))
        return short(f"{key}: " + json.dumps(body, ensure_ascii=False))
    return short(f"{key}: {body}")


def failed_step(flow_dir):
    """(step, message) for the first failed command, best source first."""
    for path in sorted(glob.glob(os.path.join(flow_dir, "debug", "**", "commands*.json"), recursive=True)):
        try:
            with open(path, encoding="utf-8") as f:
                entries = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(entries, dict):
            entries = entries.get("commands", [])
        for entry in entries if isinstance(entries, list) else []:
            meta = entry.get("metadata", {}) if isinstance(entry, dict) else {}
            if str(meta.get("status", "")).upper() == "FAILED":
                error = meta.get("error") or {}
                message = error.get("message") if isinstance(error, dict) else error
                return describe_command(entry.get("command")), short(message or "")
    report = os.path.join(flow_dir, "report.xml")
    if os.path.exists(report):
        try:
            for failure in ET.parse(report).getroot().iter("failure"):
                return "", short(failure.get("message") or failure.text or "")
        except ET.ParseError:
            pass
    console = os.path.join(flow_dir, "console.txt")
    if os.path.exists(console):
        with open(console, encoding="utf-8", errors="replace") as f:
            lines = [l.rstrip() for l in f if l.strip()]
        marked = [l for l in lines if "FAILED" in l or "❌" in l or "Error" in l]
        if marked:
            return "", short(marked[-1])
        if lines:
            return "", short(lines[-1])
    path = os.path.join(flow_dir, "failure.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return "", short(f.read())
    return "", "no Maestro output (did the step that runs the flows start?)"


def report_lines(platform, root, names):
    rows = []
    for name in names:
        flow_dir = os.path.join(root, name)
        result_path = os.path.join(flow_dir, "result.txt")
        if os.path.exists(result_path):
            with open(result_path, encoding="utf-8") as f:
                result = f.read().strip() or "unknown"
        else:
            result = "not run"
        step, message = ("", "") if result == "passed" else failed_step(flow_dir)
        rows.append((name, result, step, message))
        line = f"{platform} {name}: {result}"
        if result != "passed":
            if step:
                line += f" at step [{step}]"
            if message:
                line += f": {message}"
        print(line)
    return rows


def write_summary(platform, rows, sheet):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"### Phone test, {platform}\n\n| Flow | Result | Failed step | Message |\n|---|---|---|---|\n")
        for name, result, step, message in rows:
            cell = lambda s: s.replace("|", "\\|").replace("\n", " ")
            f.write(f"| {name} | {result} | {cell(step)} | {cell(message)} |\n")
        if not rows:
            f.write("| (no flows ran) | | | |\n")
        f.write(f"\nContact sheet: `{os.path.basename(sheet)}` in the job's artifact.\n\n" if sheet else "\nNo contact sheet.\n\n")


def screenshots(root, names):
    pictures = []
    for name in names:
        flow_dir = os.path.join(root, name)
        found = sorted(glob.glob(os.path.join(flow_dir, "**", "*.png"), recursive=True))
        for path in found:
            pictures.append((name, path))
    return pictures


def contact_sheet(platform, root, names):
    pictures = screenshots(root, names)
    if not pictures:
        print(f"{platform}: no screenshots, so no contact sheet")
        return None
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print(f"{platform}: Pillow is not installed, so no contact sheet ({len(pictures)} screenshots are in the artifact)")
        return None

    try:
        font = ImageFont.load_default(size=13)
    except TypeError:  # Pillow before 10.1
        font = ImageFont.load_default()

    thumbs = []
    for flow, path in pictures:
        try:
            with Image.open(path) as im:
                im = im.convert("RGB")
                h = max(1, round(im.height * THUMB_W / im.width))
                thumbs.append((flow, os.path.splitext(os.path.basename(path))[0], im.resize((THUMB_W, h), Image.LANCZOS)))
        except Exception as e:  # a half-written PNG must not lose the others
            print(f"{platform}: skipped {path}: {e}")
    if not thumbs:
        return None

    cols = min(COLUMNS, len(thumbs))
    rows = [thumbs[i : i + cols] for i in range(0, len(thumbs), cols)]
    row_h = [max(t[2].height for t in r) + LABEL_H for r in rows]
    width = cols * THUMB_W + (cols + 1) * GAP
    height = sum(row_h) + (len(rows) + 1) * GAP
    sheet = Image.new("RGB", (width, height), (245, 243, 240))
    draw = ImageDraw.Draw(sheet)

    def fit(text):
        while text and draw.textlength(text, font=font) > THUMB_W - 4:
            text = text[:-2] + "…" if len(text) > 2 else ""
        return text

    y = GAP
    for r, h in zip(rows, row_h):
        x = GAP
        for flow, label, im in r:
            sheet.paste(im, (x, y))
            draw.rectangle([x, y, x + im.width - 1, y + im.height - 1], outline=(190, 186, 180))
            draw.text((x + 2, y + im.height + 3), fit(label), fill=(20, 20, 20), font=font)
            draw.text((x + 2, y + im.height + 18), fit(flow), fill=(110, 110, 110), font=font)
            x += THUMB_W + GAP
        y += h + GAP

    out = os.path.join(root, f"contact-{platform}.jpg")
    sheet.save(out, "JPEG", quality=72, optimize=True)
    print(f"{platform}: contact sheet {out} ({len(thumbs)} screenshots, {sheet.width}x{sheet.height}, {os.path.getsize(out) // 1024} KB)")
    return out


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 0
    platform, root = sys.argv[1], sys.argv[2]
    if not os.path.isdir(root):
        print(f"{platform}: no results folder {root}: no flow ran")
        write_summary(platform, [], None)
        return 0
    names = flows_in_order(root)
    rows = report_lines(platform, root, names)
    if not rows:
        print(f"{platform}: no flow ran")
    try:
        sheet = contact_sheet(platform, root, names)
    except Exception as e:  # the lines above matter more than the picture
        print(f"{platform}: contact sheet failed: {e}")
        sheet = None
    write_summary(platform, rows, sheet)
    return 0


if __name__ == "__main__":
    sys.exit(main())

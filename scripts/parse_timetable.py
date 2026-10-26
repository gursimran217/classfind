#!/usr/bin/env python3
"""CLASSFIND timetable PDF parser.

Reads an official section timetable PDF (the landscape "ELECTRICAL GROUP"
layout) and emits data/seed/timetable.generated.json.

The PDF is a text layer, not a scan, so no OCR is needed. Its meaning lives in
the *coordinates*: day labels down the left, time columns across the top, and
subject codes in the grid between them. A plain text dump comes out scrambled,
so every field below is recovered from word bounding boxes.
"""
import json
import os
import re
import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SEED_DIR = os.path.join(ROOT, "data", "seed")

DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
DAY_INDEX = {d: i for i, d in enumerate(DAYS)}
TIME_RE = re.compile(r"^\d{2}:\d{2}-\d{2}:\d{2}$")
DAY_RE = re.compile(r"^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)$")

# Short codes used in the grid -> readable subject names. Anything not listed
# keeps its code, so a new subject still shows up (just unlabelled).
SUBJECT_NAMES = {
    "PHY": "Physics",
    "CALCULAS": "Calculus & Laplace Transforms",
    "PSP": "Problem Solving & Programming",
    "PPS": "Problem Solving & Programming",  # the PDF writes PPS in the grid
    "EE": "Electrical & Electronics Engineering",
    "EVS": "Environment Studies",
    "DT": "Design Thinking",
    "BC": "Business Communication",
    "TEP": "Technology Exploration & Product Engineering",
}


def words(page):
    return page.get_text("words")


def parse(pdf_path):
    doc = pymupdf.open(pdf_path)
    page = doc[0]
    ws = words(page)

    # --- day rows ---------------------------------------------------------
    day_rows = []
    for x0, y0, x1, y1, word, *_ in ws:
        m = DAY_RE.match(word.upper())
        if m and x0 < 200:
            day_rows.append((DAY_INDEX[m.group(1)], y0, x1))
    day_rows.sort(key=lambda t: t[1])

    # --- time columns -----------------------------------------------------
    cols = []
    for x0, y0, x1, y1, word, *_ in ws:
        if TIME_RE.match(word):
            start, end = word.split("-")
            cols.append((start, end, x0, x1))
    cols.sort(key=lambda t: t[2])
    if not day_rows or not cols:
        raise SystemExit(f"No grid found in {pdf_path}")

    grid_left = min(c[2] for c in cols) - 40
    grid_right = max(c[3] for c in cols) + 40
    first_row_y = day_rows[0][1]
    last_row_y = day_rows[-1][1]
    row_gap = (last_row_y - first_row_y) / max(1, len(day_rows) - 1)

    # --- collect tokens inside the grid band ------------------------------
    # A token belongs to a day if its y sits within that row's band.
    def day_for_y(y):
        best = None
        best_d = 1e9
        for idx, ry, _ in day_rows:
            d = abs(y - ry)
            if d < best_d:
                best_d = d
                best = idx
        return best if best_d <= row_gap * 0.75 else None

    def period_for_x(x):
        best = None
        best_d = 1e9
        for i, (start, end, cx0, cx1) in enumerate(cols):
            center = (cx0 + cx1) / 2
            d = abs(x - center)
            if d < best_d:
                best_d = d
                best = i
        return best

    # tokens within the grid band, grouped per day row
    band = {}
    for x0, y0, x1, y1, word, *_ in ws:
        if not (first_row_y - row_gap * 0.75 <= y0 <= last_row_y + row_gap * 0.75):
            continue
        if not (grid_left <= x0 <= grid_right):
            continue
        if DAY_RE.match(word.upper()) or TIME_RE.match(word):
            continue
        d = day_for_y(y0)
        if d is None:
            continue
        band.setdefault(d, []).append((y0, x0, x1, word))

    SKIP = {"LUNCH", "BREAK", "LUNCH BREAK"}
    slots = []
    for d, toks in band.items():
        # Cluster into visual lines by y first — a day can carry two stacked
        # sub-rows (the T1/T2 lab split), which must not be merged together.
        toks.sort(key=lambda t: (t[0], t[1]))
        lines = []
        for y, x0, x1, word in toks:
            if lines and abs(y - lines[-1][0]) < 8:
                lines[-1][1].append((x0, x1, word))
            else:
                lines.append([y, [(x0, x1, word)]])

        for _y, items in lines:
            items.sort()
            cells = []
            cur = None
            for x0, x1, word in items:
                if cur and x0 - cur[2] < 26:
                    cur[0] = cur[0] + " " + word
                    cur[2] = x1
                else:
                    if cur:
                        cells.append(cur)
                    cur = [word, x0, x1]
            if cur:
                cells.append(cur)

            for text, left, right in cells:
                p = period_for_x(left)
                if p is None:
                    continue
                clean = text.strip()
                if clean.upper() in SKIP:
                    continue
                group = None
                gm = re.search(r"\s+T([12])$", clean)
                if gm:
                    group = f"T{gm.group(1)}"
                    clean = clean[: gm.start()].strip()
                kind = "lecture"
                lm = re.match(r"^(.*?)\s+LAB-?\d*$", clean)
                if lm:
                    clean = lm.group(1).strip()
                    kind = "lab"

                # This template merges a two-period lab into a single cell, so
                # the label is centred on the boundary between two columns.
                # Detect that and fill BOTH periods — otherwise the second one
                # renders empty and the grid stops matching the PDF.
                emit = [p]
                if kind == "lab" and len(cols) > 1:
                    centre = (left + right) / 2
                    best = None
                    for i in range(len(cols) - 1):
                        mid = (
                            (cols[i][2] + cols[i][3]) / 2
                            + (cols[i + 1][2] + cols[i + 1][3]) / 2
                        ) / 2
                        gap = abs(centre - mid)
                        if best is None or gap < best[0]:
                            best = (gap, i)
                    if best and best[0] < 18:
                        emit = [best[1], best[1] + 1]

                for pp in emit:
                    start, end, _, _ = cols[pp]
                    slots.append(
                        {
                            "day": d,
                            "period": pp + 1,
                            "start": start,
                            "end": end,
                            "code": clean,
                            "subject": SUBJECT_NAMES.get(clean, clean),
                            "kind": kind,
                            "group": group,
                        }
                    )

    # --- header facts -----------------------------------------------------
    full = page.get_text()
    room = None
    m = re.search(r"Room\s*No\.?\s*:?\s*(\d+)", full)
    if m:
        room = m.group(1)
    floor = None
    m = re.search(r"(\d)(?:st|nd|rd|th)\s*Floor", full)
    if m:
        floor = int(m.group(1))
    section = None
    m = re.search(r"SECTION\s*:?\s*([A-Z]\d[A-Z])", full)
    if m:
        section = m.group(1)
    coordinator = None
    m = re.search(r"Class\s*Coordinator\s*:?\s*([A-Z][A-Za-z.\s]+?)(?:\s{2,}|Prepared|Prof|Head|$)", full)
    if m:
        coordinator = re.sub(r"\s+", " ", m.group(1)).strip()
    semester = None
    m = re.search(r"(B\.?\s*Tech[^\n]*?(?:20\d\d[-–]\d\d))", full)
    if m:
        semester = re.sub(r"\s+", " ", m.group(1)).strip()

    # --- lab course -> faculty table -------------------------------------
    # Rows like: ASE1S0301  Dr. Neeraj Sharma  2
    lab_faculty = {}
    for x0, y0, x1, y1, word, *_ in ws:
        if y0 < 440 or x0 > 300:
            continue
        if re.match(r"^[A-Z]{3}\d[A-Z]\d{4}$", word):
            # gather name words on the same line
            names = [
                w[4]
                for w in ws
                if abs(w[1] - y0) < 4 and 315 <= w[0] <= 460 and not re.match(r"^\d+$", w[4])
            ]
            if names:
                lab_faculty[word] = " ".join(names)

    return {
        "source": os.path.basename(pdf_path),
        "section": section,
        "room": room,
        "floor": floor,
        "semester": semester,
        "coordinator": coordinator,
        "periods": [{"period": i + 1, "start": s, "end": e} for i, (s, e, _, _) in enumerate(cols)],
        "days": DAYS,
        "labFaculty": lab_faculty,
        "slots": sorted(slots, key=lambda s: (s["day"], s["period"])),
    }


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.expanduser("~"), "Downloads", "Telegram Desktop", "time_table_G1I.pdf"
    )
    if not os.path.exists(src):
        print(f"Source not found: {src}", file=sys.stderr)
        sys.exit(1)

    result = parse(src)
    os.makedirs(SEED_DIR, exist_ok=True)
    out = os.path.join(SEED_DIR, "timetable.generated.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)

    print(f"section={result['section']} room={result['room']} floor={result['floor']}")
    print(f"coordinator={result['coordinator']}")
    print(f"semester={result['semester']}")
    print(f"periods={len(result['periods'])} slots={len(result['slots'])} labs={result['labFaculty']}")
    for s in result["slots"]:
        g = f" [{s['group']}]" if s["group"] else ""
        print(f"  {DAYS[s['day']]:9} P{s['period']} {s['start']}-{s['end']}  {s['code']:10} {s['kind']}{g}")
    print(f"OK -> {out}")


if __name__ == "__main__":
    main()

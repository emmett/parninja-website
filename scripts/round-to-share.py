#!/usr/bin/env python3
"""
Translate a raw watch/round JSON into compact share encodings and compare sizes.

Supports the /watch fixture schema (v + meta + holes[]) and does a best-effort
normalize if holeNumber/strokes/position fields are present under other wrappers.

Examples:
  python3 scripts/round-to-share.py watch/fixtures/watch-warm-springs-2026-09-11.json
  python3 scripts/round-to-share.py round.json --hole 3
  python3 scripts/round-to-share.py round.json --hole 3 --write /tmp/share-out
  python3 scripts/round-to-share.py round.json --format arrays --encode
"""

from __future__ import annotations

import argparse
import base64
import json
import struct
import sys
import zlib
from pathlib import Path
from typing import Any

CLUBS = [
    "DR",
    "3W",
    "5W",
    "7W",
    "9W",
    "2I",
    "3I",
    "4I",
    "5I",
    "6I",
    "7I",
    "8I",
    "9I",
    "PW",
    "GW",
    "SW",
    "LW",
    "PU",
    "HY",
    "1I",
    "4W",
]
LIES = ["Tee", "Fairway", "Rough", "Sand", "Green", "Recovery"]


LIE_CHAR = {
    "Tee": "T",
    "Fairway": "F",
    "Rough": "R",
    "Sand": "S",
    "Green": "G",
    "Recovery": "X",
}
CHAR_LIE = {v: k for k, v in LIE_CHAR.items()}
# base36 index alphabet for club map (up to 36 clubs in a round)
CLUB_IX = "0123456789abcdefghijklmnopqrstuvwxyz"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def raw_deflate(data: bytes) -> bytes:
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return c.compress(data) + c.flush()


def round6(v: float) -> float:
    return round(float(v), 6)


def microdeg(lat_or_lng: float) -> int:
    return int(round(float(lat_or_lng) * 1_000_000))


def derived_score(strokes: list) -> int:
    """Score = sum of strokeCount (default 1) + penalties on each stroke."""
    total = 0
    for s in strokes or []:
        total += int(s.get("strokeCount") or 1)
        total += int(s.get("penalty") or 0)
    return total


def get_pos(stroke: dict) -> tuple[float, float] | None:
    pos = stroke.get("position") or stroke.get("gpsPosition") or {}
    lat = pos.get("latitude", pos.get("lat"))
    lng = pos.get("longitude", pos.get("lng", pos.get("lon")))
    if lat is None or lng is None:
        return None
    return float(lat), float(lng)


def pick_latest_round(raw: dict | list) -> dict:
    """From a full app export {rounds:[...]} or a bare round, return one round dict."""
    if isinstance(raw, list):
        rounds = raw
    elif isinstance(raw, dict) and isinstance(raw.get("rounds"), list):
        rounds = raw["rounds"]
    elif isinstance(raw, dict) and isinstance(raw.get("holes"), list):
        return raw
    else:
        raise ValueError("Expected a round, watch doc, or export with rounds[]")
    if not rounds:
        raise ValueError("No rounds in export")
    return max(
        rounds,
        key=lambda r: r.get("datePlayed") or r.get("date") or r.get("lastPlayedAt") or "",
    )


def normalize_round(raw: dict, latest: bool = False) -> dict:
    """Normalize various round shapes into watch fixture shape."""
    if latest or (isinstance(raw, dict) and "rounds" in raw and "holes" not in raw):
        raw = pick_latest_round(raw)

    if "holes" in raw and isinstance(raw["holes"], list):
        meta = raw.get("meta") or {}
        if not meta:
            date = raw.get("datePlayed") or raw.get("date") or ""
            meta = {
                "course": raw.get("course") or raw.get("courseName") or "Unknown",
                "tees": raw.get("tees") or raw.get("teeName") or "",
                "datePlayed": str(date)[:10],
            }
        holes = []
        for h in raw["holes"]:
            holes.append(
                {
                    "holeNumber": h.get("holeNumber", h.get("h", h.get("number"))),
                    "par": h.get("par"),
                    "score": h.get("score", h.get("sc")),
                    "distance": h.get("distance", h.get("yd", h.get("yardage"))),
                    "teePosition": h.get("teePosition"),
                    "greenPosition": h.get("greenPosition"),
                    "strokes": h.get("strokes") or h.get("s") or [],
                }
            )
        return {"v": raw.get("v", 1), "meta": meta, "holes": holes}
    raise ValueError("Expected JSON with a top-level 'holes' array (or export.rounds)")


def collect_clubs(doc: dict, hole_number: int | None) -> list[str]:
    holes = doc["holes"]
    if hole_number is not None:
        holes = [h for h in holes if h.get("holeNumber") == hole_number]
    seen: list[str] = []
    for h in holes:
        for s in h.get("strokes") or []:
            if not get_pos(s):
                continue
            c = s.get("club") or "?"
            if c not in seen:
                seen.append(c)
    return seen


def to_compact(doc: dict, hole_number: int | None) -> str:
    """
    Full-18 oriented text pack (v2):

      2|course|tees|date|club0,club1,...|
      H<par>,<score>,<lat0_µ>,<lng0_µ>,<gΔlat>,<gΔlng>|
      <LieChar><clubIx>[:dlat:dlng][*<puttCount>]|
      ...next stroke...|
      H... next hole

    - Origin = first GPS stroke on the hole (absolute microdegrees)
    - Green = Δ microdegrees from origin (omitted as g0,0 if missing / coincides)
    - Later strokes = Δ from *previous* stroke (chain)
    - Score stored but also recoverable as sum(strokeCount)+penalties
    - Lie: T F R S G X
    - Club: index into round club table (0-9a-z)
    """
    meta = doc["meta"]
    clubs = collect_clubs(doc, hole_number)
    if len(clubs) > len(CLUB_IX):
        raise ValueError(f"too many distinct clubs ({len(clubs)}) for base36 map")

    club_i = {c: CLUB_IX[i] for i, c in enumerate(clubs)}
    parts = [
        "2",
        meta.get("course") or "",
        meta.get("tees") or "",
        meta.get("datePlayed") or "",
        ",".join(clubs),
    ]

    holes = doc["holes"]
    if hole_number is not None:
        holes = [h for h in holes if h.get("holeNumber") == hole_number]

    for h in holes:
        strokes = [s for s in (h.get("strokes") or []) if get_pos(s)]
        par = int(h.get("par") or 0)
        score = int(h.get("score") if h.get("score") is not None else derived_score(strokes))

        if not strokes:
            # scorecard-only hole: no GPS — still emit par/score
            parts.append(f"H{par},{score}")
            continue

        lat0, lng0 = get_pos(strokes[0])  # type: ignore
        o_lat, o_lng = microdeg(lat0), microdeg(lng0)

        green = h.get("greenPosition") or {}
        if green.get("latitude") is not None:
            g_dlat = microdeg(green["latitude"]) - o_lat
            g_dlng = microdeg(green["longitude"]) - o_lng
            g_tok = f"{g_dlat},{g_dlng}"
        else:
            # fall back to last stroke as green anchor
            glat, glng = get_pos(strokes[-1])  # type: ignore
            g_tok = f"{microdeg(glat) - o_lat},{microdeg(glng) - o_lng}"

        parts.append(f"H{par},{score},{o_lat},{o_lng},{g_tok}")

        prev_lat, prev_lng = o_lat, o_lng
        for i, s in enumerate(strokes):
            lat, lng = get_pos(s)  # type: ignore
            la, ln = microdeg(lat), microdeg(lng)
            lie = LIE_CHAR.get(s.get("lie") or "", "?")
            ci = club_i[s.get("club") or "?"]
            tok = f"{lie}{ci}"
            if i > 0:
                tok += f":{la - prev_lat},{ln - prev_lng}"
            # putt multiplicity when >1 (score derivation)
            n = int(s.get("strokeCount") or 1)
            if (s.get("club") or "") == "PU" and n != 1:
                tok += f"*{n}"
            pen = int(s.get("penalty") or 0)
            if pen:
                tok += f"+{pen}"
            parts.append(tok)
            prev_lat, prev_lng = la, ln

    return "|".join(parts)


def to_compact_bin(doc: dict, hole_number: int | None) -> bytes:
    """
    Binary twin of compact text.
      u8 ver=2
      u8 metaLen + utf8 course|tees|date
      u8 nClubs + clubs as length-prefixed short strings
      u8 nHoles
      per hole:
        u8 par, u8 score
        u8 flags: bit0 hasGps, bit1 hasGreen
        if hasGps:
          i32 originLatµ, i32 originLngµ
          i16 greenΔlat, i16 greenΔlng  (0,0 if !hasGreen)
          u8 nStrokes
          per stroke:
            u8 (lie_hi<<5 | club_lo)  lie 0-5 in top 3 bits? use: lie 0-7 in low 3, club in high 5
            if not first: i16 dlat, i16 dlng from previous
            u8 extras: puttCount (1 default) in low 4, penalty in high 4
    """
    meta = doc["meta"]
    clubs = collect_clubs(doc, hole_number)
    buf = bytearray()
    buf.append(2)
    meta_s = (
        f"{meta.get('course') or ''}|{meta.get('tees') or ''}|"
        f"{meta.get('datePlayed') or ''}"
    ).encode()
    buf.append(len(meta_s))
    buf.extend(meta_s)
    buf.append(len(clubs))
    for c in clubs:
        b = c.encode()
        buf.append(len(b))
        buf.extend(b)

    holes = doc["holes"]
    if hole_number is not None:
        holes = [h for h in holes if h.get("holeNumber") == hole_number]
    buf.append(len(holes))

    for h in holes:
        strokes = [s for s in (h.get("strokes") or []) if get_pos(s)]
        par = int(h.get("par") or 0)
        score = int(h.get("score") if h.get("score") is not None else derived_score(strokes))
        buf.append(par)
        buf.append(score)
        has_gps = 1 if strokes else 0
        green = h.get("greenPosition") or {}
        has_green = 1 if green.get("latitude") is not None else 0
        buf.append((has_green << 1) | has_gps)
        if not has_gps:
            continue

        lat0, lng0 = get_pos(strokes[0])  # type: ignore
        o_lat, o_lng = microdeg(lat0), microdeg(lng0)
        buf.extend(struct.pack(">ii", o_lat, o_lng))
        if has_green:
            g_dlat = microdeg(green["latitude"]) - o_lat
            g_dlng = microdeg(green["longitude"]) - o_lng
        else:
            g_dlat = g_dlng = 0
        if abs(g_dlat) > 32767 or abs(g_dlng) > 32767:
            raise ValueError("green delta exceeds int16")
        buf.extend(struct.pack(">hh", g_dlat, g_dlng))
        buf.append(len(strokes))

        prev_lat, prev_lng = o_lat, o_lng
        for i, s in enumerate(strokes):
            club = s.get("club") or "?"
            lie = s.get("lie") or ""
            ci = clubs.index(club)
            li = LIES.index(lie) if lie in LIES else 0
            buf.append(((ci & 0x1F) << 3) | (li & 0x07))
            lat, lng = get_pos(s)  # type: ignore
            la, ln = microdeg(lat), microdeg(lng)
            if i > 0:
                dlat, dlng = la - prev_lat, ln - prev_lng
                if abs(dlat) > 32767 or abs(dlng) > 32767:
                    raise ValueError("stroke delta exceeds int16")
                buf.extend(struct.pack(">hh", dlat, dlng))
            n = int(s.get("strokeCount") or 1) & 0x0F
            pen = int(s.get("penalty") or 0) & 0x0F
            buf.append((pen << 4) | n)
            prev_lat, prev_lng = la, ln

    return bytes(buf)

def slim_stroke(s: dict) -> dict | None:
    pos = get_pos(s)
    if not pos:
        return None
    lat, lng = pos
    out: dict[str, Any] = {
        "c": s.get("club") or s.get("c") or "?",
        "l": s.get("lie") or s.get("l") or "",
        "p": [round6(lat), round6(lng)],
    }
    rem = s.get("distanceRemaining", s.get("d"))
    if rem is not None:
        out["d"] = round(float(rem), 1)
    sg = s.get("SGA", s.get("sg"))
    if sg is not None and float(sg) != 0:
        out["sg"] = round(float(sg), 2)
    club = out["c"]
    if club == "PU":
        n = s.get("strokeCount", s.get("n"))
        if n is not None:
            out["n"] = int(n)
        fp = s.get("firstPuttDistance", s.get("fp"))
        if fp is not None:
            out["fp"] = round(float(fp), 2)
    return out


def slim_hole(h: dict) -> dict:
    strokes = []
    for s in h.get("strokes") or []:
        ss = slim_stroke(s)
        if ss:
            strokes.append(ss)
    out: dict[str, Any] = {
        "h": h.get("holeNumber"),
        "par": h.get("par"),
        "sc": h.get("score"),
        "yd": h.get("distance"),
        "s": strokes,
    }
    tee = h.get("teePosition")
    green = h.get("greenPosition")
    if isinstance(tee, dict) and tee.get("latitude") is not None:
        out["tee"] = [round6(tee["latitude"]), round6(tee["longitude"])]
    if isinstance(green, dict) and green.get("latitude") is not None:
        out["grn"] = [round6(green["latitude"]), round6(green["longitude"])]
    return out


def to_slim_json(doc: dict, hole_number: int | None) -> dict:
    meta = doc["meta"]
    if hole_number is not None:
        hole = next(h for h in doc["holes"] if h.get("holeNumber") == hole_number)
        return {"v": 1, "meta": meta, "hole": slim_hole(hole)}
    return {
        "v": 1,
        "meta": meta,
        "holes": [slim_hole(h) for h in doc["holes"]],
    }


def to_arrays(doc: dict, hole_number: int | None) -> list:
    """Positional JSON arrays — no object keys."""
    meta = doc["meta"]
    header = [
        1,
        meta.get("course") or "",
        meta.get("tees") or "",
        meta.get("datePlayed") or "",
    ]

    def stroke_row(s: dict) -> list:
        pos = get_pos(s)
        assert pos
        lat, lng = pos
        row: list[Any] = [
            s.get("club") or "?",
            s.get("lie") or "",
            round6(lat),
            round6(lng),
            round(float(s.get("distanceRemaining") or 0), 1),
        ]
        if (s.get("club") or "") == "PU":
            row.append(s.get("strokeCount") or 1)
            row.append(
                round(float(s.get("firstPuttDistance") or 0), 2)
                if s.get("firstPuttDistance") is not None
                else None
            )
        return row

    def hole_block(h: dict) -> list:
        strokes = [stroke_row(s) for s in (h.get("strokes") or []) if get_pos(s)]
        return [
            h.get("holeNumber"),
            h.get("par"),
            h.get("score"),
            h.get("distance"),
            strokes,
        ]

    if hole_number is not None:
        hole = next(h for h in doc["holes"] if h.get("holeNumber") == hole_number)
        return header + hole_block(hole)
    return header + [hole_block(h) for h in doc["holes"]]


def to_pipe(doc: dict, hole_number: int | None) -> str:
    meta = doc["meta"]
    parts = [
        "1",
        meta.get("course") or "",
        meta.get("tees") or "",
        meta.get("datePlayed") or "",
    ]

    def emit_hole(h: dict) -> None:
        parts.append(
            f"H{h.get('holeNumber')},{h.get('par')},{h.get('score')},{h.get('distance')}"
        )
        for s in h.get("strokes") or []:
            pos = get_pos(s)
            if not pos:
                continue
            lat, lng = pos
            rem = round(float(s.get("distanceRemaining") or 0), 1)
            cell = f"{s.get('club')},{s.get('lie') or ''},{round6(lat)},{round6(lng)},{rem}"
            if (s.get("club") or "") == "PU":
                n = s.get("strokeCount") or 1
                fp = (
                    round(float(s["firstPuttDistance"]), 2)
                    if s.get("firstPuttDistance") is not None
                    else ""
                )
                cell += f",{n},{fp}"
            parts.append(cell)

    if hole_number is not None:
        hole = next(h for h in doc["holes"] if h.get("holeNumber") == hole_number)
        emit_hole(hole)
    else:
        for h in doc["holes"]:
            emit_hole(h)
    return "|".join(parts)


def to_binary(doc: dict, hole_number: int | None, include_meta: bool = True) -> bytes:
    """
    Versioned binary pack:
      u8 ver=1
      [u8 metaLen + meta utf8 "course|tees|date"] if include_meta
      then one or more holes:
        u8 hole, u8 par, u8 score, u16 yards, u8 nStrokes
        i32 lat0_micro, i32 lng0_micro
        per stroke:
          u8 (club<<3 | lie)
          if not first: i16 dlat_micro, i16 dlng_micro  (delta from stroke 0)
          u16 rem_tenths
          if PU: u8 puttCount, u16 firstPutt_hundredths_yards
    """
    meta = doc["meta"]
    buf = bytearray()
    buf.append(1)
    if include_meta:
        meta_s = (
            f"{meta.get('course') or ''}|{meta.get('tees') or ''}|"
            f"{meta.get('datePlayed') or ''}"
        ).encode("utf-8")
        if len(meta_s) > 255:
            raise ValueError("meta string too long for u8 length")
        buf.append(len(meta_s))
        buf.extend(meta_s)
    else:
        buf.append(0)

    holes = doc["holes"]
    if hole_number is not None:
        holes = [h for h in holes if h.get("holeNumber") == hole_number]
        if not holes:
            raise ValueError(f"hole {hole_number} not found")

    buf.append(len(holes))
    for h in holes:
        strokes = [s for s in (h.get("strokes") or []) if get_pos(s)]
        buf.append(int(h.get("holeNumber") or 0))
        buf.append(int(h.get("par") or 0))
        buf.append(int(h.get("score") or 0))
        buf.extend(struct.pack(">H", int(h.get("distance") or 0)))
        buf.append(len(strokes))
        if not strokes:
            continue
        lat0 = int(round(get_pos(strokes[0])[0] * 1e6))
        lng0 = int(round(get_pos(strokes[0])[1] * 1e6))
        buf.extend(struct.pack(">ii", lat0, lng0))
        for i, s in enumerate(strokes):
            club = s.get("club") or "?"
            lie = s.get("lie") or ""
            ci = CLUBS.index(club) if club in CLUBS else 0
            li = LIES.index(lie) if lie in LIES else 0
            buf.append(((ci & 0x1F) << 3) | (li & 0x07))
            if i > 0:
                lat, lng = get_pos(s)  # type: ignore
                dlat = int(round(lat * 1e6)) - lat0
                dlng = int(round(lng * 1e6)) - lng0
                if abs(dlat) > 32767 or abs(dlng) > 32767:
                    raise ValueError("coord delta exceeds int16; use absolute fallback")
                buf.extend(struct.pack(">hh", dlat, dlng))
            rem = int(round(float(s.get("distanceRemaining") or 0) * 10))
            buf.extend(struct.pack(">H", min(max(rem, 0), 65535)))
            if club == "PU":
                buf.append(int(s.get("strokeCount") or 1))
                fp = int(round(float(s.get("firstPuttDistance") or 0) * 100))
                buf.extend(struct.pack(">H", min(max(fp, 0), 65535)))
    return bytes(buf)


FORMATS = (
    "slim-json",
    "arrays",
    "pipe",
    "binary",
    "binary-nometas",
    "compact",
    "compact-bin",
)


def materialize(fmt: str, doc: dict, hole: int | None) -> bytes:
    if fmt == "slim-json":
        return json.dumps(to_slim_json(doc, hole), separators=(",", ":")).encode()
    if fmt == "arrays":
        return json.dumps(to_arrays(doc, hole), separators=(",", ":")).encode()
    if fmt == "pipe":
        return to_pipe(doc, hole).encode()
    if fmt == "binary":
        return to_binary(doc, hole, include_meta=True)
    if fmt == "binary-nometas":
        return to_binary(doc, hole, include_meta=False)
    if fmt == "compact":
        return to_compact(doc, hole).encode()
    if fmt == "compact-bin":
        return to_compact_bin(doc, hole)
    raise ValueError(fmt)


def size_row(name: str, raw: bytes) -> dict:
    defl = raw_deflate(raw)
    return {
        "format": name,
        "raw": len(raw),
        "deflate": len(defl),
        "b64_raw": len(b64url(raw)),
        "b64_deflate": len(b64url(defl)),
        "under_1500": len(b64url(defl)) <= 1500 or len(b64url(raw)) <= 1500,
    }


def print_table(rows: list[dict]) -> None:
    headers = ("format", "raw", "deflate", "b64_raw", "#r= deflate", "≤1500?")
    widths = [22, 6, 8, 8, 11, 6]
    line = "  ".join(h.ljust(w) for h, w in zip(headers, widths))
    print(line)
    print("  ".join("-" * w for w in widths))
    for r in rows:
        cells = [
            str(r["format"]).ljust(widths[0]),
            str(r["raw"]).rjust(widths[1]),
            str(r["deflate"]).rjust(widths[2]),
            str(r["b64_raw"]).rjust(widths[3]),
            str(r["b64_deflate"]).rjust(widths[4]),
            ("yes" if r["under_1500"] else "NO").ljust(widths[5]),
        ]
        print("  ".join(cells))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path, help="Raw round/watch JSON or full app export")
    ap.add_argument(
        "--latest",
        action="store_true",
        help="From a multi-round export, use the most recent round by datePlayed",
    )
    ap.add_argument("--hole", type=int, default=None, help="Single hole number (omit for full round)")
    ap.add_argument(
        "--format",
        choices=FORMATS,
        default=None,
        help="Emit one format only (default: compare all)",
    )
    ap.add_argument(
        "--encode",
        action="store_true",
        help="Print #r= base64url (deflate) for the chosen/all formats",
    )
    ap.add_argument(
        "--no-compress",
        action="store_true",
        help="With --encode, use raw bytes without DEFLATE",
    )
    ap.add_argument(
        "--write",
        type=Path,
        default=None,
        help="Write artifacts to DIR (raw + .b64.txt per format)",
    )
    ap.add_argument(
        "--url-prefix",
        default="https://parninja.com/watch/#r=",
        help="Prefix when printing share URLs",
    )
    args = ap.parse_args()

    raw_doc = json.loads(args.input.read_text())
    # Auto-detect export wrapper
    latest = args.latest or (
        isinstance(raw_doc, dict) and "rounds" in raw_doc and "holes" not in raw_doc
    )
    doc = normalize_round(raw_doc, latest=latest)

    if args.hole is not None:
        nums = [h.get("holeNumber") for h in doc["holes"]]
        if args.hole not in nums:
            print(f"Hole {args.hole} not in file. Available: {nums}", file=sys.stderr)
            return 1

    scope = f"hole {args.hole}" if args.hole is not None else f"full round ({len(doc['holes'])} holes)"
    print(f"Input: {args.input}")
    print(f"Scope: {scope}")
    print(
        f"Course: {doc['meta'].get('course')} · {doc['meta'].get('tees')} · "
        f"{doc['meta'].get('datePlayed')}"
    )
    print(f"Clubs map: {', '.join(collect_clubs(doc, args.hole))}")
    print()

    formats = [args.format] if args.format else list(FORMATS)
    rows = []
    payloads: dict[str, bytes] = {}
    for fmt in formats:
        try:
            payloads[fmt] = materialize(fmt, doc, args.hole)
            rows.append(size_row(fmt, payloads[fmt]))
        except Exception as e:
            print(f"ERROR {fmt}: {e}", file=sys.stderr)
            return 1

    print_table(rows)
    print()
    print("Recommended full-18 format: compact / compact-bin (#r= deflate column).")
    print("Budget: ≤ ~1500 chars for URL hash; otherwise hosted short id.")

    if args.encode or args.write:
        print()
        for fmt, raw in payloads.items():
            # For tiny binary, also show uncompressed b64 if smaller
            defl = raw_deflate(raw)
            use_raw = args.no_compress or (len(b64url(raw)) < len(b64url(defl)))
            body = raw if use_raw else defl
            blob = b64url(body)
            tag = "raw" if use_raw else "deflate"
            print(f"--- {fmt} ({tag}, {len(blob)} chars) ---")
            if args.encode:
                print(f"{args.url_prefix}{blob}")
                print()
            if args.write:
                args.write.mkdir(parents=True, exist_ok=True)
                stem = f"{'hole' + str(args.hole) if args.hole else 'round'}-{fmt}"
                (args.write / f"{stem}.bin").write_bytes(raw)
                (args.write / f"{stem}.{tag}.b64.txt").write_text(blob + "\n")
                if fmt in ("slim-json", "arrays", "pipe", "compact"):
                    (args.write / f"{stem}.txt").write_bytes(raw)
                print(f"Wrote {args.write / stem}.*")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
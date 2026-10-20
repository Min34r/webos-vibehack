#!/usr/bin/env python3
"""Build the vector tiles in app/logos/: a brand logo (or a glyph) centred on a solid 16:9 colour.

The TV only gives 130px app icons, blurry on a 4K tile. sync-apps.py uses app/logos/<app id>.svg
instead of the TV's icon whenever one exists. Logos come from Wikimedia Commons.

    python3 tools/make_logos.py            # rebuild every tile in LOGOS and GLYPHS
    python3 tools/make_logos.py netflix    # just these app ids

Add an app: find its app id (python3 sync-apps.py $TV_HOST --list) and its logo on
commons.wikimedia.org, add a line to LOGOS, run this, then ./install.sh.
"""
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "app", "logos")
W, H = 1280, 720

# app id: (Wikimedia Commons file, background, logo box width, height, colour swaps)
LOGOS = {
    "netflix": ("Netflix_2015_logo.svg", "#ffffff", 760, 260, None),
    "canalplus": ("Canal+.svg", "#000000", 820, 240, None),
    "amazon": ("Amazon_Prime_Video_logo.svg", "#0578ff", 700, 300,
               {"fill:#00A8E1": "fill:#ffffff", "fill:#232F3E": "fill:#ffffff", "fill:#D1EFFA": "fill:#ffffff"}),
    "youtube.leanback.v4": ("YouTube_Logo_2017.svg", "#ffffff", 760, 220, None),
    "tv.twitch.tv.starshot.lg": ("Twitch_Glitch_Logo_Purple.svg", "#9146ff", 340, 380,
                                 {"fill:#FFFFFF": "fill:#__P__", "fill:#9146FF": "fill:#ffffff",
                                  "fill:#__P__": "fill:#9146ff"}),
    "com.webos.app.hdmi2": ("Bazzite_Logo.svg", "#15122b", 520, 520, None),   # PC running Bazzite
    "com.webos.app.hdmi3": ("Nintendo_Switch_2_logo.svg", "#e60012", 560, 560, None),
}

# Material icons (Apache 2.0), white on a colour.
GLYPHS = {
    "com.webos.app.discovery": ("#4caf6e", "M4,8h4V4H4v4zM10,20h4v-4h-4v4zM4,20h4v-4H4v4zM4,14h4v-4H4v4zM10,14h4v-4h-4v4z"
                                           "M16,4v4h4V4h-4zM10,8h4V4h-4v4zM16,14h4v-4h-4v4zM16,20h4v-4h-4v4z"),
}


def fetch(name):
    url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(name)
    req = urllib.request.Request(url, headers={"User-Agent": "webos-vibehack/1.0 (tools/make_logos.py)"})
    # Commons answers 429 to quick bursts: pace the downloads and wait as long as it asks.
    for attempt in range(5):
        time.sleep(1.5)
        try:
            text = urllib.request.urlopen(req, timeout=20).read().decode("utf-8").replace("\r\n", "\n")
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise
            wait = int(e.headers.get("Retry-After") or 10 * (attempt + 1))
            print(f"  (Commons asks to slow down: waiting {wait} s)")
            time.sleep(wait)
    if "<svg" not in text or "<html" in text[:500].lower():
        sys.exit(f"{name}: not an SVG (renamed on Commons?)")
    return text


def parse(svg, swaps):
    """The logo's viewBox and inner markup, with its XML prolog, comments and title dropped."""
    svg = re.sub(r"<\?xml.*?\?>|<!--.*?-->|<title>.*?</title>", "", svg, flags=re.S)
    attrs, inner = re.search(r"<svg\b([^>]*)>(.*)</svg>", svg, flags=re.S).groups()
    box = re.search(r'viewBox="([^"]+)"', attrs)
    if box:
        box = box.group(1)
    else:
        w = re.search(r'width="([\d.]+)', attrs).group(1)
        h = re.search(r'height="([\d.]+)', attrs).group(1)
        box = f"0 0 {w} {h}"
    for old, new in (swaps or {}).items():
        inner = re.sub(re.escape(old), new, inner, flags=re.I)
    return box, inner


def tile(bg, box, inner, box_w, box_h):
    x, y = (W - box_w) / 2, (H - box_h) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<rect width="{W}" height="{H}" fill="{bg}"/>'
            f'<svg x="{x}" y="{y}" width="{box_w}" height="{box_h}" viewBox="{box}" '
            f'preserveAspectRatio="xMidYMid meet">{inner}</svg></svg>\n')


def write(app_id, svg):
    with open(os.path.join(OUT, app_id + ".svg"), "w", encoding="utf-8") as f:
        f.write(svg)
    print("  " + app_id)


def main(only):
    os.makedirs(OUT, exist_ok=True)
    for app_id, (name, bg, box_w, box_h, swaps) in LOGOS.items():
        if not only or app_id in only:
            box, inner = parse(fetch(name), swaps)
            write(app_id, tile(bg, box, inner, box_w, box_h))
    for app_id, (bg, path) in GLYPHS.items():
        if not only or app_id in only:
            write(app_id, tile(bg, "0 0 24 24", f'<path fill="#ffffff" d="{path}"/>', 300, 300))


if __name__ == "__main__":
    main(sys.argv[1:])

#!/usr/bin/env python3
"""Set up the optional Govee backlight sync: write govee.json for one of your Govee lights.

With govee.json at the repo root, install.sh hands it to the on-TV service, which turns the light
on when the TV turns on and off when it goes to standby. It goes through Govee's cloud API, so you
need an API key: in the Govee Home app, Profile > Settings > About Us > Apply for API Key (it comes
by email, check the spam folder). govee.json holds the key: it is git-ignored, keep it that way.

    python3 tools/govee_setup.py YOUR-API-KEY            # list your lights, pick one
    python3 tools/govee_setup.py YOUR-API-KEY H6097      # pick by model (SKU)
    rm govee.json && ./install.sh                         # turn the sync off
"""
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "govee.json")


def devices(key):
    req = urllib.request.Request("https://openapi.api.govee.com/router/api/v1/user/devices",
                                 headers={"Govee-API-Key": key})
    reply = json.load(urllib.request.urlopen(req, timeout=20))
    if reply.get("code") != 200:
        sys.exit(f"Govee refused the key: {reply.get('message')}")
    # Only devices that can be switched on and off.
    return [d for d in reply.get("data", [])
            if any(c.get("instance") == "powerSwitch" for c in d.get("capabilities", []))]


def main(key, sku):
    found = devices(key)
    if not found:
        sys.exit("No Govee device on this account can be switched on and off.")
    if sku:
        found = [d for d in found if d["sku"].lower() == sku.lower()] or sys.exit(f"No {sku} on this account.")
    if len(found) > 1:
        for i, d in enumerate(found, 1):
            print(f"  {i}. {d['sku']}  {d.get('deviceName', '')}")
        pick = found[int(input("Which one? ")) - 1]
    else:
        pick = found[0]
    old = os.umask(0o077)   # the key stays readable by you only
    try:
        with open(OUT, "w") as f:
            json.dump({"apiKey": key, "sku": pick["sku"], "device": pick["device"],
                       "name": pick.get("deviceName", "")}, f, indent=1)
    finally:
        os.umask(old)
    print(f"Wrote govee.json for {pick['sku']} ({pick.get('deviceName', '')}). Now run ./install.sh.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)

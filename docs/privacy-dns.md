# Cutting LG's tracking with DNS

webOS can't be stripped of LG's services without rooting the TV, but most of what they send can be
stopped at the DNS level: point the TV at a filtering DNS and deny the tracking domains. Nothing
on the TV changes, and undoing it is setting the DNS back to automatic.

Do the TV's own settings first (no risk): **Settings → Support → Privacy & Terms → User
Agreements** (refuse Viewing Information and Interest-Based Ads), **Settings → General → System →
Additional Settings** (Live Plus, Home Promotion and Content Recommendation off).

## What an OLED C4 talks to

Observed on an idle TV (webOS, firmware 43.21.73) from its connection table, servers named by
their TLS certificates:

| Domain | Who | Likely role |
|---|---|---|
| `*.ad.lgsmartad.com` | LG | Ads ("Smart Ad") |
| `adstk.io` | ad tech | Ad tracking |
| `*.tv.wiselg.com` | LG | webOS cloud: config, recommendations |
| `*.lgthinq.com` | LG | ThinQ smart home (EU and Korea) |
| `*.elastic.lgwebostv.com` | LG | Likely logs and analytics |
| `*.app.lgwebostv.com` | LG | App services (keep) |
| `*.lgemp-prd.net`, `*.lgeapi.com` | LG | APIs, role unknown |
| `unagi-eu.amazon.com` | Prime Video | Amazon device metrics (the app is preloaded) |
| `logging.apiproxy…netflix…` | Netflix | Netflix telemetry (the app is preloaded) |
| Google (`1e100.net`, port 5228) | YouTube, Chromecast | App traffic and Google push |

After the TV's own privacy settings, and once it had settled (a settings change makes it resync
with everything above for a minute or two), 3 minutes of idle went from 31 servers to 15: the ad
domains, ThinQ, the analytics endpoints and Prime Video's metrics were gone. The webOS cloud
(`wiselg.com`, always connected), Netflix's logging and Google's traffic remained, and DNS still
went to Google's 8.8.8.8: that's what the DNS filter below is for.

## Setting it up with NextDNS

[NextDNS](https://nextdns.io) is free up to 300,000 queries a month, which a TV stays well under,
and its logs show every domain the TV asks for, so you can see what a block changes.

1. Create a configuration. In **Setup**, link your IP (Free gives a fixed IPv4) and note the two
   IPv4 DNS addresses (and the IPv6 ones, which carry your configuration ID).
2. On the TV: **Settings → General → Network → (your connection) → Advanced → DNS**: set the
   NextDNS addresses manually. The TV also talks IPv6: if it offers IPv6 DNS, set those too, or
   its IPv6 queries may still go to the Freebox.
3. In NextDNS **Privacy**, enable a general list (NextDNS Ads & Trackers).
4. In **Denylist**, add the domains below, one tier at a time, checking the TV between tiers.
5. In **Allowlist**, add the domains that must keep working.

### Denylist

**Tier 1, safe:** ads, ad tracking, content recognition, ThinQ.

```
lgsmartad.com
lgads.tv
ads.lgtvcommon.com
alphonso.tv
adstk.io
lgthinq.com
lgtviot.com
ngfts.lge.com
```

**Tier 2, test:** telemetry whose side effects are unknown on this model. Check the launcher, apps,
the Content Store and voice after adding them; remove any that breaks something.

```
wiselg.com
elastic.lgwebostv.com
lgtvcommon.com
nextlgsdp.com
unagi-eu.amazon.com
```

### Allowlist

Keep these reachable, whatever the lists say:

```
developer.lge.com      # Developer Mode: the launcher's service extends its session here
lgappstv.com           # Content Store, app installs
lgtvsdp.com            # Content Store
app.lgwebostv.com      # app services
snu.lge.com            # firmware update check (also su.lge.com, su-ssl.lge.com)
open-meteo.com         # the launcher's weather
```

Never deny `lge.com` as a whole, or `amazonaws.com` (much of LG and other apps run on AWS).

## Limits

- Community reports say some LG endpoints are reached by hard-coded IP addresses, which DNS can't
  stop (a router firewall can), and that some TVs fall back to encrypted DNS (Google, Cloudflare)
  when their usual names fail. NextDNS's logs show whether queries still arrive.
- The DNS lives in the TV's network settings: a factory reset or a network reset undoes it.
- If the TV is rejoined to the network, check the DNS is still set manually.

Sources: [hugobatista/lg-tv-ad-block](https://github.com/hugobatista/lg-tv-ad-block/),
[Level1Techs: LG TV block mini-how-to](https://forum.level1techs.com/t/lg-tv-block-mini-how-to/255178),
[Privacy Guides discussion](https://discuss.privacyguides.net/t/lg-smart-tv-investigation-by-gamernexus-highlight-privacy-issues/40519?page=2).

# MJ Play EPG

Public programme schedules only. No video stream addresses, account credentials or viewing history.

GitHub Actions downloads the configured XMLTV sources every six hours, streams the large files on its runner, retains useful recent guides if a source fails, and publishes small per-channel JSON files through GitHub Pages. Refresh times are scheduled in UTC and may be delayed by GitHub. Each successful run commits refreshed data to preserve fallback schedules and repository activity.

Enable **Settings → Pages → GitHub Actions**, then run **Refresh and publish EPG** once. Read `status.json` to check the actual last successful refresh; creating a workflow alone does not prove a run succeeded.

The TV requests `/guides/CHANNEL.json` relative to this repository's Pages base URL. Programme timestamps are UTC milliseconds; the TV presents local times. Snapshots cover about 48 hours. Failed refreshes do not overwrite the deployed site with an empty result. Expired listings must never be presented as current.

Local command: `node refresh.mjs` (Node 22 or later). The mapping catalogue is intentionally reviewed and does not invent local stations or East/West variants.

Sources: EPGShare01, EPGTalk, IPTV-EPG and sasagr/bbcnews-epg. This repository contains schedule metadata and no media.

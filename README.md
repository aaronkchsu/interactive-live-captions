# Streamer Voice Box

A local Twitch caption studio with live translation, streamer observations, Chat Chorus, and clearly labeled fictional Chaos commentary. One Node 24 server and native browser modules; no runtime dependencies or frontend build step.

## Start and try it

```sh
nvm use 24
npm start
```

Open [the studio](http://localhost:4317) in Chrome or Edge. The first screen uses **labeled sample content** and does not record or spend API credits.

1. Open **Setup → OpenAI**. Paste your own key into the masked field and save it. **Check connection** checks account/model access; **Test English → Chinese** makes one small paid translation request. Select browser speech or OpenAI Realtime.
2. In **Inputs**, choose a microphone and optionally a webcam/OBS Virtual Camera. **Test inputs** previews locally without sending media to AI. Adjust the crop around the streamer. Restart a live session after changing devices. Browser speech uses the system default microphone; OpenAI uses the selected input.
3. Choose a mode and languages in the studio, then click **Start live session**. Grant microphone/camera permission. Speak English; finalized phrases receive Chinese, Spanish, or Japanese translations. Device capture and paid continuous processing only start through this action.
4. Add an OBS **Browser Source** with `http://localhost:4317/overlay`, normally at **1920 × 1080**, or **1080 × 1920** for portrait. This local URL is for OBS on the same machine. The source is transparent; the studio’s sample landscape is not broadcast.
5. **Stop session** ends capture and returns to labeled samples. Closing the studio stops devices; a 30-second capture lease also stops server-side paid lanes if the tab disappears unexpectedly.

The in-app browser is useful for design previews; Chrome/Edge are the supported live-capture targets. Browser speech may use its vendor’s recognition service and is not guaranteed to run on-device.

## Modes

| Mode | Speech | Secondary track |
|---|---|---|
| Captions | Original, translated, or both | None |
| Full Context | Enabled | Observed sounds/actions, with Chat Chorus between observations |
| Description Only | Hidden, retained in transcript | Observed sounds/actions |
| Chat Chorus | Enabled | Collective chat commentary |
| Chaos | Keep or replace speech | Clearly labeled fictional comedy; persistent CHAOS MODE badge |

Style, translation language and content mode are independent. The secondary line has its own language and above/below placement. Each line gets six seconds of reading time; stale and repeated cues are suppressed. Reduced motion and portrait/bilingual previews are included.

Audio observations analyze three-second microphone windows. Camera observations use cropped JPEG frames at most 640 pixels on the long side every two seconds, compared with the preceding frame. These processors only request AI work in the modes that use them. Ambiguous observations display nothing. Camera/audio media stay in bounded memory and are not saved.

Chat Chorus needs a connected Twitch account and at least three distinct contributing viewers. It caps the rolling window at 20 seconds/200 messages, three contributions per viewer, with an eight-second generation interval and supporting message IDs. Quiet observations require two minutes of baseline and a sustained 40-second fall in activity. Chaos is fiction, even when inspired by actual events.

Exports contain the **last 200 retained finalized speech segments** and their translations, without commentary or fiction. This is bounded session history, not an archival recording service.

## Twitch setup

Create a Twitch application in [the Twitch developer console](https://dev.twitch.tv/console/apps), with the exact callback shown in **Setup → Twitch** (default `http://localhost:4317/auth/twitch/callback`). Save its client ID and secret in Setup, then choose **Connect Twitch** and authorize your own channel. The app requests `user:read:chat` and `channel:read:redemptions`, validates OAuth state, and refreshes tokens.

After connecting, load your existing Channel Points rewards and map them to modes. Reward creation is done in Twitch. Connections are explicit after a server restart; use the saved-account reconnect button.

```text
!mode captions|context|describe|chorus|chaos
!style spotlight|paper|comic
!captions zh|es|ja           (moderator/broadcaster; updates saved language)
!mode reset                (moderator/broadcaster)
```

Viewer modes follow the studio’s allowed-mode list. Commands and rewards share deduplication and a default 12-second cooldown. Accepted mode/style effects last 20 seconds; a new accepted effect replaces the old override and restores the saved base afterward. Manual settings changes cancel the override. **Return to my settings** resets it immediately. Rewards redeemed during cooldown do not activate an effect and are not automatically refunded; the mapping screen explains this behavior.

## Storage, cost and hosting boundary

Preferences and credentials use separate ignored files in `.local/`, with private directory/file permissions and atomic writes. Existing `.env` credentials are imported only if that field has not been saved before. Keys never go to the browser, OBS snapshot, transcript, or logs. Local credentials are permission-protected plaintext, **not encrypted hosted storage**.

Every AI request resolves the current owner’s key. There is no operator-funded fallback. Your OpenAI account pays AI usage; future hosted infrastructure would still have operating costs.

The server binds to loopback and uses one development owner. The core and storage/provider interfaces support isolated contexts, tested with two owners. **This is not production authentication and must not be exposed publicly.** Hosted Twitch sign-in, database-backed accounts, encrypted credential storage, authorization, private revocable overlays and quotas are the later milestone after local validation.

Models can be overridden in `.env` using the names in `.env.example`. Defaults: `gpt-live-transcribe` for WebRTC speech, `gpt-6-luna` for translation/vision/commentary, `gpt-audio-1.5` for audio descriptions. Model availability and real stream quality depend on the account. OpenAI Realtime commits audio every three seconds; first-text latency and phrase boundaries still need live tuning.

## Development and verification

```sh
npm install             # development-only TypeScript and Node types
npm test                # isolated fixtures; never uses real keys
npm run typecheck       # JSDoc contracts and core modules
npm run test:soak       # one simulated hour, two owners, no paid requests
```

Optional, explicit **paid synthetic** compatibility check, using your locally saved key:

```sh
node scripts/smoke-providers.mjs --paid-synthetic-test
```

This performs five small requests and writes a secret-free result to `artifacts/provider-smoke-result.json`. It does not record devices or verify Twitch/OBS.

See [architecture](docs/architecture.md), [verification results and remaining gates](docs/verification.md), and [caption research](docs/research.md).

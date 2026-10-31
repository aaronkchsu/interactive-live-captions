# AuraMax — TwitchCon competition project

A local Twitch caption studio with live translation, streamer observations, Chat Chorus, and clearly labeled fictional Chaos commentary. One Node 24 server and native browser modules; no runtime dependencies or frontend build step.

## One repository, two experiences

- **Live studio:** `server.mjs`, `src/`, and `public/` — local captions, Twitch controls, OBS overlay, and translated broadcast audio.
- **Public website:** [`website/dist/`](website/dist/) — the interactive landing page at [auramaxcap.com](https://auramaxcap.com), with an early-access form. See [website setup and deployment](website/README.md).
- **Project evidence:** [`docs/`](docs/) — architecture, research, and verification results. The website playground is explicitly scripted; real-provider results and remaining live acceptance gates are documented separately.
- **Checks:** [`tests/`](tests/) — isolated fixtures and simulated soak; no real API keys required.

Use this repository for both experiences. The studio stays at the root so existing commands, local credentials, and OBS URLs keep working. Cloudflare receives **only `website/dist/`**, never the studio server or local credentials. Website hosting currently uses Direct Upload, so a Git commit does not automatically redeploy the public site.

Preview the website from the repository root with `npm run website:dev` (Python 3 required), then open http://localhost:4320. `npm run website:check` checks its JavaScript syntax. Studio instructions follow below.

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
!captions fr                (moderator/broadcaster; any target code in public/languages.js)
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

## Chinese voice for the whole stream

The **Say it in Chinese** panel adds a 20-second live speech translation effect. You keep speaking English; OpenAI’s `gpt-realtime-translate` produces Chinese audio that adapts to your tone. Exact voice identity and live translation quality still need your listening test.

The **separate audio source** is [http://localhost:4317/voice](http://localhost:4317/voice). Add it to OBS as a Browser Source, enable **Control audio via OBS**, keep **Audio Monitoring: Monitor Off**, and select the audio track used by your stream. Leave **Shutdown source when not visible** and automatic scene-refresh off; reuse that source across scenes.

In the studio:

1. Enable **Route microphone through Voice Box**, then start a live session in Chrome/Edge.
2. Use **Test OBS sound** and confirm the new source’s mixer meter responds to your microphone.
3. **Mute the duplicate microphone source (Mic/Aux) in OBS.** Voice Box does not remotely change OBS mute buttons. Your microphone now reaches the stream through the new audio source. Leave game/music sources as they are.
4. Click **Speak Chinese · 20 seconds** and keep speaking. Your English stays live while Chinese prepares. The mixer waits for actual non-silent translated audio (not just an open connection), then crossfades using a 120ms onset buffer to preserve the first syllable. The 20-second countdown starts at this handoff. The mic is still captured for speech recognition and translation. If no audio arrives within the connection deadline, the effect cancels with English unchanged.
5. After 20 seconds, new input to the translation connection stops; up to five more seconds are allowed for pending speech before normal audio returns. **Restore my voice now** cancels immediately. Connection/model failures restore the normal microphone within the connected Voice Box feed.

The feed is encoded into your Twitch broadcast, so all viewers hear the same result. It is not a viewer-specific audio selection. An **AI DUB · 中文** label and translated text replace normal caption presentation during the effect; original speech history remains intact.

This avoids muting English during translation startup; it does not eliminate the model's translation delay. The first Chinese phrase may repeat the meaning of English viewers just heard while the translation warmed up. For a demo, click the effect while saying a short transition such as “Let's switch to Chinese,” then continue naturally. Real microphone/OBS timing still needs validation after changes.

Enable **Let viewers activate Chinese voice** to allow `!voice zh` or map a reward to **Speak Chinese · 20 seconds**. Viewer access is off by default. The existing shared cooldown applies; repeated activations do not extend an active voice effect. Moderator `!mode reset`, manual settings changes and stopping the session cancel dubbing.

Keep the studio running. If the studio or audio source closes, the Voice Box route cannot carry the microphone: **unmute the original OBS microphone** to recover. Routing adds a local WebRTC hop; check lip sync and adjust OBS synchronization if needed. A normal browser opened at `/voice` is an audible preview and occupies the single receiver slot; close it before connecting OBS.

As checked October 29, 2026, the model is **$0.034 per minute**: roughly **$0.0113 for 20 seconds**, plus connection/finish time. Existing caption, observation and commentary usage is separate. A single feed serves all viewers, so AI cost does not multiply with viewer count. See [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-realtime-translate).

## Caption languages

The shared catalog in `public/languages.js` drives studio choices, server validation, provider prompts, Twitch moderator commands, and OBS language/direction metadata. There are 20 caption languages: English source captions and 19 translation targets. Spoken input remains English. Chinese voice dubbing is a separate feature and is not expanded by this catalog.

Moderators can use `!captions fr`, `!captions ar`, or any translation code in the catalog. Secondary descriptions, Chorus, and Chaos use the same language catalog. Arabic and Hebrew caption text renders right to left while English labels remain left to right.

Recorded samples remain limited to English/Chinese/Spanish/Japanese. Selecting another language in demo mode shows an explicit missing-sample message, never a substituted language or an automatic paid request. Live translation requires the streamer's key. Adding an option does not establish fluent-reader quality validation.

After editing the catalog, run `npm run website:languages` to refresh the static landing-page list; `npm run website:check` detects drift.

Validation on October 31, 2026: 51 automated tests passed, including all 19 targets through moderator-command → session → provider → overlay/history with mocked transport, missing-demo handling, invalid-language rejection, and RTL metadata. All 19 real API requests returned translations for the same short synthetic English phrase; this was not a microphone test or fluent-reader review. Arabic output was inspected in desktop and portrait bilingual layouts with reduced motion. Raw synthetic results and API-reported usage are kept locally in ignored `artifacts/language-smoke-result.json`. Re-run explicitly with `node scripts/smoke-languages.mjs --paid-synthetic-test` (uses saved key/API credits).

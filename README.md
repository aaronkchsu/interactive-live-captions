# AuraMax — TwitchCon competition project

A local Twitch studio with independent subtitle and commentary tracks, live translation, and viewer-controlled add-ons. One Node 24 server and native browser modules; no runtime dependencies or frontend build step.

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
2. In **Inputs**, choose a microphone and optionally a webcam/OBS Virtual Camera. **Test inputs** previews locally without sending media to AI. Adjust the crop around the streamer. Live capture reconfigures when input requirements or devices change. Browser speech uses the system default microphone; OpenAI uses the selected input.
3. Choose a mode and languages in the studio, then click **Start live session**. Grant microphone/camera permission. Speak English; finalized phrases receive translations in your selected target language. Device capture and paid continuous processing only start through this action.
4. Add an OBS **Browser Source** with `http://localhost:4317/overlay`, normally at **1920 × 1080**, or **1080 × 1920** for portrait. This local URL is for OBS on the same machine. The source is transparent; the studio’s sample landscape is not broadcast.
5. **Stop session** ends capture and returns to labeled samples. Closing the studio stops devices; a 30-second capture lease also stops server-side paid lanes if the tab disappears unexpectedly.

The in-app browser is useful for design previews; Chrome/Edge are the supported live-capture targets. Browser speech may use its vendor’s recognition service and is not guaranteed to run on-device.

## Stream preview background

Choose **Show webcam** to display your selected camera behind captions in the studio. **Hide webcam** restores the automatic Twitch/demo background. This is a muted, local-only preview: it does not open the microphone, start AI analysis, or add webcam video to OBS. Select a different camera in Setup → Inputs. When camera analysis is already capturing, the preview reuses its stream. Closing the page releases preview-owned camera tracks.

Stream Preview automatically follows the connected Twitch account. Live-channel snapshots refresh every 30 seconds while the studio tab is visible. Offline channels show their latest saved broadcast thumbnail when available; otherwise the demo background appears while the studio keeps checking. Disconnecting Twitch restores the demo background. Images are labeled and used for layout only, not synchronized video; they are never sent to OBS or AI.

Backgrounds stay in the studio. They are not sent to AI, OBS, or the audience, and selecting one does not start capture. The channel name and public thumbnail metadata come from Twitch's [Get Streams](https://dev.twitch.tv/docs/api/reference/#get-streams) and [Get Videos](https://dev.twitch.tv/docs/api/reference/#get-videos) endpoints; credentials remain on the local server.

## On-stream controls

The studio uses the landing page’s cream, black and yellow styling; overlay presets remain independent. Setup opens with Twitch, followed by OpenAI, inputs, preferences and OBS. This connects a local channel; hosted Twitch account sign-in remains a later milestone.

**Connect Twitch** beside Viewer add-ons opens a focused connection panel. It shows connection/reconnect states, includes a copyable callback URL and one-time local application setup, and returns to the panel after Twitch authorization or cancellation. Configure the application once; subsequent connections use Twitch's consent screen. Starting authorization navigates away and stops live capture, including routed microphone audio; the panel warns live users to restore their original OBS microphone first and restart capture afterward. Connecting Twitch does not start microphone capture or paid AI processing.

- **Freeze** holds the exact current caption presentation while speech, translations and transcript history continue.
- **Hide** immediately clears all caption text and labels from the studio preview and OBS. It overrides a freeze.
- **Resume** shows current captions without replaying missed or expired phrases.

These controls affect visuals only, not capture or broadcast audio. Viewer commands cannot unhide the output. OBS reconnects preserve the state; starting or stopping a session resets it. Studio shortcuts are **Alt + Shift + F / H / R**, except while typing or in Setup.

## Tracks and add-ons

Choose **Subtitles** or **Commentary** for the primary track. Open **Advanced: second track** to enable another track with the same editor. Each has its own language and appearance; switching content preserves its design. Both use the shared 21-language catalog, including Slovak and Turkish. Live speech currently assumes English input.

- **Subtitles:** microphone transcription, plus translation only for requested output languages. No camera analysis, audio-description requests, or chat summaries. Two tracks requesting the same translation share a request.
- **Commentary:** select microphone, Twitch chat, and/or camera. Choose Factual, Playful, Cheeky, or Roast. Nonfactual commentary is labeled comedy. Chat-only commentary does not open the microphone unless broadcast audio routing is separately enabled.
- **Appearance:** shared design schema and editor for font, size, color, accent, backplate, placement and preset. Freeze/Hide/Resume apply to both tracks.
- **Viewer add-ons:** configure the affected track, content/language/tone/appearance change, trigger, duration, and whether it updates saved settings. Temporary effects restore the saved baseline; manual edits cancel them. Disabled add-ons cannot be invoked by viewers.

Audio observations analyze three-second microphone windows; silent and near-silent windows are discarded locally without a paid request. Camera observations compare cropped JPEG frames at most 640 pixels on the long side every two seconds. Shared observations feed independent commentary lanes, which run at most once per eight seconds with changed evidence. Media stays in bounded memory. Commentary uses only the inputs enabled for its track.

Collective chat claims require at least three contributing viewers. Chat uses a rolling 20-second/200-message window, capped at three contributions per viewer. Quiet claims require a two-minute baseline and a sustained 40-second fall in activity. Speech never waits for commentary. Expired or obsolete results cannot replace current output.

Exports contain the last 200 retained finalized speech segments and per-language translations. Commentary and fiction never enter the speech export. See [track architecture](docs/track-architecture.md).

## Twitch setup

Create a Twitch application in [the Twitch developer console](https://dev.twitch.tv/console/apps), with the exact callback shown in **Setup → Twitch** (default `http://localhost:4317/auth/twitch/callback`). Save its client ID and secret in Setup, then choose **Connect Twitch** and authorize your own channel. The app requests `user:read:chat` and `channel:read:redemptions`, validates OAuth state, and refreshes tokens.

After connecting, load your existing Channel Points rewards and map them to enabled add-ons. Reward creation is done in Twitch. A saved Twitch connection reconnects automatically after a server restart; use the saved-account reconnect button if it fails. This never starts microphone capture or paid AI processing.

```text
!mode subtitles|commentary
!addon red                 (or a configured add-on ID)
!style spotlight|paper|comic
!captions fr                (moderator/broadcaster; any target code in public/languages.js)
!mode reset                (moderator/broadcaster)
```

Commands and rewards share deduplication and a default 12-second cooldown. Temporary add-ons last 5–120 seconds (default 20); persistent add-ons update saved settings. **Return to my settings** cancels a temporary effect. Rewards during cooldown do not activate an effect and are not automatically refunded.

A new-subscription trigger uses the first enabled subscription add-on. Enabling it requires authorizing the additional `channel:read:subscriptions` scope; the studio identifies when reauthorization is needed. Existing chat/reward permissions do not include it. This trigger handles new subscriptions, not resubscription messages. Legacy viewer mode commands are retired; saved legacy reward mappings migrate to enabled add-ons and still obey opt-in.

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

## Voice translation for the whole stream

The compact **Voice translation** card lets you choose a spoken output language and translate continuously until you stop it. **Set up OBS audio** opens the routing guide; **Start translation** appears once the key, live microphone, routing, and receiver are ready. The active state shows a Stop translation button and translated transcript. Only viewer effects show a countdown. The shared `public/voice-languages.js` catalog lists the 13 output languages documented for `gpt-realtime-translate`: English, Chinese, Spanish, Japanese, French, German, Portuguese, Italian, Korean, Hindi, Russian, Vietnamese and Indonesian. This is provider capability support, not listening-test certification. Voice similarity and translation quality need a real recording check.

The **separate audio source** is [http://localhost:4317/voice](http://localhost:4317/voice). Add it to OBS as a Browser Source, enable **Control audio via OBS**, keep **Audio Monitoring: Monitor Off**, and select the audio track used by your stream. Leave **Shutdown source when not visible** and automatic scene-refresh off; reuse that source across scenes.

In the studio:

1. Enable **Route microphone through Voice Box**, then start a live session in Chrome/Edge.
2. Use **Test OBS sound** and confirm the new source’s mixer meter responds to your microphone.
3. **Mute the duplicate microphone source (Mic/Aux) in OBS.** Voice Box does not remotely change OBS mute buttons. Your microphone now reaches the stream through the new audio source. Leave game/music sources as they are.
4. Choose a language and click **Start translation** and keep speaking. Your original voice stays live while translation prepares. The mixer waits for actual non-silent translated audio (not just an open connection), then crossfades using a 120ms onset buffer to preserve the first syllable. Streamer-started translation has no automatic duration cutoff. The mic is still captured for speech recognition and translation. If no audio arrives within the connection deadline, the effect cancels with English unchanged.
5. **Stop translation** restores your original microphone immediately and closes the translation connection. Continuous sessions renew using the provider’s reported expiry; original audio plays while a new connection warms up. Connection/model failures stop translation and restore the normal microphone within the connected Voice Box feed.

The feed is encoded into your Twitch broadcast, so all viewers hear the same result. It is not a viewer-specific audio selection. An **AI DUB · 中文** label and translated text replace normal caption presentation during the effect; original speech history remains intact.

This avoids muting English during translation startup; it does not eliminate the model's translation delay. The first Chinese phrase may repeat the meaning of English viewers just heard while the translation warmed up. For a demo, click the effect while saying a short transition such as “Let's switch to Chinese,” then continue naturally. Real microphone/OBS timing still needs validation after changes.

Under **Viewer add-ons**, enable **Allow voice translation**. `!voice` uses the saved spoken language; `!voice ja` selects Japanese for that effect. Channel Points can map to a specific supported voice language. Viewer access is off by default. Choose **Voice effect duration** (5–120 seconds, default 20) for chat commands and Channel Points. The countdown starts when translated audio is audible; up to five seconds of queued speech can finish afterward. The shared cooldown applies; repeated activations do not extend an active effect. Viewer effects cannot replace continuous translation. Streamer Start bypasses the audience cooldown and replaces a timed effect. Moderator effect reset and caption/design changes leave continuous translation running; Stop translation, disabling audio routing, changing the spoken language, or ending capture stops it.

Keep the studio running. If the studio or audio source closes, the Voice Box route cannot carry the microphone: **unmute the original OBS microphone** to recover. Routing adds a local WebRTC hop; check lip sync and adjust OBS synchronization if needed. A normal browser opened at `/voice` is an audible preview and occupies the single receiver slot; close it before connecting OBS.

As checked October 29, 2026, the model is **$0.034 per minute**: roughly **$0.0113 for 20 seconds**, plus connection/finish time. Existing caption, observation and commentary usage is separate. A single feed serves all viewers, so AI cost does not multiply with viewer count. See [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-realtime-translate).

## Caption languages

Competition submission planning and deferred viewer-controlled caption ideas are recorded in [Devpost notes](docs/devpost-notes.md).

The shared catalog in `public/languages.js` drives studio choices, server validation, provider prompts, Twitch moderator commands, and OBS language/direction metadata. There are 21 caption languages: English source captions and 20 translation targets. Spoken input remains English. Spoken translation uses its own 13-language catalog and is not expanded by the caption catalog.

Moderators can use `!captions fr`, `!captions ar`, or any translation code in the catalog. Secondary descriptions, Chorus, and Chaos use the same language catalog. Arabic and Hebrew caption text renders right to left while English labels remain left to right.

Recorded samples remain limited to English/Chinese/Spanish/Japanese. Selecting another language in demo mode shows an explicit missing-sample message, never a substituted language or an automatic paid request. Live translation requires the streamer's key. Adding an option does not establish fluent-reader quality validation.

After editing the catalog, run `npm run website:languages` to refresh the static landing-page list; `npm run website:check` detects drift.

Validation on October 31, 2026: 51 automated tests passed, including all 19 targets through moderator-command → session → provider → overlay/history with mocked transport, missing-demo handling, invalid-language rejection, and RTL metadata. All 19 real API requests returned translations for the same short synthetic English phrase; this was not a microphone test or fluent-reader review. Arabic output was inspected in desktop and portrait bilingual layouts with reduced motion. Raw synthetic results and API-reported usage are kept locally in ignored `artifacts/language-smoke-result.json`. Re-run explicitly with `node scripts/smoke-languages.mjs --paid-synthetic-test` (uses saved key/API credits).

Slovak was added after the streamer identified Slovak and Turkish as important community languages; Turkish was already included. The starter list was a product selection, not audience analytics or a complete language-coverage claim. All 51 tests passed again with Slovak included, and a separate real API synthetic-text request returned Slovak successfully (local report: `artifacts/slovak-smoke-result.json`). Fluent-reader validation remains outstanding.

## Brand fonts

Appearance offers 24 font choices grouped as Clean, Bold, Rounded, Handwritten, Serif, and Monospace, with a sample preview. Primary and secondary tracks keep independent fonts across subtitle/commentary switches. Bundled fonts load on demand from the local server in both the studio and OBS. **My installed font…** accepts a font-family name; install it on the computer running the studio and OBS. Unsupported glyphs and missing custom fonts fall back to system fonts. The catalog and licenses are in `public/fonts/`.

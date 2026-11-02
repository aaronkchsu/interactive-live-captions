### Real microphone and Chinese voice follow-up — November 1, 2026

- With the user present and wearing headphones, started the real OpenAI speech adapter using MacBook Pro Microphone (Built-in). The saved device ID was initially unavailable in the in-app browser; the new recovery panel identified that correctly. Selecting the currently enumerated built-in microphone restored capture.
- Real English speech appeared in the studio transcript. Started continuous Chinese voice translation; the provider reached active state and generated the Chinese output transcript for the user's welcome/Minecraft/thanks sentences. OBS's production browser audio source was connected and recorded audio locally. No public stream was started.
- Saved recording: `/Users/aaronshoo/Movies/2026-11-01 23-43-27.mkv`. Extracted audio for user listening: `artifacts/live-chinese-voice-test.mp3` (56.6 seconds). This confirms live capture, provider output, and non-silent recorded OBS audio; perceived voice similarity, fluent-reader quality, and aggregate latency remain unchecked. The real test used English on-screen captions and Chinese spoken output; it did not newly verify Chinese subtitle pixels.
- Stopped translation, microphone capture, and recording. Confirmed server mode demo, microphone idle, no active voice effect, and receiver waiting for microphone. MacBook Pro microphone selection is saved for this browser.

### Browser and actual OBS follow-up — November 1, 2026

- Browser access was restored. Restarted the local studio and verified saved Twitch auto-reconnection. No real microphone/camera capture or paid AI processing was started in this follow-up.
- Through the actual studio UI, freeze held the same text in both studio and overlay; an overlay reload preserved it. Hide removed overlay text; Resume restored normal display. The studio reported no captured browser console errors.
- Inspected the 390px layout with reduced-motion emulation and a portrait English/Chinese sample preview. Document width and scroll width both measured 390px. Primary Bungee and secondary Caveat remained independent through track switches. Emulation overrides were cleared afterward. Screenshots: `artifacts/release-studio-mobile.png`, `artifacts/release-portrait-bilingual.png`.
- The production browser mixer/receiver passed synthetic original (440 Hz) → translated (880 Hz) → original routing, original suppression, uninterrupted warmup, continuous playback beyond 30 seconds, provider renewal, manual stop, and a configured seven-second viewer effect with bounded drain. No fixture failures were recorded. Result: `artifacts/release-browser-audio.json`.
- Added an optional `?receiver=obs` mode to the test-only broadcast fixture so actual OBS can own the receiver. Recorded 51 seconds through OBS 33.0.1's existing `thevoicesource` browser source in the new `AuraMax Final QA` scene. The saved recording contains 440 Hz → 880 Hz → 440 Hz; steady translated samples suppress the original by over 60 dB. This verifies actual OBS audio output with synthetic input, not microphone recognition or real translation quality. Recording: `/Users/aaronshoo/Movies/2026-11-01 23-35-37.mkv`; analysis: `artifacts/release-obs-analysis.json`; screenshot: `artifacts/release-obs-routing.png`.
- Corrected the existing OBS voice source's “Shutdown source when not visible” setting to off. Confirmed Control audio via OBS is on, monitoring is off, and tracks 1–6 are included. Its URL was temporarily pointed at the isolated fixture server and restored to `http://localhost:4317/voice`. Recording and synthetic capture were stopped; nothing was streamed publicly.
- Remaining acceptance gates: live microphone → real translated speech, perceived quality/latency and fluent Chinese review, camera observations, fresh multi-viewer chat/reward actions, actual OBS caption framing, and a real one-hour stream. Automated and synthetic checks do not establish these results. Local changes remain uncommitted/unpushed and landing-page publication is still pending.

## Voice translation controls — November 1, 2026

- Replaced the Chinese-only panel with a compact spoken-language selector and readiness/action controls. OBS routing steps are in an accessible setup dialog; viewer opt-in remains under Viewer add-ons.
- The shared voice catalog contains the 13 output languages documented by OpenAI. Selected language is persisted and used by the provider request, effect state, output transcript metadata, chat commands and reward mappings. Caption-only languages are rejected for voice requests before a provider call.
- 74 automated tests and typechecking passed. Added coverage for supported/unsupported languages, selected-language commands, reward validation, provider language selection and readiness states. Existing receiver ownership, delayed handoff, restoration and credential isolation tests remain passing.
- Browser checked language selection, setup-to-input navigation, desktop and 390px layouts, plus English/Chinese tracks in portrait with reduced motion. Screenshot: `artifacts/voice-controls-compact.png`. Setup dialog and page have no horizontal overflow. No microphone audio or paid translation was sent in this change. Actual OBS recording, voice similarity and translated meaning remain unverified for this version.

# Verification — 2026-10-29

## Twitch preview background — November 1, 2026

- 70 automated tests and development typechecking passed. Preview tests cover the authorized channel, live-image metadata, recorded/offline distinction, channel validation, and rejecting unexpected image hosts.
- Real Twitch lookup: `aaronkc` was offline with no archived broadcasts; the studio displayed that state. `kruzadar` returned an October 30 broadcast thumbnail; the browser loaded its 1280×720 image and labeled it recorded/not live. This verified the real recorded-image path, not an actual live-thumbnail refresh.
- Inspected desktop (1440×1100), compact (390×844), portrait, bilingual and reduced-motion presentation. No horizontal overflow at 390px; no browser console errors. Fixed a loading race that could replace a channel name while it was being typed. Restored the user's single-track landscape settings afterward.
- Screenshot: `artifacts/twitch-stream-preview.png`. Backgrounds are studio-only and never enter OBS or AI inputs. Continuous video playback and synchronization are not part of this snapshot feature. Chat connection resumed as `aaronkc`; devices/paid processors remained idle.

## Track refactor — November 1, 2026

This supersedes the earlier five-preset UI descriptions below; those remain historical evidence.

- 67 automated tests pass; development TypeScript checking passes. Added coverage for independent source requirements, shared translations, primary/secondary language separation, old-settings migration, no one-viewer collective claims, stale commentary after mode changes, exact English/translation pairing, disabled add-on enforcement, persistent and temporary effects, cancellation during pending microphone permission, and both-track freeze. EventSub fixtures cover add-on rewards and deduplicated new subscriptions.
- One hour of simulated time, two owners: 2,642 translations, 640 commentary requests, 1,600 audio observations and 2,240 camera observations. At most 200 retained segments, 126 messages and two active requests per lane. Retained heap grew 32,920 bytes between minute 10 and minute 60. p95 two-owner core processing was 0.295 ms. This is fixture-only, not browser/OBS/network latency or a real one-hour broadcast.
- Browser checked at 1440×1000 and 390×844: no horizontal overflow at compact width; content editor follows the preview on mobile. Checked independent language selection, both subtitle tracks, mixed commentary/subtitles, portrait layout and reduced motion. Freeze status and Hide clearing were verified. The Bright red preview changed only primary appearance; Return to my settings restored it. An OBS-route reload restored the exact frozen two-track text.
- Real Twitch resumed as `aaronkc` with the existing chat/redemption permissions. One reconnect initially returned HTTP 400 during rapid development restarts; retry succeeded after the previous socket disconnected. No new chat message was sent, no reward redeemed, and no subscription permission added in this refactor check.
- Screenshot: `artifacts/track-studio-desktop.png`. The screenshot is explicitly labeled demo content. No real microphone/camera or paid commentary/translation requests were run for this refactor. Real model quality, OBS capture and language-reader acceptance remain open.


## Automated local results

- Node 24.22.1; `npm test`: 47 passing tests.
- `npm run typecheck`: passing JSDoc/core TypeScript check, with no emitted build output.
- Covered: reordered/duplicate speech, delayed translation display vs retained history, language changes away/back, stopped-session identities, permission/SDP cancellation, denied devices, optional-provider isolation, capture lease expiry, cue priority, fiction exclusion, effect restoration, cooldown/deduplication, insufficient chat evidence, quiet warmup, OAuth cancellation/state/refresh, secret redaction, owner credential/state isolation, atomic concurrent storage, SSE backpressure and identical-snapshot repaint.
- One-hour **simulated** soak, two owners: 2,402 translation jobs, 578 Chorus jobs, 192 Chaos jobs, 1,152 audio jobs and 1,728 vision jobs. Retained segments capped at 200; queues stayed within configured limits. Post-GC retained heap stabilized near 6MB; minute-10 to minute-60 growth was about 169KB, with the last four samples near-flat. Exact run output: `artifacts/soak-result.json`.
- This simulation advances a fake clock; it is not a one-hour real audio, network or OBS test. Queue overload/expiry is exercised separately in regression tests. Core processing timing is not event-to-overlay latency.

## Real API results, synthetic inputs

Five small requests used the configured owner key; no microphone, camera, or Twitch content was captured. Output is recorded separately in `artifacts/provider-smoke-result.json`.

| Pipeline | Observed result | Single request latency |
|---|---|---|
| English → Chinese | `大家好。欢迎来到直播间。` for “Hello everyone. Welcome to the stream.” | 1,788ms |
| Audio observation | Three seconds of synthetic silence correctly returned no cue | 1,393ms |
| Camera observation | Identical blank frames correctly returned no cue | 4,564ms |
| Chat Chorus | Summary returned with all three synthetic supporting message IDs | 2,054ms |
| Chaos | Clearly fictional commentary returned | 1,381ms |

These prove API/schema compatibility for these requests. They do not establish percentile latency, live detection accuracy, multilingual meaning quality, or actual WebRTC transcription. An earlier smoke check exposed a translation JSON wrapper; translation now uses a strict `translation` field and returns only its validated text.

## Browser inspection

The running studio was inspected at desktop and compact widths with landscape/portrait previews, Chinese bilingual captions, Description Only, Full Context and both Chaos placements. Description Only hides speech while the studio transcript remains available. Replacing speech in Chaos keeps the persistent fiction label. Guided setup shows masked empty key input, device selection, crop controls and actual connection status. Reduced-motion behavior and independent overlay rendering are included in the final manual UI checks.

## Remaining acceptance gates

### Final release hardening — November 1, 2026

Fixed reproduced failure cases:

- Older out-of-order translations could reappear after newer captions expired. Those completions now remain in history, and display selection never goes backward. English advances after a held bilingual pair expires even if the next translation fails.
- Speech setup and reconnection could remain in “starting” indefinitely. A 20-second deadline now releases capture and provides recovery details. Closed/failed speech data channels and transcription-failure events also report actionable errors.
- A failed OBS signaling answer could prevent retries of the same receiver offer. Failed bridges now reset and retry; receivers also renew stalled handshakes after 15 seconds and bound HTTP requests to 10 seconds.
- Pending commentary could publish evidence after moderator deletion. Deletion/clear now invalidate pending commentary and remove current cues. A lone prolific chatter cannot establish the collective quiet baseline.
- Channel Points voice labels now reflect the configured duration. Saved Twitch connections reconnect at server startup without starting media capture.
- Caption events publish coalesced overlay snapshots immediately instead of waiting for the 100ms expiry tick.
- A real audio-provider request incorrectly described synthetic silence as “raised voice.” Silent/near-silent PCM now fails a local signal gate before any API request. Malformed audio is rejected. This prevents the reproduced failure; it does not establish accuracy on real laughter, coughing, or raised speech.

Verification:

- **99 automated tests passed**, including the new recovery, ordering, moderation, signal-gate, all-language/font HTTP, and reconnect cases. Typechecking, website checks, and `git diff --check` passed. Log: `artifacts/release-tests.log`.
- A simulated one-hour/two-owner soak kept queues/history bounded; retained heap grew 26,296 bytes between simulated minutes 10 and 60. This is fake-clock testing, not an actual one-hour stream. Log: `artifacts/release-soak.log`.
- Local HTTP → overlay SSE delivery measured p95 **0.79ms** across 100 synthetic phrases after immediate publishing, versus **102.65ms** across 40 phrases before it. All phrases arrived. Excludes browser rendering, microphone recognition, provider and OBS latency. Results: `artifacts/release-http-latency.json` and `artifacts/release-http-latency-after.json`.
- Real requests returned Slovak (2,789ms), Turkish (2,741ms), no observation for unchanged blank camera frames (2,618ms), and a chat commentary supported by all three fabricated message IDs (2,549ms). The initial silence failure is preserved in `artifacts/release-provider-smoke.json`. After the fix, three silent/near-silent windows produced no cues and zero API requests: `artifacts/release-silence-fix.json`. All inputs were synthetic; no private live media was captured and no language-reader signoff is claimed.
- Restarted the actual studio with the fixes. Saved Twitch automatically connected as `aaronkc`, 38 rewards loaded, and studio/overlay/audio routes returned 200. No chat message or redemption was sent. Result: `artifacts/release-running-build.json`.
- **Remaining release gates:** browser control is disabled in Work settings, so fresh visual inspection and actual microphone → caption/voice → OBS recording remain unverified. Also test a real chat command/redemption, switching content modes during voice translation, and a long real translated-audio session. The studio is left in demo mode with Twitch connected, microphone idle, and audio receiver disconnected. Local changes are not committed/pushed; the latest marketing wording remains undeployed.

### Current-build validation — November 1, 2026

- Re-ran all 86 tests, development typechecking, and website checks successfully. Log: `artifacts/build-validation-tests.log`.
- Re-ran the one-hour simulated soak with two owners: 36,001 ticks, bounded history/queues, and 44,712 bytes of retained heap growth between simulated minutes 10 and 60. This is a fake-clock simulation, not a real one-hour stream. Log: `artifacts/build-validation-soak.log`.
- The saved OpenAI key validated. A real request translated the synthetic greeting “Hello everyone. Welcome to the stream.” into “大家好。欢迎来到直播间。” in 2,983ms. Model listing is not a successful execution test for each listed model. Result: `artifacts/build-live-service-check.json`.
- An isolated session used the actual session core, translation scheduler, and configured OpenAI provider to deliver a second synthetic phrase into English and Chinese overlay tracks in 3,588ms, with independent Bungee and Lora font settings. Freeze held the presentation across an incoming draft; hide and resume states passed. No saved studio settings were changed. Result: `artifacts/build-provider-pipeline.json`. This verifies overlay data, not browser pixels or microphone recognition.
- Reconnected the saved Twitch account as `aaronkc`; EventSub reported connected and 38 Channel Points rewards loaded. No chat message was sent and no reward was redeemed. The connected channel was offline with no preview image. Studio, overlay, voice receiver, font modules, and all 22 bundled font files returned HTTP 200. The overlay SSE endpoint delivered a version-3 snapshot without private history or capture credentials. Result: `artifacts/build-integration-status.json`.
- Studio left running on port 4317 in demo mode, with Twitch connected, microphone idle, and voice output disconnected. Browser controls remain unavailable. A fresh real microphone → captions/translated voice → OBS recording, live chat command, and reward redemption are still needed for full acceptance of this build.

### Continuous voice, viewer duration, and brand fonts — November 1, 2026

- All 86 automated tests pass, as do development typechecking and website checks. Results: `artifacts/final-feature-tests.log`.
- Streamer-started voice translation remains active until stopped; viewer commands and rewards use the saved 5–120 second duration (default 20). Tests cover renewal identities, stale events, timed restoration, continuous-mode preservation across appearance changes, viewer permissions, cooldowns, and invalid durations. The simulated two-hour lifecycle is not a real two-hour provider session.
- The catalog offers 24 font choices, including 22 bundled fonts with distribution licenses, plus an installed-font family option. Primary and secondary tracks retain separate choices. Tests verify assets, licenses, migration, and safe custom family names. Installed fonts must be present on the studio and OBS computers; unavailable glyphs can use fallback fonts.
- Earlier browser inspection in this task confirmed Bungee, custom Arial, and a 390px Caveat preview without overflow. The synthetic audio fixture ran continuous translation beyond 30 seconds and through two renewal connections. These are synthetic checks, not real microphone, provider, or OBS acceptance. The final timed-effect result and screenshot were not saved before browser access was lost; no new browser artifact is claimed.
- Final browser inspection and Cloudflare publication remain pending because local browser control is disabled in Work settings. The studio is running on port 4317 and the static-only publication archive is `artifacts/auramax-continuous-voice.zip`. A fresh real microphone → translated speech → OBS recording remains required.

### Microphone recovery — November 1, 2026

- All 80 automated tests passed, including named browser failures with empty messages, unsupported capture, canceled permission attempts, redacted diagnostics, persisted failure details, stale capture rejection, and new-session recovery. Development typechecking passed.
- Inspected the actual recovery panel at desktop and 390px widths; no panel overflow. The settings shortcut opened Inputs. Screenshot: `artifacts/microphone-recovery.png`.
- The earlier live attempt stored no error detail, so its cause remains unknown. The new panel says so explicitly. The server was restarted with structured failure recording; a fresh real microphone → provider → OBS test is still required. No real microphone or paid audio was started for these checks.

### Chinese broadcast audio addition

- Startup handoff regression: the fixture now opens a translation peer and sends transcript text while withholding output audio for five seconds. The browser receiver kept the 440 Hz original during this wait, then received the 880 Hz translated signal with original suppressed. The audio thread now gates readiness on 32ms above an RMS threshold of .003, with a 120ms onset buffer and scheduled gain handoff. Unit tests cover silence, low codec noise, transient clicks, either stereo channel, single activation and processor teardown. This verifies synthetic audio continuity, not real model latency or perceived speech quality. Live OBS must be retested after refreshing the studio.

- Native browser WebRTC integration used a synthetic 440 Hz microphone and an injected 880 Hz translation peer through the production mixer and receiver. The receiver measured approximately 439 Hz normally, 879 Hz during dubbing, and 439 Hz after restoration. During dubbing, the original frequency was suppressed by at least 30 dB relative to the translated signal. Both timed restoration and the manual restore control were exercised. No real devices or paid audio were used. Latest result: `artifacts/broadcast-browser-result.json`.
- Regression tests cover exclusive receiver leases, capture ownership, stale negotiation, credential redaction, viewer opt-in and cooldown, connection deadlines, the 20-second input window with a bounded five-second tail, caption restoration, and owner-specific provider credentials.
- The voice controls were visually inspected at 1440px desktop and 390px compact widths. Screenshot: `artifacts/chinese-voice-studio.png`.
- The configured account successfully created a real `gpt-realtime-translate` ephemeral client secret. No audio was sent in that compatibility check. This establishes endpoint/model access only; real translated speech and voice similarity remain unverified.
- Actual OBS routing remains a manual acceptance gate: verify the new source on the stream audio track, mute the duplicate Mic/Aux source, keep monitoring off, and record normal → Chinese → normal plus manual cancellation. Check translated meaning with a fluent Chinese speaker and test the documented fallback of unmuting the original OBS mic if the studio/source closes.

### Audience connection flow — November 1, 2026

- All 56 automated tests and development typechecking passed after adding the audience-panel Twitch entry point.
- Headless Chrome exercised the actual studio modules with injected Twitch state and intercepted OAuth requests: missing/configured application, focused panel, repeated-click suppression during SSE updates, failed authorization retry, connecting/connected/error states, reward availability, live-capture warning, and success/cancellation return handling with query cleanup. No real OAuth, devices or paid processing were used.
- Visually inspected the connection panel at 1440px desktop and 390px mobile with reduced motion, plus the connected audience card and portrait bilingual preview. Screenshots are local in `artifacts/twitch-setup-desktop.png`, `artifacts/twitch-setup-mobile.png`, `artifacts/twitch-audience-connected.png` and `artifacts/twitch-flow-portrait-bilingual.png`.
- Subsequent real-provider check on November 1: authorized AuraMax Captions as `aaronkc` through the registered localhost callback with `user:read:chat` and `channel:read:redemptions`. The production EventSub adapter reached connected status. A real `!style paper` message sent through Twitch chat produced one `origin: twitch` event, changed the effective style to `paper`, preserved the saved `spotlight` baseline, and automatically restored it after the 20-second effect. Existing Channel Points rewards loaded through Twitch; no reward was redeemed or mapped. Screenshot: `artifacts/twitch-live-command-verified.png`. Speech stayed in explicitly labeled demo mode; microphones/camera and all AI lanes remained idle. Earlier connection screenshots remain fixtures.

### Existing live acceptance gates

1. In Chrome/Edge, start OpenAI Realtime with the actual microphone. Speak English, stop/restart during permission and network setup, and verify segment ordering plus phrase boundaries. Measure first English and final-to-Chinese latency over many phrases.
2. Enable the selected webcam or OBS Virtual Camera, crop the streamer, then test laughter, sigh, cough, raised voice, waving, standing, leaving and returning. Verify ambiguity produces no cue and fresh cues meet the eight-second target.
3. With the authorized Twitch account, test three distinct chatters, message deletion, moderator reset, allowed-mode restrictions, token refresh, overlapping effects, and duplicate/cooldown reward delivery. Real OAuth, one chat style command, timed restoration, and reward listing passed; live Chat Chorus and reward redemption remain unverified.
4. Open the actual OBS browser source, verify transparent framing at 1920×1080 and 1080×1920, and test disconnect/reconnect with unchanged text. Browser overlay tests do not count as actual OBS verification.
5. Ask a fluent Chinese reader to check negation, names, numbers, slang and humor on actual speech. No fluent-reader signoff has been claimed.
6. Run a real one-hour stream and measure end-to-end p95 latency, memory and provider usage. The API sample and fake-clock soak do not satisfy this production-quality gate.
7. Only then move to hosted beta: account identity, encrypted secrets, database isolation, per-operation authorization, private overlays and quotas, followed by onboarding with a small BYOK group.

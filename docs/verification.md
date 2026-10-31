# Verification — 2026-10-29

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

### Chinese broadcast audio addition

- Startup handoff regression: the fixture now opens a translation peer and sends transcript text while withholding output audio for five seconds. The browser receiver kept the 440 Hz original during this wait, then received the 880 Hz translated signal with original suppressed. The audio thread now gates readiness on 32ms above an RMS threshold of .003, with a 120ms onset buffer and scheduled gain handoff. Unit tests cover silence, low codec noise, transient clicks, either stereo channel, single activation and processor teardown. This verifies synthetic audio continuity, not real model latency or perceived speech quality. Live OBS must be retested after refreshing the studio.

- Native browser WebRTC integration used a synthetic 440 Hz microphone and an injected 880 Hz translation peer through the production mixer and receiver. The receiver measured approximately 439 Hz normally, 879 Hz during dubbing, and 439 Hz after restoration. During dubbing, the original frequency was suppressed by at least 30 dB relative to the translated signal. Both timed restoration and the manual restore control were exercised. No real devices or paid audio were used. Latest result: `artifacts/broadcast-browser-result.json`.
- Regression tests cover exclusive receiver leases, capture ownership, stale negotiation, credential redaction, viewer opt-in and cooldown, connection deadlines, the 20-second input window with a bounded five-second tail, caption restoration, and owner-specific provider credentials.
- The voice controls were visually inspected at 1440px desktop and 390px compact widths. Screenshot: `artifacts/chinese-voice-studio.png`.
- The configured account successfully created a real `gpt-realtime-translate` ephemeral client secret. No audio was sent in that compatibility check. This establishes endpoint/model access only; real translated speech and voice similarity remain unverified.
- Actual OBS routing remains a manual acceptance gate: verify the new source on the stream audio track, mute the duplicate Mic/Aux source, keep monitoring off, and record normal → Chinese → normal plus manual cancellation. Check translated meaning with a fluent Chinese speaker and test the documented fallback of unmuting the original OBS mic if the studio/source closes.

### Existing live acceptance gates

1. In Chrome/Edge, start OpenAI Realtime with the actual microphone. Speak English, stop/restart during permission and network setup, and verify segment ordering plus phrase boundaries. Measure first English and final-to-Chinese latency over many phrases.
2. Enable the selected webcam or OBS Virtual Camera, crop the streamer, then test laughter, sigh, cough, raised voice, waving, standing, leaving and returning. Verify ambiguity produces no cue and fresh cues meet the eight-second target.
3. Connect an authorized Twitch broadcaster account with the two requested scopes. Test three distinct chatters, message deletion, moderator reset, allowed-mode restrictions, token refresh, overlapping effects, and duplicate/cooldown reward delivery. This environment has no configured Twitch application, so real Twitch authorization/rewards remain unverified.
4. Open the actual OBS browser source, verify transparent framing at 1920×1080 and 1080×1920, and test disconnect/reconnect with unchanged text. Browser overlay tests do not count as actual OBS verification.
5. Ask a fluent Chinese reader to check negation, names, numbers, slang and humor on actual speech. No fluent-reader signoff has been claimed.
6. Run a real one-hour stream and measure end-to-end p95 latency, memory and provider usage. The API sample and fake-clock soak do not satisfy this production-quality gate.
7. Only then move to hosted beta: account identity, encrypted secrets, database isolation, per-operation authorization, private overlays and quotas, followed by onboarding with a small BYOK group.

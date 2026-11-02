# Track architecture — November 1, 2026

## Configuration

`public/track-model.js` is the shared, pure schema. Settings version 3 holds primary/secondary tracks and viewer add-ons. Each track has enabled, mode, language, commentary tone/inputs, and a design object. Only the secondary can be disabled. The editor reuses one implementation for either track. The shared language catalog also generates the landing-page list.

Legacy scalar settings remain a migration/compatibility boundary for old preferences and the broadcast-audio renderer. New studio controls write track patches. Saved bilingual settings migrate to two tracks; legacy full-context/chorus/chaos settings migrate to commentary. Old viewer mode commands cannot bypass enabled add-ons; moderator compatibility commands remain supported. Legacy reward mappings normalize to add-on IDs, with disabled effects still blocked.

## Work ownership

`inputPlan` derives the union of enabled tracks' requirements. English subtitles use speech capture only. Other subtitle languages add translations; identical languages share requests. Commentary mic enables transcription and audio observations; commentary camera enables frame capture/observations; commentary chat enables bounded chat aggregation. Dubbing can independently require microphone routing. Disabling unused sources stops their capture and queued analysis. Changing devices or capture requirements replaces the cancellable capture handle; late permission results release their tracks.

`StreamSession` owns identity, lifecycle, raw transcript, shared observations, settings and effects. `TrackRuntime` owns per-language results and two independent commentary lanes. The speech/translation path never awaits commentary. Every result validates session and generation; translation additionally validates the retained source revision. Queues remain bounded. Commentary reads only each track's selected evidence. Collective chat claims require three distinct contributors and referenced message IDs; factual and comedic outputs are labeled separately.

Presentation snapshots contain two rendered track descriptions. The shared browser renderer groups tracks by position to prevent overlapping tracks at the same anchor. Freeze captures the exact two-track presentation; Hide clears everything; Resume skips stale output. Speech exports never include commentary.

## Viewer actions

Add-ons target one enabled track and change content, language, tone or appearance. Creator opt-in, deduplication and shared cooldown apply to commands, rewards and subscriptions. Temporary overrides replace the preceding override and restore saved settings; manual edits cancel them. Persistent effects write saved settings. Mode changes preserve design. Existing `!style` commands have a separate creator toggle. `!captions` remains moderator-only and changes the primary language without rebuilding other track settings.

New-subscription events require the optional `channel:read:subscriptions` grant. The first enabled subscription add-on wins; resubscription messages are not included. The connection UI reports missing access. Channel Points are mapped to existing rewards; rejected cooldown redemptions are not automatically refunded.

## Remaining validation

Tests cover queue/lifecycle isolation, stale results, migration, opt-in and effect restoration. Browser checks cover track switching, bilingual/portrait output, mobile controls, reduced motion and output controls. These are not a substitute for live microphone, camera, paid AI, OBS and multilingual reader checks. The local identity adapter remains unsuitable for public hosting.

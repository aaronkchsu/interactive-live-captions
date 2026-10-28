# Caption design evidence and experiment plan

The MVP uses **research-informed starting points**, not a proven recipe for Twitch retention. TikTok's public material primarily studies advertising, while most subtitle experiments use prerecorded film or documentary footage. Neither directly validates live bilingual Twitch captions with audience-driven animations.

## Evidence → implementation → limits

### 1. TikTok creative research

[The Power of Creative Elements in TikTok ads (2022)](https://ads.tiktok.com/business/creativecenter/quicktok/online/Power_Creative_Elements/pc/en?previewMode=true) describes a creative analysis with Kantar covering approximately 4,000 ads. It supports text as part of a deliberate creative presentation and discusses balancing treatments and information density.

**Our choice:** brief phrases, selective emphasis, and restrained entry animation. Caption content stays unchanged when the style changes.

**Limit:** TikTok's 5–10 words/sec ad-text claim is not an appropriate default for continuous live subtitles, bilingual comprehension, or Chinese reading speed. Do not advertise a retention lift based on this figure.

### 2. Placement and testing

[TikTok Creative Best Practices (2025)](https://ads.tiktok.com/resources/help/article/creative-best-practices?lang=en) recommends contextual captions/text, protecting UI-safe space, and testing different creative treatments.

**Our choice:** landscape/portrait previews, adjustable placement, and a preview safe-area guide. The guide is a configurable design aid, not an official Twitch/TikTok safe-zone template. Preview personal footage before relying on any placement.

### 3. Reading speed evidence is context-dependent

[Szarkowska & Gerber-Morón (2018), Viewers can keep up with fast subtitles](https://discovery.ucl.ac.uk/id/eprint/10050653/) tested 74 English, Polish, and Spanish viewers with 12, 16, and 20 characters/sec. Viewers often coped with fast subtitles, with preferences affected by soundtrack familiarity.

[Kruger, Wisniewska & Liao (2022), Why subtitle speed matters](https://researchers.mq.edu.au/en/publications/why-subtitle-speed-matters-evidence-from-word-skipping-and-reread/) tested 12, 20, and 28 characters/sec and found faster subtitles were read less completely, with lower comprehension.

**Our choice:** preserve the complete phrase while it is displayed; do not replace it with isolated flashing words or play an entry animation on every draft update. The phrase-hold control lets users explore sample pacing and tune silence hold. Actual live phrase arrival follows speech. There is no claim that slower is universally better or that one cps figure applies across scripts.

### 4. Bilingual presentation is an option

[Liao, Kruger & Doherty (2020), The impact of monolingual and bilingual subtitles on visual attention](https://researchers.mq.edu.au/en/publications/the-impact-of-monolingual-and-bilingual-subtitles-on-visual-atten/) reports a small study of 20 native Chinese speakers. Dual subtitles did not produce greater cognitive load or greater gains than monolingual subtitles in its setting.

**Our choice:** original / translation / both controls with stable language hierarchy. Chinese is rendered as text, with CJK font fallbacks and browser-native line wrapping. We do not segment Chinese by spaces.

**Limit:** this was prerecorded documentary material, not noisy gaming audio or audience-controlled live typography. Bilingual is not automatically best.

### 5. Contrast and motion

[WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) specifies at least 4.5:1 for normal text and 3:1 for qualifying large text. Translucent backplates must be evaluated over actual footage; a nominal color pair is not enough.

**Our choice:** robust type, backplates, user-adjustable background strength, and a neutral reset. Reduced motion disables entry animation and decorative waveform motion; operating-system reduced-motion preference is also respected.

## Values that remain hypotheses

The initial phrase hold (5 sec), caption size (42 relative units), entry duration (320 ms), 12-second audience cooldown, and 20-second style duration are product choices for testing. None is described as a scientifically established optimum. Portrait and landscape layouts may need different tuning after real viewing tests.

## First evaluation

1. Record a short consented English sample containing normal speech, fast speech, pauses, names, numbers, negation, slang, and a long uninterrupted sentence.
2. Replay the same audio across provider and visual settings. Keep input, transcript, translation, timestamps, model settings, and observed usage together.
3. Measure first-English-text delay and end-of-phrase-to-Chinese delay separately. Initial targets: p95 under 2 sec and 4 sec respectively. These are targets, not results.
4. Test Chinese meaning with a fluent reader; back-translation alone does not establish accuracy.
5. Compare neutral captions with Spotlight/Notebook/Sidekick using equivalent source content. Ask viewers to answer content questions, rate readability and fatigue, and indicate preference. Small informal tests guide iteration but do not justify population-level claims.
6. Inspect at actual OBS size, a phone-sized crop, bright footage, busy gameplay, and reduced motion. Record clipping, missing glyphs, obstructed content, and excessive flashing.
7. Verify failures: microphone permission denial, network interruption, translation timeout, late old-language results, repeated Twitch messages, and opening the overlay after the session starts.

## Genuine Codex build evidence

- The initial plan separated audio/provider behavior from caption rendering.
- Research changed the design toward stable phrases, adjustable presentation, and restrained emphasis.
- Browser inspection found an emphasis pseudo-element adding unwanted layout space; it was removed.
- Tests protect against old translations resurfacing after language/session changes and late microphone callbacks overwriting demo mode.
- Save actual before/after captures and real account tests during subsequent iterations. Do not present fixture playback as live AI output.

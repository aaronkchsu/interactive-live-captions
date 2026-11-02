# Streamer Voice Box

This repository owns the AuraMax Captions live caption studio and its public landing page in website/. Do not edit sibling TwitchCon projects. Treat website/ as the canonical website source; the earlier standalone landing-page checkout is a historical backup. Deploy only website/dist/ to public static hosting.

- Keep the application small: one Node server, native browser modules, CSS, and SVG. Node 24+; no runtime dependencies.
- Subtitles and commentary can occupy either track. Label commentary and fiction; never represent either as the spoken transcript.
- Preserve caption meaning. Visual presets never rewrite source speech or translation.
- Keep demo fixtures unmistakably labeled. Never represent sample captions, chat, or events as live integrations.
- Browser-source overlays are stream-wide. Per-viewer captions are a separate future product.
- Never expose API keys or Twitch access tokens to the overlay, HTML, logs, or committed files.
- Keep display state separate from audio and provider adapters. Reject stale asynchronous results when sessions or languages change.
- Research claims belong in docs/research.md with limitations. Values for timing, phrase length, and animation are hypotheses, not scientifically proven universal optima.
- Run npm test for behavior changes and inspect desktop, portrait, reduced-motion, and bilingual layouts in a browser.

## AuraMax Captions copy

- Always use the full product name "AuraMax Captions" in user-facing copy and submission writing. Do not shorten it to "AuraMax".

- Frame the benefit as helping viewers "understand the moment." Do not use "get the joke" or jokes as the product's marketing message.
- Avoid em dashes and double-hyphen sentence breaks in AuraMax Captions copy and submission writing. Use periods or commas.
- Use concise, concrete language across the product and website. Every line should name a feature, explain a user problem or action, or provide evidence.
- Remove filler slogans and redundant subtitles instead of replacing them with another slogan. The user explicitly rejected “Readable by design” as meaningless fluff.
- Prefer descriptive headings such as “Caption reading speed” over vague phrases such as “Leave room to read it again.” Preserve sources and meaningful limitations.
- Do not reintroduce previously rejected filler, including “Your chat deserves a new toy,” decorative “Built with OpenAI Codex” labels, or casual overuse of “literally.”

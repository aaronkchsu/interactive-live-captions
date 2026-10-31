# Streamer Voice Box

This repository owns the AuraMax live caption studio and its public landing page in website/. Do not edit sibling TwitchCon projects. Treat website/ as the canonical website source; the earlier standalone landing-page checkout is a historical backup. Deploy only website/dist/ to public static hosting.

- Keep the application small: one Node server, native browser modules, CSS, and SVG. Node 24+; no runtime dependencies.
- Fiction and commentary belong only in their labeled secondary tracks.
- Preserve caption meaning. Visual presets never rewrite source speech or translation.
- Keep demo fixtures unmistakably labeled. Never represent sample captions, chat, or events as live integrations.
- Browser-source overlays are stream-wide. Per-viewer captions are a separate future product.
- Never expose API keys or Twitch access tokens to the overlay, HTML, logs, or committed files.
- Keep display state separate from audio and provider adapters. Reject stale asynchronous results when sessions or languages change.
- Research claims belong in docs/research.md with limitations. Values for timing, phrase length, and animation are hypotheses, not scientifically proven universal optima.
- Run npm test for behavior changes and inspect desktop, portrait, reduced-motion, and bilingual layouts in a browser.

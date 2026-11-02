# Devpost submission notes

## What's next: viewer-controlled captions

Scope decision — October 31, 2026: record these as future work for the Devpost submission. Do not add them to the current competition build or describe them as shipped features.

Suggested submission copy:

> AuraMax currently adds captions and commentary directly to the broadcast through OBS. Next, we want to give individual viewers more control: optional speech captions through Twitch's CC button, and a Twitch Extension where viewers could show or hide the custom overlay and choose their own caption settings.

### Optional native closed captions

- Explore sending the accurate speech transcript through an OBS caption-output integration so viewers can enable or disable it using Twitch's CC controls.
- Keep generated commentary and fiction out of this transcript.
- Validate the output path, supported character sets, mobile behavior and VOD playback before promising language coverage or compatibility.
- This is a separate output from the existing browser source; adding text to the OBS video does not enable native CC.

### Viewer-controlled Twitch Extension

- Explore a viewer-side overlay with individual visibility, caption style and language choices.
- Keep viewer preferences independent of the streamer's broadcast-wide settings and community effects.
- Verify Twitch Extension review requirements, desktop/mobile capabilities, authorization and delivery costs before committing to implementation.
- Per-viewer controls cannot remove captions already embedded in the broadcast video. The streamer would need to disable that embedded caption layer when offering an optional-only experience.

References for future implementation: [Twitch caption guide](https://help.twitch.tv/s/article/guide-to-closed-captions?language=en_US), [Twitch Extension guidelines](https://dev.twitch.tv/docs/extensions/guidelines-and-policies/).

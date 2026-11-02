# AuraMax Captions — submission draft

Status: overview saved to Devpost; story and judge answers below are working drafts. Demo video, thumbnail, repository access, and final eligibility answers remain outstanding. Do not treat this file as a completed submission.

## Elevator pitch

Captivate your viewers with interactive live captions and subtitles. Let chat change styles, trigger commentary, and switch your spoken language.

## Project story

### Inspiration

A viewer opens a stream on their phone without sound. Another speaks a different language. Both can see the streamer react, but miss what made the moment funny.

AuraMax started with captions that help those viewers follow along. Then we asked: what if the community could also participate through the captions? A chat command could change their look, turn on playful commentary, or temporarily switch the streamer's spoken output to another language.

### What it does

AuraMax is a local caption studio connected to Twitch and OBS.

- **Subtitles:** transcribe English speech and display captions in a catalog of 21 languages, including Slovak and Turkish. Add a second track for bilingual captions.
- **Commentary:** use selected microphone, camera, and chat inputs to describe or react to the stream. Choose factual, playful, cheeky, or roast commentary. Generated commentary stays separate from the actual transcript.
- **Community controls:** let viewers trigger creator-approved changes through chat commands and mapped Channel Points rewards. Effects can change language, style, content, or commentary tone. Creators choose duration and permissions.
- **Voice translation, beta:** translate spoken output into a selected language through a separate OBS audio source. Streamers can leave it on until they stop it; viewer activations are timed. It uses AI-translated speech, not a guaranteed clone of the streamer's voice.
- **Stream controls:** customize fonts, colors, placement, and backgrounds. Freeze the current captions, hide them immediately, or resume current output.

Captions are added to the broadcast through an OBS Browser Source. All viewers see the same output. The studio runs locally with the streamer's own OpenAI key; the public website provides a scripted interactive preview.

### How we built it with Codex

We used OpenAI Codex throughout design, implementation, and testing. We brought stream-specific problems and screenshots into the conversation, then used Codex to turn them into working changes: the first caption dashboard, Twitch authorization, OBS output, translation, and community controls.

The biggest design change was replacing a growing collection of modes with two configurable tracks. Either track can contain subtitles or commentary, with independent language and appearance. Codex helped refactor the event pipeline so subtitle-only sessions do not run camera analysis or chat commentary.

The application uses one Node.js 24 server, native JavaScript browser modules, HTML/CSS, and JSDoc type checking. OpenAI powers transcription, translation, observations, commentary, and translated speech. Twitch OAuth and EventSub connect the creator's channel to chat and reward events. OBS Browser Sources deliver text and audio to the broadcast.

### Challenges and what we learned

Live output has to handle late results. A translation arriving after the streamer changes language must not replace newer captions. We track source revisions, bound request queues, and discard obsolete work.

Voice translation introduced another problem: cutting the original microphone as soon as an effect starts creates silence while translated audio prepares. We keep original audio flowing until translated speech arrives, then switch the routed output. Translation still has model latency; warming the connection does not eliminate that delay.

Community commentary needs evidence. One viewer repeating a message should not become “chat thinks…” Collective claims require multiple contributors, and chat inputs are bounded and deduplicated.

We also learned to separate the caption transcript from generated commentary. That distinction matters in the interface, the overlay, and exported transcripts.

### What we verified

The current local build passes 103 automated tests, type checking, and website checks. Tests cover reordered speech, stale translations, overlapping effects, reconnects, isolated streamer contexts, and webcam preview lifecycle. A simulated one-hour run checks bounded queues and memory.

We also tested real provider translations, a live Twitch style command, and microphone-to-Chinese voice output recorded through OBS. These checks are documented separately from synthetic fixtures. Fluent-speaker quality review, a full real-stream soak, and broader live camera/community testing remain outstanding.

### What's next

Optional captions through Twitch's native CC controls and a viewer-side Twitch Extension could let each viewer choose visibility and language. These are planned, not shipped. Hosted onboarding with Twitch sign-in, encrypted credentials, and account-level controls is also future work; the current studio is local.

## Judge-only: main technology requirement

OpenAI Codex was used throughout the build to plan the architecture, implement the studio and landing page, integrate Twitch and OpenAI, refactor the subtitle/commentary tracks, and write and run regression checks. Iteration included screenshots and real OBS recordings, not only generated code.

Twitch OAuth connects the creator's account. EventSub delivers chat messages and Channel Points redemption events to creator-approved add-ons. Twitch API requests load existing rewards and stream preview metadata. Commands such as !style, !addon, and !voice let the community affect the stream within the creator's settings.

OBS Browser Sources display captions and carry translated audio into the broadcast. OpenAI APIs provide speech transcription, text translation, audio/camera observations, commentary, and live speech translation. One Node.js 24 server and native browser JavaScript coordinate these independent pipelines. The creator supplies their own OpenAI key.

## Judge-only: streamer and community use

A streamer connects Twitch, supplies an OpenAI key, chooses a microphone, and adds the caption Browser Source to OBS. They choose subtitles or commentary, a language, and a visual style. A second track is optional. Subtitle-only use requires audio; commentary can use selected chat, microphone, and camera inputs.

Viewers can follow spoken content without audio or through translated captions. They can also activate creator-approved style changes, commentary modes, and timed voice translation through chat commands and mapped Channel Points rewards. Creators control the allowed changes and durations, and can freeze or hide visual output immediately.

For example, a creator can show English speech with Chinese captions, let chat temporarily choose a bold red style, or activate Japanese spoken output for a timed effect. These outputs are broadcast-wide, not personalized per viewer. Voice translation requires the separate OBS audio route and muting the duplicate microphone source in OBS.

## Three-minute video outline

- **0:00–0:15 — Problem and result.** A real stream moment without audio, then the same moment with captions. Explain the sound-off and language barriers without an unsupported retention statistic.
- **0:15–0:45 — Subtitles and translation.** Speak into the microphone; show English and Chinese tracks in OBS. Show the simple track controls.
- **0:45–1:15 — Twitch interaction.** Send an allowed command in Twitch chat and show the actual style or commentary effect on the broadcast. Show creator control and restoration. Clearly label any fixture used instead of a real event.
- **1:15–1:40 — Voice translation beta.** Show the original microphone transitioning to translated speech through OBS. Include actual audio and honest latency; avoid an edit that implies instantaneous translation.
- **1:40–2:25 — Built with Codex.** Show this build conversation, one concrete refactor (independent tracks and input selection), relevant code, and regression results. Explain how user feedback shaped implementation.
- **2:25–2:50 — Creator control.** Show fonts, Freeze/Hide/Resume, and allowed viewer effects. Briefly explain local BYOK and setup.
- **2:50–3:00 — Close.** Show the project URL and identify optional viewer-specific CC/Extension support as next steps.

## Submission checklist

- Saved overview: AuraMax Captions and elevator pitch.
- Review and save project story, Built with tags, and website/code links.
- Record and upload a maximum three-minute YouTube demo. Use public visibility to satisfy the stricter wording on the event overview (the edit form also mentions unlisted).
- Add a project thumbnail and selected screenshots.
- Push current local commit and confirm judges can access the repository. Private repositories must be shared with testing@devpost.com, per the submission form.
- Confirm the primary Codex session ID. This browser session reports 01a176dc-1f6e-7cc1-b93f-94b2c1512dcd; verify that it is the main build thread before submitting.
- User supplies submitter type, residence, personal survey answers, and eligibility attestations.
- Review final submission together before submitting.

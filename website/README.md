# AuraMax landing page

Portable, buildless static website. This folder is part of the AuraMax competition repository. The live caption studio lives at the repository root and is **not** deployed with this page.

## Local development

Run `python3 -m http.server 4320 --bind 127.0.0.1 --directory dist` from this directory. No Node dependencies or API credentials are needed. Run `node --check dist/app.js` after JavaScript changes.

## Signup

The signup form is published and linked to a private response spreadsheet owned by the user's personal Google account. The public responder URL and feature field ID live in `dist/signup-config.js`. The selected landing-page feature prefills Google Forms. A non-JavaScript fallback links to the public form directly.

Public signup: https://docs.google.com/forms/d/e/1FAIpQLScG6gB6ly6KwbriGQUZyAmVmJNv7hb7beQnffuPldZvgDilfw/viewform



Required: manually entered email and favorite feature. Optional: Twitch channel. Google login is not required by the configured settings; response summaries and emailed response copies are disabled. The form explains testing/launch contact and how to request removal. Never publish the response sheet, put edit links in the landing page, or collect keys/passwords.

A clearly labeled test submission uses `auramax-test@example.com` and the channel field `TEST — signup integration check; not a real subscriber`. Exclude it from counts and outreach.

## Free public hosting

Cloudflare Pages is the public host. Project `auramaxcap` was deployed on 2026-10-30 at https://auramaxcap.pages.dev using Direct Upload on the Free plan. Upload only the contents of `dist/` for future updates; there is no build step. Static requests are currently free and unlimited, subject to provider terms and product limits. The marketing page never calls paid AI APIs.

`auramaxcap.com` and `www.auramaxcap.com` are configured as Pages custom domains, with proxied CNAME records targeting `auramaxcap.pages.dev`. Domain registration remains at GoDaddy. GoDaddy now delegates DNS to `kirk.ns.cloudflare.com` and `maya.ns.cloudflare.com`; Cloudflare confirmed zone activation. The original parking A records were replaced through Pages setup; `_domainconnect` (DNS only) and `_dmarc` were preserved. There were no MX records. Both `auramaxcap.com` and `www.auramaxcap.com` are Active with SSL enabled. Both HTTPS hostnames were opened successfully in the browser on 2026-10-30; the earlier certificate provisioning delay resolved without changing TLS security settings. The Chinese demo and public signup destination were also verified.



Official references: https://developers.cloudflare.com/pages/functions/pricing/ and https://developers.cloudflare.com/pages/configuration/custom-domains/

The `.openai/hosting.json` project is for an owner-private Sites review deployment. Sites currently advertises free hosting through December 31, 2026 and proposed custom-domain charges thereafter. Do not connect the custom domain to Sites under a free-only requirement.

## Content and QA

- All transcript, translation, chat, and Chaos content in the playground is scripted and labeled illustrative. The demo opens in Chaos and offers Just chatting, Snack break, and Minecraft sample moments. The photo does not depict the fictional scenarios or actual speech.
- `dist/assets/streamer.jpg`: photo by Yan Krukau, [Pexels photo 9072382](https://www.pexels.com/photo/a-man-in-a-black-shirt-talking-on-a-headphone-s-mic-while-looking-at-a-computer-monitor-9072382/), used under the [Pexels license](https://www.pexels.com/license/) checked 2026-10-30. It is illustrative stock imagery, not a user testimonial or endorsement. The public page credits the photographer.
- Chaos keeps speech and commentary separate. At the user’s request, the marketing demo has one compact Demo toolbar and a single scripted/fiction disclosure below the image instead of repeated labels on the photo. Live studio/OBS labeling is unchanged.
- The product-first editorial layout uses oversized type, a restrained gold accent, sourced audience figures, and a scripted photo-backed demo. The hero is followed by the interactive demo (“Captions Made for Live Content”), then audience evidence and use cases. The old hypothetical audience-loss calculator has been removed.
- Sound-off headline: 75% of respondents said they often keep their phone muted while videos play (Sharethrough, 750 people, June 2021). Source, date, and general-mobile scope sit directly below the heading. This is not a Twitch/live-stream mute rate.
- Audience figures: 105 million monthly Twitch viewers (Amazon Ads, September 2025), over 50% primarily mobile (Twitch, July 2024), and 70% of new viewers arriving on mobile (Twitch, June 2026). Sources and dates appear beside the figures. The historical muted-feed default is dated; mobile use does not establish a mute rate. See ../docs/research.md.
- Form publication, private response-sheet access, feature prefill, and a test submission were checked. Public Cloudflare Pages HTTPS, the Chinese translation demo, and the signup destination were verified. Both custom-domain bindings and their DNS records were created. Both hostnames are Active with SSL and verified in the browser.
- Redesign checked at 1440px desktop and 390px mobile on 2026-10-30, without horizontal overflow. Chinese/Spanish/Japanese translation fixtures, Chat Chorus, Chaos labeling, valid/invalid chat commands, caption hiding/restoration, style switch, pause, audience shortcuts, expandable details, and signup feature prefill were verified. No browser console errors were observed.
- Reduced-motion preference pauses the scripted timer and disables automatic sample rotation. This behavior was inspected in source; OS preference emulation was not available in this browser session.
- No analytics, secret storage, microphone access, or Twitch authorization occurs on this marketing page. Google Fonts are loaded from Google's font service.

Local screenshots and deployment archives live in ignored `artifacts/` and are not published.

The live studio now has 21 caption languages (English source plus 20 translation targets). The expandable marketing list is generated from `../public/languages.js` by `npm run website:languages` at the repository root. `npm run website:check` verifies synchronization. The marketing playground intentionally keeps its three recorded translation examples; it never makes live paid translation requests.

Research notes live at `dist/research.html`, linked from the landing-page navigation. The static page preserves the studio’s original study links and limitations. It does not load the playground script or make API requests.

## Yellow/pink design and rollback

The original cream/gold design is preserved at tag `auramax-editorial-before-color` (commit `d87a4f3`). The approved `design/yellow-pink-preview` branch was merged into `main` and adds `dist/signal.css` to the landing page; all visible copy and demo behavior remain unchanged. Yellow highlights streamer speech and pink highlights community/Chaos commentary. Research and the studio retain their current styles pending a design decision. The landing-page design was approved for publication on October 31, 2026; the original remains available through the rollback tag.

For side-by-side review, the ignored `artifacts/brand-review/` directory contains `original/` and `yellow/` static snapshots. Serve that directory on port 4320 to compare `/original/` and `/yellow/`. Refresh the yellow snapshot after further changes. The Git tag is the durable original; the snapshots are only review aids.

Validation: website checks passed; extracted visible HTML text matches the original exactly. Browser checks at 1280px and 390px showed no horizontal overflow. Translation, caption hiding/restoration, and mode color changes were verified. No JavaScript behavior was changed.

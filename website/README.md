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

- All transcript, translation, chat, and Chaos content in the playground is scripted and labeled illustrative.
- Chaos keeps accurate speech separate and shows a persistent fiction label.
- The audience calculator uses visitor-selected assumptions, not measured lost viewers or growth claims.
- Twitch's mobile statistic is attributed to its July 2024 disclosure; mobile does not mean muted.
- Form publication, private response-sheet access, feature prefill, and a test submission were checked. Public Cloudflare Pages HTTPS, the Chinese translation demo, and the signup destination were verified. Both custom-domain bindings and their DNS records were created. Both hostnames are Active with SSL and verified in the browser.
- Desktop and 390px mobile browser layout checked. Mobile has no horizontal overflow. Mode command, translation, pause, and fiction labeling checked; additional interactions verified in the task.
- Reduced-motion preference pauses the scripted timer and removes the illustration animation.
- No analytics, secret storage, microphone access, or Twitch authorization occurs on this marketing page. Google Fonts are loaded from Google's font service.

Local screenshots and deployment archives live in ignored `artifacts/` and are not published.

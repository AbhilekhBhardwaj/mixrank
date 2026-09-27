# Website Technology Finder

A demo of two-pass website technology detection.

The UI avoids jargon so anyone can use it. Pass one is called "the quick check" and
pass two is "the deeper check". This README uses the engineering terms.

Signature scanning is the standard technique, and it's what tools like MixRank rely on.
It matches known fingerprints against a page's HTML and headers. That works well for
the big platforms, but on smaller, indie, and custom-built sites it often finds
*nothing at all*. There's no fallback: if the obvious signature isn't there, you get
no answer.

This tool adds a fallback. When the first pass doesn't find a platform, a second pass
looks at things a site can't easily hide: `robots.txt`, the declared sitemap, and how a
few known admin paths respond. Then it reports how much extra coverage that gets you.

Both passes **follow `robots.txt`**. The tool obeys the file, it doesn't just read it for
clues. See [Crawling policy](#crawling-policy).

## What counts as a detection

A site counts as **identified** when a pass names its platform: a CMS, ecommerce
system, site builder, or framework. Analytics, payment, CDN, and support tools still
get detected and reported, but they don't count as identifying the site on their own,
and they don't stop the fallback pass from running.

This rule matters a lot. Cloudflare sits in front of a big share of the web. If any
match counted, nearly every site would "pass" on the first check, the fallback would
hardly ever run, and the comparison would be meaningless. Only counting platforms is
what makes the two rates comparable. To change the rule, edit `PLATFORM_CATEGORIES` in
`src/lib/detection/signatures.ts`.

## Crawling policy

`robots.txt` decides what gets fetched. It isn't just a source of evidence.
`src/lib/detection/robots.ts` implements RFC 9309 and every outbound request goes
through it.

The tool fetches `/robots.txt` **once per origin**. It caches the in-flight promise, so
the concurrent requests in pass two share one fetch instead of each making their own.
After that, it's checked before every request, including **every redirect hop**,
because a redirect can land on an origin with different rules. If a URL is disallowed,
the request is never made.

| robots.txt response | Treated as | Behaviour |
|---|---|---|
| `2xx` | rules | Parsed and applied |
| `4xx` | unavailable | No rules exist, so everything can be fetched |
| `5xx` or network failure | unreachable | Rules may exist but can't be read, so **the whole site is left alone** |
| `2xx` serving HTML | no file | Really a styled 404. Treated as no rules and not used for hints |

What's implemented from the spec:

- Consecutive `User-agent` lines form one group.
- A group that names our product token (`TechnographicExplorer`, which matches the
  User-Agent we send) *replaces* the `*` group. It doesn't add to it.
- The longest matching rule wins, and `Allow` wins a tie, so `Disallow: /` with
  `Allow: /public/` works as expected.
- `*` wildcards and `$` end anchors.
- Comments, CRLF line endings, and empty `Disallow:` lines.
- `/robots.txt` itself can always be fetched.

The 5xx row is the one people might disagree with, and it's on purpose. RFC 9309 says
an unreachable `robots.txt` means everything is disallowed. Guessing "allowed" there is
exactly how a crawler ends up fetching pages it was told to stay away from. The
downside is that a site with a flaky `robots.txt` gets no detection at all. The UI says
that clearly instead of calling it a failed detection.

### Crawl-delay

`Crawl-delay` isn't part of RFC 9309, but lots of sites set it, so the tool follows it.
If the group that applies to us sets a delay, requests to that origin are spaced at
least that far apart, counting from the `robots.txt` fetch. Each request books its time
slot before it starts waiting, so requests fired at the same moment still go out one at
a time. Time spent waiting doesn't count toward a request's timeout.

The tool will wait up to 10 seconds between requests. If a site asks for more, it only
fetches `robots.txt` and leaves the site alone. That way it never goes faster than the
site asked for, and a batch can't stall on one site.

### Skips are always reported

Each result includes a `robots` object with the state, a short plain-English summary,
and every path that wasn't fetched. If a site's own homepage is disallowed, the result
has `blockedByRobots: true`. The batch summary counts those sites separately
(`robotsBlocked`) instead of lumping them into "undetected". Mixing the two would make
a site's reasonable request look like our failure, and it would drag the headline
number down.

## Setup

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev
```

Open http://localhost:3000.

### Environment variables

All of these are **optional**. Without them the app works fine. Batch runs just aren't
saved, and no history shows up when the page loads.

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | for persistence | Project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | for persistence | Server-side key. Use this one if you can, since it never reaches the browser. |
| `NEXT_PUBLIC_SUPABASE_URL` | alternative | Used if `SUPABASE_URL` isn't set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | alternative | Used if the service-role key isn't set. Needs the RLS policies below. |

### Database

Run `supabase/schema.sql` once in the Supabase SQL editor. It creates
`detection_runs` (one row per batch, with the summary) and `detection_results` (one row
per site), plus the RLS policies you need if you use the anon key.

It's safe to run again, and you **have to** run it again on a database created before
robots.txt support was added. `create table if not exists` won't touch existing tables,
so the new `robots_blocked`, `robots`, and `blocked_by_robots` columns are added by
`alter table ... add column if not exists` statements at the end of the file.

## Rate limiting

Both detection endpoints make outbound requests on demand and need no login, so each
one is limited per IP per minute:

| Endpoint | Limit | Why |
|---|---:|---|
| `POST /api/detect` | 20 / min | One check is a handful of outbound requests |
| `POST /api/detect-batch` | 3 / min | A batch makes several hundred |

Going over the limit returns `429` with `Retry-After`. Every response includes
`RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`.

There are two things to know about `src/lib/rate-limit.ts` before putting this online.
First, the counts live in memory, so the limit is **per server instance**. With N
instances, the real limit is N times higher. Moving the counts to Redis or Upstash
fixes that. Second, the client IP comes from `x-forwarded-for`, which the client can
fake unless a trusted proxy overwrites it. So this stops accidental overuse, not a
determined attacker.

## API

### `POST /api/detect`

```jsonc
// request
{ "url": "example.com" }
```

Returns the technologies found, which pass found each one, the evidence, and the
`robots` object described in [Crawling policy](#crawling-policy). If the fallback ran,
it also returns the path probes and their results. If the site's page is disallowed,
you get `blockedByRobots: true` and no technologies.

### `POST /api/detect-batch`

```jsonc
// request: leave out `urls` to run the built-in sample list
{ "urls": ["a.com", "b.com"], "label": "my batch" }
```

Runs detection on the list (max 100 URLs, six at a time) and returns each site's
result plus a summary: totals, the primary-only count, the count the fallback added,
both rates, and the improvement. Saves the run if Supabase is set up.

### `GET /api/runs/latest`

Returns the most recent saved run, or `{ run: null }` if there isn't one.

## The sample sites

`src/lib/sample-sites.ts` lists 80 real, live sites. It leans toward platforms that
don't leave a signature in their HTML:

| Platform | Sites | Why it's included |
|---|---:|---|
| Ghost | 26 | Ghost has no primary signature at all |
| Joomla | 13 | Declining CMS with few markup clues |
| Drupal | 12 | Enterprise and nonprofit CMS, rarely fingerprinted in markup |
| Squarespace | 10 | Sites on custom domains, not builder subdomains |
| Wix | 8 | |
| Webflow | 7 | |
| WordPress | 4 | Standard installs, to keep the baseline honest |

Hand-written static personal sites are left out on purpose. They have no platform to
find, so neither pass can identify them. Including them would lower the rate without
testing anything.

**How the sites were picked matters for trusting the headline number.** They came from
public platform showcases and case-study lists. The only filters were whether the site
was reachable and taking the first N in the order listed. No site was added or removed
based on what the tool detected, because picking sites by the result would fake the
result instead of measuring it. Some sites have since switched platforms or gone
offline. That's what happens in real life, so they stay in.

## Detection detail

**Pass 1** checks for 14 platforms and services (WordPress, Shopify, React, Next.js,
Vue, Webflow, Squarespace, Wix, Google Analytics, Google Tag Manager, Stripe,
Cloudflare, Intercom, HubSpot) in the HTML and the response headers.

**Pass 2** only runs when pass 1 doesn't name a platform. It looks at:

- `robots.txt` disallow rules, which often give the platform away (`/wp-admin/`,
  `/ghost/`, `/administrator/`, `/core/`, Shopify's `/a/downloads/`). This doesn't cost
  an extra request, because the file was already fetched to decide what can be crawled.
- The sitemap listed in `robots.txt`, or `/sitemap.xml` if none is listed. Sitemap file
  names differ by platform (`sitemap_products_1.xml`, `wp-sitemap.xml`).
- Probes of `/wp-login.php`, `/administrator/`, and `/user/login`. Each is checked
  against `robots.txt` first and skipped, with a note in the result, if disallowed.

Each probe is compared against a **control request of the same shape**: a `.php` file
and a directory that don't exist. If a probe gets the same status as its control, it's
thrown out as no signal. That handles hosts that answer `200` for every path.

If there's **no usable control, the probe isn't judged at all**. When the control
request fails or is disallowed, every status looks meaningful. That's how a host whose
control request just timed out can turn an ordinary `403` into a confident
"WordPress". No baseline, no verdict.

Controls don't fully solve `403`. A WAF blocks *known attack paths* with `403`
(`/wp-login.php` is the classic one) but returns `404` for paths it has no rule for. A
control URL is never a known attack path, so comparing against it can't tell "exists
but forbidden" apart from "WAF rule matched". So a bare `403` only counts when the page
content confirms the platform.

Bot-challenge and block pages are thrown out. If a site's *own* page is one of these,
the result gets a warning, because what we scanned was the edge network, not the site.
Cloudflare also adds `/cdn-cgi/challenge-platform` to normal successful responses for
bot scoring, so that marker only counts as a challenge page when it comes with a
`403`, `429`, or `503`.

**On this sample, path probes add almost nothing.** Of 33 sites the fallback
identified, 31 came from `robots.txt` and 2 from sitemaps. The probes are the riskiest
part of the second pass and currently the least useful. They're worth keeping for
self-hosted CMSes that expose admin paths without a WAF, but don't expect them to move
the number much.

Two more checks stop the second pass from over-claiming. Generic folder names
(`/components/`, `/modules/`, `/checkouts/`) only count when the platform's full
default set shows up together, because any one of them alone appears in lots of
unrelated `robots.txt` files. And since a site only runs one CMS, conflicting CMS
matches are narrowed down to the best-supported one. Before that fix, some large
nonprofit sites showed up as Drupal *and* Joomla *and* WordPress at the same time.

Outbound requests have safeguards too. `robots.txt` is checked before every hop,
private and link-local addresses are refused (checked again on each redirect),
response size is capped, and every request has a timeout.

## Notes and limits

- Detection uses plain HTTP with no login and doesn't run JavaScript. Client-rendered
  frameworks only show up through their bundle paths and leftover markup.
- The tool can't tell "not identified" apart from "has no platform". That would need
  ground truth it doesn't have, so the headline rate slightly understates accuracy on
  a sample that includes hand-built sites.
- There's no authentication, on purpose. Read the rate-limiting notes above before
  making this public.

import { Explorer } from "@/components/Explorer";
import { Card, Disclosure } from "@/components/ui";
import { getLatestRun } from "@/lib/runs";
import { SAMPLE_SITES } from "@/lib/sample-sites";
import { isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const CHECKS = [
  {
    name: "Quick check",
    body: "Looks at the site's homepage for signs of what it was built with. It's fast and works well on big platforms, but a lot of smaller sites don't leave any obvious signs.",
  },
  {
    name: "Deeper check",
    body: "Only runs if the quick check finds nothing. It reads a few small files that almost every site publishes, which often give the platform away even when the homepage doesn't.",
  },
];

export default async function Home() {
  const configured = isSupabaseConfigured();
  const latestRun = configured ? await getLatestRun() : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 lg:py-16">
      <header className="mb-10 lg:mb-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          Website Technology Finder
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
          Find out what a website is built with
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-secondary">
          Every website runs on something, like WordPress, Shopify, or Squarespace. The
          usual way of checking works on big sites but often comes up empty on smaller
          ones. This tool adds a second look and measures how many more sites it can
          identify.
        </p>
      </header>

      <Explorer
        initialRun={latestRun}
        sampleSize={SAMPLE_SITES.length}
        supabaseConfigured={configured}
      />

      <section className="mt-12 lg:mt-16">
        <h2 className="text-sm font-semibold tracking-tight text-ink">The two checks</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {CHECKS.map((check) => (
            <div key={check.name} className="rounded-xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-ink">{check.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{check.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Card className="mt-6">
        <Disclosure summary="How it works (technical)">
          <div className="space-y-4">
            <p>
              <strong className="font-semibold text-ink">
                The quick check is signature matching.
              </strong>{" "}
              It looks for known fingerprints of 14 platforms and services in the response
              body and headers, such as asset paths like <code>/wp-content/</code>,
              generator meta tags, and headers like <code>X-Shopify-Stage</code>. It&rsquo;s
              accurate, but it finds nothing on custom-built sites.
            </p>

            <p>
              <strong className="font-semibold text-ink">
                The deeper check looks at secondary signals.
              </strong>{" "}
              It only runs when the quick check doesn&rsquo;t name a platform. It reads
              the disallow rules in <code>robots.txt</code> (<code>/wp-admin/</code>,{" "}
              <code>/ghost/</code>, <code>/core/</code>), how the sitemap files are named,
              and how a few known admin paths respond.
            </p>

            <p>
              <strong className="font-semibold text-ink">
                A site only counts as identified
              </strong>{" "}
              when a check names its platform: a CMS, ecommerce system, site builder, or
              framework. Analytics, payment, CDN, and support tools are still listed, but
              they don&rsquo;t count and they don&rsquo;t stop the deeper check from
              running. Otherwise Cloudflare alone would &ldquo;identify&rdquo; most of the
              web in the quick check, and the comparison would be meaningless.
            </p>

            <p>
              <strong className="font-semibold text-ink">robots.txt is obeyed,</strong> not
              just read for clues. It&rsquo;s fetched once per origin and checked before
              every request, including each redirect, since a redirect can land on an
              origin with different rules. Group selection, longest-match precedence,{" "}
              <code>Allow</code> overrides, and <code>$</code> anchors follow RFC 9309. A
              4xx means there are no rules, so anything can be fetched. A 5xx or network
              failure means rules might exist but can&rsquo;t be read, so the site is left
              alone. <code>Crawl-delay</code> is honored too, up to 10 seconds between
              requests. Sites asking for longer are left alone. Disallowed paths are never
              requested, and every skip shows up in the results.
            </p>

            <p>
              <strong className="font-semibold text-ink">
                A few safeguards keep the deeper check honest.
              </strong>{" "}
              Each admin-path check is compared against a control request of the same
              shape, so a host that answers <code>200</code> for everything can&rsquo;t
              cause a false match. If there&rsquo;s no usable control, the check
              isn&rsquo;t judged at all. A bare <code>403</code> only counts when the page
              content confirms it, because firewalls block known attack paths no matter
              what platform a site runs. Bot-challenge pages are ignored. Generic folder
              names only count when the platform&rsquo;s full default set appears
              together. And since a site only runs one CMS, conflicting CMS matches are
              narrowed to the best-supported one. Before that fix, some large nonprofit
              sites showed up as Drupal <em>and</em> Joomla <em>and</em> WordPress at once.
            </p>

            <p className="text-ink-muted">
              Detection uses plain HTTP with no login and doesn&rsquo;t run JavaScript, so
              client-rendered frameworks only show up through bundle paths and leftover
              markup. The tool can&rsquo;t tell &ldquo;not identified&rdquo; apart from
              &ldquo;has no platform&rdquo;. That would need ground truth it doesn&rsquo;t
              have.
            </p>
          </div>
        </Disclosure>
      </Card>

      <footer className="mt-12 border-t border-line pt-6 text-xs leading-relaxed text-ink-muted">
        Checks are read-only and follow each site&rsquo;s robots.txt. The tool never logs
        in or changes anything.
      </footer>
    </main>
  );
}

import type { TechCategory } from "@/lib/types";

export interface HtmlRule {
  pattern: RegExp;
  /** Shown in the UI as the reason for the match. */
  label: string;
}

export interface HeaderRule {
  header: string;
  pattern: RegExp;
  label: string;
}

export interface Signature {
  name: string;
  category: TechCategory;
  html?: HtmlRule[];
  headers?: HeaderRule[];
}

/**
 * Categories that answer "what is this site built on?". A site with only
 * ancillary matches (analytics, payments, CDN) has not really been identified,
 * so those matches do not suppress the fallback pass.
 */
const PLATFORM_CATEGORIES = new Set<TechCategory>([
  "CMS",
  "Ecommerce",
  "Site Builder",
  "Framework",
]);

export function isPlatformCategory(category: TechCategory): boolean {
  return PLATFORM_CATEGORIES.has(category);
}

export const SIGNATURES: Signature[] = [
  {
    name: "WordPress",
    category: "CMS",
    html: [
      { pattern: /\/wp-content\//i, label: "asset path /wp-content/" },
      { pattern: /\/wp-includes\//i, label: "asset path /wp-includes/" },
      {
        pattern: /<meta[^>]+name=["']generator["'][^>]+content=["']WordPress/i,
        label: 'generator meta tag "WordPress"',
      },
      { pattern: /\/wp-json\//i, label: "REST route /wp-json/" },
    ],
    headers: [
      { header: "link", pattern: /api\.w\.org/i, label: "Link header api.w.org" },
      { header: "x-powered-by", pattern: /w3\s*total\s*cache|wp\b/i, label: "X-Powered-By names WordPress" },
    ],
  },
  {
    name: "Shopify",
    category: "Ecommerce",
    html: [
      { pattern: /cdn\.shopify\.com/i, label: "assets from cdn.shopify.com" },
      { pattern: /Shopify\.theme\b/i, label: "inline Shopify.theme object" },
      { pattern: /shopify-features|shopify-boomerang/i, label: "Shopify runtime script" },
      { pattern: /myshopify\.com/i, label: "myshopify.com reference" },
    ],
    headers: [
      { header: "x-shopid", pattern: /.+/, label: "X-ShopId header" },
      { header: "x-shopify-stage", pattern: /.+/, label: "X-Shopify-Stage header" },
      { header: "powered-by", pattern: /shopify/i, label: "Powered-By: Shopify" },
    ],
  },
  {
    name: "Next.js",
    category: "Framework",
    html: [
      { pattern: /\/_next\/static\//i, label: "asset path /_next/static/" },
      { pattern: /__NEXT_DATA__/, label: "__NEXT_DATA__ payload" },
      { pattern: /id=["']__next["']/i, label: 'root element id="__next"' },
    ],
    headers: [
      { header: "x-powered-by", pattern: /next\.js/i, label: "X-Powered-By: Next.js" },
      { header: "x-nextjs-cache", pattern: /.+/, label: "X-Nextjs-Cache header" },
    ],
  },
  {
    name: "React",
    category: "Framework",
    html: [
      { pattern: /data-reactroot|data-reactid/i, label: "React hydration attribute" },
      { pattern: /__REACT_DEVTOOLS_GLOBAL_HOOK__/, label: "React DevTools hook" },
      { pattern: /\breact(-dom)?(\.production|\.development)?(\.min)?\.js/i, label: "react.js bundle" },
      { pattern: /\/react@\d|cdn\.jsdelivr\.net\/npm\/react/i, label: "React CDN import" },
    ],
  },
  {
    name: "Vue.js",
    category: "Framework",
    html: [
      { pattern: /data-v-[0-9a-f]{8}/i, label: "scoped-style attribute data-v-*" },
      { pattern: /__VUE__|__VUE_DEVTOOLS_GLOBAL_HOOK__/, label: "Vue global hook" },
      { pattern: /\bvue(\.runtime)?(\.esm-browser|\.global)?(\.prod|\.min)?\.js/i, label: "vue.js bundle" },
      { pattern: /window\.__NUXT__|\/_nuxt\//i, label: "Nuxt runtime (implies Vue)" },
    ],
  },
  {
    name: "Webflow",
    category: "Site Builder",
    html: [
      { pattern: /data-wf-page|data-wf-site/i, label: "data-wf-page / data-wf-site attribute" },
      { pattern: /website-files\.com/i, label: "assets from website-files.com" },
      {
        pattern: /<meta[^>]+content=["']Webflow["']/i,
        label: 'generator meta tag "Webflow"',
      },
    ],
  },
  {
    name: "Squarespace",
    category: "Site Builder",
    html: [
      { pattern: /static1?\.squarespace\.com|squarespace-cdn\.com/i, label: "Squarespace CDN assets" },
      { pattern: /Squarespace\.afterBodyLoad|squarespace-headers/i, label: "Squarespace runtime script" },
      {
        pattern: /<meta[^>]+content=["']Squarespace["']/i,
        label: 'generator meta tag "Squarespace"',
      },
    ],
    headers: [{ header: "x-servedby", pattern: /squarespace/i, label: "X-ServedBy names Squarespace" }],
  },
  {
    name: "Wix",
    category: "Site Builder",
    html: [
      { pattern: /static\.parastorage\.com|wixstatic\.com/i, label: "Wix CDN assets" },
      {
        pattern: /<meta[^>]+content=["']Wix\.com Website Builder["']/i,
        label: 'generator meta tag "Wix.com Website Builder"',
      },
      { pattern: /wix-(warmup-data|perf-measure|first-paint)/i, label: "Wix runtime script" },
    ],
    headers: [{ header: "x-wix-request-id", pattern: /.+/, label: "X-Wix-Request-Id header" }],
  },
  {
    name: "Google Analytics",
    category: "Analytics",
    html: [
      { pattern: /google-analytics\.com\/(analytics|ga)\.js/i, label: "analytics.js loader" },
      { pattern: /gtag\/js\?id=(G|UA)-/i, label: "gtag.js with GA measurement ID" },
      { pattern: /\bUA-\d{4,}-\d{1,4}\b/, label: "Universal Analytics property ID" },
      { pattern: /\bG-[A-Z0-9]{8,}\b/, label: "GA4 measurement ID" },
    ],
  },
  {
    name: "Google Tag Manager",
    category: "Analytics",
    html: [
      { pattern: /googletagmanager\.com\/gtm\.js/i, label: "gtm.js loader" },
      { pattern: /\bGTM-[A-Z0-9]{4,}\b/, label: "GTM container ID" },
      { pattern: /ns\.html\?id=GTM-/i, label: "GTM noscript iframe" },
    ],
  },
  {
    name: "Stripe",
    category: "Payments",
    html: [
      { pattern: /js\.stripe\.com/i, label: "Stripe.js loader" },
      { pattern: /checkout\.stripe\.com|buy\.stripe\.com/i, label: "Stripe Checkout link" },
      { pattern: /\bStripe\(["']pk_(live|test)_/, label: "Stripe publishable key" },
    ],
  },
  {
    name: "Cloudflare",
    category: "CDN / Infrastructure",
    html: [
      { pattern: /\/cdn-cgi\/(scripts|challenge-platform|l\/email-protection)/i, label: "/cdn-cgi/ endpoint" },
    ],
    headers: [
      { header: "server", pattern: /cloudflare/i, label: "Server: cloudflare" },
      { header: "cf-ray", pattern: /.+/, label: "CF-Ray header" },
    ],
  },
  {
    name: "Intercom",
    category: "Support",
    html: [
      { pattern: /widget\.intercom\.io|intercomcdn\.com/i, label: "Intercom widget script" },
      { pattern: /window\.intercomSettings|Intercom\(["']boot["']/i, label: "intercomSettings bootstrap" },
    ],
  },
  {
    name: "HubSpot",
    category: "Marketing",
    html: [
      { pattern: /js\.hs-scripts\.com|js\.hsforms\.net|hs-analytics\.net/i, label: "HubSpot tracking script" },
      { pattern: /_hsq\s*=|hbspt\.forms\.create/i, label: "HubSpot queue / form embed" },
    ],
  },
];

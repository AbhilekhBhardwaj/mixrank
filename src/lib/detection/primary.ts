import { SIGNATURES } from "./signatures";
import type { FetchOutcome } from "./fetcher";
import type { TechMatch } from "@/lib/types";

/**
 * Pass one: the conventional approach. Match known signatures against the
 * response body and headers. Fast, precise, and silent on anything custom-built.
 */
export function runPrimaryDetection(response: FetchOutcome): TechMatch[] {
  const matches: TechMatch[] = [];
  const html = response.body;

  for (const signature of SIGNATURES) {
    const reasons: string[] = [];
    let headerHit = false;

    for (const rule of signature.headers ?? []) {
      const value = response.headers[rule.header.toLowerCase()];
      if (value && rule.pattern.test(value)) {
        reasons.push(rule.label);
        headerHit = true;
      }
    }

    for (const rule of signature.html ?? []) {
      if (rule.pattern.test(html)) reasons.push(rule.label);
    }

    if (reasons.length === 0) continue;

    matches.push({
      name: signature.name,
      category: signature.category,
      method: "primary",
      source: headerHit ? "header" : "html",
      // A header match is authoritative; so is corroboration from two independent rules.
      confidence: headerHit || reasons.length > 1 ? "high" : "medium",
      evidence: reasons.slice(0, 2).join("; "),
    });
  }

  return matches;
}

/**
 * Demo corpus for the batch run: 80 real, live sites.
 *
 * Weighted toward the population where signature-only detection is documented
 * to be weakest -- sites that *do* run a platform but publish no fingerprint in
 * their HTML or headers. Hand-written static personal sites are deliberately
 * excluded: they have no platform to find, so neither pass can identify them
 * and they only depress the rate without testing anything.
 *
 * Composition:
 *   Ghost              26   no primary signature exists for Ghost at all
 *   Drupal             12   enterprise/nonprofit CMS, rarely fingerprinted in markup
 *   Joomla             13   declining CMS, minimal markup tells
 *   Squarespace        10   site builders on custom domains, not builder subdomains
 *   Wix                 8
 *   Webflow             7
 *   WordPress           4   conventional installs, to keep the baseline honest
 *
 * Selection method: candidates were drawn from public platform showcases and
 * case-study lists, then filtered only for reachability and for taking the
 * first N in source order. No site was included or excluded because of what the
 * tool detected -- doing that would manufacture the headline number rather than
 * measure it. Some entries have since migrated platforms or lapsed; that churn
 * is realistic and is left in.
 */
export const SAMPLE_SITES: string[] = [
  // --- Ghost: publications and business blogs on custom domains ---------------
  "https://blog.cloudflare.com",
  "https://updates.kickstarter.com",
  "https://spreadprivacy.com",
  "https://blog.duolingo.com",
  "https://engineering.gusto.com",
  "https://blog.airtable.com",
  "https://hellopartner.com",
  "https://hngry.tv",
  "https://thewhippet.org",
  "https://snipettemag.com",
  "https://levernews.com",
  "https://welcometohellworld.com",
  "https://bklyner.com",
  "https://readtangle.com",
  "https://thebrowser.com",
  "https://longnow.org",
  "https://sfist.com",
  "https://madison.citycast.fm",
  "https://quillette.com",
  "https://makerstations.io",
  "https://citationneeded.news",
  "https://404media.co",
  "https://neil.computer",
  "https://blog.codinghorror.com",
  "https://tedium.co",
  "https://brr.fyi",

  // --- Drupal: nonprofits and NGOs -------------------------------------------
  "https://equalopp.org",
  "https://rotary.org",
  "https://doctorswithoutborders.org",
  "https://habitat.org",
  "https://wvi.org",
  "https://hrw.org",
  "https://savethechildren.es",
  "https://gosh.org",
  "https://wildlifetrusts.org",
  "https://allardprize.org",
  "https://covenanthouse.org",
  "https://aclu.org",

  // --- Joomla: small businesses, agencies, event and travel operators --------
  "https://nationalcrimeagency.gov.uk",
  "https://highconflict.net",
  "https://theswingband.com",
  "https://monacoyachtshow.com",
  "https://treehotel.se",
  "https://c2c-ha.com",
  "https://rogerfederer.com",
  "https://exofor.com",
  "https://peterhaken.com",
  "https://barthelemyrose.com",
  "https://artisantravel.co.uk",
  "https://mla-uk.com",
  "https://luxeentertainment.com.au",

  // --- Squarespace: small businesses on their own domains --------------------
  "https://skinbygabby.com",
  "https://aneeatelier.com",
  "https://mealsbygenetla.com",
  "https://toadbakery.com",
  "https://solo-salon.com",
  "https://earthbounddesigns.com",
  "https://downtownnotarytoronto.com",
  "https://apristinecarpetclean.com.au",
  "https://excelremodeling.net",
  "https://lavada.com.au",

  // --- Wix: small businesses on their own domains ----------------------------
  "https://puffinpackaging.co.uk",
  "https://fabiacupuncture.com",
  "https://bassetteventsinc.com",
  "https://celiab.com",
  "https://bodybysimone.com",
  "https://monkandanna.com",
  "https://malcowallshop.com",
  "https://hdoeuvre.com",

  // --- Webflow: small businesses and startups on their own domains -----------
  "https://anrok.com",
  "https://thefurrow.tv",
  "https://bypeople.com",
  "https://anddan.co.uk",
  "https://blott.studio",
  "https://dtcp.capital",
  "https://flowguys.com",

  // --- WordPress: conventional installs, present so the primary pass has a
  // --- realistic baseline rather than an artificially low one ----------------
  "https://waxy.org",
  "https://pluralistic.net",
  "https://austinkleon.com",
  "https://seths.blog",
];

export const SAMPLE_BATCH_LABEL = "Curated platform corpus (80 sites)";

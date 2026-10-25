// Small built-in blocklist of ad and tracking hosts. Subdomains are blocked too.
const BLOCKED = new Set([
	// Google ads & analytics
	"doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
	"google-analytics.com", "googletagmanager.com", "googletagservices.com", "app-measurement.com",
	// ad exchanges & networks
	"amazon-adsystem.com", "adnxs.com", "adsrvr.org", "criteo.com", "criteo.net", "pubmatic.com",
	"rubiconproject.com", "openx.net", "casalemedia.com", "indexww.com", "3lift.com", "bidswitch.net",
	"sovrn.com", "lijit.com", "contextweb.com", "gumgum.com", "yieldmo.com", "sharethrough.com",
	"teads.tv", "adform.net", "smartadserver.com", "media.net", "33across.com", "onetag-sys.com",
	"adsafeprotected.com", "doubleverify.com", "moatads.com", "zedo.com", "adcolony.com",
	"advertising.com", "adtechus.com", "yieldmanager.com", "serving-sys.com", "flashtalking.com",
	// content recommendation / native ads
	"taboola.com", "outbrain.com", "mgid.com", "revcontent.com", "zergnet.com", "adskeeper.com",
	// pop-unders & aggressive networks
	"propellerads.com", "popads.net", "popcash.net", "adsterra.com", "exoclick.com", "juicyads.com",
	"trafficjunky.net", "hilltopads.net", "clickadu.com", "admaven.com",
	// trackers
	"scorecardresearch.com", "quantserve.com", "quantcount.com", "hotjar.com", "clarity.ms",
	"chartbeat.com", "chartbeat.net", "newrelic.com", "nr-data.net", "crazyegg.com", "mouseflow.com",
	"fullstory.com", "bluekai.com", "krxd.net", "demdex.net", "everesttech.net", "rlcdn.com",
]);

let blockedCount = 0;

export function isBlocked(hostname) {
	let host = hostname.toLowerCase();
	while (host.includes(".")) {
		if (BLOCKED.has(host)) return true;
		host = host.slice(host.indexOf(".") + 1);
	}
	return false;
}

export function countBlocked() {
	blockedCount++;
}

export function blockedSoFar() {
	return blockedCount;
}

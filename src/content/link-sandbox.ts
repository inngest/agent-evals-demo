/**
 * The suspicious-link ticket's sandbox beat, client-safe: the link the
 * customer forwarded, the script that fetches it, and the verdict derived
 * from what the script printed. lib/sandbox.ts runs it; the thread shows it.
 */

/** Our own domain: a link that lands anywhere else did not come from us. */
export const OUR_DOMAIN = "acme.com";

// The link from the customer's "payment failed" email, as the ticket quotes
// it. example.com is IANA-run and always up, so the booth fetch is stable.
export const suspiciousLinkUrl = "https://example.com/?ref=acme-billing-verify";

// What the sandbox reports about the link, plus the verdict. The script only
// fetches; finalHost and ourDomain are derived here, in audited app code.
export type LinkCheck = {
  url: string;
  status: number;
  finalUrl: string;
  finalHost: string;
  redirects: number;
  contentType: string;
  title: string;
  ourDomain: boolean;
};

// The link check. It never runs in the app process: an unknown URL could be
// phishing, malware, or a probe of internal hosts, so in cloud mode it is
// fetched from a throwaway sandbox with no secrets and no route into our
// network, then the sandbox is destroyed. Metadata only; nothing is rendered.
export const linkCheckScript = `#!/bin/sh
# Fetch an untrusted URL from a throwaway box. Metadata only.
set -eu

curl -sS -L --max-redirs 5 --max-time 10 --proto '=http,https' \\
  -A 'AcmeSupport-LinkCheck/1.0' \\
  -o /tmp/page.html -w '%{json}' "$1" > /tmp/meta.json

title=$(sed -n 's:.*<title>\\(.*\\)</title>.*:\\1:p' /tmp/page.html | head -n 1)

jq -c --arg title "$title" '{
  status: .http_code,
  finalUrl: .url_effective,
  redirects: .num_redirects,
  contentType: .content_type,
  title: $title
}' /tmp/meta.json
`;

// Local mode's stand-in: what the real sandbox prints for suspiciousLinkUrl.
export function simulatedLinkCheck(url: string): LinkCheck {
  return toLinkCheck(url, {
    status: 200,
    finalUrl: url,
    redirects: 0,
    contentType: "text/html; charset=utf-8",
    title: "Example Domain",
  });
}

export function parseLinkCheckStdout(
  stdout: string,
  url: string,
): LinkCheck | null {
  try {
    const parsed = JSON.parse(stdout) as Partial<LinkCheck>;

    if (typeof parsed.status === "number" && typeof parsed.finalUrl === "string") {
      return toLinkCheck(url, {
        status: parsed.status,
        finalUrl: parsed.finalUrl,
        redirects: Number(parsed.redirects ?? 0),
        contentType: String(parsed.contentType ?? ""),
        title: String(parsed.title ?? ""),
      });
    }

    return null;
  } catch {
    return null;
  }
}

/** The one-line verdict the thread and the reply are built on. */
export function linkVerdict(check: LinkCheck): string {
  return check.ourDomain ? `${OUR_DOMAIN} · ours` : "not our domain";
}

function toLinkCheck(
  url: string,
  fetched: Omit<LinkCheck, "url" | "finalHost" | "ourDomain">,
): LinkCheck {
  const finalHost = hostOf(fetched.finalUrl);

  return {
    url,
    ...fetched,
    finalHost,
    ourDomain: finalHost === OUR_DOMAIN || finalHost.endsWith(`.${OUR_DOMAIN}`),
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

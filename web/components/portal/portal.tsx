"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { ThemeTextToggle } from "@/components/theme";
import { Collapse } from "@/components/disclosure";
import { useEntrance } from "@/components/reveal";
import { SEV, type Severity } from "@/lib/severity";
import { gsap, useGSAP, MOTION_OK } from "@/lib/gsap";
import {
  appApi,
  type ApiPortalHomeData,
  type ApiPortalSiteData,
  type ApiPortalBranding,
} from "@/lib/app-api";
import { authClient } from "@/lib/auth-client";

const CARD_LINK =
  "ease-ui flex flex-col gap-3 rounded-2xl border border-line bg-surface p-[18px] text-ink no-underline shadow-card hover:-translate-y-0.5 hover:text-ink hover:shadow-pop";
const BTN_OUTLINE =
  "ease-ui grid h-12 place-items-center rounded-full border border-line-strong font-semibold text-ink no-underline hover:bg-subtle hover:text-ink";

interface PortalFrameProps {
  branding: ApiPortalBranding | null;
  user?: { name: string | null; email: string } | null;
  header: React.ReactNode;
  children: React.ReactNode;
}

function PortalFrame({ branding, user, header, children }: PortalFrameProps) {
  const router = useRouter();
  const agencyName = branding?.displayName || "Your Agency";
  const initials = agencyName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "AG";

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : "ME";

  const contactHref = `mailto:${branding?.contactEmail || "hello@brightline.studio"}`;

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
    } catch {
      // Continue to sign in
    }
    router.push("/sign-in");
  };

  return (
    <div className="portal flex min-h-screen flex-col bg-surface text-base leading-6 text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[560px] items-center justify-between gap-2.5 px-5 py-3">
          <div className="flex flex-1 items-center gap-2.5">{header}</div>
          {user && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="ease-ui rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:bg-subtle hover:text-ink"
                title={`Signed in as ${user.email}`}
              >
                Sign out
              </button>
              <span
                aria-label={`Signed in as ${user.name || user.email}`}
                className="grid size-9 place-items-center rounded-full border border-line bg-subtle text-[13px] font-semibold text-ink"
              >
                {userInitials}
              </span>
            </div>
          )}
        </div>
      </header>
      {children}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[560px] flex-wrap items-center justify-between gap-3 px-5 py-4 text-[13px] text-muted">
          <a href={contactHref} className="text-muted hover:text-ink">
            Contact your agency
          </a>
          <ThemeTextToggle />
          {!branding?.hideProductBrand && <span>Powered by Plainsight</span>}
        </div>
      </footer>
    </div>
  );
}

/** S-60 Portal home. */
export function PortalHome() {
  const scope = useEntrance<HTMLElement>();
  const [data, setData] = useState<ApiPortalHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    appApi
      .getPortalHome()
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.message || "Failed to load your websites.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const branding = data?.branding ?? null;
  const agencyName = branding?.displayName || "Brightline Studio";
  const user = data?.user ?? null;
  const firstName = user?.name ? user.name.split(" ")[0] : "there";

  const agencyInitials = agencyName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "BS";

  return (
    <PortalFrame
      branding={branding}
      user={user}
      header={
        <>
          {branding?.logoLightUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoLightUrl}
              alt=""
              className="h-8 max-w-[120px] object-contain"
            />
          ) : (
            <span
              className="grid size-8 place-items-center rounded-md text-[13px] font-bold text-surface"
              style={{ backgroundColor: branding?.primaryColor || "var(--brand, #0F3D3E)" }}
            >
              {agencyInitials}
            </span>
          )}
          <span className="font-semibold">{agencyName}</span>
        </>
      }
    >
      <main ref={scope} className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-5 py-6">
        {loading ? (
          <div className="flex flex-col gap-3 py-12 text-center text-muted">
            <span className="font-medium">Loading your websites…</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-line bg-subtle p-6 text-center">
            <h1 className="m-0 text-xl font-bold">Unable to load portal</h1>
            <p className="mt-2 text-muted">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                appApi.getPortalHome().then(setData).catch((e) => setError(e?.message)).finally(() => setLoading(false));
              }}
              className="mt-4 rounded-full border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-surface"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <h1 className="m-0 font-serif text-4xl leading-10 font-normal">
              Hello, <em>{firstName}</em>
            </h1>
            <p className="m-0 text-muted">
              Here&apos;s how your websites are doing. {agencyName} checks them regularly.
            </p>
            <h2 className="mt-2 mb-0 text-lg font-semibold">Your websites</h2>
            {data?.sites && data.sites.length > 0 ? (
              data.sites.map((s) => (
                <Link key={s.id} href={`/portal/sites/${s.id}`} className={CARD_LINK}>
                  <span className="flex justify-between gap-3">
                    <span>
                      <strong className="block text-[17px]">{s.name}</strong>
                      <span className="text-sm text-muted">{s.rootUrl}</span>
                    </span>
                    <span className="tnum text-[28px] leading-8 font-bold">{s.score ?? "—"}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold ${s.cls}`}>{s.status}</span>
                    <span className="text-muted">
                      {s.band} · {s.date}
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border border-line bg-subtle p-6 text-center text-muted">
                <p className="m-0 text-sm">No websites have been assigned to your portal yet.</p>
              </div>
            )}
          </>
        )}
      </main>
    </PortalFrame>
  );
}

/** S-61 Portal site view — plain language, no rule IDs or selectors. */
export function PortalSite({ siteId: propSiteId }: { siteId?: string }) {
  const params = useParams();
  const resolvedSiteId = (propSiteId || params?.site || "") as string;

  const [data, setData] = useState<ApiPortalSiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [whatOpen, setWhatOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const scope = useEntrance<HTMLElement>();
  const chart = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!resolvedSiteId) return;
    let active = true;
    appApi
      .getPortalSite(resolvedSiteId)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.message || "Website not found or you don't have access to it.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [resolvedSiteId]);

  useGSAP(
    () => {
      if (!data) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          "[data-bar]",
          { scaleY: 0, transformOrigin: "50% 100%" },
          { scaleY: 1, duration: 0.7, ease: "power3.out", stagger: 0.07, delay: 0.3 },
        );
        gsap.fromTo(
          "[data-bar-label]",
          { autoAlpha: 0, y: 6 },
          { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.07, delay: 0.6 },
        );
      });
      return () => mm.revert();
    },
    { scope: chart, dependencies: [data] },
  );

  const branding = data?.branding ?? null;
  const agencyName = branding?.displayName || data?.org?.name || "Your Agency";
  const contactHref = `mailto:${branding?.contactEmail || "hello@brightline.studio"}`;

  return (
    <PortalFrame
      branding={branding}
      header={
        <Link href="/portal" className="-ml-3 flex h-11 items-center gap-1 px-3 font-semibold no-underline text-ink">
          <Icon d={I.chevronLeft} />
          Your websites
        </Link>
      }
    >
      <main ref={scope} className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 py-6">
        {loading ? (
          <div className="py-12 text-center text-muted">
            <span className="font-medium">Loading website accessibility details…</span>
          </div>
        ) : error || !data ? (
          <div className="rounded-xl border border-line bg-subtle p-6 text-center">
            <h1 className="m-0 text-xl font-bold">Website not found</h1>
            <p className="mt-2 text-muted">{error || "This website is not available in your client portal."}</p>
            <Link
              href="/portal"
              className="mt-4 inline-block rounded-full border border-line-strong px-4 py-2 text-sm font-semibold no-underline text-ink hover:bg-surface"
            >
              Back to your websites
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h1 className="m-0 font-serif text-4xl leading-10 font-normal">{data.site.name}</h1>
              <span className="text-sm text-muted">
                {data.site.rootUrl} · checked {data.site.checkedDate}
              </span>
            </div>

            <section aria-labelledby="p-score" className="flex flex-col gap-2 rounded-xl bg-brand-soft p-5">
              <span className="flex items-center justify-between">
                <h2 id="p-score" className="m-0 text-sm font-semibold">
                  Automated check score
                </h2>
                <button
                  type="button"
                  onClick={() => setWhatOpen((o) => !o)}
                  aria-expanded={whatOpen}
                  aria-controls="p-what"
                  className="h-11 border-0 bg-transparent px-1 text-sm font-semibold text-brand underline cursor-pointer"
                >
                  What this means
                </button>
              </span>
              <span className="flex items-baseline gap-2.5">
                <span className="tnum text-[40px] leading-[44px] font-bold">{data.site.score}</span>
                <span className="rounded bg-mod-soft px-2 py-0.5 text-sm font-semibold text-mod">
                  {data.site.band}
                </span>
              </span>
              <span className="text-[15px] font-medium text-ok">{data.site.progressText}</span>
              <Collapse open={whatOpen}>
                <p id="p-what" className="mt-1 mb-0 text-sm leading-5">
                  The score counts problems automated tests can find. It is not a legal rating. {agencyName} also tests things a computer can&apos;t, like keyboard use.
                </p>
              </Collapse>
            </section>

            <section aria-labelledby="p-trend" className="flex flex-col gap-3">
              <h2 id="p-trend" className="m-0 text-lg font-semibold">
                Last 6 months
              </h2>
              <p className="m-0 text-sm leading-5 text-muted">
                Steady progress: {data.trend[0]?.score ?? 60} in {data.trend[0]?.month ?? "start"} to {data.site.score} in {data.trend[data.trend.length - 1]?.month ?? "latest"}.
              </p>
              <div ref={chart} aria-hidden="true">
                <div className="flex h-[140px] items-end gap-2.5 border-b border-line px-1">
                  {data.trend.map((pt) => (
                    <div key={pt.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span data-bar-label className="tnum text-[13px] font-semibold">
                        {pt.score}
                      </span>
                      <span
                        data-bar
                        className="block w-full rounded-t bg-brand"
                        style={{ height: `${Math.max(8, (pt.score - 40) * 1.6)}px` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2.5 px-1 pt-1">
                  {data.trend.map((pt) => (
                    <span key={pt.month} className="flex-1 text-center text-xs text-muted">
                      {pt.month}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTableOpen((o) => !o)}
                aria-expanded={tableOpen}
                className="ease-ui h-11 self-start rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle cursor-pointer"
              >
                {tableOpen ? "Hide table" : "View as table"}
              </button>
              {tableOpen && (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-subtle text-left">
                      <th scope="col" className="p-2">
                        Month
                      </th>
                      <th scope="col" className="p-2">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trend.map((pt) => (
                      <tr key={pt.month} className="border-b border-line">
                        <td className="p-2">{pt.month}</td>
                        <td className="tnum p-2">{pt.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section aria-labelledby="p-open" className="flex flex-col gap-2">
              <h2 id="p-open" className="m-0 text-lg font-semibold">
                Still open
              </h2>
              {data.openSummary.length > 0 ? (
                data.openSummary.map((item) => (
                  <div
                    key={item.severity}
                    className="flex items-start gap-2.5 border-b border-line py-2.5 text-[15px] leading-[22px]"
                  >
                    <span
                      className={`flex-none rounded px-2 text-[13px] leading-[22px] font-semibold ${
                        SEV[item.severity]?.bg || "bg-subtle"
                      } ${SEV[item.severity]?.text || "text-ink"}`}
                    >
                      {item.count} {SEV[item.severity]?.label || item.severity}
                    </span>
                    <span>{item.description}</span>
                  </div>
                ))
              ) : (
                <p className="m-0 text-sm text-muted">No open issues found! All automated checks are passing.</p>
              )}
            </section>

            <section aria-labelledby="p-fixed" className="flex flex-col gap-2">
              <h2 id="p-fixed" className="m-0 text-lg font-semibold">
                Recently fixed by your team
              </h2>
              {data.recentFixes.length > 0 ? (
                <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[15px] leading-[22px]">
                  {data.recentFixes.map((f) => (
                    <li key={f.id}>
                      {f.title} · {f.fixedAt}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm text-muted">No issues resolved in the latest scan period.</p>
              )}
            </section>

            {data.notes.length > 0 && (
              <section aria-labelledby="p-note" className="flex flex-col gap-2.5 rounded-xl border border-line p-4">
                <h2 id="p-note" className="m-0 text-base font-semibold">
                  Notes from {agencyName}
                </h2>
                {data.notes.map((note) => (
                  <div key={note.id} className="flex flex-col gap-1 border-b border-line pb-2.5 last:border-b-0 last:pb-0">
                    <span className="text-xs font-semibold text-muted">
                      {note.authorName} · {note.date}
                    </span>
                    <p className="m-0 text-[15px] leading-[22px]">{note.body}</p>
                  </div>
                ))}
              </section>
            )}

            <div className="flex flex-col gap-3">
              {data.reports.length > 0 && (
                <a
                  href={data.reports[0].downloadUrl}
                  download
                  className={BTN_OUTLINE}
                >
                  Download {data.reports[0].name} (PDF)
                </a>
              )}
              <a
                href={data.reports[0] ? data.reports[0].downloadUrl : "#"}
                className={BTN_OUTLINE}
              >
                Download evidence pack
              </a>
              <a
                href={contactHref}
                className="ease-ui grid h-12 place-items-center rounded-full bg-brand font-semibold text-surface no-underline hover:text-surface hover:opacity-90"
                style={{ backgroundColor: branding?.primaryColor || undefined }}
              >
                Contact {agencyName}
              </a>
            </div>
          </>
        )}
      </main>
    </PortalFrame>
  );
}

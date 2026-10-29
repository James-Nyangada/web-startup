import type { PgBoss } from 'pg-boss';
import type { Repositories } from '../db/repositories/index.js';

/** Publishes within this window are batched into one rebuild (staff spec 3.1). */
export const REBUILD_DEBOUNCE_MS = 2 * 60 * 1000;
/** Without a Cloudflare API token we cannot read the build result, so assume it finished after this. */
const UNVERIFIED_LIVE_AFTER_MS = 5 * 60 * 1000;

export const QUEUE_SITE_REBUILD = 'site.rebuild';
export const QUEUE_SITE_DEPLOY_STATUS = 'site.deploy-status';

type StaffRepo = Pick<
  Repositories['staff'],
  'createSiteDeploy' | 'updateSiteDeploy' | 'listSiteDeploys' | 'getLatestDeploy' | 'listDeploysByStatus'
>;

export type RebuildTrigger = 'publish' | 'manual' | 'schedule';

/**
 * Asks for a site rebuild. If a rebuild is already queued it will pick up this change too, so
 * nothing new is created (batching). Otherwise a queued deploy is recorded and the worker is
 * told to run it once the debounce window since the last build has passed.
 */
export async function requestSiteRebuild(
  staff: StaffRepo,
  trigger: RebuildTrigger,
  requestedBy: string | null,
  boss?: PgBoss,
  now = new Date(),
): Promise<{ queued: boolean; batched: boolean }> {
  const queued = await staff.listDeploysByStatus(['queued']);
  if (queued.length > 0) return { queued: true, batched: true };

  const deploy = await staff.createSiteDeploy(trigger, requestedBy);
  if (!deploy) return { queued: false, batched: false };

  const last = await staff.getLatestDeploy();
  const lastStarted = last && last.id !== deploy.id ? last.startedAt : null;
  const waitMs = lastStarted
    ? Math.max(0, REBUILD_DEBOUNCE_MS - (now.getTime() - lastStarted.getTime()))
    : 0;
  if (boss) {
    await boss.send(QUEUE_SITE_REBUILD, {}, { startAfter: Math.ceil(waitMs / 1000), retryLimit: 2 });
  }
  return { queued: true, batched: false };
}

export interface RebuildEnv {
  hookUrl?: string;
  apiToken?: string;
  accountId?: string;
  project?: string;
}

export function rebuildEnv(env: NodeJS.ProcessEnv = process.env): RebuildEnv {
  return {
    hookUrl: env.CF_PAGES_DEPLOY_HOOK_URL,
    apiToken: env.CF_API_TOKEN,
    accountId: env.CF_ACCOUNT_ID,
    project: env.CF_PAGES_PROJECT,
  };
}

/**
 * Runs the oldest queued deploy: calls the Cloudflare Pages deploy hook and marks it building.
 * Returns true when a deploy was started (the caller then starts polling its status).
 */
export async function runQueuedRebuild(
  staff: StaffRepo,
  env: RebuildEnv = rebuildEnv(),
  f: typeof fetch = fetch,
  now = new Date(),
): Promise<boolean> {
  const queued = await staff.listDeploysByStatus(['queued']);
  const deploy = queued[queued.length - 1];
  if (!deploy) return false;

  // Another build ran recently: leave this one queued; the sweep runs it after the window.
  const recent = (await staff.listSiteDeploys(5)).find(
    (d) => d.id !== deploy.id && d.startedAt && now.getTime() - d.startedAt.getTime() < REBUILD_DEBOUNCE_MS && d.status !== 'queued',
  );
  if (recent) return false;

  if (!env.hookUrl) {
    // Server-rendered site: pages revalidate on demand, so there is no static build to wait for.
    await staff.updateSiteDeploy(deploy.id, { status: 'live', startedAt: now, finishedAt: now });
    return false;
  }
  try {
    const res = await f(env.hookUrl, { method: 'POST', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Deploy hook responded ${res.status}`);
    const body = (await res.json().catch(() => null)) as { result?: { id?: string } } | null;
    await staff.updateSiteDeploy(deploy.id, {
      status: 'building',
      startedAt: now,
      cfDeploymentId: body?.result?.id ?? null,
    });
    return true;
  } catch (err) {
    await staff.updateSiteDeploy(deploy.id, {
      status: 'failed',
      finishedAt: now,
      error: err instanceof Error ? err.message : 'Deploy hook failed',
    });
    return false;
  }
}

interface CfDeployment {
  result?: { latest_stage?: { name?: string; status?: string } };
}

/** Polls Cloudflare for every building deploy. Returns how many are still building. */
export async function pollDeployStatus(
  staff: StaffRepo,
  env: RebuildEnv = rebuildEnv(),
  f: typeof fetch = fetch,
  now = new Date(),
): Promise<number> {
  const building = await staff.listDeploysByStatus(['building']);
  let stillBuilding = 0;
  for (const d of building) {
    const startedAt = d.startedAt ?? now;
    if (env.apiToken && env.accountId && env.project && d.cfDeploymentId) {
      try {
        const res = await f(
          `https://api.cloudflare.com/client/v4/accounts/${env.accountId}/pages/projects/${env.project}/deployments/${d.cfDeploymentId}`,
          { headers: { Authorization: `Bearer ${env.apiToken}` }, signal: AbortSignal.timeout(15_000) },
        );
        if (!res.ok) throw new Error(`Cloudflare responded ${res.status}`);
        const stage = ((await res.json()) as CfDeployment).result?.latest_stage;
        if (stage?.name === 'deploy' && stage.status === 'success') {
          await staff.updateSiteDeploy(d.id, { status: 'live', finishedAt: now });
          continue;
        }
        if (stage?.status === 'failure') {
          await staff.updateSiteDeploy(d.id, {
            status: 'failed',
            finishedAt: now,
            error: `Cloudflare build failed at the "${stage.name ?? 'unknown'}" stage.`,
          });
          console.error(`[site.deploy-status] deploy ${d.id} failed at stage ${stage.name}`);
          continue;
        }
      } catch (err) {
        console.error('[site.deploy-status] poll failed:', err instanceof Error ? err.message : err);
      }
    } else if (now.getTime() - startedAt.getTime() > UNVERIFIED_LIVE_AFTER_MS) {
      await staff.updateSiteDeploy(d.id, { status: 'live', finishedAt: now });
      continue;
    }
    // Give up on builds that never finish so the indicator does not stay "building" forever.
    if (now.getTime() - startedAt.getTime() > 30 * 60 * 1000) {
      await staff.updateSiteDeploy(d.id, {
        status: 'failed',
        finishedAt: now,
        error: 'The build did not finish within 30 minutes.',
      });
      continue;
    }
    stillBuilding++;
  }
  return stillBuilding;
}

/**
 * Announces a release to Discord once it is actually live on the Plugin Hub.
 *
 * The moment that matters to a player is not when a commit lands on master — it is when the hub's
 * manifest starts pointing at that commit, because that is when the update reaches their client. The
 * hub is somebody else's repository and cannot run anything on our behalf, so this watches the one
 * file that changes: plugins/<name>, which pins repository and commit.
 *
 * When the pinned commit moves, everything between the previously announced commit and the new one is
 * turned into bullets and posted. A `Release-note:` trailer in a commit message is used verbatim if
 * any commit in the range has one, so what gets announced is decided when the work is committed
 * rather than scraped afterwards; with no trailers at all it falls back to the commit subjects, so a
 * release can never go out silently.
 *
 * Env:
 *   PLUGIN            hub manifest name, e.g. "gearforge"
 *   DISCORD_WEBHOOK   webhook URL; never posted to when DRY_RUN is set
 *   DRY_RUN           "true" to print the announcement instead of sending it
 *   GITHUB_REPOSITORY owner/repo, for links
 *   GITHUB_OUTPUT     written with the commit that was announced, so the workflow can move the tag
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const HUB = 'https://raw.githubusercontent.com/runelite/plugin-hub/master/plugins';

/** The tag recording what has already been announced. */
const TAG = 'announced';

/** Discord's limit on an embed description. */
const DESCRIPTION_LIMIT = 4000;

const plugin = process.env.PLUGIN;
const dryRun = process.env.DRY_RUN === 'true';
const repository = process.env.GITHUB_REPOSITORY || '';

if (!plugin) {
  throw new Error('PLUGIN is required');
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/**
 * The commit the hub is serving to players right now.
 */
async function liveCommit() {
  const response = await fetch(`${HUB}/${plugin}`);
  if (!response.ok) {
    throw new Error(`Could not read the hub manifest: ${response.status} ${response.statusText}`);
  }

  const manifest = await response.text();
  const match = manifest.match(/^commit=([0-9a-f]{7,40})\s*$/m);
  if (!match) {
    throw new Error(`No commit pinned in the manifest:\n${manifest}`);
  }

  return match[1];
}

/**
 * What was announced last time, or null the first time this runs.
 */
function lastAnnounced() {
  try {
    // stderr ignored: not having the tag yet is the expected first run, not a failure worth printing.
    return execFileSync('git', ['rev-parse', '--verify', `refs/tags/${TAG}^{commit}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * The bullets for everything between two commits.
 */
function notesBetween(previous, live) {
  const log = git('log', '--no-merges', '--format=%B%x00', `${previous}..${live}`);
  const messages = log.split('\0').map((entry) => entry.trim()).filter(Boolean);

  const noted = [];
  const subjects = [];

  for (const message of messages) {
    const lines = message.split('\n');
    subjects.push(lines[0].trim());

    for (const line of lines) {
      const trailer = line.match(/^Release-note:\s*(.+?)\s*$/i);
      if (trailer) {
        noted.push(trailer[1]);
      }
    }
  }

  // Deliberate notes win; subjects are the safety net so nothing ships unmentioned.
  return (noted.length > 0 ? noted : subjects).map((line) => `• ${line}`);
}

function buildPayload(previous, live, bullets) {
  const short = live.slice(0, 7);
  const compare = repository && previous
    ? `https://github.com/${repository}/compare/${previous.slice(0, 12)}...${live.slice(0, 12)}`
    : null;

  let description = bullets.join('\n');
  if (description.length > DESCRIPTION_LIMIT) {
    description = `${description.slice(0, DESCRIPTION_LIMIT - 20)}\n• …and more`;
  }

  if (compare) {
    description += `\n\n[Every change in this release](${compare})`;
  }

  return {
    embeds: [
      {
        title: 'Update is live on the Plugin Hub',
        description,
        color: 0xE6A23C,
        footer: { text: `${plugin} · ${short}` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function post(payload) {
  const webhook = process.env.DISCORD_WEBHOOK;
  if (!webhook) {
    throw new Error('DISCORD_WEBHOOK is not set');
  }

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord rejected the post: ${response.status} ${await response.text()}`);
  }
}

function record(live) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `announced=${live}\n`);
  }
}

async function main() {
  // A rehearsal: read the announcement for a commit the hub has not been given yet, so the wording
  // can be checked before the release rather than after it is in the channel. Dry runs only — this
  // must never be a way to announce something that is not actually live.
  const preview = dryRun ? process.env.PREVIEW_COMMIT : null;
  const live = preview || await liveCommit();
  const previous = lastAnnounced();

  if (!previous) {
    // Nothing to compare against. Recording where the hub is now, so the next move is the first
    // announcement — rather than posting the whole history as though it had just shipped.
    process.stdout.write(`No ${TAG} tag yet; recording ${live} as the baseline and posting nothing.\n`);
    record(live);
    return;
  }

  if (previous === live) {
    process.stdout.write(`The hub is still on ${live.slice(0, 7)}; nothing to announce.\n`);
    return;
  }

  const bullets = notesBetween(previous, live);
  if (bullets.length === 0) {
    process.stdout.write(`${previous.slice(0, 7)}..${live.slice(0, 7)} has no commits to describe.\n`);
    record(live);
    return;
  }

  const payload = buildPayload(previous, live, bullets);

  if (dryRun) {
    process.stdout.write(`Dry run — this would have been posted:\n\n${payload.embeds[0].description}\n`);
    return;
  }

  await post(payload);
  process.stdout.write(`Announced ${previous.slice(0, 7)}..${live.slice(0, 7)}.\n`);
  record(live);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});

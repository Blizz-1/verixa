#!/usr/bin/env node
/**
 * Renders every roadmap entry to a markdown file so the output can be read
 * and reviewed before anything is pushed to GitHub.
 *
 *     node scripts/issues/build.mjs              # all 504
 *     node scripts/issues/build.mjs --from 071 --to 100
 *
 * Output goes to `build/issues/`, which is gitignored. Reviewing a sample by
 * eye before a bulk push is the cheapest possible way to catch a template
 * mistake that would otherwise be repeated 200 times and have to be edited
 * back out one issue at a time.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { byRoadmapId, loadRoadmap, REPO_ROOT } from "./roadmap.mjs";
import { labelsFor, renderIssueBody, renderIssueTitle } from "./render.mjs";

function parseArgs(argv) {
  const args = { from: null, to: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--from") args.from = argv[i + 1];
    if (argv[i] === "--to") args.to = argv[i + 1];
  }
  return args;
}

async function main() {
  const { from, to } = parseArgs(process.argv.slice(2));
  const { issues, phases } = await loadRoadmap();

  const selected = issues
    .filter((issue) => {
      const n = Number.parseInt(issue.id, 10);
      if (from && n < Number.parseInt(from, 10)) return false;
      if (to && n > Number.parseInt(to, 10)) return false;
      return true;
    })
    .sort(byRoadmapId);

  const outDir = join(REPO_ROOT, "build", "issues");
  await mkdir(outDir, { recursive: true });

  let totalWords = 0;
  const index = [];

  for (const issue of selected) {
    const phase = phases.get(issue.phase);
    const title = renderIssueTitle(issue);
    const body = renderIssueBody(issue, phase);
    const labels = labelsFor(issue);

    totalWords += body.split(/\s+/).length;
    index.push({ id: issue.id, title, labels, words: body.split(/\s+/).length });

    await writeFile(
      join(outDir, `${issue.id}.md`),
      `<!-- title: ${title} -->\n<!-- labels: ${labels.join(", ")} -->\n\n${body}`,
      "utf8",
    );
  }

  await writeFile(join(outDir, "index.json"), JSON.stringify(index, null, 2), "utf8");

  process.stdout.write(
    `Rendered ${String(selected.length)} issues to build/issues/\n` +
      `Average length: ${String(Math.round(totalWords / selected.length))} words\n` +
      `Labels in use: ${[...new Set(index.flatMap((i) => i.labels))].sort().join(", ")}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});

# Phase 25 — Community, Governance & v1.0 Launch (Issues 481–500)

Establishes Verixa's contributor-facing governance (CONTRIBUTING, Code of Conduct, RFC
process), extends Phase 01's templates and Phase 19's release automation into a full
community and launch workflow, and closes the roadmap with a v1.0 readiness review.

---

### Issue 481 — CONTRIBUTING.md
**Description:** Write `CONTRIBUTING.md` covering local setup (linking Phase 01's tooling), branch/commit conventions (Issue 010's Conventional Commits), how to run tests/lint/coverage gates, PR expectations, and where to ask questions.
**Objective:** Give a first-time contributor a single authoritative document instead of scattered tribal knowledge.
**Acceptance Criteria:** Every command referenced actually works on a clean checkout; covers setup through merged-PR lifecycle; links to `CODE_OF_CONDUCT.md`, issue templates, and the RFC process (Issue 487).
**Dependencies:** 001, 010, 011
**Estimated Complexity:** S
**Files Affected:** `CONTRIBUTING.md`
**Tests Required:** None (doc); a CI doc-link checker (Issue 019 pattern, if present) validates internal links.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Why CONTRIBUTING.md is the single highest-leverage document in an OSS repo — it's the first thing a would-be contributor reads, and its absence is consistently cited as the top reason people abandon a contribution attempt.
**Deliverables:** Published contributor guide.

---

### Issue 482 — CODE_OF_CONDUCT.md
**Description:** Adopt the Contributor Covenant (or an equivalent well-known code of conduct), customized with a real enforcement contact and escalation path, referenced from `CONTRIBUTING.md` and the README.
**Objective:** Set explicit behavioral expectations and a documented enforcement mechanism before the community grows beyond maintainers who know each other personally.
**Acceptance Criteria:** File present at repo root; enforcement contact resolves to a real, monitored channel; linked from README, CONTRIBUTING.md, and issue/PR templates.
**Dependencies:** None
**Estimated Complexity:** XS
**Files Affected:** `CODE_OF_CONDUCT.md`, `README.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Why "we'll just be nice" doesn't scale — a written, enforceable code of conduct is what lets maintainers act decisively on bad behavior without it becoming a personal judgment call each time.
**Deliverables:** Adopted code of conduct.

---

### Issue 483 — SECURITY.md and vulnerability disclosure policy
**Description:** Write `SECURITY.md` describing supported versions, how to privately report a vulnerability (GitHub private security advisories), expected response SLA, and coordinated-disclosure timeline.
**Objective:** Give security researchers a clear, safe reporting path instead of forcing public issue disclosure of unpatched vulnerabilities.
**Acceptance Criteria:** GitHub private vulnerability reporting enabled on the repo; SLA is realistic and maintainer-committed; references Phase 11's security posture and Phase 15's threat models as examples of what's already been considered.
**Dependencies:** 011 (Phase 11 security hardening)
**Estimated Complexity:** XS
**Files Affected:** `SECURITY.md`, GitHub repo security settings
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Responsible disclosure as a norm — why an unclear reporting path pushes researchers toward public zero-day disclosure, and how a documented SLA builds trust with the security research community.
**Deliverables:** Published vulnerability disclosure policy.

---

### Issue 484 — Extend issue templates: feature request and security report
**Description:** Add `.github/ISSUE_TEMPLATE/feature_request.yml` and a security-report template that redirects to Issue 483's private reporting flow instead of accepting public detail, extending the bug-report template from Issue 017.
**Objective:** Route each kind of incoming issue to the right structured format and, for security reports, the right (private) channel.
**Acceptance Criteria:** GitHub's "new issue" picker shows all three templates with correct labels auto-applied; security template contains no field that invites posting exploit details publicly.
**Dependencies:** 017, 483
**Estimated Complexity:** XS
**Files Affected:** `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/ISSUE_TEMPLATE/security_report.yml`, `.github/ISSUE_TEMPLATE/config.yml`
**Tests Required:** None.
**Documentation Required:** `CONTRIBUTING.md` issue-template section.
**Educational Notes:** Structured issue forms (YAML) vs. free-text Markdown templates — required fields reduce the "please provide more info" round-trip that dominates maintainer triage time.
**Deliverables:** Complete issue template set.

---

### Issue 485 — Extend PR template with a merge-readiness checklist
**Description:** Extend Issue 017's PR template with a checklist covering: linked issue, tests added/updated, docs updated, Conventional Commit-formatted title, coverage gate awareness (Issue 037 pattern), and a breaking-change callout.
**Objective:** Make the bar for "ready to review" explicit and self-checkable, reducing back-and-forth on process rather than substance.
**Acceptance Criteria:** Template renders as a checkable list in GitHub's PR UI; each item maps to an actual CI check or reviewer expectation, not aspirational fluff.
**Dependencies:** 017, 037
**Estimated Complexity:** XS
**Files Affected:** `.github/PULL_REQUEST_TEMPLATE.md`
**Tests Required:** None.
**Documentation Required:** `CONTRIBUTING.md` PR-checklist section.
**Educational Notes:** Checklists as a defense against process drift in high-throughput OSS projects — the same reasoning as surgical/aviation checklists, applied to code review.
**Deliverables:** Extended PR template.

---

### Issue 486 — GitHub Discussions setup
**Description:** Enable GitHub Discussions with categories (Q&A, Ideas, Show and Tell, Announcements), seed with a welcome post and pinned FAQ, and document when to use Discussions vs. Issues.
**Objective:** Separate open-ended conversation and support questions from the actionable-issue tracker, keeping Issues focused on concrete work.
**Acceptance Criteria:** Discussions enabled with the four categories; README and CONTRIBUTING.md link to it; a documented rule of thumb distinguishes "open an issue" from "start a discussion."
**Dependencies:** 481
**Estimated Complexity:** XS
**Files Affected:** `README.md`, `CONTRIBUTING.md`, `.github/DISCUSSION_TEMPLATE/*`
**Tests Required:** None.
**Documentation Required:** `CONTRIBUTING.md` Discussions section.
**Educational Notes:** Why mixing support questions into the issue tracker degrades its signal — Issues should stay a queue of actionable work, not a general chat log.
**Deliverables:** Configured Discussions space.

---

### Issue 487 — RFC process definition and template
**Description:** Document the RFC process referenced by `ARCHITECTURE.md` §6 ("RFC process for major features"): when an RFC is required (new bounded context, breaking API change, cross-cutting architectural shift), stages (draft → discussion → final comment period → accepted/rejected), and who decides.
**Objective:** Give significant design decisions a lightweight, written, discoverable process instead of ad hoc chat consensus that's lost to history.
**Acceptance Criteria:** Process doc defines trigger conditions, timeline for each stage, and decision authority; explicitly scoped to avoid requiring RFCs for routine feature work (matching Issue 481's "when in doubt, open a Discussion first" guidance).
**Dependencies:** 481
**Estimated Complexity:** S
**Files Affected:** `docs/rfcs/000-rfc-process.md`, `CONTRIBUTING.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** RFCs as institutional memory — modeled on Rust's and Python's PEP processes, where the written record of *why* a decision was made outlives the people who made it.
**Deliverables:** Published RFC process.

---

### Issue 488 — RFC template and tracked RFC index
**Description:** Add `docs/rfcs/0000-template.md` (motivation, design, alternatives considered, unresolved questions — mirroring `ARCHITECTURE.md` §7's "why this vs. alternatives" style) and a generated `docs/rfcs/README.md` index listing RFCs by number, status, and title.
**Objective:** Make RFCs consistently structured and discoverable rather than freeform documents scattered across PRs.
**Acceptance Criteria:** Template enforces the same "alternatives considered" discipline already used in `ARCHITECTURE.md`; index script (or manually maintained table, documented either way) stays accurate; first real RFC (retroactively, e.g. documenting the modular-monolith decision) added as a worked example.
**Dependencies:** 487
**Estimated Complexity:** S
**Files Affected:** `docs/rfcs/0000-template.md`, `docs/rfcs/README.md`, `docs/rfcs/0001-modular-monolith.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Why a worked example (a retroactive RFC for a decision already made) teaches the format faster than an empty template — contributors copy real examples, not blank scaffolding.
**Deliverables:** RFC template, index, and one seeded example.

---

### Issue 489 — Governance model documentation
**Description:** Write `docs/governance/GOVERNANCE.md` defining maintainer roles, how maintainer status is granted/revoked, decision-making for disagreements (lazy consensus with an escalation path to maintainer vote), and how this differs from the RFC process (Issue 487) for smaller day-to-day decisions.
**Objective:** Make project authority structure explicit before growth makes informal "whoever's been around longest decides" governance unworkable.
**Acceptance Criteria:** Document distinguishes maintainer-level decisions from RFC-level decisions; defines a concrete lazy-consensus timeout; linked from CONTRIBUTING.md and CODEOWNERS (Issue 017).
**Dependencies:** 017, 487
**Estimated Complexity:** S
**Files Affected:** `docs/governance/GOVERNANCE.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Lazy consensus (silence = approval after a defined window) as the pattern most healthy OSS projects converge on — it avoids both bottlenecking on a single maintainer and requiring full agreement for routine changes.
**Deliverables:** Published governance model.

---

### Issue 490 — Maintainer onboarding guide
**Description:** Write `docs/governance/BECOMING_A_MAINTAINER.md` covering the path from first contribution to maintainer status (per Issue 489's criteria), what access is granted (CODEOWNERS entry, npm publish rights for Phase 19's per-package releases, triage permissions), and a checklist for onboarding a new maintainer.
**Objective:** Make the contributor-to-maintainer pipeline visible and achievable rather than an opaque, invitation-only process.
**Acceptance Criteria:** Concrete, observable criteria (not vague "sustained high-quality contribution"); onboarding checklist maps each granted permission to the system it touches (GitHub, npm, Discussions moderation).
**Dependencies:** 489
**Estimated Complexity:** S
**Files Affected:** `docs/governance/BECOMING_A_MAINTAINER.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Why vague promotion criteria quietly gatekeep — projects that publish a concrete maintainer path see broader, more diverse maintainer pools than ones that rely on informal tap-on-the-shoulder invitations.
**Deliverables:** Published maintainer onboarding guide.

---

### Issue 491 — Community release announcements built on automated changelog
**Description:** Extend Phase 19's `@semantic-release/changelog`-generated `CHANGELOG.md` (Issue 369) with a lightweight release-announcement step: a GitHub Discussions "Announcements" post auto-drafted from each release's changelog section, flagged for a maintainer to add human context before publishing.
**Objective:** Turn machine-generated changelog entries into community-facing communication without maintainers manually retyping release notes.
**Acceptance Criteria:** A tagged release produces a draft Announcements post containing that release's changelog entries; publishing remains a deliberate human action (no fully automated public posting); works for both major/minor and patch releases with appropriately different framing.
**Dependencies:** 369, 486
**Estimated Complexity:** S
**Files Affected:** `.github/workflows/release-announcement.yml`, `scripts/release/draft-announcement.ts`
**Tests Required:** Unit test for changelog-section-to-draft formatting.
**Documentation Required:** `docs/guides/release-process.md` announcements section.
**Educational Notes:** Why automation should draft, not publish, community-facing communication — machine-perfect accuracy still benefits from a human deciding tone and emphasis before it reaches users.
**Deliverables:** Automated release-announcement drafting.

---

### Issue 492 — Versioning and support policy
**Description:** Write `docs/governance/VERSIONING.md` codifying SemVer commitments (what counts as breaking per context, given the composable-packages model from `ARCHITECTURE.md` §2.6), which versions receive security patches, and deprecation-notice lead time for breaking changes.
**Objective:** Set explicit expectations for downstream consumers of both the platform and the standalone `packages/*` npm packages before v1.0 makes those commitments load-bearing.
**Acceptance Criteria:** Defines breaking-change criteria per package (not just the monorepo as a whole); states a minimum deprecation notice period; consistent with Issue 370's per-package versioning mechanics.
**Dependencies:** 370
**Estimated Complexity:** S
**Files Affected:** `docs/governance/VERSIONING.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Why a monorepo of independently-versioned packages needs an explicit, written breaking-change definition — "breaking" is ambiguous when a change is breaking for one package's consumers but not another's.
**Deliverables:** Published versioning and support policy.

---

### Issue 493 — v1.0 readiness checklist
**Description:** Compile `docs/launch/V1_READINESS_CHECKLIST.md` enumerating every gate v1.0 must clear: all Phase 01–24 coverage gates green, security threat models published for every context, `SECURITY.md`/`CODE_OF_CONDUCT.md`/`CONTRIBUTING.md` present, versioning policy published, no open critical-severity issues, and public API surfaces (Issue 038 pattern) finalized across all packages.
**Objective:** Turn "are we ready to launch" from a subjective judgment call into an auditable, checkable list.
**Acceptance Criteria:** Each checklist item links to the issue(s) or CI gate that satisfies it; checklist is machine-checkable where possible (e.g., a script that verifies coverage gates are green across all `packages/*`) and manually verified otherwise.
**Dependencies:** 037, 038, 483, 489, 492
**Estimated Complexity:** M
**Files Affected:** `docs/launch/V1_READINESS_CHECKLIST.md`, `scripts/launch/check-readiness.ts`
**Tests Required:** Unit test for the automated portion of the readiness script.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Why launch checklists work best as verifiable claims, not a prose narrative — "coverage gate is green" is checkable; "the project feels ready" is not.
**Deliverables:** Published, partially-automated readiness checklist.

---

### Issue 494 — Public roadmap
**Description:** Publish `docs/ROADMAP.md` (or a GitHub Projects board, documented either way) summarizing completed phases (01–24) at a high level and post-v1.0 direction (multi-tenancy, event bus, GraphQL gateway maturity — per `ARCHITECTURE.md` §8's open questions), without committing to hard dates.
**Objective:** Give the community visibility into project direction and a legitimate way to propose priorities, without over-promising a schedule.
**Acceptance Criteria:** Roadmap distinguishes "shipped," "in progress," and "under consideration"; explicitly links unresolved items to `ARCHITECTURE.md` §8's open questions; states it is directional, not a delivery commitment.
**Dependencies:** None
**Estimated Complexity:** S
**Files Affected:** `docs/ROADMAP.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Roadmaps as an expectation-management tool — the most common OSS roadmap failure mode is implying dates the maintainers never actually committed to.
**Deliverables:** Published public roadmap.

---

### Issue 495 — Contributor recognition automation
**Description:** Add an all-contributors-style bot/workflow that updates a contributors table in the README on merged PRs, recognizing code, docs, review, and design contributions distinctly (not just commit count).
**Objective:** Make non-code contributions (docs, triage, design, review) visibly valued, which broadens who feels ownership of the project.
**Acceptance Criteria:** Merging a labeled PR updates the README contributors table automatically; contribution types beyond "code" are representable; process for requesting recognition documented in CONTRIBUTING.md.
**Dependencies:** 481
**Estimated Complexity:** S
**Files Affected:** `.github/workflows/contributors.yml`, `.all-contributorsrc`, `README.md`
**Tests Required:** N/A (workflow verified via a dry run on a throwaway PR).
**Documentation Required:** `CONTRIBUTING.md` recognition section.
**Educational Notes:** Why commit-count-based recognition undervalues the OSS work that actually keeps projects alive — triage, docs, and review are consistently the least-rewarded and most burnout-prone contributions.
**Deliverables:** Automated contributor recognition.

---

### Issue 496 — Docs site and landing page launch polish
**Description:** Finalize the public-facing docs site (built on Phase 01/17's docs structure) with a launch-ready landing page: value proposition, quickstart, architecture summary, and links to CONTRIBUTING/governance/roadmap, replacing any placeholder content accumulated across prior phases.
**Objective:** Ensure the first thing a v1.0 visitor sees is coherent and complete, not a patchwork of per-phase doc stubs.
**Acceptance Criteria:** Every nav link resolves; quickstart commands verified against a clean checkout; no TODO/placeholder text remains in top-level docs pages.
**Dependencies:** 018 (README v1), 494
**Estimated Complexity:** M
**Files Affected:** `docs/index.md`, `docs/guides/quickstart.md`, docs-site config
**Tests Required:** Link-checker CI job over `docs/`.
**Documentation Required:** This issue's deliverable is the doc site itself.
**Educational Notes:** First-impression design for OSS docs — most visitors decide whether to invest further within the first page, making the landing/quickstart pair disproportionately high-leverage relative to deep reference docs.
**Deliverables:** Launch-ready documentation site.

---

### Issue 497 — Launch announcement materials
**Description:** Write the v1.0 launch blog post (or `docs/launch/ANNOUNCEMENT.md`) covering what Verixa is, why it exists (per `ARCHITECTURE.md` §1's vision), what's included at v1.0, and how to get involved, plus short-form variants for social/community-forum posting.
**Objective:** Prepare the actual communication that introduces v1.0 to the wider community, distinct from the mechanical release notes automated in Issue 491.
**Acceptance Criteria:** Long-form post covers vision/scope/getting-involved; short-form variants fit common platform constraints; reviewed for accuracy against the actual v1.0 feature set (no aspirational claims about unshipped work).
**Dependencies:** 494, 496
**Estimated Complexity:** S
**Files Affected:** `docs/launch/ANNOUNCEMENT.md`, `docs/launch/social-copy.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the announcement itself.
**Educational Notes:** Why a launch announcement is written for people who've never heard of the project, unlike release notes (Issue 491) written for existing users — same underlying facts, different audience and framing.
**Deliverables:** Published launch announcement and social copy.

---

### Issue 498 — Community office hours and support triage cadence
**Description:** Document a recurring, lightweight community support cadence: a labeling scheme for triage priority in Issues/Discussions, a documented (not necessarily live) response-time expectation, and an optional recurring async or live office-hours slot for contributor questions.
**Objective:** Set sustainable, explicit expectations for how quickly and by what mechanism the community gets responses, protecting maintainers from unbounded support burden.
**Acceptance Criteria:** Triage labels defined and applied consistently; documented response-time expectation is realistic given current maintainer bandwidth (explicitly not "24/7 support"); cadence documented in CONTRIBUTING.md.
**Dependencies:** 486, 489
**Estimated Complexity:** S
**Files Affected:** `CONTRIBUTING.md`, `.github/labels.yml`
**Tests Required:** None.
**Documentation Required:** `CONTRIBUTING.md` support section.
**Educational Notes:** Why unbounded, undocumented support expectations are a leading cause of maintainer burnout in successful OSS projects — explicit boundaries protect the project's long-term sustainability more than they disappoint users.
**Deliverables:** Documented community support cadence.

---

### Issue 499 — Post-launch triage and patch process
**Description:** Document the process for handling post-v1.0 bug reports and security findings under real users: severity classification, patch-release cadence (tied to Issue 368's semantic-release automation), and how hotfixes bypass or accelerate normal review without skipping required checks.
**Objective:** Have an agreed process in place *before* the first post-launch incident, not improvised during one.
**Acceptance Criteria:** Severity levels map to target response times; hotfix path is defined as "fewer approvals, same CI gates," never "skip CI"; process references Issue 483's security SLA for security-classified reports specifically.
**Dependencies:** 368, 483, 493
**Estimated Complexity:** S
**Files Affected:** `docs/governance/POST_LAUNCH_TRIAGE.md`
**Tests Required:** None.
**Documentation Required:** This issue's deliverable is the doc itself.
**Educational Notes:** Why incident processes must be written down beforehand — under real time pressure, teams default to whatever's already documented, not whatever would be ideal to improvise.
**Deliverables:** Published post-launch triage process.

---

### Issue 500 — v1.0 launch readiness review (capstone)
**Description:** Execute Issue 493's readiness checklist end-to-end against the actual state of the repository: run the automated readiness script, manually verify every non-automatable item, and produce a signed-off `docs/launch/V1_LAUNCH_REVIEW.md` recording the review date, findings, any accepted gaps with rationale, and the go/no-go decision — then, on go, cut the v1.0 tag via Phase 19's release pipeline and publish the Issue 497 announcement.
**Objective:** Provide a single, deliberate checkpoint where the entire roadmap — architecture (Phase 01), every domain context (Phases 02–10), security hardening (Phase 11), API surfaces (Phases 12–13), operational concerns (Phases 14–19), and community/governance (this phase) — is verified together before Verixa is presented to the world as v1.0, closing the roadmap this issue set began.
**Acceptance Criteria:** Every item in Issue 493's checklist is explicitly checked off or has a documented, maintainer-approved exception; readiness script run recorded in the review doc; a real `v1.0.0` tag is cut through the existing semantic-release pipeline (Issue 368) with no manual version editing; announcement (Issue 497) published only after tag succeeds; review doc is the durable record of "why we believed v1.0 was ready."
**Dependencies:** 493, 496, 497, 499
**Estimated Complexity:** L
**Files Affected:** `docs/launch/V1_LAUNCH_REVIEW.md`, release tag/CI run artifacts
**Tests Required:** Full CI suite green on the release commit (all coverage gates from every phase); readiness script exits clean.
**Documentation Required:** This issue's deliverable is the review record itself.
**Educational Notes:** Why a capstone review is not a rubber stamp — it's the one point in the project's life where architecture, security, and community readiness are evaluated as a single system instead of 24 independently-approved phases, catching integration gaps that no single phase's review could see.
**Deliverables:** Signed-off v1.0 readiness review, cut `v1.0.0` release, published launch announcement.

---

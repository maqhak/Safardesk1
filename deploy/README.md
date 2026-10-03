# SafarDesk Buyer Rollout System

One codebase, every buyer. A complaint or feature request is fixed **once** in this
repo, then rolled out to all buyers in minutes — with **zero risk to buyer data**.

## How it works

- **One build for all buyers.** `npm run build` compiles the production bundle
  (`BrowserRouter`, no demo mode). The same `dist/` is deployed to every buyer's
  Firebase Hosting.
- **Each buyer's data stays in their own Firebase project.** The buyer owner
  connects it once in **Settings > Firebase Backend** ("Easy Firebase Connect") —
  paste the web config JSON, no rebuild needed.
- **Deploys only touch Hosting (+ optionally Firestore rules).**
  Firestore **data** (documents/collections) is never read, written or deleted by
  these scripts. Data loss is impossible by design.
- **New features** ship inside the new build. **New collections** are enabled by
  deploying updated `firestore.rules` (`--rules`). Old documents keep working
  because the app reads new fields with fallbacks (`x.shirkas || []`, etc.).

## One-time setup (per operator machine)

```bash
npm install -g firebase-tools
firebase login
```

For each buyer: the buyer adds your Google account to **their** Firebase project
(Project Settings > Users and permissions, or IAM roles
`roles/firebasehosting.admin` + `roles/firebaserules.admin`). You never need
their Gmail password, and access can be revoked anytime.

## Adding a new buyer

1. Add an entry to `buyers.registry.json` (`id`, `companyName`, `firebaseProjectId`).
2. Deploy: `./deploy/deploy-buyer.sh <buyer-id> --version v1.0.0 --rules --yes`
3. The buyer owner opens the app and connects Firebase in Settings > Firebase Backend.

## When a buyer complains (the standard flow)

```bash
# 1. Fix the bug in the repo, commit, push to main.

# 2. STAGED: deploy to the complaining buyer first and verify the fix live.
./deploy/deploy-buyer.sh buyer-001 --version v1.2.1 --rules

# 3. ROLLOUT: push the same version to EVERY buyer.
./deploy/deploy-all.sh --version v1.2.1 --rules
```

`deploy-all.sh` builds once, tags the release in git (`v1.2.1`), deploys
buyer-by-buyer, keeps going if one fails, and prints a summary with the failed
list (re-run those individually). Every result is appended to `releases.log`.

## Dry run (see what would happen, deploy nothing)

```bash
./deploy/deploy-all.sh --version v9.9.9 --dry-run
./deploy/deploy-buyer.sh buyer-001 --version v9.9.9 --dry-run
```

## Files

| File | Purpose |
|---|---|
| `buyers.registry.json` | Buyer list (template — real data stays local, no secrets here) |
| `deploy-buyer.sh` | Deploy to ONE buyer (staged rollout / complaint verification) |
| `deploy-all.sh` | Roll out to ALL buyers |
| `releases.log` | Append-only record: timestamp, version, buyer, project, targets, status |

## Safety rules (enforced in the scripts)

- Only `--only hosting` and `--only firestore:rules` targets are ever deployed.
- Any argument resembling `delete` / `destroy` / `purge` / `firestore:delete`
  aborts the script immediately.
- Nothing in `deploy/` can read or modify Firestore data — there is simply no
  code path for it.

## Developer checklist (when adding a feature)

- [ ] New document fields are optional in types (`field?: type`).
- [ ] All reads use fallbacks (`doc.field || default`, `(doc.arr || [])`).
- [ ] New collections have rules in `firestore.rules`.
- [ ] Old saved data still opens/renders (test with a pre-change dataset).

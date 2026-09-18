# Security Policy

Eutrya v0.4.0 is a **public alpha / developer release**. It has automated regression coverage, but it has not undergone an independent security audit.

## Supported version

Security fixes are currently made against the latest `main` / `v0.4.x` public-alpha line.

## Reporting a security issue

Please **do not open a public GitHub issue with exploit details, secrets, credentials, or sensitive reproduction data**.

Use GitHub's private vulnerability reporting / Security Advisory flow for this repository when available. If that is not available, contact the repository owner privately before publishing technical details.

Include:

- affected version / commit,
- security boundary involved,
- minimal reproduction,
- expected vs. observed behavior,
- impact,
- whether real credentials, accounts, or third-party systems were touched.

Do not include real API keys or other secrets.

## Important trust boundaries

Eutrya can interact with local files, processes, remote model providers, messaging platforms, and explicitly configured external tools. Approval gates and Jev evaluation are useful controls, but they are **not an operating-system sandbox and not a security oracle**.

Use dedicated test accounts, scoped credentials, disposable workspaces/containers where appropriate, and only perform security testing where you are authorized to do so.

For the full threat/trust-boundary documentation, see [docs/SECURITY.md](docs/SECURITY.md).

# Contributing to Eutrya

Thanks for contributing.

Eutrya is currently a **public alpha**, so changes should favor explicit behavior, reproducible evidence, and conservative execution semantics over hidden automation.

## Development setup

```bash
git clone https://github.com/hellozenstrategist-lab/eutrya.git
cd eutrya
npm ci
npm test
npm run check
```

Node.js **22+** is required.

## Pull requests

`main` is protected. Changes should go through a pull request.

Before opening a PR:

```bash
npm ci
npm run check
npm test
```

The repository CI must pass before merge.

Keep PRs focused. Explain:

- what changed,
- why,
- relevant trust/security implications,
- what was tested,
- any behavior that remains unverified.

## Security-sensitive changes

Do not weaken approval gates, scope controls, state-bound tickets, path validation, credential handling, or hunt authorization semantics without clearly documenting the change and adding regression coverage.

Do not add real credentials, tokens, private keys, or production secrets to fixtures or examples.

Security vulnerabilities should be reported privately according to [SECURITY.md](SECURITY.md), not through a public issue.

## Hunt / cybersecurity contributions

Eutrya's security-hunt features are intended for authorized security research. Contributions should preserve program scope, non-destructive defaults, evidence quality, and explicit operator control.

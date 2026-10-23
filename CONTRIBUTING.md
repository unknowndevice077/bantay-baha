# Contributing to Bantay Baha

Thanks for helping. This is a small project with a simple goal: a flood warning a barangay can afford and trust. Anything that makes it cheaper, clearer or safer is welcome, including fixing a typo or translating an advisory.

By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md).

## Run it

You need Node 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). The simulator is `/`, the story game is `/play.html` and the dashboard is `/dashboard.html`. [The user guide](docs/user-guide.md) walks through all three.

## Check your change

One command runs everything CI runs:

```bash
npm run check
```

That is, in order:

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint over `src` and `tests` |
| `npm run format:check` | Prettier. `npm run format` fixes it for you |
| `npm test` | Vitest unit tests in `tests/` |
| `npm run build` | TypeScript in strict mode, then the production build |

Then run it in the browser and look at the part you changed. The tests cover the plain logic (alert rules, sensor fusion, the forecast, advisory text), not what the 3D scene looks like, so the browser check matters. [Testing](docs/testing.md) says what has and hasn't been checked.

## Where things are

| Folder | What's in it |
| --- | --- |
| `src/sensor`, `src/net` | The sensor model, alert rules and the message formats |
| `src/forecast`, `src/fusion` | The Bantay Baha+ add-ons |
| `src/alerts` | Advisory text in four languages, the siren and the PA voice |
| `src/scene`, `src/water`, `src/debris` | The 3D barangay |
| `src/game` | The story game |
| `src/dashboard` | The operations dashboard |
| `tools/forecast` | Python that trains the forecast model |
| `tools/voices` | Python that records the game's voices |
| `docs` | Everything written down. [Architecture](docs/architecture.md) is the best start |

## Making a change

1. Open an issue first for anything bigger than a small fix, so we can agree on it before you build it.
2. Branch from `main`.
3. Keep the change small and about one thing.
4. Add a test if you touched alert rules, fusion, the forecast or advisory text. Those are the parts that warn people, so they're the parts that must not break quietly.
5. Update the docs, and add a line under *Unreleased* in [CHANGELOG.md](CHANGELOG.md), if someone using the project would notice.
6. Open a pull request. The template has a short checklist.

## Style

- TypeScript, strict mode, no `any` where a type is easy to write.
- Prettier decides the formatting. Don't argue with it.
- Comments say why, not what. A short one on the tricky part is better than a paragraph on every function.
- Keep it cheap. New features shouldn't need a subscription, a cloud account or a part that costs more than a few hundred pesos. If one does, say so in the issue.
- Don't claim more than we've tested. If something hasn't run on a real creek, the docs should say so.

## Translations

The Tagalog, Cebuano and Waray advisories are in `src/alerts/templates.ts`. They were written without a native review, so corrections from speakers of those languages are some of the most useful contributions. Keep the `{level}`, `{rate}` and `{trend}` placeholders as they are.

## Releases

Versions follow [Semantic Versioning](https://semver.org). Each release gets a dated section in the [changelog](CHANGELOG.md) and a git tag like `v1.0.0`.

## Security

Please don't put a vulnerability in a public issue. Use GitHub's private security advisory on this repository. Never commit keys, tokens or broker passwords. The MQTT and WebSocket settings in the UI are only ever kept in the browser.

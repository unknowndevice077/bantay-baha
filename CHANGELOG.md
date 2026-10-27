# Changelog

All notable changes to Bantay Baha. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

## [1.1.0] - 2026-10-27

### Added

- Sensor node firmware in `firmware/`: an Arduino sketch for the ESP32 with a median-of-pings reading, the alert level worked out on the node, a beacon on its own task, JSON over MQTT in the simulator's format, and deep sleep. Its alert logic runs on a PC against 408 cases generated from the simulator's rules.
- Offline fallback: if the network is down the node texts the captain through a GSM module. The simulator has a *Simulate network down* switch and shows the texts.
- Replay a night: record a storm as JSON, save it, load it, or play a built-in sample at 1–10x.
- Unit tests for replay, the offline SMS and the firmware test vectors, and a C++ logic test in CI.

## [1.0.0] - 2026-10-23

First complete release, for the hackathon submission.

### Added

- Unit tests (Vitest) for the alert rules, rise rate, sensor fusion and fault injection, the forecast features and model loader, advisory templates in all four languages, and the maths helpers.
- ESLint, Prettier and an `.editorconfig`. `npm run check` runs lint, formatting, tests and the build in one go.
- GitHub Actions CI: lint, formatting, tests and build on Node 20 and 22, plus a Docker image build.
- `CONTRIBUTING.md`, a code of conduct, issue forms and a pull request template.
- [Specification](docs/specification.md): the requirements the system is built to, and how each one is checked.
- `tools/demo`: records the silent 1-minute demo video from the running site, so it can be remade whenever the app changes.

### Changed

- All source files formatted with Prettier. No behaviour change.

## [0.4.0] - 2026-10-14

### Added

- Concrete houses have front steps that match the door height, and people walk up them.
- Gauge camera on its own post, shown in the simulator and in the docs.
- The sensor enclosure shows its power chain: charger, 5 V boost converter, switch and wiring, with cards for each.
- Hand-holding in the story game. Lola Cora takes your hand and walks beside you, and her hand slips if you run.
- Households pack go-bags after the first advisory. Everyone stops at the registration table at the hall.
- Aling Nena at the hall stairs, who meets Toto when he arrives.
- Residents wave, carry bags and react when you talk to them, instead of only repeating a line.

### Changed

- The project is costed for a barangay: the node is about ₱2,000 to ₱8,000 with no subscriptions, and the gateway is a spare phone or laptop.
- The Close button on the sensor enclosure closes it.
- Roads and lanes count as ground for walking, so characters stand on them and not under them.

### Fixed

- Characters' feet going through the floor.
- Prompts missing for things at your feet or overhead.
- The north-bank evacuation lane running through houses.

## [0.3.0] - 2026-10-13

### Added

- The story game, *One night by the creek*, with voiced characters, objectives, an after-action report and a pause menu with sound settings.
- The operations dashboard, which follows the simulator or the game live, or a real device.
- Bantay Baha+ forecast: gradient-boosted trees, 30 and 60 minutes ahead, running in the browser.
- Bantay Baha+ sensor fusion: a gauge camera as a second sensor, with fault detection and a *Simulate sensor failure* control.
- Project documentation in `docs/`.
- Sound effects and mute options. The game fast-forwards between alerts.
- Crouch and descend controls, and a graphics quality setting.

### Fixed

- A loading freeze, simulator lag, and several playtest bugs.

## [0.2.0] - 2026-10-12

### Added

- Audio, more urgent resident behaviour during storms, and a graphics pass.

## [0.1.0] - 2026-10-12

### Added

- The 3D simulator: a barangay beside a creek, a solar ultrasonic sensor pole, a flood driven by one sensor reading, four alert levels, advisories in four languages, a siren and residents who evacuate.

[Unreleased]: https://github.com/unknowndevice077/bantay-baha/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/unknowndevice077/bantay-baha/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/unknowndevice077/bantay-baha/releases/tag/v1.0.0

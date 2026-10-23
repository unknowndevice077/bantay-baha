// state.ts reads window.innerWidth at import time; tests run in plain node.
(globalThis as { window?: unknown }).window ??= { innerWidth: 1280 };

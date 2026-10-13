// Lists every line the story game voices, straight from src/game/script.ts (and the
// residents' lines from src/alerts/templates.ts), as tools/voices/lines.json for render.py.
//
//   node tools/voices/export_lines.mjs
//
// Lines that contain live numbers are expanded over the values the game can produce.
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = buildSync({
  stdin: {
    contents: `export { LINES, VOICES } from './src/game/script.ts'; export { residentLine } from './src/alerts/templates.ts';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { LINES, VOICES, residentLine } = mod;

const out = new Map();
const add = (speaker, text, emotion = 'calm') => {
  if (!VOICES[speaker] && !speaker.startsWith('resident-')) return; // the captain and the narrator are not voiced
  out.set(`${speaker}|${text}`, { speaker, text, emotion });
};
const addLines = (lines) => lines.forEach(([speaker, text, emotion]) => add(speaker, text, emotion));

for (const value of Object.values(LINES)) {
  if (Array.isArray(value)) addLines(value);
}
// Lines built from live values: voice only what doesn't depend on them, or every value the game can produce.
addLines(LINES.forecastSeen('{forecast}').filter(([, text]) => !text.includes('{forecast}')));
for (let minutes = 5; minutes <= 60; minutes += 5) addLines(LINES.forecastWarns(minutes));

// What residents say when you talk to them (English recordings; other languages use browser speech).
for (const status of ['NORMAL', 'ADVISORY', 'WARNING', 'EVACUATE']) {
  for (const sheltered of [false, true]) {
    const text = residentLine('en', status, sheltered);
    const emotion = sheltered ? 'relieved' : status === 'EVACUATE' ? 'scared' : status === 'WARNING' ? 'concerned' : 'calm';
    for (const v of ['resident-male', 'resident-female', 'resident-child']) add(v, text, emotion);
  }
}

const lines = [...out.values()];
writeFileSync(fileURLToPath(new URL('lines.json', import.meta.url)), JSON.stringify(lines, null, 1));
console.log(`${lines.length} voiced lines -> tools/voices/lines.json`);

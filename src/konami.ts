/** ↑ ↑ ↓ ↓ ← → ← → B A */
const SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

export function listenKonami(onUnlock: () => void): void {
  let i = 0;
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    i = key === SEQUENCE[i] ? i + 1 : key === SEQUENCE[0] ? 1 : 0;
    if (i === SEQUENCE.length) {
      i = 0;
      onUnlock();
    }
  });
}

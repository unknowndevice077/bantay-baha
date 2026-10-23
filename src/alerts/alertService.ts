/**
 * Produces the advisory text. Templates are the default; optionally a local
 * Ollama model writes it, falling back to templates if unreachable.
 * Regenerates on status / language / Lola-mode changes.
 */
import { type Lang, type Status, bus, state } from '../state';
import { LANG_NAMES, renderTemplate } from './templates';

export const ollamaConfig = { enabled: false, url: 'http://localhost:11434', model: 'llama3.2' };

export type AlertSource = 'template' | 'ollama' | 'ollama-pending' | 'template-fallback';

export interface AlertMessage {
  text: string;
  status: Status;
  lang: Lang;
  lola: boolean;
  source: AlertSource;
}

const TIMEOUT_MS = 8000;

export class AlertService {
  private key = '';
  private llmText: string | null = null;
  private llm: 'idle' | 'pending' | 'failed' = 'idle';

  constructor(
    private readonly onMessage: (m: AlertMessage) => void,
    /** Called when a new Lola-mode scolding is delivered (siren + shake). */
    private readonly onLola: () => void,
  ) {
    bus.on('reading', () => this.refresh());
    bus.on('status', () => this.refresh());
    bus.on('toggle', ({ key }) => {
      if (key === 'lola') this.refresh();
    });
  }

  /** Call after changing state.lang or the Ollama settings. */
  refresh(): void {
    const r = state.reading;
    if (!r) return;
    const lola = state.toggles.lola;
    const key = `${r.status}|${state.lang}|${lola}|${ollamaConfig.enabled}|${ollamaConfig.model}`;
    if (key !== this.key) {
      this.key = key;
      this.llmText = null;
      this.llm = 'idle';
      if (lola) this.onLola();
      if (ollamaConfig.enabled) void this.ask(key, r.status, r.level * 100, r.rate, state.lang, lola);
    }
    const source: AlertSource = this.llmText
      ? 'ollama'
      : this.llm === 'pending'
        ? 'ollama-pending'
        : this.llm === 'failed'
          ? 'template-fallback'
          : 'template';
    this.onMessage({
      text: this.llmText ?? renderTemplate(state.lang, r.status, lola, { levelCm: r.level * 100, rateCm: r.rate }),
      status: r.status,
      lang: state.lang,
      lola,
      source,
    });
  }

  private async ask(key: string, status: Status, levelCm: number, rate: number, lang: Lang, lola: boolean): Promise<void> {
    this.llm = 'pending';
    const prompt = [
      `You are the flood early-warning announcer of a Philippine barangay beside a creek.`,
      `Write ONE short public advisory (max 45 words) in ${LANG_NAMES[lang]}.`,
      `Status: ${status}. Water level: ${levelCm.toFixed(0)} cm on the gauge. Rise rate: ${rate.toFixed(0)} cm per 10 minutes.`,
      lola ? 'Deliver it as a scolding but loving Filipino grandmother (Lola) talking to her apo.' : 'Use a calm, clear, official tone.',
      'State the action residents must take for this status. The evacuation center is the Barangay Hall.',
      'Reply with the advisory text only.',
    ].join('\n');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // No Content-Type header: keeps this a "simple" CORS request (Ollama parses the JSON body anyway).
      const res = await fetch(`${ollamaConfig.url.replace(/\/+$/, '')}/api/generate`, {
        method: 'POST',
        body: JSON.stringify({ model: ollamaConfig.model, prompt, stream: false, options: { temperature: 0.7 } }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { response?: string };
      const text = json.response?.trim().replace(/^"|"$/g, '');
      if (!text) throw new Error('empty response');
      if (this.key === key) {
        this.llmText = text;
        this.llm = 'idle';
      }
    } catch {
      if (this.key === key) this.llm = 'failed';
    } finally {
      clearTimeout(timer);
      if (this.key === key) this.refresh();
    }
  }
}

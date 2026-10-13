/** Live ESP32 input for the simulator: the water level follows the device's reported distance. */
import { type LinkMode, DeviceLink, parseDistanceCm, parseJson } from '../net/link';
import { applyRemoteDistance } from '../sim';
import { bus, state } from '../state';

export type { LinkMode as RemoteMode };

export class RemoteSensor {
  private readonly link: DeviceLink;

  constructor(private readonly onStatus: (text: string, ok: boolean) => void) {
    this.link = new DeviceLink(
      (text) => this.handle(text),
      (text, ok) => {
        if (!ok && state.source === 'remote') state.source = 'rain';
        onStatus(text, ok);
      },
    );
  }

  get connected(): boolean {
    return this.link.connected;
  }

  connect(url: string, mode: LinkMode, topic: string): void {
    this.link.connect(url, mode, topic);
  }

  disconnect(): void {
    this.link.disconnect();
  }

  private handle(text: string): void {
    const cm = parseDistanceCm(text);
    if (cm === null) return;
    applyRemoteDistance(cm);
    const json = parseJson(text);
    if (json) bus.emit('remote', json);
    this.onStatus(`Live: distance ${cm.toFixed(0)} cm`, true);
  }
}

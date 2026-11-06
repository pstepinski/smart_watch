import { Injectable, inject, signal } from '@angular/core';
import { StateService } from './state.service';
import type { Process } from './models';

export interface AlarmNotice { id: number; name: string; missed: boolean; }

@Injectable({ providedIn: 'root' })
export class AlarmService {
  private readonly storage = inject(StateService);
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private sound: AudioBuffer | null = null;
  readonly testing = signal(false);
  readonly ringing = signal(false);
  private lastCheck = Date.now();
  private wasVisible = document.visibilityState === 'visible';
  readonly ready = signal(false);
  readonly preparing = signal(false);
  readonly error = signal('');
  readonly notices = signal<AlarmNotice[]>([]);

  async prepare(): Promise<boolean> {
    if (this.preparing()) return false;
    this.preparing.set(true);
    try {
      this.context ??= new AudioContext();
      this.context.onstatechange = () => this.ready.set(this.context?.state === 'running');
      await this.context.resume();
      this.ready.set(this.context.state === 'running');
      if (!this.ready()) throw new Error('Audio is suspended');
      this.error.set('');
      return true;
    } catch {
      this.ready.set(false);
      this.error.set('Nie udało się włączyć dźwięku. Spróbuj ponownie i sprawdź ustawienia przeglądarki.');
      return false;
    } finally { this.preparing.set(false); }
  }
  async testSound(): Promise<void> {
    if (!this.ringing() && await this.prepare() && !this.ringing()) this.play(false);
  }
  stopTest(): void { if (this.testing()) this.stopSound(); }
  check(now: number): void {
    const visible = document.visibilityState === 'visible';
    // Suspended pages and overdue restored alarms must not unexpectedly ring on return.
    const active = visible && this.wasVisible && now >= this.lastCheck && now - this.lastCheck < 2000;
    this.lastCheck = now;
    this.wasVisible = visible;
    const due = this.storage.state.processes.filter(entry => entry.alarmEnabled && entry.alarmAt !== undefined && entry.alarmAt <= now);
    if (visible && this.ringing() && !this.source && this.context?.state === 'running') this.play(true);
    if (!due.length) return;
    const notices = due.map(entry => {
      const missed = !active || !this.ready() || !this.context || this.context.state !== 'running' || now - entry.alarmAt! > 2000;
      entry.alarmEnabled = false;
      entry.alarmFiredAt = entry.alarmAt;
      return { id: entry.id, name: entry.name, missed };
    });
    this.notices.update(current => [...notices, ...current.filter(item => !notices.some(next => next.id === item.id))]);
    if (notices.some(item => !item.missed)) this.play(true);
    this.storage.save();
  }
  cancel(entry: Process): void {
    entry.alarmEnabled = false;
    delete entry.alarmAt;
    delete entry.alarmFiredAt;
    this.notices.update(items => items.filter(item => item.id !== entry.id));
    if (!this.notices().length) this.stopSound();
  }
  dismiss(): void { this.stopSound(); this.notices.set([]); }
  private play(loop: boolean): void {
    const context = this.context;
    if (!context || context.state !== 'running' || document.visibilityState !== 'visible') return;
    this.stopSound();
    if (!this.sound) {
      // A short sequence of paired beeps, looped by the audio engine for real alarms.
      this.sound = context.createBuffer(1, Math.ceil(context.sampleRate * 5.4), context.sampleRate);
      const samples = this.sound.getChannelData(0);
      for (let index = 0; index < 12; index++) {
        const start = index * .35 + Math.floor(index / 2) * .25;
        const frequency = index % 2 ? 880 : 660;
        for (let offset = 0; offset < Math.floor(context.sampleRate * .2); offset++) {
          const time = offset / context.sampleRate;
          const envelope = Math.min(time / .02, 1, (.2 - time) / .08);
          samples[Math.floor(start * context.sampleRate) + offset] = .12 * envelope * Math.sin(2 * Math.PI * frequency * time);
        }
      }
    }
    const source = context.createBufferSource();
    source.buffer = this.sound;
    source.loop = loop;
    source.connect(context.destination);
    this.source = source;
    this.ringing.set(loop);
    this.testing.set(!loop);
    source.onended = () => {
      source.disconnect();
      if (this.source === source) { this.source = null; this.testing.set(false); }
    };
    source.start();
  }
  // Screen-off/background playback remains unsupported; resume a ringing alarm on return.
  pauseSound(): void {
    const source = this.source;
    this.source = null;
    if (source) { source.stop(); source.disconnect(); }
    this.testing.set(false);
  }
  stopSound(): void {
    this.ringing.set(false);
    this.pauseSound();
  }
}

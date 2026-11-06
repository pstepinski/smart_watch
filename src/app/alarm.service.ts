import { Injectable, inject, signal } from '@angular/core';
import { StateService } from './state.service';
import type { Process } from './models';

export interface AlarmNotice { id: number; name: string; missed: boolean; }

@Injectable({ providedIn: 'root' })
export class AlarmService {
  private readonly storage = inject(StateService);
  private context: AudioContext | null = null;
  private nodes: OscillatorNode[] = [];
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
  async testSound(): Promise<void> { if (await this.prepare()) this.play(); }
  check(now: number): void {
    const visible = document.visibilityState === 'visible';
    // Suspended pages and overdue restored alarms must not unexpectedly ring on return.
    const active = visible && this.wasVisible && now >= this.lastCheck && now - this.lastCheck < 2000;
    this.lastCheck = now;
    this.wasVisible = visible;
    const due = this.storage.state.processes.filter(entry => entry.alarmEnabled && entry.alarmAt !== undefined && entry.alarmAt <= now);
    if (!due.length) return;
    const notices = due.map(entry => {
      const missed = !active || !this.ready() || !this.context || this.context.state !== 'running' || now - entry.alarmAt! > 2000;
      entry.alarmEnabled = false;
      entry.alarmFiredAt = entry.alarmAt;
      return { id: entry.id, name: entry.name, missed };
    });
    this.notices.update(current => [...notices, ...current.filter(item => !notices.some(next => next.id === item.id))]);
    if (notices.some(item => !item.missed)) this.play();
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
  private play(): void {
    const context = this.context;
    if (!context || context.state !== 'running' || document.visibilityState !== 'visible') return;
    this.stopSound();
    // Six short pairs of beeps; never an indefinitely looping sound.
    for (let index = 0; index < 12; index++) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * .35 + Math.floor(index / 2) * .25;
      oscillator.frequency.value = index % 2 ? 880 : 660;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.12, start + .02);
      gain.gain.setValueAtTime(.12, start + .12);
      gain.gain.linearRampToValueAtTime(0, start + .2);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start); oscillator.stop(start + .22);
      this.nodes.push(oscillator);
    }
  }
  stopSound(): void {
    for (const node of this.nodes) { try { node.stop(); node.disconnect(); } catch { /* already ended */ } }
    this.nodes = [];
  }
}

import { afterRenderEffect, Component, computed, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SwUpdate } from '@angular/service-worker';
import { I18nService } from './i18n.service';
import { StateService } from './state.service';
import { WorldClocksComponent } from './world-clocks.component';
import { UnitPickerComponent } from './unit-picker.component';
import { clockUnits, localDate, localTime, PALETTE, UNITS } from './models';
import type { CountFrom, Mode, Process } from './models';
import { elapsedValues, formatDuration, formatSelectedTime, formatTimer, processTiming, restoredTimerElapsed } from './time';

interface Ring { key: string; radius: number; width: number; color: string; progress: number; }
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
@Component({
  selector: 'app-root', standalone: true,
  imports: [FormsModule, UnitPickerComponent, WorldClocksComponent],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnDestroy {
  readonly storage = inject(StateService);
  readonly state = this.storage.state;
  readonly i18n = inject(I18nService);
  readonly t = (text: string) => this.i18n.t(text);
  readonly palette = PALETTE;
  readonly tabs: { id: Mode; label: string }[] = [
    { id: 'clock', label: 'Zegarek' }, { id: 'countdown', label: 'Odliczanie do' },
    { id: 'stopwatch', label: 'Odliczanie od' }, { id: 'timer', label: 'Stoper' }, { id: 'world', label: 'Zegary świata' }
  ];
  readonly ticks = Array.from({ length: 60 }, (_, index) => index);
  readonly now = signal(Date.now());
  private readonly revision = signal(0);
  private monotonicStart = performance.now() - (restoredTimerElapsed(this.state.timer, Date.now()) - this.state.timer.accumulated);
  private readonly interval = window.setInterval(() => this.now.set(Date.now()), 50);
  readonly installPrompt = signal<InstallEvent | null>(null);
  readonly updateReady = signal(false);
  readonly storageNotice = signal('');
  readonly storageDialog = viewChild.required<ElementRef<HTMLDialogElement>>('storageDialog');
  private readonly saveOnLeave = () => this.storage.save();
  private readonly visibilityChanged = () => { if (document.hidden) this.storage.save(); else this.now.set(Date.now()); };
  private readonly beforeInstall = (event: Event) => { event.preventDefault(); this.installPrompt.set(event as InstallEvent); };
  private readonly installed = () => this.installPrompt.set(null);
  private readonly updates = inject(SwUpdate).versionUpdates.subscribe(event => {
    if (event.type === 'VERSION_READY') this.updateReady.set(true);
  });
  readonly formatTimer = formatTimer;
  readonly view = computed(() => {
    this.revision();
    const language = this.i18n.language();
    const now = new Date(this.now());
    const processes = this.state.processes.map(entry => {
      const timing = processTiming(entry, now, language);
      let status = timing.error || (now < timing.start ? `${this.t('Oczekiwanie na początek · do końca')} ${formatDuration(+timing.end - +now, language)}` :
        timing.progress >= 1 ? this.t('Zakończono · 100%') : `${this.t('Pozostało')} ${formatDuration(+timing.end - +now, language)} · ${Math.floor(timing.progress * 100)}%`);
      const secondsLeft = Math.max(0, Math.ceil((+timing.end - +now) / 1000));
      const days = Math.floor(secondsLeft / 86400);
      const hours = Math.floor(secondsLeft / 3600) % 24;
      const minutes = Math.floor(secondsLeft / 60) % 60;
      const seconds = secondsLeft % 60;
      const remainingUnits = timing.error ? '—' : `${days ? days + ' d ' : ''}${hours} ${language === 'en' ? 'h' : 'godz.'} ${minutes} min ${seconds} s`;
      if (!entry.startTime) status = timing.error || remainingUnits;
      return { entry, timing, status, remainingUnits, percent: entry.startTime ? Math.floor(timing.progress * 100) : null };
    });
    const countFrom = this.state.countFrom.map(entry => {
      const start = new Date(`${entry.startDate || localDate(now)}T${entry.startTime}`);
      const valid = Number.isFinite(+start);
      const values = valid ? elapsedValues(start, now) : null;
      const status = !valid ? this.t('Podaj godzinę początku (data jest opcjonalna).') : now < start ? this.t('Oczekiwanie na wybrany moment.') : `${this.t('Upłynęło:')} ${formatDuration(+now - +start, language)}`;
      const elapsedUnits = valid ? formatSelectedTime(start, now, entry.units, language, true) : '—';
      return { entry, start, valid, values, status, elapsedUnits };
    });
    let digitalTime = localTime(now);
    let digitalLabel = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    let compact = false;
    let rings: Ring[] = [];
    const timerElapsed = this.timerElapsed();
    if (this.state.mode === 'countdown' && this.state.countdownMode === 'all') {
      const visible = processes.filter(item => item.entry.visible && item.entry.startTime);
      const spacing = Math.min(3.5, 20 / Math.max(1, visible.length - 1));
      rings = visible.filter(item => !item.timing.error && item.timing.progress < 1).map(item => ({
        key: `process-${item.entry.id}`, radius: 28 - visible.indexOf(item) * spacing,
        width: Math.min(2, spacing * .65), color: item.entry.color, progress: (1 - item.timing.progress) * 100
      }));
    } else if (this.state.mode === 'countdown') {
      compact = true;
      const active = processes.find(item => item.entry.id === this.state.activeProcessId);
      digitalLabel = active?.entry.name.trim() || (active ? `${this.t('Pasek')} ${active.entry.id}` : this.t('BRAK PROCESU'));
      digitalTime = !active ? this.t('Dodaj proces') : active.timing.error ? this.t('Błędny zakres') : '';
      if (active && !active.timing.error) {
        const from = new Date(Math.min(+active.timing.end, Math.max(+now, +active.timing.start)));
        digitalTime = formatSelectedTime(from, active.timing.end, this.state.countdownUnits, language);
        rings = this.unitRings(elapsedValues(from, active.timing.end), this.state.countdownUnits, true);
      }
    } else if (this.state.mode === 'stopwatch') {
      compact = true;
      const active = countFrom.find(item => item.entry.id === this.state.activeCountFromId);
      digitalLabel = active?.entry.name.trim() || (active ? `${this.t('Stoper')} ${active.entry.id}` : this.t('BRAK POZYCJI'));
      digitalTime = !active ? this.t('Dodaj pozycję') : !active.valid ? '—' : formatSelectedTime(active.start, now, active.entry.units, language);
      if (active?.values) rings = this.unitRings(active.values, active.entry.units);
    } else if (this.state.mode === 'timer') {
      compact = true;
      digitalTime = formatTimer(timerElapsed);
      digitalLabel = this.state.timer.status === 'paused' ? this.t('PAUZA') : this.t('STOPER');
      rings = this.unitRings([timerElapsed / 1000, timerElapsed / 60000, timerElapsed / 3600000], clockUnits());
    }
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    return {
      hasOverview: this.state.mode === 'stopwatch' || (this.state.mode === 'countdown' && this.state.countdownMode === 'all'),
      processes, visibleProcesses: processes.filter(item => item.entry.visible), showProcessPercent: processes.some(item => item.entry.visible && item.entry.startTime), countFrom, rings, digitalTime, digitalLabel, compact, timerElapsed, currentTime: localTime(now),
      digitalAbove: now.getHours() % 12 >= 3 && now.getHours() % 12 < 9,
      secondAngle: `${seconds * 6}deg`, minuteAngle: `${minutes * 6}deg`, hourAngle: `${((now.getHours() % 12) + minutes / 60) * 30}deg`,
      dateLabel: new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'pl-PL', { day: 'numeric', month: 'long', weekday: 'long' }).format(now)
    };
  });
  constructor() {
    afterRenderEffect(() => {
      const dialog = this.storageDialog().nativeElement;
      if (this.storage.showBanner()) {
        if (!dialog.open) dialog.showModal();
      } else if (dialog.open) dialog.close();
    });
    window.addEventListener('pagehide', this.saveOnLeave);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    window.addEventListener('beforeinstallprompt', this.beforeInstall);
    window.addEventListener('appinstalled', this.installed);
  }
  private unitRings(values: number[], selected: boolean[], remaining = false): Ring[] {
    return values.flatMap((value, index) => {
      if (!selected[index] || (remaining && value <= 0)) return [];
      const unit = UNITS[index];
      const fraction = remaining && value > 0 ? (value % unit.cycle || unit.cycle) / unit.cycle : (value % unit.cycle) / unit.cycle;
      return [{ key: `unit-${index}`, radius: 28 - index * 3.2, width: 2, color: unit.color, progress: fraction * 100 }];
    });
  }
  changed(): void {
    this.storage.save();
    this.revision.update(value => value + 1);
    this.now.set(Date.now());
  }
  openStorageInfo(): void {
    const dialog = this.storageDialog().nativeElement;
    if (!dialog.open) dialog.showModal();
  }
  closeStorageInfo(event?: Event): void {
    event?.preventDefault();
    if (this.storage.busy()) return;
    this.storage.continueWithoutSaving();
    this.storageDialog().nativeElement.close();
  }
  async allowStorage(): Promise<void> {
    if (await this.storage.enable()) {
      this.storageDialog().nativeElement.close();
      this.monotonicStart = performance.now() - (restoredTimerElapsed(this.state.timer, Date.now()) - this.state.timer.accumulated);
      this.i18n.syncLanguage();
      this.storageNotice.set('');
      this.revision.update(value => value + 1);
    }
  }
  async toggleStorage(event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) await this.allowStorage();
    else if (window.confirm(this.t('Wyłączenie zapisu usunie zapisane ustawienia, procesy, zegary świata, historię stopera i pliki offline tej aplikacji oraz przywróci ustawienia domyślne. Czy kontynuować?'))) {
      if (await this.storage.disable()) {
        this.monotonicStart = performance.now();
        this.updateReady.set(false);
        this.storageNotice.set('Dane aplikacji zostały usunięte. Nowe zmiany pozostają tylko w pamięci tej karty.');
        this.revision.update(value => value + 1);
      }
    }
    checkbox.checked = this.storage.enabled();
  }
  selectTab(mode: Mode): void { this.state.mode = mode; this.changed(); }
  tabKey(event: KeyboardEvent, index: number): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + this.tabs.length) % this.tabs.length;
    this.selectTab(this.tabs[next].id);
    document.getElementById(`${this.tabs[next].id}Tab`)?.focus();
  }
  addProcess(): void {
    const id = this.state.nextProcessId++;
    this.state.processes.push({ id, name: `${this.t('Pasek')} ${id}`, color: PALETTE[(id - 1) % PALETTE.length].color, visible: true, startDate: '', endDate: '', startTime: '08:00', endTime: '16:00' });
    this.state.activeProcessId ??= id;
    this.changed();
  }
  processTimeChanged(entry: Process): void {
    if (!entry.startDate && !entry.startTime) entry.automaticStart = Date.now();
    else delete entry.automaticStart;
    this.changed();
  }
  removeProcess(entry: Process): void {
    this.state.processes = this.state.processes.filter(item => item.id !== entry.id);
    if (this.state.activeProcessId === entry.id) this.state.activeProcessId = this.state.processes[0]?.id ?? null;
    this.changed();
  }
  addCountFrom(): void {
    const id = this.state.nextCountFromId++;
    const now = new Date();
    this.state.countFrom.push({ id, name: `${this.t('Stoper')} ${id}`, startDate: localDate(now), startTime: localTime(now), units: clockUnits() });
    this.state.activeCountFromId ??= id;
    this.changed();
  }
  removeCountFrom(entry: CountFrom): void {
    this.state.countFrom = this.state.countFrom.filter(item => item.id !== entry.id);
    if (this.state.activeCountFromId === entry.id) this.state.activeCountFromId = this.state.countFrom[0]?.id ?? null;
    this.changed();
  }
  startNow(entry: CountFrom): void {
    const now = new Date();
    entry.startDate = localDate(now);
    entry.startTime = localTime(now);
    this.changed();
  }
  timerElapsed(): number {
    const timer = this.state.timer;
    return timer.accumulated + (timer.status === 'running' ? Math.max(0, performance.now() - this.monotonicStart) : 0);
  }
  startTimer(): void {
    const timer = this.state.timer;
    if (timer.status === 'running' || timer.status === 'paused') return;
    timer.session++;
    timer.lap = 0;
    timer.accumulated = 0;
    timer.lastResult = 0;
    timer.startedAt = Date.now();
    this.monotonicStart = performance.now();
    timer.status = 'running';
    this.changed();
  }
  pauseTimer(): void {
    const timer = this.state.timer;
    if (timer.status === 'running') {
      timer.accumulated = this.timerElapsed();
      timer.startedAt = null;
      timer.status = 'paused';
    } else if (timer.status === 'paused') {
      timer.startedAt = Date.now();
      this.monotonicStart = performance.now();
      timer.status = 'running';
    }
    this.changed();
  }
  stopTimer(): void {
    const timer = this.state.timer;
    if (timer.status !== 'running' && timer.status !== 'paused') return;
    timer.accumulated = this.timerElapsed();
    timer.startedAt = null;
    timer.status = 'stopped';
    this.saveTimerResult('Stop');
    this.changed();
  }
  lapTimer(): void {
    if (this.state.timer.status !== 'running') return;
    this.saveTimerResult(`Okrążenie ${++this.state.timer.lap}`);
    this.changed();
  }
  deleteTimerResult(id: number): void {
    this.state.timer.results = this.state.timer.results.filter(result => result.id !== id);
    this.changed();
  }
  clearTimerResults(): void {
    this.state.timer.results = [];
    this.changed();
  }
  private saveTimerResult(kind: string): void {
    const timer = this.state.timer;
    const elapsed = this.timerElapsed();
    timer.results.unshift({ id: timer.nextResultId++, session: timer.session, kind, elapsed, split: Math.max(0, elapsed - timer.lastResult) });
    timer.lastResult = elapsed;
  }
  async install(): Promise<void> {
    const event = this.installPrompt();
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    this.installPrompt.set(null);
  }
  resultKind(kind: string): string {
    const lap = /^Okrążenie (\d+)$/.exec(kind);
    return lap ? `${this.t('Okrążenie')} ${lap[1]}` : this.t(kind);
  }
  reload(): void { window.location.reload(); }
  ngOnDestroy(): void {
    window.clearInterval(this.interval);
    this.updates.unsubscribe();
    window.removeEventListener('pagehide', this.saveOnLeave);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    window.removeEventListener('beforeinstallprompt', this.beforeInstall);
    window.removeEventListener('appinstalled', this.installed);
  }
}

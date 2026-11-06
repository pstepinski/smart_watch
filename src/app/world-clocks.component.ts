import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from './i18n.service';
import { translate } from './translations';
import { StateService } from './state.service';
import { CITIES, defaultWorldClocks, timeZones, validTimeZone, zonedTime } from './world-clocks';
import type { WorldClock } from './world-clocks';

@Component({
  selector: 'app-world-clocks', standalone: true, imports: [FormsModule],
  templateUrl: './world-clocks.component.html'
})
export class WorldClocksComponent implements OnDestroy {
  readonly storage = inject(StateService);
  readonly state = this.storage.state;
  readonly i18n = inject(I18nService);
  readonly t = (text: string) => this.i18n.t(text);
  readonly cities = CITIES;
  readonly zones = timeZones();
  readonly ticks = Array.from({ length: 12 }, (_, i) => i);
  readonly now = signal(Date.now());
  private readonly revision = signal(0);
  private readonly interval = window.setInterval(() => this.now.set(Date.now()), 1000);
  selectedCity = '0';
  customName = '';
  customZone = 'Europe/Warsaw';
  readonly error = signal('');
  readonly search = signal('');
  readonly clocks = computed(() => {
    this.revision();
    const locale = this.i18n.language() === 'en' ? 'en-GB' : 'pl-PL';
    const now = new Date(this.now());
    return this.state.worldClocks.map(entry => ({ entry, ...zonedTime(now, entry.timeZone, locale) }));
  });
  readonly filteredClocks = computed(() => {
    const normalize = (text: string) => text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
    const query = normalize(this.search());
    return this.clocks().filter(clock => !query ||
      [clock.entry.name, translate(clock.entry.name, 'en')].some(name => normalize(name).includes(query)));
  });
  changed(): void {
    this.storage.save();
    this.revision.update(value => value + 1);
  }
  add(): void {
    const city = this.selectedCity === 'custom' ? null : this.cities[Number(this.selectedCity)];
    const name = city ? city[0] : this.customName.trim();
    const timeZone = city ? city[1] : this.customZone;
    if (!name || !validTimeZone(timeZone)) { this.error.set('Podaj nazwę miasta i prawidłową strefę czasową.'); return; }
    if (this.state.worldClocks.some(entry => entry.name === name && entry.timeZone === timeZone)) {
      this.error.set('Ten zegar już jest na liście.'); return;
    }
    this.state.worldClocks.push({ id: this.state.nextWorldClockId++, name, timeZone, visible: true });
    this.customName = '';
    this.error.set('');
    this.changed();
  }
  remove(entry: WorldClock): void {
    this.state.worldClocks = this.state.worldClocks.filter(item => item.id !== entry.id);
    this.error.set('');
    this.changed();
  }
  restore(): void {
    this.state.worldClocks = defaultWorldClocks();
    this.state.nextWorldClockId = this.state.worldClocks.length + 1;
    this.error.set('');
    this.changed();
  }
  setAll(visible: boolean): void {
    this.state.worldClocks.forEach(entry => { entry.visible = visible; });
    this.changed();
  }
  ngOnDestroy(): void { window.clearInterval(this.interval); }
}

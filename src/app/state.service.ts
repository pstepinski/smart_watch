import { Injectable, signal } from '@angular/core';
import { createState } from './models';
import { loadState, saveState } from './persistence';

@Injectable({ providedIn: 'root' })
export class StateService {
  readonly error = signal('');
  readonly state;
  constructor() {
    try {
      const loaded = loadState(localStorage);
      this.state = loaded.state;
      for (const process of this.state.processes) {
        if (!process.startDate && !process.startTime && process.automaticStart === undefined) process.automaticStart = Date.now();
      }
      this.error.set(loaded.error || saveState(localStorage, this.state));
    } catch {
      this.state = createState();
      this.error.set('Zapis na urządzeniu jest niedostępny w tej przeglądarce.');
    }
  }
  save(): void {
    try { this.error.set(saveState(localStorage, this.state)); }
    catch { this.error.set('Nie udało się zapisać danych na urządzeniu.'); }
  }
}

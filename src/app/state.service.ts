import { Injectable, isDevMode, signal } from '@angular/core';
import { browserLanguage } from './translations';
import { createState } from './models';
import { loadState, saveState, STORAGE_KEY } from './persistence';
import { CONSENT_KEY, consentGranted } from './storage-consent';

@Injectable({ providedIn: 'root' })
export class StateService {
  readonly error = signal('');
  readonly enabled = signal(false);
  readonly showBanner = signal(true);
  readonly busy = signal(false);
  readonly state = createState(new Date(), browserLanguage(navigator.language));
  private pristine = true;

  constructor() {
    try {
      if (localStorage.getItem(CONSENT_KEY) === 'granted') {
        this.restore();
        this.enabled.set(true);
        this.showBanner.set(false);
        consentGranted.next(true);
      }
    } catch {
      this.error.set('Zapis na urządzeniu jest niedostępny w tej przeglądarce.');
    }
    window.addEventListener('storage', event => {
      if ((event.key === CONSENT_KEY && event.newValue !== 'granted') || event.key === null) {
        this.enabled.set(false);
        this.showBanner.set(true);
        consentGranted.next(false);
      }
    });
  }
  private restore(): void {
    const loaded = loadState(localStorage, new Date(), this.state.language);
    Object.assign(this.state, loaded.state);
    for (const process of this.state.processes) {
      if (!process.startDate && !process.startTime && process.automaticStart === undefined) process.automaticStart = Date.now();
    }
    this.error.set(loaded.error);
  }
  save(markDirty = true): void {
    if (markDirty) this.pristine = false;
    if (!this.enabled()) return;
    try {
      // A revoked choice in another tab must not be overwritten by a stale pagehide callback.
      if (localStorage.getItem(CONSENT_KEY) !== 'granted') {
        this.enabled.set(false);
        consentGranted.next(false);
        return;
      }
      this.error.set(saveState(localStorage, this.state));
    } catch {
      this.error.set('Nie udało się zapisać danych na urządzeniu.');
    }
  }
  async enable(): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      // Older installations can restore existing data after the user's first explicit agreement.
      if (this.pristine) this.restore();
      // Save the choice first: failure must not overwrite or remove an older state.
      localStorage.setItem(CONSENT_KEY, 'granted');
      const error = saveState(localStorage, this.state);
      if (error) {
        localStorage.removeItem(CONSENT_KEY);
        this.error.set(error);
        return false;
      }
      this.enabled.set(true);
      this.showBanner.set(false);
      this.error.set('');
      consentGranted.next(true);
      if (!isDevMode() && 'serviceWorker' in navigator) {
        // Also handles re-enabling after the first Angular registration was unregistered.
        try { await navigator.serviceWorker.register(new URL('ngsw-worker.js', document.baseURI).href); }
        catch { this.error.set('Dane są zapisywane, ale tryb offline jest niedostępny.'); }
      }
      return true;
    } catch {
      this.error.set('Nie udało się zapisać danych na urządzeniu.');
      return false;
    } finally { this.busy.set(false); }
  }
  continueWithoutSaving(): void { this.showBanner.set(false); }

  async disable(): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      localStorage.removeItem(CONSENT_KEY);
      this.enabled.set(false);
      consentGranted.next(false);
      localStorage.removeItem(STORAGE_KEY);
      Object.assign(this.state, createState(new Date(), this.state.language));
      this.showBanner.set(false);
      this.pristine = false;
      const scope = new URL('./', document.baseURI).href;
      const worker = new URL('ngsw-worker.js', document.baseURI).href;
      if ('serviceWorker' in navigator) {
        for (const registration of await navigator.serviceWorker.getRegistrations()) {
          const scripts = [registration.active, registration.waiting, registration.installing];
          if (registration.scope === scope && scripts.some(item => item?.scriptURL === worker)) await registration.unregister();
        }
      }
      if ('caches' in window) {
        const prefix = `ngsw:${new URL(scope).pathname}:`;
        await Promise.all((await caches.keys()).filter(key => key.startsWith(prefix)).map(key => caches.delete(key)));
      }
      this.error.set('');
      return true;
    } catch {
      this.error.set('Nie udało się usunąć wszystkich danych aplikacji. Sprawdź ustawienia przeglądarki.');
      return false;
    } finally { this.busy.set(false); }
  }
}

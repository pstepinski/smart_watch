import { Injectable, isDevMode, signal } from '@angular/core';

export const ANALYTICS_CONSENT_KEY = 'horizon.analyticsConsent.v1';
export const VISITOR_KEY = 'horizon.visitorId.v1';
const visitorPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  readonly choice = signal<'granted' | 'denied' | null>(null);
  readonly enabled = signal(false);
  readonly error = signal('');
  private started = false;

  constructor() {
    this.restore();
    window.addEventListener('storage', event => {
      if (event.key === ANALYTICS_CONSENT_KEY || event.key === VISITOR_KEY || event.key === null) {
        this.restore();
        if (this.started && this.enabled()) this.trackUnique();
      }
    });
  }
  private restore(): void {
    try {
      const choice = localStorage.getItem(ANALYTICS_CONSENT_KEY);
      const id = choice === 'granted' ? localStorage.getItem(VISITOR_KEY) : null;
      const allowed = choice === 'granted' && id !== null && visitorPattern.test(id);
      this.choice.set(allowed ? 'granted' : choice === 'denied' ? 'denied' : null);
      this.enabled.set(allowed);
    } catch { this.enabled.set(false); }
  }
  trackOpening(): void {
    if (this.started || isDevMode()) return;
    this.started = true;
    this.send('/api/visits', { event: 'visit' });
    this.trackUnique();
  }
  setEnabled(allowed: boolean): void {
    this.error.set('');
    try {
      if (allowed) {
        const existing = localStorage.getItem(VISITOR_KEY);
        const id = existing && visitorPattern.test(existing) ? existing : this.newVisitor();
        localStorage.setItem(VISITOR_KEY, id);
        localStorage.setItem(ANALYTICS_CONSENT_KEY, 'granted');
        this.choice.set('granted');
        this.enabled.set(true);
        if (this.started) this.trackUnique();
      } else {
        this.choice.set('denied');
        this.enabled.set(false);
        // Revoke first, so another tab cannot send a stale identifier.
        localStorage.setItem(ANALYTICS_CONSENT_KEY, 'denied');
        localStorage.removeItem(VISITOR_KEY);
      }
    } catch {
      this.choice.set('denied');
      this.enabled.set(false);
      this.error.set('Nie udało się zapisać wyboru statystyk. Sprawdź ustawienia przeglądarki.');
      try { localStorage.removeItem(ANALYTICS_CONSENT_KEY); localStorage.removeItem(VISITOR_KEY); } catch { /* storage unavailable */ }
    }
  }
  declineIfUndecided(): void { if (this.choice() === null) this.setEnabled(false); }
  private trackUnique(): void {
    // Always check persisted consent, including after changes made in another tab.
    try {
      if (localStorage.getItem(ANALYTICS_CONSENT_KEY) !== 'granted') return;
      const visitorId = localStorage.getItem(VISITOR_KEY);
      if (visitorId && visitorPattern.test(visitorId)) this.send('/api/visitors', { visitorId });
    } catch { /* do not fall back to an in-memory tracking identifier */ }
  }
  private send(url: string, body: object): void {
    void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', keepalive: true }).catch(() => {});
  }
  private newVisitor(): string {
    // getRandomValues also works on ordinary HTTP addresses used on a local network.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

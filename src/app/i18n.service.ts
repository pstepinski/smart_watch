import { Injectable, inject, signal } from '@angular/core';
import { StateService } from './state.service';
import { translate } from './translations';
import type { Language } from './translations';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly storage = inject(StateService);
  private chosen = false;
  readonly language = signal<Language>(this.storage.state.language);
  constructor() { this.updateDocument(); }
  t(text: string): string { return translate(text, this.language()); }
  setLanguage(value: Language): void {
    if (value !== 'pl' && value !== 'en') return;
    this.chosen = true;
    this.language.set(value);
    this.storage.state.language = value;
    this.storage.save(false);
    this.updateDocument();
  }
  syncLanguage(): void {
    if (this.chosen) {
      this.storage.state.language = this.language();
      this.storage.save(false);
    } else this.language.set(this.storage.state.language);
    this.updateDocument();
  }
  private updateDocument(): void {
    document.documentElement.lang = this.language();
    document.title = this.language() === 'en' ? 'SMART WATCH — hybrid clock' : 'SMART WATCH — zegar hybrydowy';
  }
}

import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PRESETS, UNITS } from './models';

@Component({
  selector: 'app-unit-picker',
  standalone: true,
  imports: [FormsModule],
  template: `
    <label>Szybki wybór
      <select [ngModel]="preset()" (ngModelChange)="applyPreset($event)" [attr.aria-label]="'Zestaw jednostek: ' + label()">
        <option value="custom">Własny zestaw</option>
        @for (item of presets; track item.id) { <option [value]="item.id">{{ item.name }}</option> }
      </select>
    </label>
    <div class="unit-toggles">
      @for (unit of units; track unit.name; let i = $index) {
        <label class="display-toggle">
          <input type="checkbox" role="switch" [checked]="selection()[i]" (change)="toggle(i, $event)" [attr.aria-label]="label() + ': ' + unit.name">
          <span class="unit-dot" [style.background]="unit.color"></span><span>{{ unit.name }}</span>
          @if (values()) { <span class="unit-value">{{ value(i) }}</span> }
        </label>
      }
    </div>
  `
})
export class UnitPickerComponent {
  readonly selection = input.required<boolean[]>();
  readonly label = input('Jednostki');
  readonly values = input<number[] | null>(null);
  readonly selectionChange = output<boolean[]>();
  readonly presets = PRESETS;
  readonly units = UNITS;
  preset(): string {
    return PRESETS.find(preset => UNITS.every((_, index) => this.selection()[index] === preset.indexes.includes(index)))?.id ?? 'custom';
  }
  applyPreset(value: string): void {
    const preset = PRESETS.find(item => item.id === value);
    if (preset) this.selectionChange.emit(UNITS.map((_, index) => preset.indexes.includes(index)));
  }
  toggle(index: number, event: Event): void {
    this.selectionChange.emit(this.selection().map((checked, i) => i === index ? (event.target as HTMLInputElement).checked : checked));
  }
  value(index: number): string { const value = this.values()?.[index]; return value === undefined || !Number.isFinite(value) ? '—' : String(Math.floor(value)); }
}

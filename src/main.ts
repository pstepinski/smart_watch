import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { filter, take } from 'rxjs';
import { consentGranted } from './app/storage-consent';
import { AnalyticsService } from './app/analytics.service';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideServiceWorker('ngsw-worker.js', {
    enabled: !isDevMode(),
    registrationStrategy: () => consentGranted.pipe(filter(Boolean), take(1))
  })]
}).then(app => app.injector.get(AnalyticsService).trackOpening()).catch(error => console.error(error));

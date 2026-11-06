import { BehaviorSubject } from 'rxjs';

export const CONSENT_KEY = 'horizon.storageConsent.v1';
export const consentGranted = new BehaviorSubject(false);

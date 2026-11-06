# HORIZON

Aplikacja Angular PWA: zegarek analogowo-cyfrowy, odliczanie do wybranego momentu, odliczanie od wybranego momentu i stoper z pauzą oraz okrążeniami. Interfejs jest po polsku i działa również na telefonie.

## Uruchomienie

Wymagany Node.js 24.15+ (lub zgodna wersja wskazana w `package.json`).

```bash
npm ci
npm start
```

Aplikacja deweloperska: `http://localhost:4200`. Service worker jest wyłączony w trybie deweloperskim, żeby aktualizacje kodu były od razu widoczne.

## PWA i działanie offline

```bash
npm run build
npm run preview
```

Wersja produkcyjna: `http://localhost:4173`. Po pierwszym otwarciu i pobraniu zasobów aplikacja uruchamia się bez sieci. Jeśli przeglądarka udostępnia instalację, pojawia się przycisk „Zainstaluj aplikację”. Można też skorzystać z menu przeglądarki „Zainstaluj” / „Dodaj do ekranu początkowego” (na iOS: Udostępnij → Do ekranu początkowego).

Do hostowania należy udostępnić zawartość `dist/horizon/browser` przez **HTTPS**. `localhost` również pozwala testować PWA. Zachowaj ten sam adres aplikacji: dane przeglądarki są przypisane do konkretnego protokołu, hosta i portu. Sam plik HTML otwarty przez `file://` nie uruchamia aplikacji Angular ani PWA.

Manifest, ikony (w tym maskable) i konfiguracja Angular Service Worker znajdują się w `public/` oraz `ngsw-config.json`. Gdy service worker pobierze aktualizację, aplikacja pokazuje przycisk odświeżenia.

## Dane na urządzeniu

Stan jest zapisywany automatycznie w `localStorage`, pod kluczem `horizon.state.v1`. Obejmuje:

- procesy, nazwy, kolory, zakresy dat i godzin, widoczność oraz aktywny proces;
- pozycje „Odliczania od”, ich początki, jednostki i aktywną pozycję;
- zakładkę, tryb odliczania oraz widoczność wyświetlacza;
- stan stopera, numer pomiaru i okrążenia oraz historię wyników (najnowsze na górze).

Włączony stoper po ponownym uruchomieniu uwzględnia czas zamknięcia aplikacji lub wyłączenia urządzenia. Pauza pozostaje na pauzie i nie dolicza przerwy. Podczas otwartej sesji pomiar korzysta z zegara monotonicznego, a po restarcie jest odtwarzany z zapisanego czasu systemowego. Stoper nie wymaga wykonywania kodu w tle.

Dane pozostają lokalnie w danej przeglądarce i nie są wysyłane na serwer ani synchronizowane między urządzeniami. Wyczyszczenie danych witryny usuwa zapis. Gdy odczyt lub zapis jest niedostępny, interfejs pokazuje komunikat. Zapis ma wersjonowany schemat i jest sprawdzany przed odtworzeniem.

## Sprawdzenie

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Testy jednostkowe sprawdzają obliczenia kalendarzowe, formatowanie, zakresy czasu i zapis stanu. Testy Playwright uruchamiają wersję produkcyjną i sprawdzają m.in. przywracanie formularzy, pauzę i wznowienie, restart całej przeglądarki, tryby odliczania, układ mobilny, instalowalność oraz uruchomienie offline.

## Kod

- `src/app/app.component.*` — interfejs i obsługa trybów;
- `src/app/unit-picker.component.ts` — wybór jednostek i gotowych zestawów;
- `src/app/models.ts` — model zapisywanych danych;
- `src/app/time.ts` — obliczenia czasu;
- `src/app/state.service.ts`, `src/app/persistence.ts` — lokalny zapis, odczyt i walidacja.

Poprzednia jednoplikowa wersja `smart_watch.html` pozostaje w historii Git. Została zastąpiona aplikacją Angular.

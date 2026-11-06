# SMART WATCH

by Piotr Stępiński

Aplikacja Angular PWA: zegarek analogowo-cyfrowy, odliczanie do wybranego momentu, odliczanie od wybranego momentu i stoper z pauzą oraz okrążeniami. Interfejs obsługuje język polski i angielski oraz działa na telefonie. Przy pierwszym uruchomieniu wybierany jest język przeglądarki: polski dla `pl`, angielski dla pozostałych języków. Wybór PL/EN nad zakładkami jest zapamiętywany na urządzeniu i ma pierwszeństwo przed językiem przeglądarki. Starsze dane bez zapisanego języka również korzystają z języka przeglądarki.

## Uruchomienie

Wymagany Node.js 24.15+ (lub zgodna wersja wskazana w `package.json`).

```bash
npm ci
npm start
```

Aplikacja deweloperska: `http://localhost:4200`. Service worker jest wyłączony w trybie deweloperskim, żeby aktualizacje kodu były od razu widoczne.

## Docker Compose

Wymagany Docker z działającym `docker compose` (obsługującym `up --wait`). Node.js na komputerze nie jest potrzebny — aplikacja buduje się wewnątrz obrazu, a gotowe pliki serwuje Nginx.

```bash
./scripts/start.sh
```

Adres: `http://localhost:4173`. Skrypt buduje aktualny kod, uruchamia kontener w tle i czeka na pozytywny healthcheck. Można uruchomić go z dowolnego katalogu.

Zatrzymanie aplikacji:

```bash
./scripts/stop.sh
```

Zmiana portu (użyj tej samej wartości także przy zatrzymywaniu):

```bash
HORIZON_PORT=8090 ./scripts/start.sh
HORIZON_PORT=8090 ./scripts/stop.sh
```

Odpowiedniki bez skryptów, uruchamiane w katalogu projektu:

```bash
docker compose up -d --build --wait
docker compose logs -f web
docker compose down
```

Kontener jest automatycznie uruchamiany po restarcie Dockera, dopóki nie zostanie zatrzymany. Dane aplikacji pozostają w przeglądarce; nie wymagają wolumenu Docker i nie są usuwane przez `stop.sh`. Zachowaj ten sam adres i port, aby korzystać z tego samego zapisu.

Do PWA na telefonie potrzebny jest adres HTTPS, np. przez reverse proxy przed kontenerem. Zwykłe HTTP pod adresem IP komputera pozwala otworzyć stronę, ale nie zapewnia obsługi PWA jak HTTPS lub `localhost`.

## PWA i działanie offline

```bash
npm run build
npm run preview
```

Wersja produkcyjna: `http://localhost:4173`. Po pierwszym otwarciu i pobraniu zasobów aplikacja uruchamia się bez sieci. Jeśli przeglądarka udostępnia instalację, pojawia się przycisk „Zainstaluj aplikację”. Można też skorzystać z menu przeglądarki „Zainstaluj” / „Dodaj do ekranu początkowego” (na iOS: Udostępnij → Do ekranu początkowego).

Do hostowania należy udostępnić zawartość `dist/horizon/browser` przez **HTTPS**. `localhost` również pozwala testować PWA. Zachowaj ten sam adres aplikacji: dane przeglądarki są przypisane do konkretnego protokołu, hosta i portu. Sam plik HTML otwarty przez `file://` nie uruchamia aplikacji Angular ani PWA.

Manifest, ikony (w tym maskable) i konfiguracja Angular Service Worker znajdują się w `public/` oraz `ngsw-config.json`. Gdy service worker pobierze aktualizację, aplikacja pokazuje przycisk odświeżenia.

W „Odliczaniu do” można pozostawić datę i godzinę początku puste oraz podać samą godzinę końca. Początek jest wtedy zapisywany jako moment ustawienia zakresu i zachowuje się po restarcie. Jeśli godzina końca już minęła, wybierany jest następny dzień. Można też podać konkretną datę końca.

W widoku wszystkich procesów „Odliczania do” obok zegarka znajduje się tabela z pozostałym czasem w jednostkach i procentem upływu. Na ekranach do 700 px zegarek i tabela tworzą karuzelę obsługiwaną przesunięciem palca lub przyciskami „Zegarek” / „Procesy”.

## Zegary świata

Zakładka „Zegary świata” zawiera 30 domyślnych miast z różnych kontynentów, w tym Warszawę. Każdy widoczny zegar ma tarczę analogową, czas cyfrowy, lokalną datę i przesunięcie UTC. Strefy IANA korzystają z obsługi czasu letniego w przeglądarce.

W rozwijanej sekcji „Miasta i ustawienia” można wybrać widoczne zegary, dodawać miasta z listy lub własne z wybraną strefą czasową, usuwać pozycje oraz przywrócić zestaw domyślny. Lista i widoczność są zapisywane lokalnie; aktualizacja aplikacji dodaje nowe ustawienia bez usuwania dotychczasowych danych.

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

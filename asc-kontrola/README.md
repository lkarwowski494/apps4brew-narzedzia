# Kontrola ustawień App Store Connect (tylko odczyt)

Narzędzie porównuje ustawienia aplikacji w App Store Connect z oczekiwaniami zapisanymi w repozytorium aplikacji i wypisuje raport.
**Niczego nie zmienia**: klient API wysyła wyłącznie żądania `GET` (nie ma w nim parametru metody), a test pilnuje, że w kodzie nie ma metod zapisu.
Katalog jest samodzielny i nie zawiera niczego specyficznego dla żadnej aplikacji — wszystko, co dotyczy aplikacji, jest w jej pliku konfiguracji.

## Uruchomienie

```
ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_PATH=/ścieżka/do/AuthKey.p8 node kontrola.mjs --config <plik-konfiguracji.json> [--szczegoly]
```

Ścieżki z konfiguracji (pliki z oczekiwanymi wartościami) są liczone od bieżącego katalogu — uruchamiaj z katalogu głównego repozytorium aplikacji.
Wynik: raport Markdown na standardowym wyjściu. Kod wyjścia: `0` brak różnic; `1` co najmniej jedna **RÓŻNICA** albo **BŁĄD** odczytu; `2` błędne wywołanie.

W GitHub Actions: workflow wielokrotnego użytku `.github/workflows/asc-kontrola.yml` w repozytorium narzędzi (`on: workflow_call`; wejścia `config`, `szczegoly`;
sekrety `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, przekazywane jawnie). Aplikacja dodaje cienki workflow `workflow_dispatch` z `uses: …/asc-kontrola.yml@<SHA>`.
Workflow pobiera repozytorium wywołujące (konfiguracja, oczekiwane wartości) oraz repozytorium narzędzi w wersji z `uses:` (`job.workflow_repository`, `job.workflow_sha`).
Klucz trafia tylko do `RUNNER_TEMP` i jest usuwany zawsze.

## Statusy w raporcie

| Status | Znaczenie | Kod wyjścia |
|---|---|---|
| OK | wartość w App Store Connect zgadza się z oczekiwaną | 0 |
| RÓŻNICA | wartość inna niż oczekiwana | 1 |
| BRAK DANYCH | nie ma czego porównać (brak pliku z oczekiwaniami, brak wartości w App Store Connect) | 0 |
| TYLKO RĘCZNIE | API nie udostępnia tego ustawienia — sprawdzić w App Store Connect | 0 |
| INFO | tylko wypisanie (oczekiwana wartość `null` albo nie ustalona) | 0 |
| BŁĄD | odczyt nieudany (np. brak uprawnień klucza, brak obiektu) | 1 |

## Kontrole na start

| Obszar | Co sprawdza | Zasób API |
|---|---|---|
| Ceny | bieżące ceny każdego produktu w wybranych terytoriach i w grupach (np. strefa euro — różnice wypisane) | `subscriptions/{id}/prices`, `iapPriceSchedule` |
| Oferty wprowadzające | tryb, czas, pokrycie wszystkich terytoriów z ceną, brak daty końca | `subscriptions/{id}/introductoryOffers` |
| Produkty | Family Sharing | atrybut `familySharable` |
| Adresy | Privacy Policy URL (lokalizacje), Support URL, Marketing URL (wersja) | `appInfoLocalizations`, `appStoreVersionLocalizations` |
| Metadane sklepu | nazwa, podtytuł, słowa kluczowe, tekst promocyjny, opis, lista lokalizacji | jak wyżej |
| Aplikacja | kategorie, ocena wiekowa (wypisanie), dostępność w krajach | `appInfos`, `ageRatingDeclaration`, `appAvailabilityV2` |
| Aplikacja | etykieta prywatności | **tylko ręcznie** — API jej nie udostępnia (odczyt dokumentacji 21.10.2026) |
| Informacje dla recenzenta | kontakt (tylko „ustawione/puste”), konto demo, zgodność notatek z plikiem | `appStoreReviewDetail` |

Dostępność w krajach: odpowiedź 404 dla `appAvailabilityV2` (przebieg 21.10.2026) raport pokazuje jako BRAK DANYCH z krokiem w App Store Connect (Ceny i dostępność → Dostępność aplikacji), nie jako BŁĄD — Apple nie opisuje tego kodu, najczęściej oznacza nieustawioną dostępność aplikacji.

Dane osobowe recenzenta, treści metadanych i notatek nigdy nie trafiają do raportu — tylko kody lokalizacji, nazwy pól i liczby.

## Konfiguracja aplikacji

Jeden plik JSON. Pola (wszystkie poza `aplikacja` opcjonalne — kontrola bez wpisu w konfiguracji jest pomijana):

| Pole | Opis |
|---|---|
| `aplikacja.bundleId` | identyfikator pakietu aplikacji |
| `produkty[]` | `{ klucz, productId, rodzaj }`; `rodzaj`: `subskrypcja` albo `jednorazowy` |
| `terytoria.wybrane[]` | kody terytoriów App Store Connect (np. `USA`, `POL`) kontrolowane osobno |
| `terytoria.grupy{}` | nazwa grupy → lista kodów (np. strefa euro); kwota grupy w `ceny` |
| `ceny{klucz}` | `{ <terytorium albo grupa>: kwota lub null }`; wpis terytorium ma pierwszeństwo przed wpisem grupy |
| `oferta` | `{ produkty[], tryb (np. FREE_TRIAL), czas (np. TWO_WEEKS), bezDatyKonca }` albo `{ produkty[], brak: true }` (model bez oferty wprowadzającej: OK tylko, gdy produkt nie ma żadnej) |
| `rodzina{klucz}` | oczekiwany Family Sharing (`true`/`false`) |
| `adresy.plik` | plik JSON z `privacyPolicyUrl`, `supportUrl`, `marketingUrl` |
| `kategoria` | `{ glowna, dodatkowa }` (identyfikatory kategorii; `null` = tylko wypisz) |
| `wiek.oczekiwane` | opcjonalnie odpowiedzi deklaracji wieku do porównania; sam wpis `wiek: {}` włącza wypisanie |
| `dostepnosc.terytoria` | lista kodów albo `null` (tylko wypisz liczbę i listę) |
| `metadane` | `{ plik, komunikatBraku }`; plik: `{ "lokalizacje": { "<kod>": { name, subtitle, keywords, promotionalText, description } } }` |
| `uwagiRecenzenta` | `{ plik, komunikatBraku }`; plik tekstowy z oczekiwanymi notatkami |

Brak pliku z oczekiwaniami to **BRAK DANYCH** z komunikatem z konfiguracji, nie błąd.

## Jak dodać kontrolę

1. W `kontrole/` dodaj wpis (nowy plik albo istniejący) o kształcie opisanym w `kontrole/index.mjs`:
   `{ id, obszar, nazwa, zasoby, dotyczy(config), pobierz(kontekst), porownaj(dane, kontekst) }`.
2. Dane pobieraj przez kontekst (`kontekst.mjs`; dodaj tam pobieranie z pamięcią podręczną, jeśli zasób jest nowy) — tylko odczyt.
3. Porównanie napisz jako **czystą funkcję** i wyeksportuj, żeby dało się ją testować na atrapach odpowiedzi API; zwracaj wiersze `wiersz(STATUS, opis, szczegoly)`.
4. Dopisz kontrolę do `KONTROLE` w `kontrole/index.mjs`, a oczekiwaną wartość do pliku konfiguracji aplikacji.
5. Nazwy pól sprawdź w dokumentacji Apple (nie zgaduj) i wpisz adres strony z datą odczytu w komentarzu na górze pliku.
6. W raporcie nie umieszczaj danych osobowych, identyfikatorów kluczy ani treści odpowiedzi API.

## Dokumentacja Apple użyta przy pisaniu (odczyt 21.10.2026)

Adresy stron są w komentarzu na górze `kontekst.mjs`. Ustawienie, którego API nie udostępnia (etykieta prywatności), raport oznacza jako TYLKO RĘCZNIE
i podaje adres: https://developer.apple.com/documentation/appstoreconnectapi (lista zasobów) oraz https://developer.apple.com/app-store/app-privacy-details/ (wymagania).

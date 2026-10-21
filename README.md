# apps4brew-narzedzia

Wspólne narzędzia studia Apps4Brew (kontrola App Store Connect i inne). Repozytorium jest publiczne — nie zawiera sekretów ani danych aplikacji;
dane aplikacji (konfiguracja, oczekiwane wartości) leżą w repozytorium każdej aplikacji.

## Zawartość

| Katalog | Co to jest |
|---|---|
| `asc-kontrola/` | kontrola ustawień App Store Connect, **tylko odczyt** (żądania GET); README w środku: konfiguracja, uruchomienie, jak dodać kontrolę |
| `.github/workflows/asc-kontrola.yml` | workflow wielokrotnego użytku (`workflow_call`) uruchamiający kontrolę dla aplikacji |
| `.github/workflows/testy.yml` | testy tego repozytorium (`node --test testy/asc-kontrola.test.mjs`), bez sekretów |
| `testy/` | testy narzędzia na atrapie API oraz przykładowa konfiguracja fikcyjnej aplikacji (`testy/przyklad/`) |

## Użycie w repozytorium aplikacji

Cienki workflow ręczny wywołuje workflow wspólny, **przypięty do pełnego SHA** commitu (nie do gałęzi — wersja narzędzia zmienia się tylko świadomie):

```yaml
jobs:
  kontrola:
    uses: lkarwowski494/apps4brew-narzedzia/.github/workflows/asc-kontrola.yml@<SHA 40 znaków>
    with:
      config: sciezka/do/konfiguracji.json
      szczegoly: false
    secrets:
      ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
      ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
      ASC_KEY_P8: ${{ secrets.ASC_KEY_P8 }}
```

Workflow sam pobiera narzędzie w wersji z `@<SHA>` (`job.workflow_repository`, `job.workflow_sha`; źródło: dokumentacja kontekstów GitHub Actions,
https://docs.github.com/en/actions/reference/workflows-and-actions/contexts , odczyt 21.10.2026), więc wywołujące repozytorium nie musi go kopiować.
Sekrety przekazuj jawnie (trzy wymagane); `secrets: inherit` GitHub dokumentuje dla repozytoriów w obrębie jednej organizacji lub przedsiębiorstwa, więc tu nie polegamy na nim.

## Zasady

- Kontrola nigdy niczego nie zmienia w App Store Connect; test pilnuje braku metod zapisu.
- Raport nie zawiera identyfikatorów klucza, wystawcy ani aplikacji, tokenów, treści odpowiedzi API ani danych osobowych.
- Zmiana narzędzia = nowy commit, a aplikacje podnoszą przypięty SHA, kiedy chcą.
- W katalogu narzędzia nie ma niczego specyficznego dla aplikacji (test to sprawdza).

## Testy

`node --test testy/asc-kontrola.test.mjs` (Node 22).

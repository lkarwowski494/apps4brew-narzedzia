// Rejestr kontroli. Dodanie kontroli = nowy plik w tym katalogu (albo wpis w istniejącym) + jedna linia tutaj + oczekiwana wartość w konfiguracji aplikacji.
// Kontrola ma kształt:
//   { id, obszar, nazwa, zasoby: ['GET /v1/…'], dotyczy: config => boolean, pobierz: async kontekst => dane, porownaj: (dane, kontekst) => [wiersz…] }
// gdzie wiersz = wiersz(STATUS, opis, szczegoly?) z wspolne.mjs. `pobierz` tylko czyta (kontekst.mjs); `porownaj` jest czystą funkcją (testy na atrapach).
import { kontrole as ceny } from './ceny.mjs';
import { kontrole as oferty } from './oferty.mjs';
import { kontrole as adresy } from './adresy.mjs';
import { kontrole as metadane } from './metadane.mjs';
import { kontrole as aplikacja } from './aplikacja.mjs';
import { kontrole as produkty } from './produkty.mjs';
import { kontrole as recenzent } from './recenzent.mjs';

export const KONTROLE = [...ceny, ...oferty, ...produkty, ...adresy, ...metadane, ...aplikacja, ...recenzent];

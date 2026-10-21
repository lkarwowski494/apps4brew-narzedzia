// App Review Information: kontakt (tylko „ustawione/puste” — dane osobowe nigdy nie trafiają do raportu), konto demo, notatki dla recenzenta.
// Konfiguracja: uwagiRecenzenta { plik, komunikatBraku } — plik tekstowy z oczekiwanymi notatkami; treść notatek nie jest wypisywana.
import { STATUS as S, wiersz, normTekst } from '../wspolne.mjs';

const POLA_KONTAKTU = [['contactFirstName', 'imię'], ['contactLastName', 'nazwisko'], ['contactPhone', 'telefon'], ['contactEmail', 'e-mail']];
export function ocenRecenzenta({ szczegoly, oczekiwaneNotatki, komunikatBraku }) {
  if (!szczegoly) return [wiersz(S.BRAK, 'Informacje dla recenzenta: brak wypełnionej sekcji w App Store Connect')];
  const ustawione = f => !!normTekst(szczegoly[f]);
  const puste = POLA_KONTAKTU.filter(([f]) => !ustawione(f)).map(([, n]) => n);
  const wyniki = [wiersz(puste.length ? S.ROZNICA : S.OK, `Kontakt recenzenta: ${puste.length ? `puste pola: ${puste.join(', ')}` : 'wszystkie pola ustawione'}`)];
  wyniki.push(wiersz(S.INFO, `Konto demo: ${szczegoly.demoAccountRequired ? `wymagane, dane ${ustawione('demoAccountName') && ustawione('demoAccountPassword') ? 'ustawione' : 'PUSTE'}` : 'niewymagane'}`));
  const notatki = normTekst(szczegoly.notes);
  if (oczekiwaneNotatki === null || oczekiwaneNotatki === undefined) wyniki.push(wiersz(S.BRAK, `Notatki dla recenzenta: ${notatki ? 'ustawione' : 'puste'}; ${komunikatBraku ?? 'brak pliku z oczekiwanymi notatkami'}`));
  else wyniki.push(notatki === normTekst(oczekiwaneNotatki) ? wiersz(S.OK, 'Notatki dla recenzenta: zgodne z plikiem') : wiersz(S.ROZNICA, `Notatki dla recenzenta: ${notatki ? 'różnią się od pliku' : 'puste, a plik ma treść'}`));
  return wyniki;
}

export const kontrole = [
  {
    id: 'recenzent', obszar: 'Informacje dla recenzenta', nazwa: 'Kontakt, konto demo, notatki',
    zasoby: ['GET /v1/appStoreVersions/{id}/appStoreReviewDetail'],
    dotyczy: c => !!c.uwagiRecenzenta,
    async pobierz(k) { return { szczegoly: await k.recenzent(), oczekiwaneNotatki: k.czytajTekst(k.config.uwagiRecenzenta.plik) }; },
    porownaj: (d, k) => ocenRecenzenta({ ...d, komunikatBraku: k.config.uwagiRecenzenta.komunikatBraku }),
  },
];

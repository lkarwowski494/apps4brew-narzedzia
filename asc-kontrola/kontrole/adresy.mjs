// Adresy: Privacy Policy URL (App Information, każda lokalizacja) oraz Support URL i Marketing URL (wersja, każda lokalizacja).
// Konfiguracja: adresy { plik } — plik JSON z polami privacyPolicyUrl, supportUrl, marketingUrl (każde opcjonalne: brak pola = nie kontrolujemy).
import { STATUS as S, wiersz, kody, porownajLokalizacje } from '../wspolne.mjs';

const norm = s => String(s ?? '').trim();
export function porownajAdres({ nazwa, wartosci, oczekiwany }) {
  const lokalizacje = Object.keys(wartosci);
  if (!lokalizacje.length) return wiersz(S.BRAK, `${nazwa}: brak lokalizacji w App Store Connect`);
  const { zgodne, rozne } = porownajLokalizacje(wartosci, oczekiwany, norm);
  return rozne.length ? wiersz(S.ROZNICA, `${nazwa}: zgodne ${zgodne} z ${lokalizacje.length}; inne albo puste: ${kody(rozne, 40)}`) : wiersz(S.OK, `${nazwa}: ${lokalizacje.length} lokalizacji zgodnych`);
}
const poLokalizacji = (lista, pole) => Object.fromEntries(lista.map(l => [l.locale, l[pole]]));

export const kontrole = [
  {
    id: 'adresy', obszar: 'Adresy', nazwa: 'Privacy Policy URL, Support URL, Marketing URL',
    zasoby: ['GET /v1/appInfos/{id}/appInfoLocalizations', 'GET /v1/appStoreVersions/{id}/appStoreVersionLocalizations'],
    dotyczy: c => !!c.adresy?.plik,
    async pobierz(k) {
      const oczekiwane = k.czytajJson(k.config.adresy.plik);
      if (!oczekiwane) return { oczekiwane: null };
      return { oczekiwane, info: await k.lokalizacjeInfo(), wersja: await k.lokalizacjeWersji() };
    },
    porownaj(d, k) {
      if (!d.oczekiwane) return [wiersz(S.BRAK, `brak pliku z adresami (${k.config.adresy.plik})`)];
      const wyniki = [];
      const wpisy = [['Privacy Policy URL (App Information)', 'privacyPolicyUrl', d.info], ['Support URL (wersja)', 'supportUrl', d.wersja], ['Marketing URL (wersja)', 'marketingUrl', d.wersja]];
      for (const [nazwa, pole, lista] of wpisy) if (d.oczekiwane[pole]) wyniki.push(porownajAdres({ nazwa, wartosci: poLokalizacji(lista, pole), oczekiwany: d.oczekiwane[pole] }));
      return wyniki;
    },
  },
];

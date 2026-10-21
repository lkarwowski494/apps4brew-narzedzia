// Metadane per lokalizacja: nazwa, podtytuł (App Information) oraz słowa kluczowe, tekst promocyjny, opis (wersja); lista lokalizacji.
// Konfiguracja: metadane { zrodla[], komunikatBraku }. Każde źródło to plik JSON z obiektem „kod lokalizacji → wpis” pod ścieżką `korzen` (np. "names" albo "lokalizacje"; puste = cały plik):
//   { "plik": "…json", "korzen": "lokalizacje", "pola": { "<pole App Store Connect>": "<klucz we wpisie>" | null } }   (null = wpis jest samą wartością tekstową)
// Pola App Store Connect: name, subtitle (App Information) oraz keywords, promotionalText, description (wersja); pole nieopisane w źródłach nie jest kontrolowane.
// Źródeł może być kilka (np. nazwy osobno, podtytuły i słowa osobno). Brak pliku źródła = BRAK DANYCH z komunikatem z konfiguracji, nie błąd. Treści nie trafiają do raportu — tylko kody lokalizacji i nazwy pól.
import { STATUS as S, wiersz, kody, porownajLokalizacje } from '../wspolne.mjs';

const wCiezce = (obj, sciezka) => (sciezka ? sciezka.split('.').reduce((o, k) => o?.[k], obj) : obj);
/** Oczekiwane metadane ze źródeł: { lokalizacje: { kod: { pole: wartość } }, brakujace: [pliki] }. */
export function zbierzOczekiwane(zrodla, czytajJson) {
  const lokalizacje = {}; const brakujace = [];
  for (const z of zrodla) {
    const dane = czytajJson(z.plik);
    if (!dane) { brakujace.push(z.plik); continue; }
    for (const [locale, wpis] of Object.entries(wCiezce(dane, z.korzen) ?? {})) {
      if (locale.startsWith('_')) continue;
      for (const [pole, klucz] of Object.entries(z.pola ?? {})) {
        const v = klucz === null ? wpis : wpis?.[klucz];
        if (typeof v === 'string') (lokalizacje[locale] ??= {})[pole] = v;
      }
    }
  }
  return { lokalizacje, brakujace };
}

const POLA_INFO = [['name', 'Nazwa'], ['subtitle', 'Podtytuł']];
const POLA_WERSJI = [['keywords', 'Słowa kluczowe'], ['promotionalText', 'Tekst promocyjny'], ['description', 'Opis']];

export function porownajMetadane({ oczekiwane, info, wersja }) {
  const wyniki = []; const exp = oczekiwane.lokalizacje ?? {};
  const mamy = new Set([...info.map(l => l.locale), ...wersja.map(l => l.locale)]);
  const brak = Object.keys(exp).filter(l => !mamy.has(l)); const obce = [...mamy].filter(l => !(l in exp));
  wyniki.push(brak.length || obce.length
    ? wiersz(S.ROZNICA, `Lista lokalizacji: brakuje ${brak.length ? kody(brak, 40) : '—'}; nadmiarowe ${obce.length ? kody(obce, 40) : '—'}`, [`w App Store Connect: ${mamy.size}, w pliku: ${Object.keys(exp).length}`])
    : wiersz(S.OK, `Lista lokalizacji: ${mamy.size} zgodnych`));
  for (const [pole, nazwa, lista] of [...POLA_INFO.map(([p, n]) => [p, n, info]), ...POLA_WERSJI.map(([p, n]) => [p, n, wersja])]) {
    const roznePo = []; let sprawdzone = 0;
    for (const [locale, dane] of Object.entries(exp)) {
      if (dane[pole] === undefined) continue;
      const zapisana = lista.find(l => l.locale === locale);
      if (!zapisana) continue; /* brak lokalizacji zgłasza wiersz listy */
      sprawdzone++;
      if (porownajLokalizacje({ [locale]: zapisana[pole] }, dane[pole]).rozne.length) roznePo.push(locale);
    }
    if (sprawdzone) wyniki.push(roznePo.length ? wiersz(S.ROZNICA, `${nazwa}: różni się w ${roznePo.length} z ${sprawdzone}: ${kody(roznePo, 40)}`) : wiersz(S.OK, `${nazwa}: ${sprawdzone} lokalizacji zgodnych`));
  }
  return wyniki;
}

export const kontrole = [
  {
    id: 'metadane', obszar: 'Metadane sklepu', nazwa: 'Nazwa, podtytuł, słowa kluczowe, tekst promocyjny, opis, lokalizacje',
    zasoby: ['GET /v1/appInfos/{id}/appInfoLocalizations', 'GET /v1/appStoreVersions/{id}/appStoreVersionLocalizations'],
    dotyczy: c => !!c.metadane?.zrodla?.length,
    async pobierz(k) {
      const oczekiwane = zbierzOczekiwane(k.config.metadane.zrodla, k.czytajJson);
      return { oczekiwane, info: await k.lokalizacjeInfo(), wersja: await k.lokalizacjeWersji() };
    },
    porownaj(d, k) {
      const { lokalizacje, brakujace } = d.oczekiwane; const wyniki = [];
      if (brakujace.length) {
        const mamy = [...new Set([...d.info.map(l => l.locale), ...d.wersja.map(l => l.locale)])].sort();
        wyniki.push(wiersz(S.BRAK, `${k.config.metadane.komunikatBraku ?? 'brak pliku z oczekiwanymi metadanymi'}; brakujące pliki: ${brakujace.length} z ${k.config.metadane.zrodla.length}; w App Store Connect lokalizacji: ${mamy.length}`, [`brakujące: ${brakujace.join(', ')}`, `lokalizacje: ${mamy.join(', ')}`]));
      }
      if (Object.keys(lokalizacje).length) wyniki.push(...porownajMetadane({ oczekiwane: { lokalizacje }, info: d.info, wersja: d.wersja }));
      return wyniki;
    },
  },
];

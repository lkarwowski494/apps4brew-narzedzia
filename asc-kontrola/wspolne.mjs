// Czyste funkcje wspólne dla kontroli (bez sieci i bez plików) — testowane na atrapach odpowiedzi API.
export const STATUS = { OK: 'OK', ROZNICA: 'RÓŻNICA', BRAK: 'BRAK DANYCH', RECZNIE: 'TYLKO RĘCZNIE', INFO: 'INFO', BLAD: 'BŁĄD' };
/** Statusy, które dają kod wyjścia 1 (czerwony przebieg). BRAK DANYCH, TYLKO RĘCZNIE i INFO nie są różnicą. */
export const CZERWONE = new Set([STATUS.ROZNICA, STATUS.BLAD]);

export const wiersz = (status, opis, szczegoly, zawsze = false) => ({ status, opis, ...(szczegoly?.length ? { szczegoly } : {}), ...(zawsze ? { zawszeSzczegoly: true } : {}) });
export const kwota = n => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : String(n));
export const rowneKwoty = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
export const normTekst = s => String(s ?? '').replace(/\r\n?/g, '\n').trim();
/** Lista kodów skrócona do `max` pozycji (reszta jako „+N”), chyba że pełna. */
export const kody = (lista, max = 12) => (lista.length <= max ? lista.join(', ') : `${lista.slice(0, max).join(', ')} +${lista.length - max}`);

/** Zasoby dołączone (`included`) jako mapa „typ:id” → zasób. */
export const indeks = included => new Map((included ?? []).map(z => [`${z.type}:${z.id}`, z]));
const relId = (zasob, nazwa) => zasob.relationships?.[nazwa]?.data?.id ?? null;

/**
 * Ceny (subskrypcji albo zakupu jednorazowego) → wiersze { terytorium, od, do, kwota }. Wymaga `include=…PricePoint,territory`;
 * nazwa relacji punktu cenowego: subskrypcja `subscriptionPricePoint`, zakup `inAppPurchasePricePoint`.
 */
export function wierszeCen({ data, included }, relacjaPunktu, typPunktu) {
  const idx = indeks(included);
  return data.map(c => {
    const punkt = idx.get(`${typPunktu}:${relId(c, relacjaPunktu)}`);
    return { terytorium: relId(c, 'territory'), od: c.attributes?.startDate ?? null, do: c.attributes?.endDate ?? null, kwota: punkt ? Number(punkt.attributes?.customerPrice) : NaN };
  }).filter(w => w.terytorium);
}

/** Cena obowiązująca dziś w każdym terytorium: najnowsza z już rozpoczętych i niezakończonych. Zwraca Map terytorium → kwota. */
export function biezaceCeny(wiersze, dzis) {
  const wynik = new Map(); const od = new Map();
  for (const w of wiersze) {
    if (w.od && w.od > dzis) continue;
    if (w.do && w.do < dzis) continue;
    const stary = od.get(w.terytorium);
    if (stary === undefined || (w.od ?? '') >= stary) { od.set(w.terytorium, w.od ?? ''); wynik.set(w.terytorium, w.kwota); }
  }
  return wynik;
}

/** Oczekiwana kwota dla terytorium: wpis własny, a gdy go nie ma — wpis grupy, do której terytorium należy (np. strefa euro). undefined = nie ustalono. */
export function oczekiwanaKwota(oczekiwane, terytorium, grupy = {}) {
  if (Object.prototype.hasOwnProperty.call(oczekiwane, terytorium)) return oczekiwane[terytorium];
  for (const [g, lista] of Object.entries(grupy)) if (lista.includes(terytorium) && Object.prototype.hasOwnProperty.call(oczekiwane, g)) return oczekiwane[g];
  return undefined;
}

/** Porównanie jednej wartości tekstowej w wielu lokalizacjach: zwraca { zgodne, rozne: [locale], puste: [locale] }. */
export function porownajLokalizacje(zapisane, oczekiwana, norm = normTekst) {
  const rozne = []; const puste = []; let zgodne = 0;
  for (const [locale, wartosc] of Object.entries(zapisane)) {
    const w = norm(wartosc);
    if (!w) puste.push(locale);
    if (w === norm(oczekiwana)) zgodne++; else rozne.push(locale);
  }
  return { zgodne, rozne, puste };
}

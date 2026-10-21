// Kontrole cen: subskrypcje i zakup jednorazowy w wybranych terytoriach oraz w grupach terytoriów (np. strefa euro).
// Konfiguracja: produkty[], terytoria.wybrane[], terytoria.grupy{}, ceny{klucz → {terytorium|grupa → kwota|null}}. null = „nie ustalono” (tylko wypisz).
import { STATUS as S, wiersz, kwota, rowneKwoty, kody, biezaceCeny, oczekiwanaKwota } from '../wspolne.mjs';

export function porownajCeny({ klucz, wiersze, config, dzis }) {
  const oczekiwane = config.ceny?.[klucz] ?? {}; const grupy = config.terytoria?.grupy ?? {};
  const biezace = biezaceCeny(wiersze, dzis); const wyniki = [];
  for (const t of config.terytoria?.wybrane ?? []) {
    const jest = biezace.get(t); const chce = oczekiwanaKwota(oczekiwane, t, grupy);
    if (jest === undefined || Number.isNaN(jest)) wyniki.push(wiersz(S.BRAK, `${klucz} ${t}: brak ceny bieżącej`));
    else if (chce === undefined || chce === null) wyniki.push(wiersz(S.INFO, `${klucz} ${t}: ${kwota(jest)} (oczekiwana nie ustalona)`));
    else wyniki.push(rowneKwoty(jest, chce) ? wiersz(S.OK, `${klucz} ${t}: ${kwota(jest)}`) : wiersz(S.ROZNICA, `${klucz} ${t}: jest ${kwota(jest)}, oczekiwane ${kwota(chce)}`));
  }
  for (const [g, lista] of Object.entries(grupy)) {
    const chce = Object.prototype.hasOwnProperty.call(oczekiwane, g) ? oczekiwane[g] : undefined;
    if (chce === undefined) continue; /* grupa bez wpisu w ceny[klucz] — nie dotyczy tego produktu */
    const poKwocie = new Map(); const brak = [];
    for (const t of lista) {
      const c = biezace.get(t);
      if (c === undefined || Number.isNaN(c)) brak.push(t); else { const key = kwota(c); poKwocie.set(key, [...(poKwocie.get(key) ?? []), t]); }
    }
    const opisRoznic = [...poKwocie].map(([c, ts]) => `${c}: ${kody(ts, 30)}`);
    const rozne = poKwocie.size > 1; const zla = chce !== null && [...poKwocie.keys()].some(c => !rowneKwoty(c, chce));
    const opis = `${klucz} grupa ${g} (${lista.length}): ${rozne ? `RÓŻNE KWOTY — ${opisRoznic.join('; ')}` : poKwocie.size ? `jedna kwota ${[...poKwocie.keys()][0]}` : 'brak cen'}${brak.length ? `; bez ceny: ${kody(brak, 30)}` : ''}${chce === null ? ' (oczekiwana nie ustalona)' : ''}`;
    wyniki.push(wiersz(chce === null ? S.INFO : zla || brak.length ? S.ROZNICA : S.OK, opis));
  }
  return wyniki;
}

export const kontrole = [
  {
    id: 'ceny', obszar: 'Ceny', nazwa: 'Ceny produktów (bieżące)',
    zasoby: ['GET /v1/subscriptions/{id}/prices', 'GET /v2/inAppPurchases/{id}/iapPriceSchedule', 'GET /v1/inAppPurchasePriceSchedules/{id}/manualPrices', 'GET /v1/inAppPurchasePriceSchedules/{id}/automaticPrices'],
    dotyczy: c => (c.produkty ?? []).some(p => c.ceny?.[p.klucz]),
    async pobierz(k) { const o = {}; for (const p of k.config.produkty.filter(p => k.config.ceny?.[p.klucz])) o[p.klucz] = await k.ceny(p.klucz); return o; },
    porownaj: (dane, k) => Object.entries(dane).flatMap(([klucz, wiersze]) => porownajCeny({ klucz, wiersze, config: k.config, dzis: k.dzis })),
  },
];

// Oferty wprowadzające subskrypcji: tryb, czas, wszystkie terytoria (te, w których subskrypcja ma cenę), bez daty końca.
// Konfiguracja: oferta { produkty[], tryb (np. FREE_TRIAL), czas (np. TWO_WEEKS), bezDatyKonca } albo { produkty[], brak: true } — model bez oferty wprowadzającej.
import { STATUS as S, wiersz, kody } from '../wspolne.mjs';

export function porownajOferty({ klucz, oferty, terytoriaCen, oczekiwana }) {
  if (!terytoriaCen.size) return [wiersz(S.BRAK, `${klucz}: subskrypcja nie ma cen — nie da się ustalić listy terytoriów`)];
  if (oczekiwana.brak === true) {
    if (!oferty.length) return [wiersz(S.OK, `${klucz}: brak ofert wprowadzających (zgodnie z konfiguracją)`)];
    const t = oferty.map(o => o.relationships?.territory?.data?.id).filter(Boolean);
    return [wiersz(S.ROZNICA, `${klucz}: oczekiwany brak ofert wprowadzających, są w ${t.length} terytoriach: ${kody(t)} — usuń w App Store Connect (subskrypcja → Introductory Offers)`)];
  }
  if (!oferty.length) return [wiersz(S.ROZNICA, `${klucz}: brak ofert wprowadzających`)];
  const maTeryt = new Map(oferty.map(o => [o.relationships?.territory?.data?.id, o.attributes ?? {}]));
  const zlyTryb = [...maTeryt].filter(([, a]) => a.offerMode !== oczekiwana.tryb).map(([t]) => t);
  const zlyCzas = [...maTeryt].filter(([, a]) => a.duration !== oczekiwana.czas).map(([t]) => t);
  const zKoncem = oczekiwana.bezDatyKonca === false ? [] : [...maTeryt].filter(([, a]) => a.endDate).map(([t]) => t);
  const brak = [...terytoriaCen].filter(t => !maTeryt.has(t));
  const problemy = [];
  if (zlyTryb.length) problemy.push(`inny tryb niż ${oczekiwana.tryb}: ${kody(zlyTryb)}`);
  if (zlyCzas.length) problemy.push(`inny czas niż ${oczekiwana.czas}: ${kody(zlyCzas)}`);
  if (zKoncem.length) problemy.push(`z datą końca: ${kody(zKoncem)}`);
  if (brak.length) problemy.push(`bez oferty (${brak.length}): ${kody(brak)}`);
  const sz = [`terytoria z ofertą: ${maTeryt.size}, terytoria z ceną: ${terytoriaCen.size}`];
  return [problemy.length ? wiersz(S.ROZNICA, `${klucz}: ${problemy.join('; ')}`, sz) : wiersz(S.OK, `${klucz}: ${oczekiwana.tryb}, ${oczekiwana.czas}, ${maTeryt.size} terytoriów, bez daty końca`, sz)];
}

export const kontrole = [
  {
    id: 'oferty', obszar: 'Oferty wprowadzające', nazwa: 'Oferty wprowadzające subskrypcji',
    zasoby: ['GET /v1/subscriptions/{id}/introductoryOffers', 'GET /v1/subscriptions/{id}/prices'],
    dotyczy: c => !!c.oferta?.produkty?.length,
    async pobierz(k) { const o = {}; for (const klucz of k.config.oferta.produkty) o[klucz] = { oferty: await k.oferty(klucz), terytoriaCen: new Set((await k.ceny(klucz)).map(w => w.terytorium)) }; return o; },
    porownaj: (dane, k) => Object.entries(dane).flatMap(([klucz, d]) => porownajOferty({ klucz, ...d, oczekiwana: k.config.oferta })),
  },
];

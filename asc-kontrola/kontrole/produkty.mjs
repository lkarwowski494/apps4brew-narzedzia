// Ustawienia produktów: Family Sharing (atrybut familySharable subskrypcji i zakupu jednorazowego).
// Konfiguracja: rodzina { klucz produktu → true|false }.
import { STATUS as S, wiersz } from '../wspolne.mjs';

export function porownajRodzine({ klucz, jest, oczekiwane }) {
  if (typeof jest !== 'boolean') return wiersz(S.BRAK, `Family Sharing ${klucz}: brak atrybutu w odpowiedzi API`);
  return jest === oczekiwane ? wiersz(S.OK, `Family Sharing ${klucz}: ${jest ? 'włączone' : 'wyłączone'}`) : wiersz(S.ROZNICA, `Family Sharing ${klucz}: jest ${jest ? 'włączone' : 'wyłączone'}, oczekiwane ${oczekiwane ? 'włączone' : 'wyłączone'}`);
}

export const kontrole = [
  {
    id: 'rodzina', obszar: 'Produkty', nazwa: 'Family Sharing',
    zasoby: ['GET /v1/subscriptionGroups/{id}/subscriptions (familySharable)', 'GET /v1/apps/{id}/inAppPurchasesV2 (familySharable)'],
    dotyczy: c => !!c.rodzina && Object.keys(c.rodzina).length > 0,
    async pobierz(k) {
      const o = {};
      for (const klucz of Object.keys(k.config.rodzina)) { const p = k.produkt(klucz); o[klucz] = (p.rodzaj === 'subskrypcja' ? await k.subskrypcja(klucz) : await k.zakup(klucz)).attributes?.familySharable; }
      return o;
    },
    porownaj: (dane, k) => Object.entries(dane).map(([klucz, jest]) => porownajRodzine({ klucz, jest, oczekiwane: k.config.rodzina[klucz] })),
  },
];

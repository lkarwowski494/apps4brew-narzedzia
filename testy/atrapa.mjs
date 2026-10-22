// Napęd testów kontroli App Store Connect (testy/asc-kontrola.test.mjs): atrapa API w procesie potomnym (moduły narzędzia to ESM z import.meta).
// Użycie: node asc-kontrola-driver.mjs <tryb>; wynik: JSON na standardowym wyjściu.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = join(root, 'asc-kontrola');
const { uruchom, raport } = await import(join(N, 'kontrola.mjs'));
const { makeReadClient, makeJwt, safePath } = await import(join(N, 'klient.mjs'));
const w = await import(join(N, 'wspolne.mjs'));
const { wybierzWedlugStanu } = await import(join(N, 'kontekst.mjs'));
const { porownajMetadane } = await import(join(N, 'kontrole/metadane.mjs'));
const { KONTROLE } = await import(join(N, 'kontrole/index.mjs'));
const { generateKeyPairSync, verify } = await import('node:crypto');

const mode = process.argv[2];
const config = JSON.parse(readFileSync(join(root, 'testy/przyklad/konfiguracja.json'), 'utf8'));
const DZIS = '2026-10-21';
const EURO = config.terytoria.grupy.strefaEuro;
const WSZYSTKIE = [...new Set([...config.terytoria.wybrane, ...EURO, 'JPN', 'CAN'])];

/** Cena, jaką atrapa zwraca dla produktu i terytorium: oczekiwana z konfiguracji (null → 1.11), z modyfikacjami scenariusza. */
function cena(klucz, t) {
  const exp = config.ceny[klucz]; let v = w.oczekiwanaKwota(exp, t, config.terytoria.grupy);
  if (v === undefined || v === null) v = 1.11;
  if (mode === 'cena-pl' && klucz === 'yearly' && t === 'POL') v = 24.99;
  if (mode === 'euro-rozne' && klucz === 'yearly' && t === 'AUT') v = 8.99;
  return v;
}
let seq = 0;
function ceny(klucz, typ, relPunkt, typPunktu) {
  const data = []; const included = [];
  for (const t of WSZYSTKIE) {
    const id = `pp${++seq}`;
    included.push({ type: typPunktu, id, attributes: { customerPrice: cena(klucz, t).toFixed(2) } });
    data.push({ type: typ, id: `pr${seq}`, attributes: { startDate: null }, relationships: { [relPunkt]: { data: { type: typPunktu, id } }, territory: { data: { type: 'territories', id: t } } } });
    if (mode === 'cena-historia' && klucz === 'yearly' && t === 'USA') { /* stara cena (zakończona) i przyszła cena nie mogą wpływać na bieżącą */
      const a = `pp${++seq}`; included.push({ type: typPunktu, id: a, attributes: { customerPrice: '3.33' } });
      data.push({ type: typ, id: `pr${seq}`, attributes: { startDate: '2020-01-01', endDate: '2020-02-01' }, relationships: { [relPunkt]: { data: { type: typPunktu, id: a } }, territory: { data: { type: 'territories', id: 'USA' } } } });
      const b = `pp${++seq}`; included.push({ type: typPunktu, id: b, attributes: { customerPrice: '9.99' } });
      data.push({ type: typ, id: `pr${seq}`, attributes: { startDate: '2027-01-01' }, relationships: { [relPunkt]: { data: { type: typPunktu, id: b } }, territory: { data: { type: 'territories', id: 'USA' } } } });
    }
  }
  return { data, included };
}
const oferty = klucz => ({ data: WSZYSTKIE.filter(t => !(mode === 'oferta-brak' && klucz === 'yearly' && t === 'JPN')).map(t => ({ type: 'subscriptionIntroductoryOffers', id: `o${klucz}${t}`, attributes: { offerMode: mode === 'oferta-tryb' && klucz === 'monthly' && t === 'USA' ? 'PAY_AS_YOU_GO' : 'FREE_TRIAL', duration: 'TWO_WEEKS', numberOfPeriods: 1, startDate: null, endDate: mode === 'oferta-koniec' && t === 'POL' ? '2027-01-01' : null }, relationships: { territory: { data: { type: 'territories', id: t } } } })) });

const OSOBOWE = ['Jan-Imie-Tajne', 'Kowalski-Tajne', '+48-600-TAJNY', 'recenzent-tajny@example.test'];
const NOTATKI = 'Notatki dla recenzenta.\nDrugi wiersz.';
const urls = JSON.parse(readFileSync(join(root, 'testy/przyklad/adresy.json'), 'utf8'));
const LOKALE = ['en-US', 'pl', 'en-AU', 'en-CA'];
const META = { lokalizacje: Object.fromEntries(LOKALE.map(l => [l, { name: `Nazwa ${l}`, subtitle: `Podtytuł ${l}`, keywords: `k1,k2,${l}`, promotionalText: `Promo ${l}`, description: `Opis ${l}\nlinia` }])) };

const wywolania = [];
const ODP = (status, body) => ({ ok: status < 400, status, json: async () => body });
const fakeFetch = async (url, init = {}) => {
  const m = init.method || 'GET'; const u = new URL(url); const p = u.pathname; wywolania.push(m + ' ' + p);
  if (mode === 'blad-403') return ODP(403, { errors: [{ code: 'FORBIDDEN_ERROR', title: 'Forbidden', detail: 'SEKRET-SZCZEGOL' }] });
  if (p === '/v1/apps') return ODP(200, { data: [{ id: '111222', attributes: {} }] });
  if (p === '/v1/apps/111222/subscriptionGroups') return ODP(200, { data: [{ id: 'GRP-1' }] });
  if (p === '/v1/subscriptionGroups/GRP-1/subscriptions') return ODP(200, { data: config.produkty.filter(x => x.rodzaj === 'subskrypcja').map((x, i) => ({ id: `SUB-${i}`, attributes: { productId: x.productId, familySharable: !(mode === 'rodzina' && x.klucz === 'yearly') } })) });
  const sub = p.match(/^\/v1\/subscriptions\/SUB-(\d)\/(prices|introductoryOffers)$/);
  if (sub) { const klucz = config.produkty.filter(x => x.rodzaj === 'subskrypcja')[Number(sub[1])].klucz; return ODP(200, sub[2] === 'prices' ? ceny(klucz, 'subscriptionPrices', 'subscriptionPricePoint', 'subscriptionPricePoints') : oferty(klucz)); }
  if (p === '/v1/apps/111222/inAppPurchasesV2') return ODP(200, { data: [{ id: 'IAP-1', attributes: { productId: config.produkty.find(x => x.rodzaj === 'jednorazowy').productId, familySharable: true } }] });
  if (p === '/v2/inAppPurchases/IAP-1/iapPriceSchedule') return ODP(200, { data: { id: 'PS-1' } });
  if (p === '/v1/inAppPurchasePriceSchedules/PS-1/manualPrices') return ODP(200, ceny('lifetime', 'inAppPurchasePrices', 'inAppPurchasePricePoint', 'inAppPurchasePricePoints'));
  if (p === '/v1/inAppPurchasePriceSchedules/PS-1/automaticPrices') return ODP(200, { data: [], included: [] });
  if (p === '/v1/apps/111222/appInfos') return ODP(200, { data: [{ id: 'INFO-1', attributes: { state: 'PREPARE_FOR_SUBMISSION', appStoreAgeRating: 'FOUR_PLUS' }, relationships: { primaryCategory: { data: { id: mode === 'kategoria' ? 'LIFESTYLE' : 'HEALTH_AND_FITNESS' } }, secondaryCategory: { data: null } } }] });
  if (p === '/v1/appInfos/INFO-1/appInfoLocalizations') return ODP(200, { data: LOKALE.map(l => ({ attributes: { locale: l, name: mode === 'meta-roznica' && l === 'pl' ? 'Inna nazwa' : META.lokalizacje[l].name, subtitle: META.lokalizacje[l].subtitle, privacyPolicyUrl: mode === 'adres-roznica' && l === 'pl' ? 'https://example.test/stary' : urls.privacyPolicyUrl } })) });
  if (p === '/v1/appInfos/INFO-1/ageRatingDeclaration') return ODP(200, { data: { attributes: { gambling: false, violenceRealistic: 'NONE', healthOrWellnessTopics: true, ageRatingOverrideV2: 'NONE' } } });
  if (p === '/v1/apps/111222/appStoreVersions') return ODP(200, { data: [{ id: 'VER-0', attributes: { appVersionState: 'READY_FOR_DISTRIBUTION', createdDate: '2026-01-01' } }, { id: 'VER-1', attributes: { appVersionState: 'PREPARE_FOR_SUBMISSION', createdDate: '2026-10-01' } }] });
  if (p === '/v1/appStoreVersions/VER-1/appStoreVersionLocalizations') return ODP(200, { data: LOKALE.filter(l => !(mode === 'meta-lokale' && l === 'en-CA')).map(l => ({ attributes: { locale: l, ...META.lokalizacje[l], supportUrl: urls.supportUrl, marketingUrl: urls.marketingUrl, keywords: mode === 'meta-roznica' && l === 'en-US' ? 'inne' : META.lokalizacje[l].keywords } })) });
  if (p === '/v1/appStoreVersions/VER-1/appStoreReviewDetail') return ODP(200, { data: { attributes: { contactFirstName: OSOBOWE[0], contactLastName: OSOBOWE[1], contactPhone: mode === 'recenzent-puste' ? '' : OSOBOWE[2], contactEmail: OSOBOWE[3], demoAccountRequired: false, notes: mode === 'notatki-roznica' ? 'Inne notatki' : NOTATKI } } });
  if (p === '/v1/apps/111222/appAvailabilityV2' && mode === 'dostepnosc-404') return ODP(404, { errors: [{ code: 'NOT_FOUND', title: 'The specified resource does not exist', detail: 'SEKRET-SZCZEGOL' }] }); /* przebieg 21.10.2026: aplikacja bez ustawionej dostępności */
  if (p === '/v1/apps/111222/appAvailabilityV2') return ODP(200, { data: { id: 'AVAIL-1' } });
  if (p === '/v2/appAvailabilities/AVAIL-1/territoryAvailabilities') return ODP(200, { data: WSZYSTKIE.map(t => ({ attributes: { available: true }, relationships: { territory: { data: { id: t } } } })) });
  return ODP(404, { errors: [] });
};

const out = {};
if (mode === 'jwt') {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwt = makeJwt({ keyId: 'KID1234567', issuerId: 'ISSUER', keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }), now: 1000 });
  const [h, b, s] = jwt.split('.'); out.header = JSON.parse(Buffer.from(h, 'base64url')); out.payload = JSON.parse(Buffer.from(b, 'base64url'));
  out.valid = verify('sha256', Buffer.from(h + '.' + b), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
} else if (mode === 'czyste') {
  const wiersze = [{ terytorium: 'X', od: null, do: null, kwota: 1 }, { terytorium: 'X', od: '2026-01-01', do: null, kwota: 2 }, { terytorium: 'X', od: '2030-01-01', do: null, kwota: 3 }, { terytorium: 'Y', od: '2019-01-01', do: '2020-01-01', kwota: 4 }];
  out.biezace = [...w.biezaceCeny(wiersze, DZIS)];
  out.oczek = [w.oczekiwanaKwota({ strefaEuro: 7.99, DEU: 8.5 }, 'DEU', { strefaEuro: ['DEU', 'FRA'] }), w.oczekiwanaKwota({ strefaEuro: 7.99 }, 'FRA', { strefaEuro: ['DEU', 'FRA'] }), w.oczekiwanaKwota({ strefaEuro: 7.99 }, 'USA', { strefaEuro: ['DEU'] }), w.oczekiwanaKwota({ GBR: null }, 'GBR', {})];
  out.stan = wybierzWedlugStanu([{ id: 'a', attributes: { appVersionState: 'READY_FOR_DISTRIBUTION' } }, { id: 'b', attributes: { appVersionState: 'IN_REVIEW', createdDate: '2026-01-01' } }, { id: 'c', attributes: { appVersionState: 'IN_REVIEW', createdDate: '2026-02-01' } }]).id;
  out.stanPusty = wybierzWedlugStanu([]);
  out.sciezki = [safePath('/v1/apps/123456789/appInfos?include=x'), safePath('/v1/appInfos/0a1b2c3d-1111-2222-3333-444455556666/ageRatingDeclaration'), safePath('https://api.appstoreconnect.apple.com/v2/appAvailabilities/9876543/territoryAvailabilities')];
  out.metaBrakLokalizacji = porownajMetadane({ oczekiwane: META, info: [{ locale: 'en-US', name: 'Nazwa en-US', subtitle: 'Podtytuł en-US' }, { locale: 'xx', name: 'x' }], wersja: [] }).map(x => [x.status, x.opis]);
  out.lokalizacje = w.porownajLokalizacje({ a: 'x ', b: '', c: 'y' }, 'x');
  out.kody = [w.kody(['A', 'B'], 3), w.kody(['A', 'B', 'C', 'D'], 2)];
  out.kontrole = KONTROLE.map(k => ({ id: k.id, obszar: k.obszar, pola: ['nazwa', 'zasoby', 'dotyczy', 'pobierz', 'porownaj'].filter(f => !k[f] && !(f === 'zasoby' && Array.isArray(k.zasoby))) }));
} else {
  const klient = makeReadClient({ fetchFn: fakeFetch, token: 'TOKEN-XYZ' });
  const pliki = { 'dane/adresy.json': JSON.stringify(urls) };
  if (['meta', 'meta-roznica', 'meta-lokale', 'meta-polowa'].includes(mode)) pliki['dane/nazwy.json'] = JSON.stringify({ _opis: 'x', names: Object.fromEntries(LOKALE.map(l => [l, META.lokalizacje[l].name])) });
  if (['meta', 'meta-roznica', 'meta-lokale'].includes(mode)) pliki['dane/metadane.json'] = JSON.stringify({ _opis: 'x', lokalizacje: Object.fromEntries(LOKALE.map(l => [l, { subtitle: META.lokalizacje[l].subtitle, keywords: META.lokalizacje[l].keywords }])) });
  if (['notatki', 'notatki-roznica'].includes(mode)) pliki['dane/notatki.md'] = NOTATKI + '\n';
  const wynik = await uruchom({ client: klient, config, dzis: DZIS, czytajJson: p => (pliki[p] ? JSON.parse(pliki[p]) : null), czytajTekst: p => pliki[p] ?? null });
  out.code = wynik.code; out.liczby = wynik.liczby; out.wyniki = wynik.wyniki;
  out.raport = raport(wynik, { szczegoly: mode === 'szczegoly', dzis: DZIS });
  out.wywolania = wywolania;
}
process.stdout.write(JSON.stringify(out));

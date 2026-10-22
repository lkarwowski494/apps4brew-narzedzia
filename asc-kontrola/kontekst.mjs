// Kontekst kontroli: konfiguracja aplikacji, klient tylko do odczytu i pobieranie z pamięcią podręczną (jedno żądanie na zasób, bez względu na liczbę kontroli).
// Adresy dokumentacji Apple (odczyt 21.10.2026), zasoby używane w tym pliku:
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-subscriptiongroups
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-subscriptiongroups-_id_-subscriptions
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-subscriptions-_id_-prices
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-subscriptions-_id_-introductoryoffers
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-inapppurchasesv2
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v2-inapppurchases-_id_-iappriceschedule
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-inapppurchasepriceschedules-_id_-manualprices
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-inapppurchasepriceschedules-_id_-automaticprices
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appinfos
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appinfos-_id_-appinfolocalizations
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appinfos-_id_-ageratingdeclaration
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appstoreversions
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstoreversions-_id_-appstoreversionlocalizations
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstoreversions-_id_-appstorereviewdetail
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appavailabilityv2
//   https://developer.apple.com/documentation/appstoreconnectapi/get-v2-appavailabilities-_id_-territoryavailabilities
import { wierszeCen } from './wspolne.mjs';

/** Kolejność wyboru wersji App Store do kontroli: najpierw ta, którą można jeszcze edytować, na końcu opublikowana. */
export const KOLEJNOSC_STANOW = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'PENDING_APPLE_RELEASE', 'READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'];
const stanOf = z => z.attributes?.appVersionState ?? z.attributes?.appStoreState ?? z.attributes?.state ?? '';
/** Wybór zasobu w najlepszym stanie wg KOLEJNOSC_STANOW (nieznany stan na końcu); remis rozstrzyga najnowsza data utworzenia. */
export function wybierzWedlugStanu(zasoby) {
  const ranga = z => { const i = KOLEJNOSC_STANOW.indexOf(stanOf(z)); return i < 0 ? KOLEJNOSC_STANOW.length : i; };
  return [...zasoby].sort((a, b) => ranga(a) - ranga(b) || String(b.attributes?.createdDate ?? '').localeCompare(String(a.attributes?.createdDate ?? '')))[0] ?? null;
}

export function makeKontekst({ client, config, dzis, czytajJson = () => null, czytajTekst = () => null }) {
  const cache = new Map();
  const raz = (klucz, f) => { if (!cache.has(klucz)) cache.set(klucz, f()); return cache.get(klucz); };
  const k = {
    config, dzis, client, czytajJson, czytajTekst,
    produkt: klucz => (config.produkty ?? []).find(p => p.klucz === klucz),
    aplikacja: () => raz('app', async () => {
      const { data } = await client.list(`/v1/apps?filter[bundleId]=${encodeURIComponent(config.aplikacja.bundleId)}`);
      if (data.length !== 1) throw new Error(`aplikacja z konfiguracji: znaleziono ${data.length} (oczekiwana 1)`);
      return data[0].id;
    }),
    /** Subskrypcja o danym kluczu produktu (po productId, we wszystkich grupach aplikacji). */
    subskrypcja: klucz => raz('sub:' + klucz, async () => {
      const p = k.produkt(klucz); const app = await k.aplikacja();
      const grupy = (await client.list(`/v1/apps/${app}/subscriptionGroups`)).data;
      for (const g of grupy) {
        const sub = (await client.list(`/v1/subscriptionGroups/${g.id}/subscriptions`)).data.find(s => s.attributes?.productId === p.productId);
        if (sub) return sub;
      }
      throw new Error(`brak subskrypcji ${p.productId} w App Store Connect`);
    }),
    zakup: klucz => raz('iap:' + klucz, async () => {
      const p = k.produkt(klucz); const app = await k.aplikacja();
      const zakup = (await client.list(`/v1/apps/${app}/inAppPurchasesV2?filter[productId]=${encodeURIComponent(p.productId)}`)).data.find(s => s.attributes?.productId === p.productId);
      if (!zakup) throw new Error(`brak produktu ${p.productId} w App Store Connect`);
      return zakup;
    }),
    /** Wiersze cen produktu (wszystkie terytoria, także historyczne i przyszłe): { terytorium, od, do, kwota }. */
    ceny: klucz => raz('ceny:' + klucz, async () => {
      const p = k.produkt(klucz);
      if (p.rodzaj === 'subskrypcja') {
        const sub = await k.subskrypcja(klucz);
        return wierszeCen(await client.list(`/v1/subscriptions/${sub.id}/prices?include=subscriptionPricePoint,territory`), 'subscriptionPricePoint', 'subscriptionPricePoints');
      }
      const zakup = await k.zakup(klucz);
      const harmonogram = (await client.get(`/v2/inAppPurchases/${zakup.id}/iapPriceSchedule`))?.data;
      if (!harmonogram) return [];
      const reczne = wierszeCen(await client.list(`/v1/inAppPurchasePriceSchedules/${harmonogram.id}/manualPrices?include=inAppPurchasePricePoint,territory`), 'inAppPurchasePricePoint', 'inAppPurchasePricePoints');
      const auto = wierszeCen(await client.list(`/v1/inAppPurchasePriceSchedules/${harmonogram.id}/automaticPrices?include=inAppPurchasePricePoint,territory`), 'inAppPurchasePricePoint', 'inAppPurchasePricePoints');
      return [...auto, ...reczne]; /* ręczna cena z tą samą datą początku wygrywa (biezaceCeny bierze ostatnią przy remisie) */
    }),
    oferty: klucz => raz('oferty:' + klucz, async () => {
      const sub = await k.subskrypcja(klucz);
      return (await client.list(`/v1/subscriptions/${sub.id}/introductoryOffers?include=territory`)).data;
    }),
    infoAplikacji: () => raz('info', async () => {
      const app = await k.aplikacja();
      const { data, included } = await client.list(`/v1/apps/${app}/appInfos?include=primaryCategory,secondaryCategory`);
      const info = wybierzWedlugStanu(data);
      if (!info) throw new Error('brak App Information');
      return { info, stan: stanOf(info), kategorie: { glowna: info.relationships?.primaryCategory?.data?.id ?? null, dodatkowa: info.relationships?.secondaryCategory?.data?.id ?? null }, included };
    }),
    lokalizacjeInfo: () => raz('lokinfo', async () => {
      const { info } = await k.infoAplikacji();
      return (await client.list(`/v1/appInfos/${info.id}/appInfoLocalizations`)).data.map(l => ({ locale: l.attributes.locale, ...l.attributes }));
    }),
    deklaracjaWieku: () => raz('wiek', async () => {
      const { info } = await k.infoAplikacji();
      return { ocena: info.attributes?.appStoreAgeRating ?? null, deklaracja: (await client.get(`/v1/appInfos/${info.id}/ageRatingDeclaration`))?.data?.attributes ?? null };
    }),
    wersja: () => raz('wersja', async () => {
      const app = await k.aplikacja();
      const { data } = await client.list(`/v1/apps/${app}/appStoreVersions?filter[platform]=IOS`);
      const w = wybierzWedlugStanu(data);
      if (!w) throw new Error('brak wersji App Store (iOS)');
      return { wersja: w, stan: stanOf(w) };
    }),
    lokalizacjeWersji: () => raz('lokwersji', async () => {
      const { wersja } = await k.wersja();
      return (await client.list(`/v1/appStoreVersions/${wersja.id}/appStoreVersionLocalizations`)).data.map(l => ({ locale: l.attributes.locale, ...l.attributes }));
    }),
    recenzent: () => raz('recenzent', async () => {
      const { wersja } = await k.wersja();
      return (await client.get(`/v1/appStoreVersions/${wersja.id}/appStoreReviewDetail`))?.data?.attributes ?? null;
    }),
    dostepnosc: () => raz('dostepnosc', async () => {
      const app = await k.aplikacja();
      let a;
      try { a = (await client.get(`/v1/apps/${app}/appAvailabilityV2`))?.data; }
      catch (e) { if (e.status === 404) return { nieustawiona: true }; throw e; } /* 404: zasób powstaje dopiero po zapisaniu dostępności aplikacji w App Store Connect (przebieg 21.10.2026) */
      if (!a) return [];
      const { data } = await client.list(`/v2/appAvailabilities/${a.id}/territoryAvailabilities?include=territory`);
      return data.map(t => ({ terytorium: t.relationships?.territory?.data?.id, dostepne: t.attributes?.available === true }));
    }),
  };
  return k;
}

// Ustawienia aplikacji: kategorie, ocena wiekowa (tylko wypisanie odpowiedzi), dostępność w krajach, etykieta prywatności (tylko ręcznie).
import { STATUS as S, wiersz, kody } from '../wspolne.mjs';

export function porownajKategorie({ kategorie, oczekiwane }) {
  const wyniki = [];
  for (const [pole, nazwa] of [['glowna', 'Kategoria główna'], ['dodatkowa', 'Kategoria dodatkowa']]) {
    const jest = kategorie[pole]; const chce = oczekiwane?.[pole];
    if (chce === undefined || chce === null) wyniki.push(wiersz(S.INFO, `${nazwa}: ${jest ?? 'brak'} (oczekiwana nie ustalona)`));
    else wyniki.push(jest === chce ? wiersz(S.OK, `${nazwa}: ${jest}`) : wiersz(S.ROZNICA, `${nazwa}: jest ${jest ?? 'brak'}, oczekiwane ${chce}`));
  }
  return wyniki;
}

/** Odpowiedzi deklaracji wieku: wszystkie pola w szczegółach, w opisie tylko te inne niż NONE/false. */
export function opiszWiek({ ocena, deklaracja }, oczekiwane) {
  if (!deklaracja) return [wiersz(S.BRAK, 'Ocena wiekowa: brak deklaracji w App Store Connect')];
  const pola = Object.entries(deklaracja).sort(([a], [b]) => a.localeCompare(b));
  const ustawione = pola.filter(([, v]) => v !== 'NONE' && v !== false && v !== null && v !== undefined).map(([k, v]) => `${k}=${v}`);
  const sz = pola.map(([k, v]) => `${k} = ${v}`);
  const roznice = oczekiwane ? Object.entries(oczekiwane).filter(([k, v]) => deklaracja[k] !== v).map(([k]) => k) : [];
  if (roznice.length) return [wiersz(S.ROZNICA, `Ocena wiekowa: różnią się odpowiedzi: ${kody(roznice, 30)}`, sz)];
  return [wiersz(oczekiwane ? S.OK : S.INFO, `Ocena wiekowa: ${ocena ?? 'brak oceny'}; odpowiedzi inne niż „brak/nie”: ${ustawione.length ? ustawione.join(', ') : 'żadne'}`, sz)];
}

export function porownajDostepnosc({ terytoria, oczekiwane }) {
  if (terytoria?.nieustawiona) return [wiersz(S.BRAK, 'Dostępność w krajach: brak zapisu dostępności aplikacji (GET appAvailabilityV2 → 404; Apple nie opisuje tego kodu — najczęściej dostępność nieustawiona); sprawdź i zapisz: App Store Connect → aplikacja → Ceny i dostępność (Pricing and Availability) → Dostępność aplikacji, potem uruchom kontrolę ponownie')];
  const dostepne = terytoria.filter(t => t.dostepne).map(t => t.terytorium).sort();
  const lista = [`dostępne (${dostepne.length}): ${dostepne.join(' ')}`];
  if (!terytoria.length) return [wiersz(S.BRAK, 'Dostępność w krajach: brak danych z App Store Connect')];
  if (!Array.isArray(oczekiwane)) return [wiersz(S.INFO, `Dostępność w krajach: ${dostepne.length} z ${terytoria.length} (decyzja o liście nie zapisana)`, lista, true)];
  const brak = oczekiwane.filter(t => !dostepne.includes(t)); const nadmiar = dostepne.filter(t => !oczekiwane.includes(t));
  return [brak.length || nadmiar.length ? wiersz(S.ROZNICA, `Dostępność w krajach: brakuje ${brak.length ? kody(brak, 30) : '—'}; nadmiarowe ${nadmiar.length ? kody(nadmiar, 30) : '—'}`, lista, true) : wiersz(S.OK, `Dostępność w krajach: ${dostepne.length} zgodnych z listą`, lista, true)];
}

export const kontrole = [
  {
    id: 'kategorie', obszar: 'Aplikacja', nazwa: 'Kategorie',
    zasoby: ['GET /v1/apps/{id}/appInfos?include=primaryCategory,secondaryCategory'],
    dotyczy: c => !!c.kategoria,
    pobierz: async k => (await k.infoAplikacji()).kategorie,
    porownaj: (kategorie, k) => porownajKategorie({ kategorie, oczekiwane: k.config.kategoria }),
  },
  {
    id: 'wiek', obszar: 'Aplikacja', nazwa: 'Ocena wiekowa (wypisanie odpowiedzi)',
    zasoby: ['GET /v1/appInfos/{id}/ageRatingDeclaration'],
    dotyczy: c => c.wiek !== undefined,
    pobierz: k => k.deklaracjaWieku(),
    porownaj: (d, k) => opiszWiek(d, k.config.wiek?.oczekiwane),
  },
  {
    id: 'dostepnosc', obszar: 'Aplikacja', nazwa: 'Dostępność w krajach',
    zasoby: ['GET /v1/apps/{id}/appAvailabilityV2', 'GET /v2/appAvailabilities/{id}/territoryAvailabilities'],
    dotyczy: c => c.dostepnosc !== undefined,
    pobierz: async k => k.dostepnosc(),
    porownaj: (terytoria, k) => porownajDostepnosc({ terytoria, oczekiwane: k.config.dostepnosc?.terytoria }),
  },
  {
    id: 'prywatnosc', obszar: 'Aplikacja', nazwa: 'Etykieta prywatności (App Privacy)',
    zasoby: [],
    dotyczy: () => true,
    pobierz: async () => null,
    porownaj: () => [wiersz(S.RECZNIE, 'Etykieta prywatności (odpowiedzi „App Privacy”): API App Store Connect jej nie udostępnia (odczyt dokumentacji 21.10.2026) — sprawdzić w App Store Connect → App Privacy; wymagania: https://developer.apple.com/app-store/app-privacy-details/ , lista zasobów API: https://developer.apple.com/documentation/appstoreconnectapi')],
  },
];

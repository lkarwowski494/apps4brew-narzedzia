// Kontrola ustawień App Store Connect — TYLKO ODCZYT. Porównuje to, co jest w App Store Connect, z oczekiwaniami zapisanymi w repozytorium aplikacji
// i wypisuje raport (Markdown). Nic nie zmienia: klient (klient.mjs) wysyła wyłącznie żądania GET.
//   node kontrola.mjs --config <plik-konfiguracji.json> [--szczegoly]
// Dane logowania ze zmiennych środowiskowych: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (plik .p8). Ścieżki z konfiguracji liczone od bieżącego katalogu.
// Kod wyjścia: 0 = brak różnic; 1 = co najmniej jedna RÓŻNICA albo BŁĄD odczytu; 2 = błąd wywołania. BRAK DANYCH, TYLKO RĘCZNIE i INFO nie dają kodu 1.
// Raport nie zawiera identyfikatorów klucza, wystawcy ani aplikacji, tokenów, treści odpowiedzi API ani danych osobowych.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeJwt, makeReadClient } from './klient.mjs';
import { makeKontekst } from './kontekst.mjs';
import { KONTROLE } from './kontrole/index.mjs';
import { STATUS, CZERWONE, wiersz } from './wspolne.mjs';

const komorka = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Uruchamia wszystkie kontrole z konfiguracji. Błąd jednej kontroli nie przerywa pozostałych (wiersz BŁĄD). */
export async function uruchom({ client, config, dzis = new Date().toISOString().slice(0, 10), czytajJson, czytajTekst, kontrole = KONTROLE }) {
  const k = makeKontekst({ client, config, dzis, czytajJson, czytajTekst });
  const wyniki = [];
  for (const kontrola of kontrole) {
    if (!kontrola.dotyczy(config)) continue;
    let wiersze;
    try { wiersze = kontrola.porownaj(await kontrola.pobierz(k), k); }
    catch (e) { wiersze = [wiersz(STATUS.BLAD, `odczyt nieudany: ${String(e.message).slice(0, 200)}`)]; }
    for (const w of wiersze) wyniki.push({ obszar: kontrola.obszar, kontrola: kontrola.nazwa, ...w });
  }
  const liczby = Object.fromEntries(Object.values(STATUS).map(s => [s, wyniki.filter(w => w.status === s).length]));
  return { wyniki, liczby, code: wyniki.some(w => CZERWONE.has(w.status)) ? 1 : 0 };
}

/** Raport Markdown: sekcje według obszaru; szczegóły pod tabelą (zawsze dla wierszy, które tego wymagają, resztę tylko z `szczegoly`). */
export function raport({ wyniki, liczby }, { szczegoly = false, dzis = '' } = {}) {
  const out = [`# Kontrola App Store Connect (tylko odczyt)${dzis ? ` — ${dzis}` : ''}`, ''];
  out.push(`Podsumowanie: ${Object.entries(liczby).map(([s, n]) => `${s} ${n}`).join(', ')}`, '');
  for (const obszar of [...new Set(wyniki.map(w => w.obszar))]) {
    out.push(`## ${obszar}`, '', '| Kontrola | Status | Wynik |', '|---|---|---|');
    const wiersze = wyniki.filter(w => w.obszar === obszar);
    for (const w of wiersze) out.push(`| ${komorka(w.kontrola)} | ${w.status} | ${komorka(w.opis)} |`);
    const sz = wiersze.filter(w => w.szczegoly && (szczegoly || w.zawszeSzczegoly));
    if (sz.length) { out.push(''); for (const w of sz) { out.push(`- ${komorka(w.opis.split(':')[0])}:`); for (const l of w.szczegoly) out.push(`  - ${komorka(l)}`); } }
    out.push('');
  }
  return out.join('\n');
}

async function main() {
  const args = process.argv.slice(2); const i = args.indexOf('--config');
  const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuerId, ASC_KEY_PATH: keyPath } = process.env;
  if (i < 0 || !args[i + 1] || !keyId || !issuerId || !keyPath) { console.error('Użycie: node kontrola.mjs --config <plik.json> [--szczegoly]; wymagane ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH.'); process.exit(2); }
  const config = JSON.parse(readFileSync(resolve(args[i + 1]), 'utf8'));
  const czytajTekst = p => (existsSync(resolve(p)) ? readFileSync(resolve(p), 'utf8') : null);
  const czytajJson = p => { const t = czytajTekst(p); return t === null ? null : JSON.parse(t); };
  const token = makeJwt({ keyId, issuerId, keyPem: readFileSync(keyPath, 'utf8') });
  const dzis = new Date().toISOString().slice(0, 10);
  const wynik = await uruchom({ client: makeReadClient({ token }), config, dzis, czytajJson, czytajTekst });
  console.log(raport(wynik, { szczegoly: args.includes('--szczegoly'), dzis }));
  process.exit(wynik.code);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(`Błąd: ${String(e.message).slice(0, 200)}`); process.exit(2); });

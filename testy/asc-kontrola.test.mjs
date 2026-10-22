// Testy kontroli App Store Connect (tylko odczyt): logika porównań na atrapie API (testy/atrapa.mjs w procesie potomnym),
// maskowanie, brak metod zapisu, niezależność od konkretnej aplikacji i kształt workflow wielokrotnego użytku.
// Uruchomienie: node --test testy/asc-kontrola.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname, normalize } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
const walk = d => readdirSync(join(root, d), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const drive = mode => JSON.parse(execFileSync('node', [join(root, 'testy/atrapa.mjs'), mode], { encoding: 'utf8', maxBuffer: 20e6 }));
const row = (r, re) => r.wyniki.find(x => re.test(x.opis));
const match = (s, re) => assert.match(s, re);
const nomatch = (s, re) => assert.doesNotMatch(s, re);
const config = JSON.parse(read('testy/przyklad/konfiguracja.json'));

describe('kontrole na atrapie API', () => {
  test('wszystko zgodne: kod 0; ceny i oferty OK; metadane i notatki BRAK DANYCH; etykieta prywatności TYLKO RĘCZNIE', () => {
    const r = drive('zgodne');
    assert.equal(r.code, 0); assert.equal(r.liczby['RÓŻNICA'], 0); assert.equal(r.liczby['BŁĄD'], 0);
    for (const t of ['USA', 'POL', 'DEU', 'FRA', 'ITA', 'ESP', 'NLD', 'GBR']) assert.equal(row(r, new RegExp(`^yearly ${t}:`)).status, 'OK');
    assert.equal(row(r, /^monthly GBR:/).status, 'INFO'); assert.equal(row(r, /^lifetime DEU:/).status, 'INFO');
    assert.equal(row(r, /^yearly grupa strefaEuro \(21\): jedna kwota 7\.99/).status, 'OK'); assert.equal(row(r, /^lifetime grupa strefaEuro/).status, 'INFO');
    assert.equal(row(r, /^monthly: FREE_TRIAL, TWO_WEEKS/).status, 'OK'); assert.equal(row(r, /^yearly: FREE_TRIAL, TWO_WEEKS/).status, 'OK');
    assert.equal(row(r, /Family Sharing lifetime/).status, 'OK'); assert.equal(row(r, /Kategoria główna: HEALTH_AND_FITNESS/).status, 'OK'); assert.equal(row(r, /Kategoria dodatkowa/).status, 'INFO');
    for (const n of ['Privacy Policy URL', 'Support URL', 'Marketing URL']) assert.equal(row(r, new RegExp(`^${n}`)).status, 'OK');
    assert.equal(r.wyniki.find(x => x.kontrola.startsWith('Nazwa, podtytuł')).status, 'BRAK DANYCH');
    assert.equal(row(r, /^Notatki dla recenzenta/).status, 'BRAK DANYCH'); assert.equal(row(r, /^Etykieta prywatności/).status, 'TYLKO RĘCZNIE');
    assert.equal(row(r, /^Ocena wiekowa/).status, 'INFO'); assert.equal(row(r, /^Dostępność w krajach/).status, 'INFO');
  });
  test('cena inna niż oczekiwana: RÓŻNICA i kod 1', () => {
    const r = drive('cena-pl'); assert.equal(r.code, 1);
    assert.deepEqual(row(r, /^yearly POL:/), { status: 'RÓŻNICA', opis: 'yearly POL: jest 24.99, oczekiwane 19.99', obszar: 'Ceny', kontrola: 'Ceny produktów (bieżące)' });
  });
  test('cena bieżąca: zakończona i przyszła pozycja harmonogramu nie wpływają na wynik', () => { const w = row(drive('cena-historia'), /^yearly USA:/); assert.equal(w.status, 'OK'); assert.equal(w.opis, 'yearly USA: 6.99'); });
  test('strefa euro: różnica jednego kraju wypisana z kodem kraju i kwotą', () => {
    const r = drive('euro-rozne'); assert.equal(r.code, 1);
    const g = row(r, /^yearly grupa strefaEuro/); assert.equal(g.status, 'RÓŻNICA'); match(g.opis, /RÓŻNE KWOTY/); match(g.opis, /8\.99: AUT/); match(g.opis, /7\.99:/);
  });
  test('oferty: brak w terytorium, zły tryb, data końca → RÓŻNICA z kodami terytoriów', () => {
    const a = row(drive('oferta-brak'), /^yearly:/); assert.equal(a.status, 'RÓŻNICA'); match(a.opis, /bez oferty \(1\): JPN/);
    match(row(drive('oferta-tryb'), /^monthly:/).opis, /inny tryb niż FREE_TRIAL: USA/); match(row(drive('oferta-koniec'), /^monthly:/).opis, /z datą końca: POL/);
  });
  test('Family Sharing wyłączone wbrew konfiguracji → RÓŻNICA; kategoria inna → RÓŻNICA; Privacy Policy URL inny w jednej lokalizacji → RÓŻNICA', () => {
    assert.equal(row(drive('rodzina'), /Family Sharing yearly/).status, 'RÓŻNICA');
    assert.equal(row(drive('kategoria'), /Kategoria główna/).opis, 'Kategoria główna: jest LIFESTYLE, oczekiwane HEALTH_AND_FITNESS');
    const a = row(drive('adres-roznica'), /^Privacy Policy URL/); assert.equal(a.status, 'RÓŻNICA'); match(a.opis, /pl/);
  });
  test('metadane w formacie sklepu (nazwy: names, podtytuł i słowa: lokalizacje): zgodne → OK, w tym lista lokalizacji; pola bez źródła nie są kontrolowane', () => {
    const r = drive('meta'); assert.equal(r.code, 0);
    for (const n of ['Lista lokalizacji: 4 zgodnych', 'Nazwa: 4', 'Podtytuł: 4', 'Słowa kluczowe: 4']) assert.equal(r.wyniki.find(x => x.opis.startsWith(n)).status, 'OK');
    assert.equal(r.wyniki.some(x => /^(Tekst promocyjny|Opis):/.test(x.opis)), false);
  });
  test('metadane: tylko jedno źródło (nazwy) → BRAK DANYCH o brakującym pliku, nazwy nadal porównane', () => {
    const r = drive('meta-polowa'); assert.equal(r.code, 0);
    assert.ok(r.wyniki.find(x => x.status === 'BRAK DANYCH' && /brakujące pliki: 1 z 2/.test(x.opis)));
    assert.equal(row(r, /^Nazwa:/).status, 'OK'); assert.equal(row(r, /^Słowa kluczowe:/), undefined);
  });
  test('metadane: różna nazwa w pl i słowa kluczowe w en-US → RÓŻNICA z kodami lokalizacji', () => {
    const r = drive('meta-roznica'); assert.equal(r.code, 1);
    assert.equal(row(r, /^Nazwa:/).opis, 'Nazwa: różni się w 1 z 4: pl'); assert.equal(row(r, /^Słowa kluczowe:/).opis, 'Słowa kluczowe: różni się w 1 z 4: en-US');
  });
  test('metadane: lokalizacja nieobecna w wersji nie psuje listy; pole wersji liczone tylko dla istniejących', () => {
    const r = drive('meta-lokale'); assert.equal(row(r, /^Lista lokalizacji/).status, 'OK'); assert.equal(row(r, /^Słowa kluczowe:/).opis, 'Słowa kluczowe: 3 lokalizacji zgodnych');
  });
  test('recenzent: dane osobowe i treść notatek nigdy w raporcie; puste pole kontaktu → RÓŻNICA; notatki z pliku porównane', () => {
    for (const mode of ['zgodne', 'notatki', 'notatki-roznica', 'recenzent-puste', 'szczegoly']) {
      const r = drive(mode); const all = JSON.stringify(r.wyniki) + r.raport;
      for (const s of ['Jan-Imie-Tajne', 'Kowalski-Tajne', '+48-600-TAJNY', 'recenzent-tajny@example.test', 'Notatki dla recenzenta.', 'Inne notatki']) assert.ok(!all.includes(s), s);
    }
    assert.equal(row(drive('zgodne'), /^Kontakt recenzenta/).opis, 'Kontakt recenzenta: wszystkie pola ustawione');
    assert.equal(row(drive('recenzent-puste'), /^Kontakt recenzenta/).opis, 'Kontakt recenzenta: puste pola: telefon');
    assert.equal(row(drive('notatki'), /^Notatki dla recenzenta/).status, 'OK'); assert.equal(row(drive('notatki-roznica'), /^Notatki dla recenzenta/).status, 'RÓŻNICA');
  });
  test('dostępność: 404 dla appAvailabilityV2 (dostępność aplikacji nieustawiona) → BRAK DANYCH z krokiem w App Store Connect, nie BŁĄD; reszta kontroli działa, kod 0', () => {
    const r = drive('dostepnosc-404'); const w = row(r, /^Dostępność w krajach/);
    assert.equal(w.status, 'BRAK DANYCH'); match(w.opis, /brak zapisu dostępności/); match(w.opis, /Ceny i dostępność|Pricing and Availability/);
    assert.equal(r.liczby['BŁĄD'], 0); assert.equal(r.code, 0); nomatch(JSON.stringify(r.wyniki) + r.raport, /SEKRET-SZCZEGOL|111222/);
    assert.ok(!r.wywolania.some(x => x.includes('/territoryAvailabilities')));
  });
  test('szczegóły: lista dostępnych krajów zawsze, odpowiedzi wiekowe dopiero z opcją szczegoly', () => {
    const bez = drive('zgodne').raport; const z = drive('szczegoly').raport;
    match(bez, /dostępne \(/); nomatch(bez, /healthOrWellnessTopics = true/); match(z, /healthOrWellnessTopics = true/); match(z, /gambling = false/);
  });
  test('raport: sekcje według obszarów, tabela ze statusami i podsumowanie z liczbami', () => {
    const t = drive('zgodne').raport;
    for (const h of ['## Ceny', '## Oferty wprowadzające', '## Produkty', '## Adresy', '## Metadane sklepu', '## Aplikacja', '## Informacje dla recenzenta']) assert.ok(t.includes(h), h);
    match(t, /Podsumowanie: OK \d+, RÓŻNICA 0, BRAK DANYCH \d+, TYLKO RĘCZNIE 1, INFO \d+, BŁĄD 0/); assert.ok(t.includes('| Kontrola | Status | Wynik |'));
  });
  test('maskowanie: token, identyfikatory obiektów i szczegóły błędów nie trafiają do raportu; błąd odczytu → BŁĄD i kod 1', () => {
    for (const mode of ['zgodne', 'szczegoly', 'blad-403']) {
      const r = drive(mode); const all = JSON.stringify({ ...r, wywolania: [] }) + r.raport;
      nomatch(all, /TOKEN-XYZ|SEKRET-SZCZEGOL|111222|GRP-1|SUB-\d|IAP-1|PS-1|INFO-1|VER-\d|AVAIL-1|Bearer/);
    }
    const r = drive('blad-403'); assert.equal(r.code, 1); assert.ok(r.liczby['BŁĄD'] > 0);
    assert.ok(r.wyniki.every(x => x.status === 'BŁĄD' || x.status === 'TYLKO RĘCZNIE'));
    assert.equal(r.wyniki[0].opis, 'odczyt nieudany: GET /v1/apps → 403 (FORBIDDEN_ERROR: Forbidden)');
  });
  test('tylko odczyt: wszystkie żądania do API to GET', () => { const r = drive('zgodne'); assert.ok(r.wywolania.length > 20); assert.ok(r.wywolania.every(x => x.startsWith('GET /'))); });
  test('JWT ES256: nagłówek, treść (10 minut) i poprawny podpis', () => {
    const r = drive('jwt'); assert.deepEqual(r.header, { alg: 'ES256', kid: 'KID1234567', typ: 'JWT' }); assert.deepEqual(r.payload, { iss: 'ISSUER', iat: 1000, exp: 1600, aud: 'appstoreconnect-v1' }); assert.equal(r.valid, true);
  });
  test('funkcje czyste: cena bieżąca, kwota z grupy, wybór wersji wg stanu, ścieżki bez identyfikatorów, lokalizacje', () => {
    const r = drive('czyste');
    assert.deepEqual(r.biezace, [['X', 2]]); assert.deepEqual(r.oczek, [8.5, 7.99, null, null]); /* trzecia wartość to undefined (brak wpisu), w JSON null */
    assert.equal(r.stan, 'c'); assert.equal(r.stanPusty, null);
    assert.deepEqual(r.sciezki, ['/v1/apps/{id}/appInfos', '/v1/appInfos/{id}/ageRatingDeclaration', '/v2/appAvailabilities/{id}/territoryAvailabilities']);
    assert.equal(r.metaBrakLokalizacji[0][0], 'RÓŻNICA'); match(r.metaBrakLokalizacji[0][1], /brakuje/);
    assert.deepEqual(r.lokalizacje, { zgodne: 1, rozne: ['b', 'c'], puste: ['b'] }); assert.deepEqual(r.kody, ['A, B', 'A, B +2']);
  });
  test('rejestr kontroli: kompletny kształt, unikalne id, znane kontrole na liście', () => {
    const r = drive('czyste'); for (const k of r.kontrole) assert.deepEqual(k.pola, []);
    assert.equal(new Set(r.kontrole.map(k => k.id)).size, r.kontrole.length);
    for (const id of ['ceny', 'oferty', 'rodzina', 'adresy', 'metadane', 'kategorie', 'wiek', 'dostepnosc', 'prywatnosc', 'recenzent']) assert.ok(r.kontrole.some(k => k.id === id), id);
  });
});

describe('narzędzie: tylko odczyt i niezależność od aplikacji', () => {
  const pliki = walk('asc-kontrola').filter(f => /\.(mjs|md|json)$/.test(f));
  test('kod narzędzia nie zawiera metod zapisu (POST, PATCH, PUT, DELETE) ani wywołań z inną metodą niż GET', () => {
    assert.ok(pliki.length >= 12);
    for (const f of pliki.filter(x => x.endsWith('.mjs'))) {
      const src = read(f); nomatch(src, /\b(POST|PATCH|PUT|DELETE)\b/);
      for (const m of src.matchAll(/method:\s*([^,}\s]+)/g)) assert.equal(m[1], "'GET'", f);
    }
    match(read('asc-kontrola/klient.mjs'), /method: 'GET'/);
  });
  test('kod nie wypisuje sekretów ani treści odpowiedzi API', () => {
    const src = pliki.filter(f => f.endsWith('.mjs')).map(read).join('\n');
    nomatch(src, /console\.(log|error)\((keyId|issuerId|token|keyPem)|console\.(log|error)\([^)]*\$\{[^}]*(keyId|issuerId|token|keyPem)/); nomatch(src, /e\.detail|\.detail\b|JSON\.stringify\(json/);
  });
  test('niezależność od aplikacji: w katalogu narzędzia brak nazw konkretnej aplikacji, jej identyfikatorów i ścieżek jej repozytorium', () => {
    const zakazane = [/trening/i, /pl\.lukasz/, /lukasz/i, /apps4brew\.com/i, /(?<![\w-])store\//, /(?<![\w-])docs\//, /app\.json/, /lib\/products/, new RegExp(config.aplikacja.bundleId.replace(/\./g, '\\.'))];
    for (const f of pliki) { const src = read(f); for (const re of zakazane) assert.equal(re.test(src), false, `${f} ${re.source}`); }
  });
  test('narzędzie nie importuje niczego spoza swojego katalogu (przenoszone w całości)', () => {
    for (const f of pliki.filter(x => x.endsWith('.mjs'))) for (const m of read(f).matchAll(/from '([^']+)'/g)) {
      assert.ok(m[1].startsWith('node:') || m[1].startsWith('./') || m[1].startsWith('../'), `${f} ${m[1]}`);
      if (m[1].startsWith('../')) assert.ok(normalize(join(dirname(f), m[1])).startsWith('asc-kontrola'), `${f} ${m[1]}`);
    }
  });
});

describe('workflow wielokrotnego użytku', () => {
  const y = read('.github/workflows/asc-kontrola.yml');
  test('tylko workflow_call (config wymagany, szczegoly boolean), trzy wymagane sekrety, odczyt treści, ubuntu', () => {
    match(y, /\non:\n  workflow_call:\n    inputs:\n      config:\n[\s\S]*?required: true\n/); match(y, /szczegoly:\n[\s\S]*?type: boolean/);
    for (const s of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8']) match(y, new RegExp(`\\n      ${s}:\\n        required: true`));
    nomatch(y, /^\s+workflow_dispatch:|schedule:|^\s+push:|pull_request/m); match(y, /permissions:\n\s+contents: read\n/); nomatch(y, /contents: write|macos/); match(y, /runs-on: ubuntu-latest/);
  });
  test('pobiera repozytorium wywołujące ORAZ repozytorium narzędzi w wersji workflow (job.workflow_repository i job.workflow_sha), do osobnego katalogu', () => {
    assert.equal((y.match(/uses: actions\/checkout@v5/g) || []).length, 2);
    match(y, /repository: \$\{\{ job\.workflow_repository \}\}\n\s+ref: \$\{\{ job\.workflow_sha \}\}\n\s+path: \.narzedzia-studia\n\s+persist-credentials: false/);
    match(y, /node \.narzedzia-studia\/asc-kontrola\/kontrola\.mjs --config "\$KONFIGURACJA"/);
    assert.equal((y.match(/persist-credentials: false/g) || []).length, 2);
  });
  test('klucz maskowany, w RUNNER_TEMP i usuwany zawsze; wejścia tylko przez zmienne środowiskowe; bez metod zapisu', () => {
    assert.ok(y.includes('::add-mask::$ASC_KEY_ID') && y.includes('::add-mask::$ASC_ISSUER_ID')); match(y, /umask 077/);
    nomatch(y, /echo[^\n]*\$\{?ASC_KEY_P8(?!" \|)/); nomatch(y, /echo "\$ASC_KEY_(ID|P8)|echo "\$ASC_ISSUER_ID/);
    match(y, /- name: Usunięcie klucza z maszyny\n\s+if: always\(\)\n\s+run: rm -f "\$RUNNER_TEMP\/AuthKey\.p8"/);
    nomatch(y, /run:[^\n]*\$\{\{ inputs/); assert.ok(y.includes('KONFIGURACJA: ${{ inputs.config }}') && y.includes('SZCZEGOLY: ${{ inputs.szczegoly }}'));
    assert.ok(y.includes('tee -a "$GITHUB_STEP_SUMMARY"')); nomatch(y, /\b(POST|PATCH|PUT|DELETE)\b/);
    for (const m of y.match(/secrets\.[A-Z_0-9]+/g) || []) assert.ok(['secrets.ASC_KEY_ID', 'secrets.ASC_ISSUER_ID', 'secrets.ASC_KEY_P8'].includes(m), m);
  });
  test('workflow nie zawiera nazw konkretnej aplikacji', () => { nomatch(y, /trening|lukasz\./i); });
  test('CI tego repozytorium: node --test bez sekretów', () => {
    const ci = read('.github/workflows/testy.yml'); match(ci, /node --test testy\/asc-kontrola\.test\.mjs/); nomatch(ci, /secrets\./); match(ci, /permissions:\n\s+contents: read/);
  });
});

import { Router } from 'express';
import { Country, State, City } from 'country-state-city';
import { authMiddleware } from '../middleware/auth.js';
import { getDb } from '../db/database.js';

const router = Router();
const OUTROS = 'OUTROS';
const EXCLUDED_COUNTRY = 'BR';

function countryName(code: string): string {
  return Country.getCountryByCode(code)?.name || code;
}

function exploreType(req: { query: Record<string, unknown> }): 'people' | 'businesses' {
  return req.query.type === 'businesses' ? 'businesses' : 'people';
}

/** Países com pessoas ou negócios cadastrados (exceto Brasil) — filtros do Explorar */
router.get('/used-countries', authMiddleware, (req, res) => {
  const db = getDb();
  const type = exploreType(req);

  const rows = type === 'businesses'
    ? db.prepare(
        `SELECT DISTINCT UPPER(TRIM(country)) AS country_code
         FROM businesses
         WHERE is_active = 1
           AND country IS NOT NULL
           AND TRIM(country) != ''
           AND UPPER(TRIM(country)) != ?
         ORDER BY country_code`
      ).all(EXCLUDED_COUNTRY) as Array<{ country_code: string }>
    : db.prepare(
        `SELECT DISTINCT UPPER(TRIM(current_country)) AS country_code
         FROM public_profiles
         WHERE current_country IS NOT NULL
           AND TRIM(current_country) != ''
           AND UPPER(TRIM(current_country)) != ?
         ORDER BY country_code`
      ).all(EXCLUDED_COUNTRY) as Array<{ country_code: string }>;

  const countries = rows
    .map((r) => ({ code: r.country_code, name: countryName(r.country_code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  res.json(countries);
});

/** Estados/regiões com cadastros no país selecionado */
router.get('/used-states', authMiddleware, (req, res) => {
  const country = String(req.query.country || '').toUpperCase();
  if (!country) return res.status(400).json({ error: 'País obrigatório' });
  if (country === EXCLUDED_COUNTRY) return res.json([]);

  const db = getDb();
  const type = exploreType(req);

  const rows = type === 'businesses'
    ? db.prepare(
        `SELECT DISTINCT TRIM(state) AS name
         FROM businesses
         WHERE is_active = 1
           AND UPPER(TRIM(country)) = ?
           AND state IS NOT NULL
           AND TRIM(state) != ''
         ORDER BY name COLLATE NOCASE`
      ).all(country) as Array<{ name: string }>
    : db.prepare(
        `SELECT DISTINCT TRIM(current_state) AS name
         FROM public_profiles
         WHERE UPPER(TRIM(current_country)) = ?
           AND current_state IS NOT NULL
           AND TRIM(current_state) != ''
         ORDER BY name COLLATE NOCASE`
      ).all(country) as Array<{ name: string }>;

  res.json(rows.map((r) => ({ code: r.name, name: r.name })));
});

/** Cidades com cadastros no estado/região selecionado */
router.get('/used-cities', authMiddleware, (req, res) => {
  const country = String(req.query.country || '').toUpperCase();
  const state = String(req.query.state || '').trim();
  if (!country || !state) return res.status(400).json({ error: 'País e estado obrigatórios' });
  if (country === EXCLUDED_COUNTRY) return res.json([]);

  const db = getDb();
  const type = exploreType(req);

  const rows = type === 'businesses'
    ? db.prepare(
        `SELECT DISTINCT TRIM(city) AS name
         FROM businesses
         WHERE is_active = 1
           AND UPPER(TRIM(country)) = ?
           AND TRIM(state) = ?
           AND city IS NOT NULL
           AND TRIM(city) != ''
         ORDER BY name COLLATE NOCASE`
      ).all(country, state) as Array<{ name: string }>
    : db.prepare(
        `SELECT DISTINCT TRIM(current_city) AS name
         FROM public_profiles
         WHERE UPPER(TRIM(current_country)) = ?
           AND TRIM(current_state) = ?
           AND current_city IS NOT NULL
           AND TRIM(current_city) != ''
         ORDER BY name COLLATE NOCASE`
      ).all(country, state) as Array<{ name: string }>;

  res.json(rows.map((r) => ({ code: r.name, name: r.name })));
});

/** Categorias com negócios cadastrados (exceto Brasil) */
router.get('/used-categories', authMiddleware, (req, res) => {
  if (exploreType(req) !== 'businesses') return res.json([]);

  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT TRIM(category) AS code
     FROM businesses
     WHERE is_active = 1
       AND category IS NOT NULL
       AND TRIM(category) != ''
       AND UPPER(TRIM(country)) != ?
     ORDER BY code COLLATE NOCASE`
  ).all(EXCLUDED_COUNTRY) as Array<{ code: string }>;

  res.json(rows.map((r) => ({ code: r.code, name: r.code })));
});

router.get('/countries', authMiddleware, (_req, res) => {
  const countries = Country.getAllCountries()
    .map((c) => ({ code: c.isoCode, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  res.json(countries);
});

router.get('/states', authMiddleware, (req, res) => {
  const country = String(req.query.country || '').toUpperCase();
  if (!country) return res.status(400).json({ error: 'País obrigatório' });

  const states = State.getStatesOfCountry(country)
    .map((s) => ({ code: s.isoCode, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  states.push({ code: OUTROS, name: 'Outros' });
  res.json(states);
});

router.get('/cities', authMiddleware, (req, res) => {
  const country = String(req.query.country || '').toUpperCase();
  const state = String(req.query.state || '');
  if (!country || !state) return res.status(400).json({ error: 'País e estado obrigatórios' });

  if (state === OUTROS) {
    return res.json([{ code: OUTROS, name: 'Outros' }]);
  }

  const cities = City.getCitiesOfState(country, state)
    .map((c) => ({ code: c.name, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  cities.push({ code: OUTROS, name: 'Outros' });
  res.json(cities);
});

/** Resolve nomes salvos no perfil para códigos ISO (preencher formulário) */
router.get('/resolve', authMiddleware, (req, res) => {
  const country = String(req.query.country || '').toUpperCase();
  const stateName = String(req.query.stateName || '');
  const cityName = String(req.query.cityName || '');

  const states = State.getStatesOfCountry(country);
  const match = states.find(
    (s) => s.name.toLowerCase() === stateName.toLowerCase() || s.isoCode === stateName
  );

  let stateIso = match?.isoCode || OUTROS;
  let stateCustom = match ? '' : stateName;
  let citySelect = cityName;
  let cityCustom = '';

  if (match && cityName) {
    const cities = City.getCitiesOfState(country, match.isoCode);
    const cityMatch = cities.some((c) => c.name.toLowerCase() === cityName.toLowerCase());
    if (!cityMatch) {
      citySelect = OUTROS;
      cityCustom = cityName;
    }
  } else if (cityName && !match) {
    citySelect = OUTROS;
    cityCustom = cityName;
  }

  if (!stateName) {
    stateIso = '';
    stateCustom = '';
  }

  res.json({ stateIso, stateCustom, citySelect, cityCustom });
});

export default router;

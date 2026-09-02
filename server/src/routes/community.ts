import { Router } from 'express';
import { Country } from 'country-state-city';
import { getDb, parseJson } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { isPremiumProfile } from '../lib/settings.js';

const router = Router();
const EXCLUDED = 'BR';

function countryName(code: string): string {
  return Country.getCountryByCode(code)?.name || code;
}

type CountryRow = { country_code: string; people_count: number; business_count: number };

router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const filterCountry = (req.query.country as string)?.trim().toUpperCase() || '';

  const meProfile = db.prepare(
    'SELECT current_country FROM public_profiles WHERE user_id = ?'
  ).get(req.user!.id) as { current_country: string } | undefined;
  const currentCountry = (meProfile?.current_country || '').toUpperCase();

  const countryStats = db.prepare(
    `SELECT country_code,
            SUM(people_count) AS people_count,
            SUM(business_count) AS business_count
     FROM (
       SELECT UPPER(TRIM(current_country)) AS country_code, COUNT(*) AS people_count, 0 AS business_count
       FROM public_profiles
       WHERE current_country IS NOT NULL
         AND TRIM(current_country) != ''
         AND UPPER(TRIM(current_country)) != ?
       GROUP BY UPPER(TRIM(current_country))
       UNION ALL
       SELECT UPPER(TRIM(country)) AS country_code, 0 AS people_count, COUNT(*) AS business_count
       FROM businesses
       WHERE is_active = 1
         AND country IS NOT NULL
         AND TRIM(country) != ''
         AND UPPER(TRIM(country)) != ?
       GROUP BY UPPER(TRIM(country))
     )
     GROUP BY country_code
     ORDER BY (people_count + business_count) DESC, country_code`
  ).all(EXCLUDED, EXCLUDED) as CountryRow[];

  const peopleTotal = countryStats.reduce((s, c) => s + c.people_count, 0);
  const businessTotal = countryStats.reduce((s, c) => s + c.business_count, 0);

  const currentCountryPeople = countryStats.find((c) => c.country_code === currentCountry)?.people_count || 0;

  const visibleCountries = filterCountry
    ? countryStats.filter((c) => c.country_code === filterCountry)
    : countryStats;

  const countries = visibleCountries.map((c) => {
    const users = db.prepare(
      `SELECT u.id, u.full_name, u.username, u.avatar_url,
              p.bio, p.current_country, p.current_city, p.primary_skill,
              p.show_city_on_profile, p.is_premium, p.premium_until,
              CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END AS is_following
       FROM users u
       JOIN public_profiles p ON p.user_id = u.id
       LEFT JOIN follows f ON f.follower_id = ? AND f.following_id = u.id
       WHERE UPPER(TRIM(p.current_country)) = ?
         AND UPPER(TRIM(p.current_country)) != ?
       ORDER BY
         CASE WHEN p.is_premium = 1 AND (p.premium_until IS NULL OR p.premium_until >= datetime('now')) THEN 0 ELSE 1 END,
         u.full_name ASC`
    ).all(req.user!.id, c.country_code, EXCLUDED) as Array<{
      id: string;
      full_name: string;
      username: string;
      avatar_url: string | null;
      bio: string;
      current_country: string;
      current_city: string;
      primary_skill: string;
      show_city_on_profile: number;
      is_premium: number;
      premium_until: string | null;
      is_following: number;
    }>;

    const businesses = db.prepare(
      `SELECT b.id, b.name, b.category, b.tagline, b.description, b.address, b.city, b.state, b.country,
              b.latitude, b.longitude, b.skills,
              u.id AS owner_id, u.full_name AS owner_name
       FROM businesses b
       JOIN users u ON u.id = b.owner_id
       WHERE b.is_active = 1
         AND UPPER(TRIM(b.country)) = ?
         AND UPPER(TRIM(b.country)) != ?
       ORDER BY b.name ASC`
    ).all(c.country_code, EXCLUDED) as Array<{
      id: string;
      name: string;
      category: string;
      tagline: string;
      description: string;
      address: string;
      city: string;
      state: string;
      country: string;
      latitude: number | null;
      longitude: number | null;
      owner_id: string;
      owner_name: string;
      skills: string;
    }>;

    return {
      code: c.country_code,
      name: countryName(c.country_code),
      people_count: c.people_count,
      business_count: c.business_count,
      users: users.map((u) => ({
        ...u,
        is_following: !!u.is_following,
        is_premium: isPremiumProfile(u),
        current_city: u.show_city_on_profile ? u.current_city : '',
      })),
      businesses: businesses.map((b) => ({
        id: b.id,
        name: b.name,
        category: b.category,
        tagline: b.tagline || '',
        description: b.description || '',
        address: b.address || '',
        city: b.city || '',
        state: b.state || '',
        country: b.country,
        latitude: b.latitude,
        longitude: b.longitude,
        owner_id: b.owner_id,
        owner_name: b.owner_name,
        skills: parseJson(b.skills, [] as string[]),
      })),
    };
  });

  res.json({
    stats: {
      people_count: peopleTotal,
      business_count: businessTotal,
      country_count: countryStats.length,
    },
    current_country: currentCountry && currentCountry !== EXCLUDED ? currentCountry : '',
    current_country_name: currentCountry && currentCountry !== EXCLUDED ? countryName(currentCountry) : '',
    current_country_people: currentCountryPeople,
    top_countries: countryStats.slice(0, 10).map((c) => ({
      code: c.country_code,
      name: countryName(c.country_code),
      people_count: c.people_count,
      business_count: c.business_count,
    })),
    countries,
  });
});

export default router;

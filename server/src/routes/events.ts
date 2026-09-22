import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getMonetizationSettings, isSponsoredEvent } from '../lib/settings.js';

const router = Router();

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const country = (req.query.country as string)?.trim();
  const city = (req.query.city as string)?.trim();
  const scope = ((req.query.scope as string) || 'upcoming').toLowerCase();
  const mine = req.query.mine === '1';

  const profile = await db.get<{ current_country: string; current_city: string }>(
    'SELECT current_country, current_city FROM public_profiles WHERE user_id = ?',
    [req.user!.id]
  );

  const filterCountry = country || profile?.current_country || '';
  const filterCity = city || '';

  const conditions = ['e.is_active = 1', "UPPER(TRIM(e.country)) != 'BR'"];
  const params: string[] = [];

  if (mine) {
    conditions.push('e.organizer_id = ?');
    params.push(req.user!.id);
  } else if (filterCountry && filterCountry.toUpperCase() !== 'BR') {
    conditions.push('e.country = ?');
    params.push(filterCountry);
  }
  if (filterCity) {
    conditions.push('LOWER(TRIM(e.city)) = LOWER(?)');
    params.push(filterCity);
  }
  if (scope === 'upcoming') {
    conditions.push(`e.event_date >= substr(utc_now(), 1, 10)`);
  }

  const settings = await getMonetizationSettings();

  const events = await db.all<Record<string, unknown> & { interested_by_me: number }>(
    `SELECT e.*, u.full_name AS organizer_name, u.username AS organizer_username, u.avatar_url AS organizer_avatar,
            CASE WHEN ei.user_id IS NOT NULL THEN 1 ELSE 0 END AS interested_by_me
     FROM community_events e
     JOIN users u ON u.id = e.organizer_id
     LEFT JOIN event_interests ei ON ei.event_id = e.id AND ei.user_id = ?
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE WHEN e.is_sponsored = 1 AND (e.sponsored_until IS NULL OR e.sponsored_until >= utc_now()) THEN 0 ELSE 1 END,
       CASE WHEN LOWER(TRIM(e.city)) = LOWER(?) THEN 0 ELSE 1 END,
       e.event_date ASC,
       e.event_time ASC
     LIMIT 50`,
    [req.user!.id, ...params, (profile?.current_city || '').trim()]
  );

  res.json(events.map((e) => ({
    ...e,
    interested_by_me: !!e.interested_by_me,
    is_sponsored: isSponsoredEvent(settings, e as { is_sponsored?: number; sponsored_until?: string | null }),
  })));
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const {
    title, description, event_date, event_time, location_name, address,
    city, country, latitude, longitude, image_url, whatsapp, external_link,
  } = req.body;

  if (!title?.trim() || !event_date || !city?.trim() || !country?.trim()) {
    return res.status(400).json({ error: 'Título, data, cidade e país são obrigatórios' });
  }

  const id = uuid();
  await db.run(
    `INSERT INTO community_events (
       id, title, description, event_date, event_time, location_name, address,
       city, country, latitude, longitude, image_url, organizer_id, whatsapp, external_link
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      title.trim(),
      description?.trim() || '',
      event_date,
      event_time || '',
      location_name?.trim() || '',
      address?.trim() || '',
      city.trim(),
      country.trim(),
      latitude ?? null,
      longitude ?? null,
      image_url || '',
      req.user!.id,
      whatsapp?.trim() || '',
      external_link?.trim() || '',
    ]
  );

  const event = await db.get<Record<string, unknown>>(
    `SELECT e.*, u.full_name AS organizer_name, u.username AS organizer_username
     FROM community_events e JOIN users u ON u.id = e.organizer_id WHERE e.id = ?`,
    [id]
  );
  res.status(201).json({ ...event, interested_by_me: false });
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const event = await db.get<Record<string, unknown>>(
    `SELECT e.*, u.full_name AS organizer_name, u.username AS organizer_username, u.avatar_url AS organizer_avatar
     FROM community_events e
     JOIN users u ON u.id = e.organizer_id
     WHERE e.id = ? AND e.is_active = 1`,
    [id]
  );
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

  const interest = await db.get<{ id: string }>(
    'SELECT id FROM event_interests WHERE event_id = ? AND user_id = ?',
    [id, req.user!.id]
  );

  const settings = await getMonetizationSettings();
  res.json({
    ...event,
    interested_by_me: !!interest,
    is_sponsored: isSponsoredEvent(settings, event as { is_sponsored?: number; sponsored_until?: string | null }),
  });
});

router.post('/:id/interest', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const event = await db.get<{ id: string }>(
    'SELECT id FROM community_events WHERE id = ? AND is_active = 1',
    [id]
  );
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

  const existing = await db.get<{ id: string }>(
    'SELECT id FROM event_interests WHERE event_id = ? AND user_id = ?',
    [id, req.user!.id]
  );
  if (existing) return res.json({ ok: true, interested: true });

  await db.run(
    'INSERT INTO event_interests (id, event_id, user_id) VALUES (?, ?, ?)',
    [uuid(), id, req.user!.id]
  );
  await db.run('UPDATE community_events SET interest_count = interest_count + 1 WHERE id = ?', [id]);
  res.json({ ok: true, interested: true });
});

router.delete('/:id/interest', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const result = await db.run('DELETE FROM event_interests WHERE event_id = ? AND user_id = ?', [id, req.user!.id]);
  if (result.changes > 0) {
    await db.run(
      `UPDATE community_events SET interest_count = CASE WHEN interest_count > 0 THEN interest_count - 1 ELSE 0 END WHERE id = ?`,
      [id]
    );
  }
  res.json({ ok: true, interested: false });
});

export default router;

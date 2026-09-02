import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const country = (req.query.country as string)?.trim();
  const city = (req.query.city as string)?.trim();
  const scope = ((req.query.scope as string) || 'upcoming').toLowerCase();

  const profile = db.prepare(
    'SELECT current_country, current_city FROM public_profiles WHERE user_id = ?'
  ).get(req.user!.id) as { current_country: string; current_city: string } | undefined;

  const filterCountry = country || profile?.current_country || '';
  const filterCity = city || '';

  const conditions = ['e.is_active = 1', "UPPER(TRIM(e.country)) != 'BR'"];
  const params: string[] = [];

  if (filterCountry && filterCountry.toUpperCase() !== 'BR') {
    conditions.push('e.country = ?');
    params.push(filterCountry);
  }
  if (filterCity) {
    conditions.push('LOWER(TRIM(e.city)) = LOWER(?)');
    params.push(filterCity);
  }
  if (scope === 'upcoming') {
    conditions.push(`e.event_date >= date('now')`);
  }

  const events = db.prepare(
    `SELECT e.*, u.full_name AS organizer_name, u.username AS organizer_username, u.avatar_url AS organizer_avatar,
            CASE WHEN ei.user_id IS NOT NULL THEN 1 ELSE 0 END AS interested_by_me
     FROM community_events e
     JOIN users u ON u.id = e.organizer_id
     LEFT JOIN event_interests ei ON ei.event_id = e.id AND ei.user_id = ?
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE WHEN LOWER(TRIM(e.city)) = LOWER(?) THEN 0 ELSE 1 END,
       e.event_date ASC,
       e.event_time ASC
     LIMIT 50`
  ).all(req.user!.id, ...params, (profile?.current_city || '').trim());

  res.json(events.map((e) => ({
    ...e,
    interested_by_me: !!(e as { interested_by_me: number }).interested_by_me,
  })));
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const {
    title, description, event_date, event_time, location_name, address,
    city, country, latitude, longitude, image_url, whatsapp, external_link,
  } = req.body;

  if (!title?.trim() || !event_date || !city?.trim() || !country?.trim()) {
    return res.status(400).json({ error: 'Título, data, cidade e país são obrigatórios' });
  }

  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT INTO community_events (
       id, title, description, event_date, event_time, location_name, address,
       city, country, latitude, longitude, image_url, organizer_id, whatsapp, external_link
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
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
    external_link?.trim() || ''
  );

  const event = db.prepare(
    `SELECT e.*, u.full_name AS organizer_name, u.username AS organizer_username
     FROM community_events e JOIN users u ON u.id = e.organizer_id WHERE e.id = ?`
  ).get(id);
  res.status(201).json({ ...event, interested_by_me: false });
});

router.get('/:id', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const event = db.prepare(
    `SELECT e.*, u.full_name AS organizer_name, u.username AS organizer_username, u.avatar_url AS organizer_avatar
     FROM community_events e
     JOIN users u ON u.id = e.organizer_id
     WHERE e.id = ? AND e.is_active = 1`
  ).get(id) as Record<string, unknown> | undefined;
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

  const interest = db.prepare(
    'SELECT id FROM event_interests WHERE event_id = ? AND user_id = ?'
  ).get(id, req.user!.id);

  res.json({ ...event, interested_by_me: !!interest });
});

router.post('/:id/interest', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const event = db.prepare('SELECT id FROM community_events WHERE id = ? AND is_active = 1').get(id);
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

  const existing = db.prepare(
    'SELECT id FROM event_interests WHERE event_id = ? AND user_id = ?'
  ).get(id, req.user!.id);
  if (existing) return res.json({ ok: true, interested: true });

  db.prepare(
    'INSERT INTO event_interests (id, event_id, user_id) VALUES (?, ?, ?)'
  ).run(uuid(), id, req.user!.id);
  db.prepare('UPDATE community_events SET interest_count = interest_count + 1 WHERE id = ?').run(id);
  res.json({ ok: true, interested: true });
});

router.delete('/:id/interest', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const result = db.prepare('DELETE FROM event_interests WHERE event_id = ? AND user_id = ?').run(id, req.user!.id);
  if (result.changes > 0) {
    db.prepare(
      `UPDATE community_events SET interest_count = CASE WHEN interest_count > 0 THEN interest_count - 1 ELSE 0 END WHERE id = ?`
    ).run(id);
  }
  res.json({ ok: true, interested: false });
});

export default router;

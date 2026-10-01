import { TERMS_VERSION } from '../lib/terms.js';

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  is_admin?: number;
  password_set?: number;
  is_active?: number;
  email_verified?: number;
  is_verified?: number;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  created_at: string;
};

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function userSnapshot(user: {
  id: string; username: string; full_name: string; avatar_url: string | null;
  city?: string; country?: string;
}) {
  return JSON.stringify({
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
    city: user.city || '',
    country: user.country || '',
  });
}

export function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
    is_admin: !!user.is_admin,
    email_verified: !!user.email_verified,
    is_verified: !!user.is_verified,
    terms_accepted: !!(user.terms_accepted_at && user.terms_version === TERMS_VERSION),
    created_at: user.created_at,
  };
}

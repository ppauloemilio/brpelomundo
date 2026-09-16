import {
  neon,
  types,
  type CustomTypesConfig,
  type HTTPQueryOptions,
  type NeonQueryFunction,
} from '@neondatabase/serverless';

/**
 * int8 (COUNT/SUM) e numeric chegam como string no protocolo do Postgres.
 * As rotas fazem aritmética direto no resultado, então convertemos aqui.
 */
const AS_NUMBER = new Set([20, 1700]);

const customTypes: CustomTypesConfig = {
  getTypeParser: (oid, format) =>
    AS_NUMBER.has(oid as number)
      ? (value: string | null) => (value === null ? null : Number(value))
      : types.getTypeParser(oid, format),
};

/**
 * `neon()` desestrutura apenas algumas chaves das opções e descarta `types`
 * silenciosamente — os parsers só valem se forem passados em cada query.
 */
const QUERY_OPTS: HTTPQueryOptions<false, true> = {
  arrayMode: false,
  fullResults: true,
  types: customTypes,
};

let client: NeonQueryFunction<false, true> | null = null;

function getClient(): NeonQueryFunction<false, true> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL não configurada. Crie server/.env com a connection string do Neon.'
      );
    }
    client = neon(url, { fullResults: true });
  }
  return client;
}

/**
 * Percorre o SQL respeitando literais, identificadores entre aspas e comentários,
 * chamando `onChar` fora deles. Base para conversão de `?` e split de statements.
 */
function scan(sql: string, onChar: (char: string) => string | null): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const char = sql[i];

    if (char === "'" || char === '"') {
      const end = endOfQuoted(sql, i, char);
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    if (char === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    if (char === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    if (char === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        out += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }

    const replacement = onChar(char);
    out += replacement === null ? char : replacement;
    i += 1;
  }
  return out;
}

/** Índice logo após a aspa de fechamento, tratando `''`/`""` como escape. */
function endOfQuoted(sql: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] !== quote) {
      i += 1;
    } else if (sql[i + 1] === quote) {
      i += 2;
    } else {
      return i + 1;
    }
  }
  return sql.length;
}

/** Converte os `?` do estilo SQLite para os `$1..$n` do Postgres. */
export function toPositional(sql: string): string {
  let n = 0;
  return scan(sql, (char) => (char === '?' ? `$${++n}` : null));
}

const SPLIT_MARKER = '\u0000';

export function splitStatements(sql: string): string[] {
  return scan(sql, (char) => (char === ';' ? SPLIT_MARKER : null))
    .split(SPLIT_MARKER)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function query<T>(sql: string, params: unknown[]): Promise<{ rows: T[]; changes: number }> {
  const result = await getClient().query(toPositional(sql), params, QUERY_OPTS);
  return { rows: result.rows as T[], changes: result.rowCount ?? 0 };
}

export const db = {
  /** Primeira linha do resultado, ou `undefined` quando não há linhas. */
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const { rows } = await query<T>(sql, params);
    return rows[0];
  },

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rows } = await query<T>(sql, params);
    return rows;
  },

  /** INSERT/UPDATE/DELETE. `changes` é a quantidade de linhas afetadas. */
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const { changes } = await query<unknown>(sql, params);
    return { changes };
  },

  /** DDL e scripts com múltiplos statements separados por `;`. */
  async exec(sql: string): Promise<void> {
    for (const statement of splitStatements(sql)) {
      await getClient().query(statement, [], QUERY_OPTS);
    }
  },
};

import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from 'drizzle-orm/sqlite-core';
export const records = sqliteTable(
  'mw_records',
  {
    owner: text('owner').notNull(),
    id: text('id').notNull(),
    kind: text('kind').notNull(),
    revision: integer('revision').notNull().default(1),
    payload: text('payload').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.id] }),
    index('mw_owner_kind').on(t.owner, t.kind),
  ],
);

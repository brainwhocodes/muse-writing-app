import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author').default(''),
  genre: text('genre').default(''),
  logline: text('logline').default(''),
  synopsis: text('synopsis').default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`)
})

export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  summary: text('summary').default(''),
  status: text('status').default('draft'), // 'draft' | 'complete' | 'idea'
  order: integer('order').notNull(),
  content: text('content').default(''), // Future proofing
  characterIds: text('character_ids').default('[]') // Storing as JSON array string for simplicity
})

export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  role: text('role').default(''),
  bio: text('bio').default(''),
  traits: text('traits').default('')
})

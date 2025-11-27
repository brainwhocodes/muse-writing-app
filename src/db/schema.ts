import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author').default(''),
  genre: text('genre').default(''),
  logline: text('logline').default(''),
  synopsis: text('synopsis').default(''),
  originalPremise: text('original_premise').default(''),
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
  content: text('content').default(''),
  characterIds: text('character_ids').default('[]'),
  beats: text('beats').default('[]') // JSON array of StoryBeat objects
})

export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  role: text('role').default(''),
  bio: text('bio').default(''),
  traits: text('traits').default(''),
  isPov: integer('is_pov', { mode: 'boolean' }).default(false),
  voiceDiction: text('voice_diction').default(''),
  voiceForbidden: text('voice_forbidden').default(''),
  voiceMetaphors: text('voice_metaphors').default('')
})

export const terminology = sqliteTable('terminology', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  term: text('term').notNull(),
  definition: text('definition').default(''),
  notes: text('notes').default(''),
  chapterIds: text('chapter_ids').default('[]'),
  category: text('category').default('other'),
  aliases: text('aliases').default('')
})

export const improvedPrompts = sqliteTable('improved_prompts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  basePromptKey: text('base_prompt_key').notNull().unique(),
  originalPrompt: text('original_prompt').notNull(),
  improvedPrompt: text('improved_prompt').notNull(),
  score: integer('score').default(0),
  mutations: text('mutations').default('[]'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`)
})

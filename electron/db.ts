import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { app, ipcMain } from 'electron'
import path from 'path'

let db: LibSQLDatabase<typeof schema>

function parseJsonSafe<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value as T
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

// Manual table creation to avoid migration complexity in Electron for now
const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT DEFAULT '',
  genre TEXT DEFAULT '',
  logline TEXT DEFAULT '',
  synopsis TEXT DEFAULT '',
  original_premise TEXT DEFAULT '',
  story_bible TEXT DEFAULT '{}',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  "order" INTEGER NOT NULL,
  content TEXT DEFAULT '',
  character_ids TEXT DEFAULT '[]',
  beats TEXT DEFAULT '[]',
  placeholder TEXT DEFAULT '',
  validator_notes TEXT DEFAULT '',
  draft_status TEXT DEFAULT 'draft',
  dense_summary TEXT DEFAULT '',
  context_snapshot TEXT DEFAULT '',
  context_tokens INTEGER DEFAULT 0,
  last_prompt_hash TEXT DEFAULT '',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  traits TEXT DEFAULT '',
  is_pov INTEGER DEFAULT 0,
  voice_diction TEXT DEFAULT '',
  voice_forbidden TEXT DEFAULT '',
  voice_metaphors TEXT DEFAULT '',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS terminology (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  term TEXT NOT NULL,
  definition TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  chapter_ids TEXT DEFAULT '[]',
  category TEXT DEFAULT 'other',
  aliases TEXT DEFAULT '',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS improved_prompts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_prompt_key TEXT NOT NULL UNIQUE,
  original_prompt TEXT NOT NULL,
  improved_prompt TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  mutations TEXT DEFAULT '[]',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
`

export function initDb() {
  const userDataPath = app.getPath('userData')
  
  // In development, use a local file in the project root so we can inspect it easier
  // process.env.VITE_DEV_SERVER_URL is set by electron-vite in dev mode
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  
  const dbPath = !isDev 
    ? path.join(process.cwd(), 'dev.db')
    : path.join(userDataPath, 'writing-app.db')
  
  console.log('Initializing DB at:', dbPath)

  const client = createClient({
    url: `file:${dbPath}`
  })

  db = drizzle(client, { schema })

  // Run migrations / init tables
  client.executeMultiple(CREATE_TABLES_SQL)
    .then(async () => {
      // Schema migrations for existing databases
      const migrations = [
        "ALTER TABLE chapters ADD COLUMN content TEXT DEFAULT ''",
        "ALTER TABLE chapters ADD COLUMN beats TEXT DEFAULT '[]'",
        "ALTER TABLE chapters ADD COLUMN placeholder TEXT DEFAULT ''",
        "ALTER TABLE chapters ADD COLUMN validator_notes TEXT DEFAULT ''",
        "ALTER TABLE chapters ADD COLUMN draft_status TEXT DEFAULT 'draft'",
        "ALTER TABLE chapters ADD COLUMN dense_summary TEXT DEFAULT ''",
        "ALTER TABLE chapters ADD COLUMN context_snapshot TEXT DEFAULT ''",
        "ALTER TABLE chapters ADD COLUMN context_tokens INTEGER DEFAULT 0",
        "ALTER TABLE chapters ADD COLUMN last_prompt_hash TEXT DEFAULT ''",
        "ALTER TABLE characters ADD COLUMN is_pov INTEGER DEFAULT 0",
        "ALTER TABLE characters ADD COLUMN voice_diction TEXT DEFAULT ''",
        "ALTER TABLE characters ADD COLUMN voice_forbidden TEXT DEFAULT ''",
        "ALTER TABLE characters ADD COLUMN voice_metaphors TEXT DEFAULT ''",
        "ALTER TABLE terminology ADD COLUMN category TEXT DEFAULT 'other'",
        "ALTER TABLE terminology ADD COLUMN aliases TEXT DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN original_premise TEXT DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN story_bible TEXT DEFAULT '{}'"
      ]
      for (const sql of migrations) {
        await client.execute(sql).catch(() => {
          // Column likely already exists, ignore error
        })
      }
    })
    .catch(err => {
      console.error('Failed to initialize DB tables:', err)
    })

  setupHandlers()
}

function setupHandlers() {
  ipcMain.handle('db-save-project', async (_, { project, chapters, characters, terms }) => {
    try {
      console.log(`Saving project with ${chapters.length} chapters`)
      if (chapters.length > 0) {
        console.log(`First chapter content length: ${chapters[0].content?.length || 0}`)
      }

      // 1. Save Project
      await db.insert(schema.projects).values({
        id: project.id || 'default-project', // Single project for now
        title: project.title,
        author: project.author,
        genre: project.genre,
        logline: project.logline,
        synopsis: project.synopsis,
        originalPremise: project.originalPremise || '',
        storyBible: JSON.stringify(project.storyBible || {}),
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: schema.projects.id,
        set: {
          title: project.title,
          author: project.author,
          genre: project.genre,
          logline: project.logline,
          synopsis: project.synopsis,
          originalPremise: project.originalPremise || '',
          storyBible: JSON.stringify(project.storyBible || {}),
          updatedAt: new Date()
        }
      })

      const projectId = project.id || 'default-project'

      // 2. Sync Chapters (Delete all for project and re-insert)
      // In a real app, we might want to be smarter, but this ensures perfect sync
      await db.delete(schema.chapters).where(eq(schema.chapters.projectId, projectId))
      
      if (chapters.length > 0) {
        await db.insert(schema.chapters).values(chapters.map((c: any, index: number) => ({
          id: c.id,
          projectId: projectId,
          title: c.title,
          summary: c.summary,
          status: c.status,
          order: index,
          content: c.content || '',
          characterIds: JSON.stringify(c.characters || []),
          beats: JSON.stringify(c.beats || []),
          placeholder: c.placeholder || '',
          validatorNotes: c.validatorNotes || '',
          draftStatus: c.draftStatus || c.status || 'draft',
          denseSummary: c.denseSummary || '',
          contextSnapshot: c.contextSnapshot || '',
          contextTokens: c.contextTokens || 0,
          lastPromptHash: c.lastPromptHash || ''
        })))
      }

      // 3. Sync Characters
      await db.delete(schema.characters).where(eq(schema.characters.projectId, projectId))
      
      if (characters.length > 0) {
        await db.insert(schema.characters).values(characters.map((c: any) => ({
          id: c.id,
          projectId: projectId,
          name: c.name,
          role: c.role,
          bio: c.bio,
          traits: c.traits,
          isPov: c.isPov ? 1 : 0,
          voiceDiction: c.voiceDiction || '',
          voiceForbidden: c.voiceForbidden || '',
          voiceMetaphors: c.voiceMetaphors || ''
        })))
      }

      // 4. Sync Terminology
      await db.delete(schema.terminology).where(eq(schema.terminology.projectId, projectId))
      
      if (terms && terms.length > 0) {
        await db.insert(schema.terminology).values(terms.map((t: any) => ({
          id: t.id,
          projectId: projectId,
          term: t.term,
          definition: t.definition || '',
          notes: t.notes || '',
          chapterIds: JSON.stringify(t.chapters || []),
          category: t.category || 'other',
          aliases: t.aliases || ''
        })))
      }

      return { success: true }
    } catch (error) {
      console.error('Save Error:', error)
      throw error
    }
  })

  ipcMain.handle('db-load-project', async (_, projectId = 'default-project') => {
    try {
      console.log('Loading project from DB:', projectId)
      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, projectId)
      })
      console.log('Found project:', project)

      if (!project) return null

      const dbChapters = await db.query.chapters.findMany({
        where: eq(schema.chapters.projectId, projectId),
        orderBy: (chapters, { asc }) => [asc(chapters.order)]
      })
      console.log('Found chapters:', dbChapters.length)

      const dbCharacters = await db.query.characters.findMany({
        where: eq(schema.characters.projectId, projectId)
      })
      console.log('Found characters:', dbCharacters.length)

      const dbTerms = await db.query.terminology.findMany({
        where: eq(schema.terminology.projectId, projectId)
      })
      console.log('Found terms:', dbTerms.length)

      // Transform back to store format
      return {
        project: {
            id: project.id,
            title: project.title,
            author: project.author,
            genre: project.genre,
            logline: project.logline,
            synopsis: project.synopsis,
            originalPremise: project.originalPremise || '',
            storyBible: parseJsonSafe(project.storyBible, {})
        },
        chapters: dbChapters.map(c => ({
            id: c.id,
            title: c.title,
            summary: c.summary,
            status: c.status,
            content: c.content,
            characters: parseJsonSafe<string[]>(c.characterIds, []),
            beats: parseJsonSafe(c.beats, []),
            placeholder: c.placeholder || '',
            validatorNotes: c.validatorNotes || '',
            draftStatus: c.draftStatus || c.status || 'draft',
            denseSummary: c.denseSummary || '',
            contextSnapshot: c.contextSnapshot || '',
            contextTokens: Number(c.contextTokens || 0),
            lastPromptHash: c.lastPromptHash || ''
        })),
        characters: dbCharacters.map(c => ({
            id: c.id,
            name: c.name,
            role: c.role,
            bio: c.bio,
            traits: c.traits,
            isPov: !!c.isPov,
            voiceDiction: c.voiceDiction || '',
            voiceForbidden: c.voiceForbidden || '',
            voiceMetaphors: c.voiceMetaphors || ''
        })),
        terms: dbTerms.map(t => ({
            id: t.id,
            term: t.term,
            definition: t.definition,
            notes: t.notes,
            chapters: JSON.parse(t.chapterIds || '[]'),
            category: t.category || 'other',
            aliases: t.aliases || ''
        }))
      }
    } catch (error) {
      console.error('Load Error:', error)
      throw error
    }
  })

  // List all projects
  ipcMain.handle('db-list-projects', async () => {
    try {
      const projects = await db.query.projects.findMany({
        orderBy: (projects, { desc }) => [desc(projects.updatedAt)]
      })
      return projects.map(p => ({
        id: p.id,
        title: p.title,
        author: p.author,
        updatedAt: p.updatedAt
      }))
    } catch (error) {
      console.error('List Projects Error:', error)
      throw error
    }
  })

  // Delete a project
  ipcMain.handle('db-delete-project', async (_, projectId: string) => {
    try {
      // Delete related data first (cascade should handle but be explicit)
      await db.delete(schema.chapters).where(eq(schema.chapters.projectId, projectId))
      await db.delete(schema.characters).where(eq(schema.characters.projectId, projectId))
      await db.delete(schema.terminology).where(eq(schema.terminology.projectId, projectId))
      await db.delete(schema.projects).where(eq(schema.projects.id, projectId))
      return { success: true }
    } catch (error) {
      console.error('Delete Project Error:', error)
      throw error
    }
  })

  // ============================================
  // Improved Prompts (GEPA) Handlers
  // ============================================

  // Save or update an improved prompt
  ipcMain.handle('db-save-improved-prompt', async (_, promptData: {
    id: string
    name: string
    basePromptKey: string
    originalPrompt: string
    improvedPrompt: string
    score: number
    mutations: string[]
  }) => {
    try {
      await db.insert(schema.improvedPrompts).values({
        id: promptData.id,
        name: promptData.name,
        basePromptKey: promptData.basePromptKey,
        originalPrompt: promptData.originalPrompt,
        improvedPrompt: promptData.improvedPrompt,
        score: Math.round(promptData.score * 100),
        mutations: JSON.stringify(promptData.mutations),
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: schema.improvedPrompts.basePromptKey,
        set: {
          improvedPrompt: promptData.improvedPrompt,
          score: Math.round(promptData.score * 100),
          mutations: JSON.stringify(promptData.mutations),
          updatedAt: new Date()
        }
      })
      return { success: true }
    } catch (error) {
      console.error('Save Improved Prompt Error:', error)
      throw error
    }
  })

  // Load all improved prompts
  ipcMain.handle('db-load-improved-prompts', async () => {
    try {
      const prompts = await db.query.improvedPrompts.findMany()
      return prompts.map(p => ({
        id: p.id,
        name: p.name,
        basePromptKey: p.basePromptKey,
        originalPrompt: p.originalPrompt,
        improvedPrompt: p.improvedPrompt,
        score: (p.score || 0) / 100,
        mutations: JSON.parse(p.mutations || '[]'),
        createdAt: p.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: p.updatedAt?.toISOString() || new Date().toISOString()
      }))
    } catch (error) {
      console.error('Load Improved Prompts Error:', error)
      throw error
    }
  })

  // Delete an improved prompt (reset to original)
  ipcMain.handle('db-delete-improved-prompt', async (_, basePromptKey: string) => {
    try {
      await db.delete(schema.improvedPrompts).where(eq(schema.improvedPrompts.basePromptKey, basePromptKey))
      return { success: true }
    } catch (error) {
      console.error('Delete Improved Prompt Error:', error)
      throw error
    }
  })
}

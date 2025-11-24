import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { app, ipcMain } from 'electron'
import path from 'path'

let db: LibSQLDatabase<typeof schema>

// Manual table creation to avoid migration complexity in Electron for now
const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT DEFAULT '',
  genre TEXT DEFAULT '',
  logline TEXT DEFAULT '',
  synopsis TEXT DEFAULT '',
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
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  traits TEXT DEFAULT '',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
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
    .then(() => {
      // Schema migration: Ensure 'content' column exists for existing databases
      return client.execute("ALTER TABLE chapters ADD COLUMN content TEXT DEFAULT ''").catch(() => {
        // Column likely already exists, ignore error
      })
    })
    .catch(err => {
      console.error('Failed to initialize DB tables:', err)
    })

  setupHandlers()
}

function setupHandlers() {
  ipcMain.handle('db-save-project', async (_, { project, chapters, characters }) => {
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
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: schema.projects.id,
        set: {
          title: project.title,
          author: project.author,
          genre: project.genre,
          logline: project.logline,
          synopsis: project.synopsis,
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
          characterIds: JSON.stringify(c.characters || [])
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
          traits: c.traits
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

      // Transform back to store format
      return {
        project: {
            id: project.id,
            title: project.title,
            author: project.author,
            genre: project.genre,
            logline: project.logline,
            synopsis: project.synopsis
        },
        chapters: dbChapters.map(c => ({
            id: c.id,
            title: c.title,
            summary: c.summary,
            status: c.status,
            content: c.content,
            characters: JSON.parse(c.characterIds || '[]')
        })),
        characters: dbCharacters.map(c => ({
            id: c.id,
            name: c.name,
            role: c.role,
            bio: c.bio,
            traits: c.traits
        }))
      }
    } catch (error) {
      console.error('Load Error:', error)
      throw error
    }
  })
}

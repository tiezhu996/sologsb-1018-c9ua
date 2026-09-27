import type { PersistedPractice, PracticeProject } from './types'

const DB_NAME = 'sologsb-1018-prosody'
const STORE = 'practice'
const KEY = 'current'
const FALLBACK_KEY = 'sologsb-1018-fallback'

// 旧版本练习没有处理标记和学生回话，打开时按未处理补齐。
export function normalizeProject(project: PracticeProject): PracticeProject {
  return {
    ...project,
    attempts: project.attempts.map((attempt) => ({
      ...attempt,
      feedback: (attempt.feedback ?? []).map((item) => ({
        ...item,
        resolved: item.resolved ?? false,
        studentReply: item.studentReply ?? ''
      }))
    }))
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadPractice(): Promise<PracticeProject | null> {
  try {
    const db = await openDb()
    const value = await new Promise<PersistedPractice | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).get(KEY)
      request.onsuccess = () => resolve(request.result as PersistedPractice | undefined)
      request.onerror = () => reject(request.error)
    })
    db.close()
    if (value?.project) return normalizeProject(value.project)
  } catch {
    const raw = localStorage.getItem(FALLBACK_KEY)
    if (raw) return normalizeProject(JSON.parse(raw) as PracticeProject)
  }
  return null
}

export async function savePractice(project: PracticeProject): Promise<'indexeddb' | 'localstorage'> {
  const value: PersistedPractice = { project, version: 1 }
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(value, KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
    return 'indexeddb'
  } catch {
    const fallback = { ...project, attempts: project.attempts.map((attempt) => ({ ...attempt, audioBlob: undefined })) }
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(fallback))
    return 'localstorage'
  }
}

export async function clearPractice(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).delete(KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  } catch {
    // Ignore cleanup errors and clear the fallback below.
  }
  localStorage.removeItem(FALLBACK_KEY)
}

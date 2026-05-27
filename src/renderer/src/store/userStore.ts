import { create } from 'zustand'
import { nanoid } from 'nanoid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  uid: string
  username: string
  /** SHA-256 hex of password */
  passwordHash: string
  nickname: string
  /** single emoji or 1-2 letter initials */
  avatar: string
  createdAt: number
}

interface UserStore {
  /** currently logged-in user, null = not authenticated */
  currentUser: User | null
  /** all registered users */
  users: User[]

  // auth
  register: (username: string, password: string, nickname: string) => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  updateProfile: (patch: Partial<Pick<User, 'nickname' | 'avatar'>>) => void

  // session ownership
  claimSession: (sessionId: string) => void
  getUserSessionIds: () => Set<string>

  // internal
  _load: () => void
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const KEYS = {
  users: 'omp_users',
  currentUid: 'omp_current_uid',
  sessionMap: 'omp_session_map' // { [uid]: string[] }
} as const

function readUsers(): User[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.users) || '[]')
  } catch {
    return []
  }
}

function writeUsers(users: User[]): void {
  localStorage.setItem(KEYS.users, JSON.stringify(users))
}

function readCurrentUid(): string | null {
  return localStorage.getItem(KEYS.currentUid)
}

function writeCurrentUid(uid: string | null): void {
  if (uid) {
    localStorage.setItem(KEYS.currentUid, uid)
  } else {
    localStorage.removeItem(KEYS.currentUid)
  }
}

function readSessionMap(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(KEYS.sessionMap) || '{}')
  } catch {
    return {}
  }
}

function writeSessionMap(map: Record<string, string[]>): void {
  localStorage.setItem(KEYS.sessionMap, JSON.stringify(map))
}

// ---------------------------------------------------------------------------
// Crypto helper (Web Crypto API — available in Electron renderer)
// ---------------------------------------------------------------------------

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function defaultAvatar(nickname: string): string {
  // pick first char as avatar
  return nickname.trim().charAt(0).toUpperCase() || '?'
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUserStore = create<UserStore>((set, get) => ({
  currentUser: null,
  users: [],

  _load: () => {
    const users = readUsers()
    const uid = readCurrentUid()
    const currentUser = uid ? (users.find((u) => u.uid === uid) ?? null) : null
    set({ users, currentUser })
  },

  register: async (username, password, nickname) => {
    const users = readUsers()
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('用户名已存在')
    }
    const passwordHash = await sha256(password)
    const newUser: User = {
      uid: nanoid(),
      username: username.trim(),
      passwordHash,
      nickname: nickname.trim() || username.trim(),
      avatar: defaultAvatar(nickname || username),
      createdAt: Date.now()
    }
    const next = [...users, newUser]
    writeUsers(next)
    writeCurrentUid(newUser.uid)
    set({ users: next, currentUser: newUser })
  },

  login: async (username, password) => {
    const users = readUsers()
    const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase())
    if (!user) throw new Error('用户不存在')
    const hash = await sha256(password)
    if (hash !== user.passwordHash) throw new Error('密码错误')
    writeCurrentUid(user.uid)
    set({ currentUser: user })
  },

  logout: () => {
    writeCurrentUid(null)
    set({ currentUser: null })
  },

  updateProfile: (patch) => {
    const { currentUser, users } = get()
    if (!currentUser) return
    const updated: User = { ...currentUser, ...patch }
    const next = users.map((u) => (u.uid === updated.uid ? updated : u))
    writeUsers(next)
    writeCurrentUid(updated.uid)
    set({ users: next, currentUser: updated })
  },

  claimSession: (sessionId) => {
    const { currentUser } = get()
    if (!currentUser) return
    const map = readSessionMap()
    const ids = map[currentUser.uid] ?? []
    if (!ids.includes(sessionId)) {
      map[currentUser.uid] = [...ids, sessionId]
      writeSessionMap(map)
    }
  },

  getUserSessionIds: () => {
    const { currentUser } = get()
    if (!currentUser) return new Set()
    const map = readSessionMap()
    return new Set(map[currentUser.uid] ?? [])
  }
}))

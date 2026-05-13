import { create } from 'zustand'

// ─── Types ────────────────────────────────────────────

export interface DragEditItem {
  pageId: string
  htmlPath: string
  selector: string
  x: number
  y: number
  width: number | null
  height: number | null
  childUpdates: Array<{ path: number[]; width?: number; height?: number }>
  isAbsoluteMode: boolean
}

export interface TextEditItem {
  pageId: string
  htmlPath: string
  selector: string
  patch: {
    text?: string
    style: { color?: string; fontSize?: string; fontWeight?: string }
  }
}

export interface DeleteItem {
  pageId: string
  htmlPath: string
  selector: string
}

export interface EditSnapshot {
  dragEdits: DragEditItem[]
  textEdits: TextEditItem[]
  deletes: DeleteItem[]
}

// ─── Helpers ──────────────────────────────────────────

function cloneSnapshot(s: EditSnapshot): EditSnapshot {
  return {
    dragEdits: s.dragEdits.map((e) => ({
      ...e,
      childUpdates: e.childUpdates.map((c) => ({ ...c }))
    })),
    textEdits: s.textEdits.map((e) => ({
      ...e,
      patch: {
        text: e.patch.text,
        style: { ...e.patch.style }
      }
    })),
    deletes: s.deletes.map((e) => ({ ...e }))
  }
}

function takeSnapshot(
  dragEdits: DragEditItem[],
  textEdits: TextEditItem[],
  deletes: DeleteItem[]
): EditSnapshot {
  return cloneSnapshot({ dragEdits, textEdits, deletes })
}

// ─── Store ────────────────────────────────────────────

interface EditHistoryState {
  dragEdits: DragEditItem[]
  textEdits: TextEditItem[]
  deletes: DeleteItem[]
  undoStack: EditSnapshot[]
  redoStack: EditSnapshot[]

  upsertDragEdit: (edit: DragEditItem) => void
  upsertTextEdit: (edit: TextEditItem) => void
  addDelete: (item: DeleteItem) => void
  undo: () => EditSnapshot | null
  redo: () => EditSnapshot | null
  canUndo: () => boolean
  canRedo: () => boolean
  clearPage: (pageId: string) => void
  clear: () => void
  getSnapshotForPage: (pageId: string) => EditSnapshot
}

export const useEditHistoryStore = create<EditHistoryState>((set, get) => ({
  dragEdits: [],
  textEdits: [],
  deletes: [],
  undoStack: [],
  redoStack: [],

  upsertDragEdit: (edit) =>
    set((state) => {
      const snapshot = takeSnapshot(state.dragEdits, state.textEdits, state.deletes)
      const idx = state.dragEdits.findIndex(
        (item) =>
          item.pageId === edit.pageId &&
          item.htmlPath === edit.htmlPath &&
          item.selector === edit.selector
      )
      const next =
        idx < 0
          ? [...state.dragEdits, edit]
          : state.dragEdits.map((item, i) => (i === idx ? edit : item))
      return {
        undoStack: [...state.undoStack, snapshot],
        redoStack: [],
        dragEdits: next
      }
    }),

  upsertTextEdit: (edit) =>
    set((state) => {
      const snapshot = takeSnapshot(state.dragEdits, state.textEdits, state.deletes)
      const idx = state.textEdits.findIndex(
        (item) =>
          item.pageId === edit.pageId &&
          item.selector === edit.selector
      )
      const next =
        idx < 0
          ? [...state.textEdits, edit]
          : state.textEdits.map((item, i) => (i === idx ? edit : item))
      return {
        undoStack: [...state.undoStack, snapshot],
        redoStack: [],
        textEdits: next
      }
    }),

  addDelete: (item) =>
    set((state) => {
      const snapshot = takeSnapshot(state.dragEdits, state.textEdits, state.deletes)
      return {
        undoStack: [...state.undoStack, snapshot],
        redoStack: [],
        deletes: [...state.deletes, item]
      }
    }),

  undo: () => {
    const state = get()
    if (state.undoStack.length === 0) return null
    const prev = state.undoStack[state.undoStack.length - 1]
    const current = takeSnapshot(state.dragEdits, state.textEdits, state.deletes)
    set({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, current],
      dragEdits: prev.dragEdits,
      textEdits: prev.textEdits,
      deletes: prev.deletes
    })
    return cloneSnapshot(prev)
  },

  redo: () => {
    const state = get()
    if (state.redoStack.length === 0) return null
    const next = state.redoStack[state.redoStack.length - 1]
    const current = takeSnapshot(state.dragEdits, state.textEdits, state.deletes)
    set({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, current],
      dragEdits: next.dragEdits,
      textEdits: next.textEdits,
      deletes: next.deletes
    })
    return cloneSnapshot(next)
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  clearPage: (_pageId) =>
    set(() => ({
      dragEdits: [],
      textEdits: [],
      deletes: [],
      undoStack: [],
      redoStack: []
    })),

  clear: () =>
    set({
      dragEdits: [],
      textEdits: [],
      deletes: [],
      undoStack: [],
      redoStack: []
    }),

  getSnapshotForPage: (pageId) => {
    const state = get()
    return {
      dragEdits: state.dragEdits.filter((e) => e.pageId === pageId),
      textEdits: state.textEdits.filter((e) => e.pageId === pageId),
      deletes: state.deletes.filter((e) => e.pageId === pageId)
    }
  }
}))

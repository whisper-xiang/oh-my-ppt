export type TemplateSource = 'user'

/**
 * Semantic role of a template page.
 * - cover:           Opening/title page (page 1)
 * - toc:             Table-of-contents page (lists section headers)
 * - section-divider: Section transition slide
 * - content:         The repeatable body/content page (carries background chrome: logo, footer, etc.)
 * - back-cover:      Closing page (last page)
 */
export type TemplatePageRole = 'cover' | 'toc' | 'section-divider' | 'content' | 'back-cover'

export interface TemplateManifestPage {
  pageNumber: number
  pageId: string
  title: string
  htmlPath: string
  /** Semantic role, used to drive which template page is used for each output page. */
  role?: TemplatePageRole
}

export interface TemplateManifest {
  schemaVersion: 1
  id: string
  name: string
  description: string
  sourceSessionId?: string
  createdAt: number
  updatedAt: number
  pageCount: number
  tags: string[]
  styleId?: string | null
  designContract?: unknown
  pages: TemplateManifestPage[]
}

export interface TemplateListItem {
  id: string
  name: string
  description: string
  source: TemplateSource
  pageCount: number
  tags: string[]
  previewHtmlPath: string | null
  previewPages: Array<{
    pageNumber: number
    pageId: string
    title: string
    htmlPath: string
    role?: TemplatePageRole
  }>
  createdAt: number
  updatedAt: number
}

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const VALID_ROLES: TemplatePageRole[] = ['cover', 'toc', 'section-divider', 'content', 'back-cover']

function parseRole(value: unknown): TemplatePageRole | undefined {
  if (typeof value === 'string' && (VALID_ROLES as string[]).includes(value)) {
    return value as TemplatePageRole
  }
  return undefined
}

/**
 * Infer a page role from its position and plain-text content.
 * Used during template creation/import when explicit roles are not yet set.
 */
export function inferPageRole(args: {
  index: number
  total: number
  textContent?: string
}): TemplatePageRole {
  const { index, total, textContent = '' } = args
  if (index === 0) return 'cover'
  if (total >= 2 && index === total - 1) return 'back-cover'
  // Detect table-of-contents pages by common title keywords
  const lower = textContent.toLowerCase()
  const isToc =
    index === 1 &&
    /目\s*录|contents?|agenda|outline|纲要|table\s+of\s+contents/.test(lower)
  if (isToc) return 'toc'
  return 'content'
}

export function parseTemplateManifest(raw: unknown): TemplateManifest {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const id = asString(record.id)
  const name = asString(record.name)
  if (!id) throw new Error('模板 manifest 缺少 id')
  if (!name) throw new Error('模板 manifest 缺少 name')

  const rawPages = Array.isArray(record.pages) ? record.pages : []
  const pages = rawPages
    .map((item, index): TemplateManifestPage => {
      const page = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const pageNumber = Math.max(1, Math.floor(asNumber(page.pageNumber) || index + 1))
      const pageId = asString(page.pageId) || `page-${pageNumber}`
      return {
        pageNumber,
        pageId,
        title: asString(page.title) || `第 ${pageNumber} 页`,
        htmlPath: asString(page.htmlPath) || `pages/${pageId}.html`,
        role: parseRole(page.role)
      }
    })
    .sort((a, b) => a.pageNumber - b.pageNumber)

  return {
    schemaVersion: 1,
    id,
    name,
    description: asString(record.description),
    sourceSessionId: asString(record.sourceSessionId) || undefined,
    createdAt: asNumber(record.createdAt) || Date.now(),
    updatedAt: asNumber(record.updatedAt) || Date.now(),
    pageCount: Math.max(0, Math.floor(asNumber(record.pageCount) || pages.length)),
    tags: Array.isArray(record.tags)
      ? record.tags.map((tag) => asString(tag)).filter(Boolean).slice(0, 12)
      : [],
    styleId: asString(record.styleId) || null,
    designContract: record.designContract,
    pages
  }
}

export function manifestToListItem(
  manifest: TemplateManifest,
  paths: {
    previewHtmlPath: string | null
    previewPages: TemplateListItem['previewPages']
  }
): TemplateListItem {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    source: 'user',
    pageCount: manifest.pageCount || manifest.pages.length,
    tags: manifest.tags,
    previewHtmlPath: paths.previewHtmlPath,
    previewPages: paths.previewPages,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt
  }
}

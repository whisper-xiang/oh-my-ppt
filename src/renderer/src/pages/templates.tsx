import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleAlert, FileText, LayoutTemplate, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/Dialog'
import { Input, Textarea } from '../components/ui/Input'
import { SaveTemplateDialog } from '../components/templates/SaveTemplateDialog'
import { TemplateCard, TemplateEmptyState } from '../components/templates/TemplateCard'
import { useTemplateStore, useToastStore } from '../store'
import { ipc, type TemplateListItem } from '../lib/ipc'

const MIN_PAGE_COUNT = 1
const MAX_PAGE_COUNT = 40
const MAX_DOCUMENT_SIZE_MB = 10
const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024

const resolvePageCount = (raw: string, fallback: number): number => {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(MAX_PAGE_COUNT, Math.max(MIN_PAGE_COUNT, parsed))
}

const buildTemplateInitialPrompt = (args: {
  templateName: string
  title: string
  pageCount: number
  brief: string
}): string =>
  [
    `Create a ${args.pageCount}-slide presentation titled "${args.title}".`,
    `Use the selected template "${args.templateName}" as the fixed visual template reference.`,
    'Regenerate every slide from the new brief/source document. Preserve the template direction for layout roles, visual rhythm, colors, typography, and component treatment, but do not reuse old slide text unless the user asks for it.',
    'Page-count mapping: preserve the template cover/opening role for slide 1 and the closing/ending role for the final slide when possible. If the final deck has more pages than the template, add the extra pages in the middle by reusing or varying relevant middle-page roles. If it has fewer pages, merge or skip less relevant middle-page roles. Do not force one-to-one page matching.',
    'Determine the presentation content language from the brief and source documents; do not infer it from the application UI language or this instruction language.',
    '',
    'Brief:',
    args.brief
  ].join('\n')

export function TemplatesPage(): React.JSX.Element {
  const navigate = useNavigate()
  const {
    templates,
    loading,
    fetchTemplates,
    createSessionFromTemplate,
    updateTemplateMetadata,
    deleteTemplate
  } = useTemplateStore()
  const { success, error, warning } = useToastStore()
  const [useTarget, setUseTarget] = useState<TemplateListItem | null>(null)
  const [editTarget, setEditTarget] = useState<TemplateListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TemplateListItem | null>(null)
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [pageCount, setPageCount] = useState('5')
  const [referenceDocumentPath, setReferenceDocumentPath] = useState<string | null>(null)
  const [parsingDocument, setParsingDocument] = useState(false)
  const [documentParseError, setDocumentParseError] = useState<string | null>(null)
  const [hasParsedSource, setHasParsedSource] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const documentInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      await fetchTemplates()
    } catch (err) {
      error('模板加载失败', {
        description: err instanceof Error ? err.message : '请稍后重试'
      })
    }
  }, [error, fetchTemplates])

  useEffect(() => {
    void load()
  }, [load])

  const openUseDialog = (template: TemplateListItem): void => {
    setUseTarget(template)
    setTitle(template.name)
    setBrief('')
    setPageCount(String(resolvePageCount(String(template.pageCount || 5), 5)))
    setReferenceDocumentPath(null)
    setDocumentParseError(null)
    setHasParsedSource(false)
  }

  const closeUseDialog = (): void => {
    if (creating || parsingDocument) return
    setUseTarget(null)
    setTitle('')
    setBrief('')
    setReferenceDocumentPath(null)
    setDocumentParseError(null)
    setHasParsedSource(false)
  }

  const ensureUploadPrerequisites = async (): Promise<boolean> => {
    const validation = await ipc.validateUploadPrerequisites()
    if (validation.ready) return true
    warning('需要先完成设置', {
      description: validation.message || '请先配置存储目录、模型和 API Key',
      action: {
        label: '去设置',
        onClick: () => navigate('/settings')
      }
    })
    return false
  }

  const handleParseDocumentClick = async (): Promise<void> => {
    if (parsingDocument) return
    if (!(await ensureUploadPrerequisites())) return
    documentInputRef.current?.click()
  }

  const handleDocumentFilesSelected = async (files: FileList | null): Promise<void> => {
    const selectedFiles = Array.from(files || [])
    if (documentInputRef.current) {
      documentInputRef.current.value = ''
    }
    if (!useTarget || selectedFiles.length === 0) return
    if (selectedFiles.length > 1) {
      const message = '一次只能上传 1 个参考文档'
      setDocumentParseError(message)
      error('文档数量超出限制', { description: message })
      return
    }

    const selectedFile = selectedFiles[0]
    if (selectedFile.size > MAX_DOCUMENT_SIZE_BYTES) {
      const message = `文档不能超过 ${MAX_DOCUMENT_SIZE_MB}MB`
      setDocumentParseError(message)
      error('文档过大', { description: message })
      return
    }

    const payloadFiles = selectedFiles
      .map((file) => ({
        path: window.electron?.getPathForFile?.(file) || '',
        name: file.name
      }))
      .filter((file) => file.path)
    if (payloadFiles.length === 0) {
      setDocumentParseError('无法读取文档路径，请重新选择')
      error('文档读取失败')
      return
    }

    setParsingDocument(true)
    setDocumentParseError(null)
    setHasParsedSource(false)
    try {
      const result = await ipc.parseDocumentPlan({
        files: payloadFiles,
        topic: title.trim() || useTarget.name,
        pageCount: resolvePageCount(pageCount, useTarget.pageCount || 5),
        existingBrief: brief.trim()
      })
      setTitle(result.topic || title || useTarget.name)
      setPageCount(String(result.pageCount))
      setBrief(result.briefText)
      const referenceFile = result.files.find((file) => file.type !== 'image')
      setReferenceDocumentPath(referenceFile?.path || null)
      setHasParsedSource(true)
      success('文档已解析', {
        description: `已整理 ${result.files.length} 个素材并填入标题、页数和大纲`
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '请稍后重试'
      setDocumentParseError(message)
      error('文档解析失败', { description: message })
    } finally {
      setParsingDocument(false)
    }
  }

  const handleCreate = async (): Promise<void> => {
    if (!useTarget || creating) return
    const deckTitle = title.trim() || useTarget.name
    const briefText = brief.trim()
    if (!briefText) {
      warning('请先填写描述或上传文档解析大纲')
      return
    }
    const safePageCount = resolvePageCount(pageCount, useTarget.pageCount || 5)
    setCreating(true)
    try {
      const sessionId = await createSessionFromTemplate({
        templateId: useTarget.id,
        title: deckTitle,
        pageCount: safePageCount,
        referenceDocumentPath: referenceDocumentPath || undefined
      })
      const initialPrompt = buildTemplateInitialPrompt({
        templateName: useTarget.name,
        title: deckTitle,
        pageCount: safePageCount,
        brief: briefText
      })
      success('已从模板创建会话', { description: '正在按模板重新生成内容' })
      setUseTarget(null)
      navigate(`/sessions/${sessionId}/template-generating`, {
        state: { initialPrompt }
      })
    } catch (err) {
      error('从模板创建失败', {
        description: err instanceof Error ? err.message : '请稍后重试'
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteTemplate(deleteTarget.id)
      success('模板已删除')
      setDeleteTarget(null)
    } catch (err) {
      error('删除模板失败', {
        description: err instanceof Error ? err.message : '请稍后重试'
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleUpdateMetadata = async (payload: {
    name: string
    description: string
    tags: string[]
  }): Promise<void> => {
    if (!editTarget || editing) return
    setEditing(true)
    try {
      await updateTemplateMetadata({
        templateId: editTarget.id,
        ...payload
      })
      success('模板信息已更新')
      setEditTarget(null)
    } catch (err) {
      error('模板更新失败', {
        description: err instanceof Error ? err.message : '请稍后重试'
      })
    } finally {
      setEditing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Templates</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#3e4a32]">模板</h1>
            <p className="mt-2 text-[12px] text-muted-foreground">
              管理从会话沉淀下来的模板，并用它们创建新的演示会话。
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <TemplateEmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUse={openUseDialog}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <Dialog open={Boolean(useTarget)} onOpenChange={(open) => !open && closeUseDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4" />
              使用模板创建会话
            </DialogTitle>
            <DialogDescription>
              输入新内容方向，或上传文档自动解析大纲；生成时会把模板作为固定视觉参考。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-[#5f6b50]">会话标题</label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="w-full sm:w-28">
                <label className="mb-1 block text-xs font-medium text-[#5f6b50]">页数</label>
                <Input
                  value={pageCount}
                  inputMode="numeric"
                  onChange={(event) => setPageCount(event.target.value)}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-[#5f6b50]">描述 / 大纲</label>
                {hasParsedSource && !parsingDocument ? (
                  <span className="rounded-full bg-[#e8f0df] px-2 py-0.5 text-[11px] text-[#4f6340]">
                    已解析
                  </span>
                ) : null}
              </div>
              <Textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                className="min-h-[160px]"
                placeholder="写下新 PPT 的主题、受众、结构和重点；也可以上传文档自动解析大纲。"
              />
            </div>
            <input
              ref={documentInputRef}
              type="file"
              accept=".md,.txt,.text,.csv,.docx"
              multiple={false}
              className="hidden"
              onChange={(event) => void handleDocumentFilesSelected(event.target.files)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleParseDocumentClick()}
                disabled={parsingDocument || creating}
              >
                {parsingDocument ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                {parsingDocument ? '解析中...' : '上传文档解析大纲'}
              </Button>
              <span className="text-xs text-muted-foreground">支持 md/txt/csv/docx，最大 {MAX_DOCUMENT_SIZE_MB}MB</span>
            </div>
            {documentParseError ? (
              <div className="flex items-start gap-2 rounded-md border border-[#d58b7f]/45 bg-[#fff2ef] px-3 py-2 text-xs text-[#8a3d33]">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{documentParseError}</span>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={closeUseDialog} disabled={creating || parsingDocument}>
              取消
            </Button>
            <Button type="button" size="sm" onClick={() => void handleCreate()} disabled={creating || parsingDocument}>
              {creating ? '创建中...' : '创建并生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除模板</DialogTitle>
            <DialogDescription>
              确定删除「{deleteTarget?.name || ''}」吗？这个操作不会影响已创建的会话。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              取消
            </Button>
            <Button type="button" size="sm" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SaveTemplateDialog
        open={Boolean(editTarget)}
        mode="edit"
        defaultName={editTarget?.name || ''}
        defaultDescription={editTarget?.description || ''}
        defaultTags={editTarget?.tags || []}
        saving={editing}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onSubmit={(payload) => void handleUpdateMetadata(payload)}
      />
    </div>
  )
}

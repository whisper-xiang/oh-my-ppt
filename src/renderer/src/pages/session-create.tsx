import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Input'
import { Card, CardContent } from '../components/ui/Card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/Select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/Tooltip'
import { ArrowLeft, CircleAlert, FileText, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useSessionStore } from '../store'
import { useSettingsStore } from '../store'
import { useToastStore } from '../store'
import { ipc, type FontListItem, type StyleParseResult, type OutlineRuleSummary } from '@renderer/lib/ipc'
import type { FontSelection } from '@shared/generation'
import { useT } from '../i18n'
import { isSupportedImageMimeType, normalizeImageMimeType } from '@shared/image-mime'

const MIN_PAGE_COUNT = 1
const MAX_PAGE_COUNT = 40
const DEFAULT_PAGE_COUNT = 5
const MAX_DOCUMENT_SIZE_MB = 10
const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024
const MAX_IMAGE_SIZE_MB = 5
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
const IMAGE_STYLE_PARSE_DELAY_MS = 300
const isImageFileName = (name: string): boolean => /\.(png|jpe?g|webp)$/i.test(name.trim())

const getImageMimeTypeFromFileName = (name: string): string => {
  const normalized = name.trim().toLowerCase()
  if (normalized.endsWith('.png')) return 'image/png'
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg'
  if (normalized.endsWith('.webp')) return 'image/webp'
  return ''
}

const isSupportedImageFile = (file: File): boolean =>
  isSupportedImageMimeType(file.type) || isImageFileName(file.name || '')

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

const resolvePageCount = (raw: string): number => {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_COUNT
  return Math.min(MAX_PAGE_COUNT, Math.max(MIN_PAGE_COUNT, parsed))
}

type Step = 'form' | 'brief'

export function SessionCreatePage(): ReactElement {
  const navigate = useNavigate()
  const { createSession } = useSessionStore()
  const { settings, modelConfigs, fetchSettings } = useSettingsStore()
  const { success, error, warning } = useToastStore()
  const t = useT()

  // local loading state for the two async steps
  const [isCreatingSession, setIsCreatingSession] = useState(false)

  // --- form fields ---
  const [topic, setTopic] = useState('')
  const [pageCount, setPageCount] = useState(String(DEFAULT_PAGE_COUNT))
  const [selectedStyleId, setSelectedStyleId] = useState('')
  const [selectedTitleFontId, setSelectedTitleFontId] = useState('auto')
  const [selectedBodyFontId, setSelectedBodyFontId] = useState('auto')
  const [selectedOutlineRuleId, setSelectedOutlineRuleId] = useState<string>('none')

  // --- options ---
  const [styleOptions, setStyleOptions] = useState<
    Array<{ id: string; label: string; description: string; styleCase?: string }>
  >([])
  const [fontOptions, setFontOptions] = useState<FontListItem[]>([])
  const [outlineRuleOptions, setOutlineRuleOptions] = useState<OutlineRuleSummary[]>([])

  // --- document ---
  const [parsingDocument, setParsingDocument] = useState(false)
  const [documentParseError, setDocumentParseError] = useState<string | null>(null)
  const [hasParsedSource, setHasParsedSource] = useState(false)
  const [referenceDocumentPath, setReferenceDocumentPath] = useState<string | null>(null)
  /** raw briefText returned by document parse — used as LLM context, NOT shown to user */
  const [documentContext, setDocumentContext] = useState<string>('')
  const documentInputRef = useRef<HTMLInputElement | null>(null)

  // --- two-step flow ---
  const [step, setStep] = useState<Step>('form')
  const [brief, setBrief] = useState('')
  const [generatingBrief, setGeneratingBrief] = useState(false)

  // ─── settings validation ───────────────────────────────────────────────────

  const checkSettingsReady = (): boolean => {
    const activeModelConfig = modelConfigs.find((config) => config.active)
    const resolvedApiKey = (activeModelConfig?.apiKey || '').trim()
    const resolvedModel = (activeModelConfig?.model || '').trim()
    const resolvedStoragePath = (settings?.storagePath || '').trim()
    return Boolean(resolvedApiKey && resolvedModel && resolvedStoragePath)
  }

  // ─── form readiness ────────────────────────────────────────────────────────

  const formReady = (() => {
    if (!topic.trim() || !selectedStyleId) return false
    if (!/^\d+$/.test(pageCount.trim())) return false
    const n = Number.parseInt(pageCount.trim(), 10)
    return n >= MIN_PAGE_COUNT && n <= MAX_PAGE_COUNT
  })()

  const briefReady = Boolean(brief.trim())

  // ─── option loading ────────────────────────────────────────────────────────

  const loadStyleOptions = useCallback(
    async (preferredStyleId?: string): Promise<void> => {
      try {
        const { items } = await ipc.listStyles()
        const sorted = [...items].sort(
          (a, b) =>
            (b.updatedAt || 0) - (a.updatedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0)
        )
        const options = sorted.map((item) => ({
          id: item.id,
          label: item.label,
          description: item.description,
          styleCase: item.styleCase
        }))
        setStyleOptions(options)
        setSelectedStyleId((current) => {
          if (preferredStyleId && options.some((option) => option.id === preferredStyleId)) {
            return preferredStyleId
          }
          if (current && options.some((option) => option.id === current)) return current
          return options.length > 0 ? options[0].id : ''
        })
      } catch (err) {
        error(t('home.styleLoadFailed'), {
          description: err instanceof Error ? err.message : t('common.retryLater')
        })
      }
    },
    [error, t]
  )

  const loadFontOptions = useCallback(async (): Promise<void> => {
    try {
      const { googleFonts, userFonts } = await ipc.listFonts()
      const options = [...userFonts, ...googleFonts]
      setFontOptions(options)
      const ids = new Set(options.map((font) => `${font.source}:${font.id}`))
      setSelectedTitleFontId((current) =>
        current === 'auto' || ids.has(current) ? current : 'auto'
      )
      setSelectedBodyFontId((current) =>
        current === 'auto' || ids.has(current) ? current : 'auto'
      )
    } catch {
      setFontOptions([])
      setSelectedTitleFontId('auto')
      setSelectedBodyFontId('auto')
    }
  }, [])

  const loadOutlineRules = useCallback(async (): Promise<void> => {
    try {
      const { items } = await ipc.listOutlineRules()
      setOutlineRuleOptions(items)
    } catch {
      setOutlineRuleOptions([])
    }
  }, [])

  useEffect(() => { void loadStyleOptions() }, [loadStyleOptions])
  useEffect(() => { void loadFontOptions() }, [loadFontOptions])
  useEffect(() => { void loadOutlineRules() }, [loadOutlineRules])
  useEffect(() => { void fetchSettings() }, [fetchSettings])

  // ─── generate brief ────────────────────────────────────────────────────────

  const handleGenerateBrief = async (): Promise<void> => {
    if (!formReady) {
      warning(t('home.completeInfoTitle'), { description: '请先填写主题、风格和页数。' })
      return
    }
    if (!checkSettingsReady()) {
      warning(t('home.settingsRequiredTitle'), {
        description: t('home.settingsRequired'),
        action: { label: t('home.goToSettings'), onClick: () => navigate('/settings') }
      })
      return
    }

    const safePageCount = resolvePageCount(pageCount.trim())
    const selectedStyle = styleOptions.find((o) => o.id === selectedStyleId)
    const styleLabel = selectedStyle?.label ?? selectedStyleId
    const resolvedOutlineRuleId =
      selectedOutlineRuleId && selectedOutlineRuleId !== 'none' ? selectedOutlineRuleId : null

    setGeneratingBrief(true)
    try {
      const result = await ipc.generateBrief({
        topic: topic.trim(),
        pageCount: safePageCount,
        styleId: selectedStyleId,
        styleLabel,
        outlineRuleId: resolvedOutlineRuleId,
        documentContext: documentContext || null
      })
      setBrief(result.briefText)
      setStep('brief')
    } catch (err) {
      error('生成描述失败', {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      setGeneratingBrief(false)
    }
  }

  // ─── create session ────────────────────────────────────────────────────────

  const handleCreateSession = async (): Promise<void> => {
    if (!briefReady) {
      warning(t('home.completeInfoTitle'), { description: '请先生成或填写详细描述。' })
      return
    }
    if (!formReady) {
      setStep('form')
      return
    }
    if (!checkSettingsReady()) {
      warning(t('home.settingsRequiredTitle'), {
        description: t('home.settingsRequired'),
        action: { label: t('home.goToSettings'), onClick: () => navigate('/settings') }
      })
      return
    }

    const findFontBySelectId = (id: string): FontListItem | undefined =>
      fontOptions.find((font) => `${font.source}:${font.id}` === id)
    const selectedTitleFont = findFontBySelectId(selectedTitleFontId)
    const selectedBodyFont = findFontBySelectId(selectedBodyFontId)
    const fontSelection: FontSelection =
      selectedTitleFont && selectedBodyFont
        ? {
            mode: 'pair',
            title: {
              source: selectedTitleFont.source,
              family: selectedTitleFont.family,
              id: selectedTitleFont.id
            },
            body: {
              source: selectedBodyFont.source,
              family: selectedBodyFont.family,
              id: selectedBodyFont.id
            }
          }
        : { mode: 'auto' }

    const topicText = topic.trim()
    const briefText = brief.trim()
    const safePageCount = resolvePageCount(pageCount.trim())
    const resolvedOutlineRuleId =
      selectedOutlineRuleId && selectedOutlineRuleId !== 'none' ? selectedOutlineRuleId : null

    setIsCreatingSession(true)
    try {
      // Step 1: create session
      const sessionId = await createSession({
        topic: topicText,
        styleId: selectedStyleId,
        pageCount: safePageCount,
        referenceDocumentPath: referenceDocumentPath || undefined,
        fontSelection,
        outlineRuleId: resolvedOutlineRuleId,
        initialPrompt: briefText
      })

      // Step 2: kick off outline generation immediately (fire-and-forget; outline page
      // will show the in-progress state when we navigate there)
      void ipc.generateOutline({
        sessionId,
        userMessage: briefText,
        type: 'deck',
        chatType: 'main'
      })

      navigate(`/sessions/${sessionId}/outline`, {
        state: { initialPrompt: briefText, outlineGenerating: true }
      })
    } catch (err) {
      error(t('home.sessionCreateFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      setIsCreatingSession(false)
    }
  }

  // ─── document upload ───────────────────────────────────────────────────────

  const ensureUploadPrerequisites = async (): Promise<boolean> => {
    const validation = await ipc.validateUploadPrerequisites()
    if (validation.ready) return true
    warning(t('home.settingsRequiredTitle'), {
      description: validation.message || t('home.settingsRequired'),
      action: { label: t('home.goToSettings'), onClick: () => navigate('/settings') }
    })
    return false
  }

  const handleParseDocumentClick = async (): Promise<void> => {
    if (parsingDocument) return
    if (!(await ensureUploadPrerequisites())) return
    documentInputRef.current?.click()
  }

  const parseImageStyle = async (file: File): Promise<StyleParseResult> => {
    const hintedMimeType = normalizeImageMimeType(file.type)
    const fallbackMimeType = getImageMimeTypeFromFileName(file.name || '')
    if (!isSupportedImageMimeType(file.type) && !fallbackMimeType) {
      throw new Error(t('styleEditor.imageFormatInvalid'))
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(t('home.imageTooLarge', { maxSize: MAX_IMAGE_SIZE_MB }))
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error(t('styleEditor.imageReadFailed')))
      reader.readAsDataURL(file)
    })
    const match = dataUrl.match(/^data:([^;]*);base64,(.+)$/)
    if (!match) throw new Error(t('styleEditor.imageReadFailed'))
    const dataUrlMimeType = normalizeImageMimeType(match[1])
    const mimeType = isSupportedImageMimeType(match[1])
      ? dataUrlMimeType
      : isSupportedImageMimeType(file.type)
        ? hintedMimeType
        : fallbackMimeType
    const imageBase64 = String(match[2] || '').trim()
    if (!mimeType || !imageBase64) throw new Error(t('styleEditor.imageReadFailed'))
    return await ipc.parseStyleImage({ imageBase64, mimeType })
  }

  const createParsedImageStyle = async (
    parsedStyle: StyleParseResult
  ): Promise<{ id: string; label: string }> => {
    const createdStyle = await ipc.createStyle({
      label: parsedStyle.label,
      description: parsedStyle.description,
      category: parsedStyle.category,
      aliases: parsedStyle.aliases,
      styleSkill: parsedStyle.styleSkill,
      styleCase: parsedStyle.styleCase || ''
    })
    await loadStyleOptions(createdStyle.id)
    return { id: createdStyle.id, label: parsedStyle.label }
  }

  const handleDocumentFilesSelected = async (files: FileList | null): Promise<void> => {
    const selectedFiles = Array.from(files || [])
    if (documentInputRef.current) {
      documentInputRef.current.value = ''
    }
    if (selectedFiles.length === 0) return
    if (selectedFiles.length > 1) {
      const message = t('home.documentSingleOnly')
      setDocumentParseError(message)
      error(t('home.documentCountExceeded'), { description: message })
      return
    }
    const selectedFile = selectedFiles[0]
    const isImage = isSupportedImageFile(selectedFile)
    const maxSizeMb = isImage ? MAX_IMAGE_SIZE_MB : MAX_DOCUMENT_SIZE_MB
    const maxSizeBytes = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_DOCUMENT_SIZE_BYTES
    if (selectedFile.size > maxSizeBytes) {
      const message = isImage
        ? t('home.imageTooLarge', { maxSize: maxSizeMb })
        : t('home.documentTooLarge', { maxSize: maxSizeMb })
      setDocumentParseError(message)
      error(t('home.documentTooLargeTitle'), { description: message })
      return
    }

    const payloadFiles = selectedFiles
      .map((file) => ({
        path: window.electron?.getPathForFile?.(file) || '',
        name: file.name
      }))
      .filter((file) => file.path)

    if (payloadFiles.length === 0) {
      setDocumentParseError(t('home.documentPathFailed'))
      error(t('home.documentPathFailedTitle'))
      return
    }

    const safePageCount = /^\d+$/.test(pageCount.trim())
      ? resolvePageCount(pageCount.trim())
      : DEFAULT_PAGE_COUNT

    setParsingDocument(true)
    setDocumentParseError(null)
    setHasParsedSource(false)
    try {
      const planPromise = ipc.parseDocumentPlan({
        files: payloadFiles,
        topic: topic.trim(),
        pageCount: safePageCount,
        existingBrief: ''
      })
      const imageStyleParsePromise = isImage
        ? delay(IMAGE_STYLE_PARSE_DELAY_MS).then(() => parseImageStyle(selectedFile))
        : Promise.resolve(null)
      const [result, parsedImageStyle] = await Promise.all([planPromise, imageStyleParsePromise])
      const imageStyle = parsedImageStyle ? await createParsedImageStyle(parsedImageStyle) : null
      // populate form fields from parse result
      setTopic(result.topic)
      setPageCount(String(result.pageCount))
      // store the parsed briefText as document context (used for brief generation), NOT shown
      setDocumentContext(result.briefText)
      const referenceFile = result.files.find((file) => file.type !== 'image')
      setReferenceDocumentPath(referenceFile?.path || null)
      // if we were already on the brief step, reset to form so user can re-generate
      setStep('form')
      setBrief('')
      setHasParsedSource(true)
      success(t('home.documentParsed'), {
        description: imageStyle
          ? t('home.imageParsedWithStyle', { style: imageStyle.label })
          : t('home.documentParsedDescription', { count: result.files.length })
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.retryLater')
      setDocumentParseError(message)
      setHasParsedSource(false)
      error(t('home.documentParseFailed'), { description: message })
    } finally {
      setParsingDocument(false)
    }
  }

  // ─── font selectors ────────────────────────────────────────────────────────

  const titleFontOptions = fontOptions.filter((font) => font.role.includes('title'))
  const bodyFontOptions = fontOptions.filter((font) => font.role.includes('body'))
  const availableTitleFonts = titleFontOptions.length > 0 ? titleFontOptions : fontOptions
  const availableBodyFonts = bodyFontOptions.length > 0 ? bodyFontOptions : fontOptions
  const fontSelectHint =
    selectedTitleFontId === 'auto' && selectedBodyFontId === 'auto'
      ? t('home.fontSchemeAutoHint')
      : selectedTitleFontId !== 'auto' && selectedBodyFontId !== 'auto'
        ? t('home.fontSchemeManualHint')
        : t('home.fontSchemePartialHint')

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          {t('home.eyebrow')}
        </p>
        <h1 className="organic-serif mt-2 text-[32px] font-semibold leading-none text-[#2d2560]">
          {t('home.title')}
        </h1>
        <p className="mt-2 text-[12px] text-muted-foreground">{t('home.description')}</p>
      </div>

      {/* ── Step indicator ── */}
      <div className="flex items-center gap-2 text-[12px]">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
            step === 'form'
              ? 'bg-[#4c3fa8] text-white'
              : 'bg-[#ddd8f5] text-[#4c3fa8]'
          }`}
        >
          1
        </span>
        <span className={step === 'form' ? 'font-medium text-[#2d2560]' : 'text-[#9a95b8]'}>
          填写表单
        </span>
        <span className="mx-1 text-[#c9c4e8]">→</span>
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
            step === 'brief'
              ? 'bg-[#4c3fa8] text-white'
              : 'bg-[#ddd8f5] text-[#9a95b8]'
          }`}
        >
          2
        </span>
        <span className={step === 'brief' ? 'font-medium text-[#2d2560]' : 'text-[#9a95b8]'}>
          确认描述
        </span>
      </div>

      {/* ════════════════════ STEP 1 — FORM ════════════════════ */}
      {step === 'form' && (
        <div className="space-y-4">
          {/* Document upload */}
          <div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <TooltipProvider delayDuration={180}>
                <div className="flex flex-wrap items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { void handleParseDocumentClick() }}
                          disabled={parsingDocument}
                          className="shrink-0"
                        >
                          {parsingDocument ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="mr-2 h-4 w-4" />
                          )}
                          {parsingDocument ? t('home.parsingDocument') : t('home.uploadDocument')}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start">
                      {t('home.uploadDocumentTooltip', {
                        maxSize: MAX_DOCUMENT_SIZE_MB,
                        imageMaxSize: MAX_IMAGE_SIZE_MB
                      })}
                    </TooltipContent>
                  </Tooltip>
                  {hasParsedSource && !parsingDocument ? (
                    <span className="rounded-full bg-[#ebe8f8] px-2.5 py-1 text-xs text-[#4c3fa8]">
                      {t('home.parsed')}
                    </span>
                  ) : null}
                </div>
              </TooltipProvider>
            </div>
            <input
              ref={documentInputRef}
              type="file"
              accept=".md,.txt,.text,.csv,.docx,image/png,image/jpeg,image/webp"
              multiple={false}
              className="hidden"
              onChange={(event) => void handleDocumentFilesSelected(event.target.files)}
            />
          </div>

          {documentParseError && (
            <div className="flex items-start gap-2 rounded-md border border-[#d4cef0]/45 bg-[#f8f7ff] px-3 py-2 text-xs text-[#9b4040]">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{documentParseError}</span>
            </div>
          )}

          {/* Form card */}
          <Card className="mb-4">
            <CardContent className="space-y-3 py-4 [&_input]:h-9 [&_button]:h-9 [&_label]:mb-1.5 [&_label]:text-xs">
              {/* Topic */}
              <div>
                <label className="block font-medium">{t('home.topic')}</label>
                <Input
                  placeholder={t('home.topicPlaceholder')}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  required
                />
              </div>

              {/* Style + PageCount */}
              <div className="grid gap-3 md:grid-cols-[1fr_100px]">
                <div>
                  <label className="block font-medium">{t('home.style')}</label>
                  <Select value={selectedStyleId} onValueChange={setSelectedStyleId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('home.stylePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {styleOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          <span className="flex items-center gap-1.5">
                            {option.label}
                            {(option.styleCase || option.description) && (
                              <span className="rounded-md border border-[#d4cef0]/80 bg-[#f8f7ff] px-1.5 py-px text-[10px] font-medium text-[#4a4570]">
                                {option.styleCase || option.description}
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block font-medium">{t('home.pageCount')}</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder={`${MIN_PAGE_COUNT}-${MAX_PAGE_COUNT}`}
                    value={pageCount}
                    required
                    onChange={(e) => {
                      const next = e.target.value
                      if (next === '') { setPageCount(''); return }
                      if (!/^\d+$/.test(next)) return
                      setPageCount(next)
                    }}
                    onBlur={() => setPageCount(String(resolvePageCount(pageCount)))}
                  />
                </div>
              </div>

              {/* Outline rule */}
              <div>
                <label className="block font-medium">大纲规则（可选）</label>
                <Select value={selectedOutlineRuleId} onValueChange={setSelectedOutlineRuleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="不使用规则" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不使用规则</SelectItem>
                    {outlineRuleOptions.map((rule) => (
                      <SelectItem key={rule.id} value={rule.id}>
                        <span className="flex items-center gap-1.5">
                          {rule.name}
                          {rule.description && (
                            <span className="truncate rounded-md border border-[#d4cef0]/80 bg-[#f8f7ff] px-1.5 py-px text-[10px] font-medium text-[#4a4570]">
                              {rule.description}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  选定后将强制大纲遵循规则（如固定第 1 页封面、第 2 页目录等）。可在「大纲规则」菜单维护。
                </p>
              </div>

              {/* Font scheme */}
              <div>
                <label className="block font-medium">{t('home.fontScheme')}</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Select value={selectedTitleFontId} onValueChange={setSelectedTitleFontId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('home.fontSchemeAuto')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t('home.fontSchemeAuto')}</SelectItem>
                      {availableTitleFonts.map((font) => {
                        const isUploaded = font.source === 'uploaded'
                        const sourceLabel = isUploaded
                          ? t('home.fontSourceUploaded')
                          : t('home.fontSourceBuiltIn')
                        return (
                          <SelectItem
                            key={`${font.source}:${font.id}`}
                            value={`${font.source}:${font.id}`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium bg-[#eeedf8] text-[#4c3fa8]">
                                {sourceLabel}
                              </span>
                              <span className="truncate">
                                {t('home.fontPairTitle')} · {font.family}
                              </span>
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <Select value={selectedBodyFontId} onValueChange={setSelectedBodyFontId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('home.fontSchemeAuto')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t('home.fontSchemeAuto')}</SelectItem>
                      {availableBodyFonts.map((font) => {
                        const isUploaded = font.source === 'uploaded'
                        const sourceLabel = isUploaded
                          ? t('home.fontSourceUploaded')
                          : t('home.fontSourceBuiltIn')
                        return (
                          <SelectItem
                            key={`${font.source}:${font.id}`}
                            value={`${font.source}:${font.id}`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium bg-[#eeedf8] text-[#4c3fa8]">
                                {sourceLabel}
                              </span>
                              <span className="truncate">
                                {t('home.fontPairBody')} · {font.family}
                              </span>
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{fontSelectHint}</p>
              </div>
            </CardContent>
          </Card>

          {/* CTA */}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => { void handleGenerateBrief() }}
              className="w-full md:w-auto"
              disabled={generatingBrief || !formReady}
            >
              {generatingBrief ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {generatingBrief ? '正在生成描述…' : '生成详细描述'}
            </Button>
          </div>
        </div>
      )}

      {/* ════════════════════ STEP 2 — BRIEF ════════════════════ */}
      {step === 'brief' && (
        <div className="space-y-4">
          {/* back link */}
          <button
            type="button"
            onClick={() => setStep('form')}
            className="flex items-center gap-1.5 text-[12px] text-[#7a75a0] hover:text-[#4c3fa8]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回修改表单
          </button>

          {/* Brief summary card */}
          <Card className="border-[#d4cef0]/60 bg-[#f8f7ff]/50">
            <CardContent className="py-3 text-[12px] text-[#5a5280]">
              <div className="flex flex-wrap gap-3">
                <span>
                  <span className="font-medium text-[#2d2560]">主题：</span>
                  {topic}
                </span>
                <span>
                  <span className="font-medium text-[#2d2560]">样式：</span>
                  {styleOptions.find((o) => o.id === selectedStyleId)?.label ?? selectedStyleId}
                </span>
                <span>
                  <span className="font-medium text-[#2d2560]">页数：</span>
                  {pageCount}
                </span>
                {selectedOutlineRuleId && selectedOutlineRuleId !== 'none' && (
                  <span>
                    <span className="font-medium text-[#2d2560]">规则：</span>
                    {outlineRuleOptions.find((r) => r.id === selectedOutlineRuleId)?.name ?? '已选'}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Editable brief */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium">详细描述（可修改）</label>
              <button
                type="button"
                onClick={() => { void handleGenerateBrief() }}
                disabled={generatingBrief}
                className="flex items-center gap-1 text-[11px] text-[#7a75a0] hover:text-[#4c3fa8] disabled:opacity-50"
              >
                {generatingBrief ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {generatingBrief ? '重新生成中…' : '重新生成'}
              </button>
            </div>
            <Textarea
              rows={14}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              className="min-h-[280px] resize-y font-mono text-[12px]"
              placeholder="详细描述将在此处显示，您可以直接修改…"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              AI 已根据您的文档和表单设置生成以上描述，确认无误后点击「创建会话」。
            </p>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => { void handleCreateSession() }}
              className="w-full md:w-auto"
              disabled={isCreatingSession || !briefReady}
            >
              {isCreatingSession ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {isCreatingSession ? '正在创建会话…' : '创建会话 →'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

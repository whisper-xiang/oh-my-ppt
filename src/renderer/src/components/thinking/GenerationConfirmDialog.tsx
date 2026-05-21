import { useState, useEffect, useCallback, type ReactElement } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../ui/Dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/Select'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useT } from '@renderer/i18n'
import { ipc, type FontListItem } from '@renderer/lib/ipc'
import type { FontSelection } from '@shared/generation'
import type { ThinkingPrepareGenerationResult } from '@shared/thinking'

type FontPairRef = Extract<FontSelection, { mode: 'pair' }>['title']

interface GenerationConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prepared: ThinkingPrepareGenerationResult | null
  onConfirm: (params: {
    topic: string
    pageCount: number
    styleId: string
    fontSelection: FontSelection
    referenceDocumentPath: string
  }) => void
}

export function GenerationConfirmDialog({
  open,
  onOpenChange,
  prepared,
  onConfirm
}: GenerationConfirmDialogProps): ReactElement {
  const t = useT()
  const [topic, setTopic] = useState('')
  const [pageCount, setPageCount] = useState('5')
  const [styleId, setStyleId] = useState('')
  const [styleOptions, setStyleOptions] = useState<
    Array<{ id: string; label: string; styleCase?: string }>
  >([])
  const [fontOptions, setFontOptions] = useState<FontListItem[]>([])
  const [titleFontId, setTitleFontId] = useState('auto')
  const [bodyFontId, setBodyFontId] = useState('auto')

  useEffect(() => {
    if (prepared) {
      setTopic(prepared.topic)
      setPageCount(String(prepared.pageCount))
      setStyleId(prepared.styleId)
    }
  }, [prepared])

  useEffect(() => {
    if (!prepared || prepared.fontSelection.mode !== 'pair') {
      setTitleFontId('auto')
      setBodyFontId('auto')
      return
    }

    const resolveSelectId = (font: FontPairRef): string => {
      if (font.id) return `${font.source}:${font.id}`
      const match = fontOptions.find(
        (option) => option.source === font.source && option.family === font.family
      )
      return match ? `${match.source}:${match.id}` : 'auto'
    }

    setTitleFontId(resolveSelectId(prepared.fontSelection.title))
    setBodyFontId(resolveSelectId(prepared.fontSelection.body))
  }, [prepared, fontOptions])

  const loadOptions = useCallback(async (): Promise<void> => {
    const [styleRes, fontRes] = await Promise.all([
      ipc.listStyles(),
      ipc.listFonts()
    ])
    const sorted = [...styleRes.items].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    )
    setStyleOptions(sorted.map((item) => ({
      id: item.id,
      label: item.label,
      styleCase: item.styleCase
    })))
    const fonts = [...fontRes.userFonts, ...fontRes.googleFonts]
    setFontOptions(fonts)
  }, [])

  useEffect(() => {
    if (open) void loadOptions()
  }, [open, loadOptions])

  if (!prepared) return <></>

  const titleFonts = fontOptions.filter((f) => f.role.includes('title'))
  const bodyFonts = fontOptions.filter((f) => f.role.includes('body'))
  const availableTitle = titleFonts.length > 0 ? titleFonts : fontOptions
  const availableBody = bodyFonts.length > 0 ? bodyFonts : fontOptions

  const resolveFontSelection = (): FontSelection => {
    const find = (id: string): FontListItem | undefined =>
      fontOptions.find((f) => `${f.source}:${f.id}` === id)
    const tf = find(titleFontId)
    const bf = find(bodyFontId)
    if (tf && bf) {
      return {
        mode: 'pair',
        title: { source: tf.source, family: tf.family, id: tf.id },
        body: { source: bf.source, family: bf.family, id: bf.id }
      }
    }
    if (
      prepared?.fontSelection.mode === 'pair' &&
      (fontOptions.length === 0 || (titleFontId !== 'auto' && bodyFontId !== 'auto'))
    ) {
      return prepared.fontSelection
    }
    return { mode: 'auto' }
  }

  const handleConfirm = (): void => {
    onConfirm({
      topic: topic.trim() || prepared.topic,
      pageCount: Number.parseInt(pageCount, 10) || prepared.pageCount,
      styleId: styleId || prepared.styleId,
      fontSelection: resolveFontSelection(),
      referenceDocumentPath: prepared.thinkingDocumentPath
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('thinking.generationDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('thinking.generationDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3 py-2 [&_input]:h-9 [&_label]:mb-1.5 [&_label]:text-xs">
          <div className="min-w-0">
            <label className="block font-medium">{t('home.topic')}</label>
            <Input
              className="min-w-0"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_6.25rem]">
            <div className="min-w-0">
              <label className="block font-medium">{t('home.style')}</label>
              <Select value={styleId} onValueChange={setStyleId}>
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder={t('home.stylePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {styleOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate">{option.label}</span>
                        {option.styleCase && (
                          <span className="max-w-[220px] shrink-0 truncate rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-1.5 py-px text-[10px] font-medium text-[#7c6a4c]">
                            {option.styleCase}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <label className="block font-medium">{t('home.pageCount')}</label>
              <Input
                className="min-w-0 text-center"
                type="text"
                inputMode="numeric"
                value={pageCount}
                onChange={(e) => {
                  const next = e.target.value
                  if (next === '' || /^\d+$/.test(next)) setPageCount(next)
                }}
              />
            </div>
          </div>

          <div className="min-w-0">
            <label className="block font-medium">{t('home.fontScheme')}</label>
            <div className="mt-1 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Select value={titleFontId} onValueChange={setTitleFontId}>
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder={t('home.fontSchemeAuto')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('home.fontSchemeAuto')}</SelectItem>
                  {availableTitle.map((font) => {
                    const isUploaded = font.source === 'uploaded'
                    return (
                      <SelectItem key={`${font.source}:${font.id}`} value={`${font.source}:${font.id}`}>
                        <span className="flex items-center gap-2">
                          <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${
                            isUploaded ? 'bg-[#eef9ec] text-[#4a7a46]' : 'bg-[#eef6ff] text-[#3e6685]'
                          }`}>
                            {isUploaded ? t('home.fontSourceUploaded') : t('home.fontSourceBuiltIn')}
                          </span>
                          <span className="truncate">{t('home.fontPairTitle')} · {font.family}</span>
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <Select value={bodyFontId} onValueChange={setBodyFontId}>
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder={t('home.fontSchemeAuto')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('home.fontSchemeAuto')}</SelectItem>
                  {availableBody.map((font) => {
                    const isUploaded = font.source === 'uploaded'
                    return (
                      <SelectItem key={`${font.source}:${font.id}`} value={`${font.source}:${font.id}`}>
                        <span className="flex items-center gap-2">
                          <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${
                            isUploaded ? 'bg-[#eef9ec] text-[#4a7a46]' : 'bg-[#eef6ff] text-[#3e6685]'
                          }`}>
                            {isUploaded ? t('home.fontSourceUploaded') : t('home.fontSourceBuiltIn')}
                          </span>
                          <span className="truncate">{t('home.fontPairBody')} · {font.family}</span>
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm}>
            {t('home.createAndStart')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

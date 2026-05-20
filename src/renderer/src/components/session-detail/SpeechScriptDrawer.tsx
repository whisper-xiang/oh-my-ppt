import { useEffect, useState } from 'react'
import { Check, Copy, Download, Loader2, RefreshCw, X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from '../ui/Button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/Select'
import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'

type SpeechScope = 'all' | 'single'
type SpeechLength = 'short' | 'medium' | 'long'
type SpeechStyle = 'formal' | 'conversational' | 'storytelling' | 'custom'

export interface SpeechConfig {
  scope: SpeechScope
  length: SpeechLength
  style: SpeechStyle
  customStyle?: string
}

interface SpeechScriptDrawerProps {
  sessionId: string
  isGenerating: boolean
  speechProgress: { current: number; total: number } | null
  speechConfig: SpeechConfig
  onConfigChange: (config: SpeechConfig) => void
  onGenerate: (config: SpeechConfig) => void
  onClose: () => void
  sessionTitle?: string
  currentPageTitle?: string
}

export function SpeechScriptDrawer({
  sessionId,
  isGenerating,
  speechProgress,
  speechConfig,
  onConfigChange,
  onGenerate,
  onClose,
  sessionTitle,
  currentPageTitle
}: SpeechScriptDrawerProps): React.JSX.Element {
  const t = useT()
  const [tab, setTab] = useState<'config' | 'result'>('config')
  const [script, setScript] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Load existing script from file on mount
  useEffect(() => {
    void ipc.getSpeechScript(sessionId).then((result) => {
      if (result.script) {
        setScript(result.script)
        setTab('result')
      } else {
        setScript(null)
        setTab('config')
      }
    })
  }, [sessionId])

  // After generation finishes, reload script and switch to result tab
  useEffect(() => {
    if (!isGenerating) {
      void ipc.getSpeechScript(sessionId).then((result) => {
        if (result.script) {
          setScript(result.script)
          setTab('result')
        }
      })
    }
  }, [isGenerating, sessionId])

  const handleGenerate = (): void => {
    onGenerate(speechConfig)
  }

  const handleRegenerate = (): void => {
    setScript(null)
    setTab('config')
  }

  const handleCopy = async (): Promise<void> => {
    if (!script) return
    await navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = (): void => {
    if (!script) return
    const suffix = t('sessionDetail.speechScriptDownloadSuffix')
    const fileName = sessionTitle ? `${sessionTitle}${suffix}.md` : 'speech-script.md'
    const blob = new Blob([script], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col overflow-hidden border-l border-[#e2d9cc] bg-[#f5f2ee]">
      {/* Header tabs */}
      <div className="flex shrink-0 items-end border-b border-[#e2d9cc] px-4 pt-4">
        <button
          type="button"
          onClick={() => setTab('config')}
          className={cn(
            'mr-4 pb-2.5 text-sm font-medium transition-colors',
            tab === 'config'
              ? 'border-b-2 border-[#e07030] text-[#e07030]'
              : 'text-[#6b6358] hover:text-[#3e3830]'
          )}
        >
          {t('sessionDetail.speechScriptTabConfig')}
        </button>
        <button
          type="button"
          onClick={() => { if (script) setTab('result') }}
          className={cn(
            'pb-2.5 text-sm font-medium transition-colors',
            tab === 'result'
              ? 'border-b-2 border-[#e07030] text-[#e07030]'
              : script
                ? 'text-[#6b6358] hover:text-[#3e3830]'
                : 'cursor-not-allowed text-[#c0b8ae]'
          )}
        >
          {t('sessionDetail.speechScriptTabResult')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto mb-2 rounded-md p-1 text-[#9a8f80] hover:bg-[#e8e0d4] hover:text-[#3e3830]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Config tab */}
      {tab === 'config' && (
        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-5">
          {/* Scope */}
          <div className="mb-5">
            <p className="mb-2.5 text-sm font-semibold text-[#2c2820]">
              {t('sessionDetail.speechScriptScope')}
            </p>
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#d8ccb5]">
              <button
                type="button"
                onClick={() => onConfigChange({ ...speechConfig, scope: 'all' })}
                className={cn(
                  'flex flex-col items-center py-3 text-sm transition-colors',
                  speechConfig.scope === 'all'
                    ? 'bg-[#e8e0d4] text-[#2c2820]'
                    : 'bg-white text-[#6b6358] hover:bg-[#f5f0e8]'
                )}
              >
                <span className="font-medium">{t('sessionDetail.speechScriptScopeAll')}</span>
                <span className="mt-0.5 text-xs text-[#9a8f80]">
                  {t('sessionDetail.speechScriptScopeAllDesc')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onConfigChange({ ...speechConfig, scope: 'single' })}
                className={cn(
                  'flex flex-col items-center border-l border-[#d8ccb5] py-3 text-sm transition-colors',
                  speechConfig.scope === 'single'
                    ? 'bg-[#e8e0d4] text-[#2c2820]'
                    : 'bg-white text-[#6b6358] hover:bg-[#f5f0e8]'
                )}
              >
                <span className="font-medium">{t('sessionDetail.speechScriptScopeSingle')}</span>
                <span className="mt-0.5 max-w-[90px] truncate text-xs text-[#9a8f80]">
                  {currentPageTitle || t('sessionDetail.speechScriptScopeSingleDesc')}
                </span>
              </button>
            </div>
          </div>

          {/* Style */}
          <div className="mb-5">
            <p className="mb-2.5 text-sm font-semibold text-[#2c2820]">
              {t('sessionDetail.speechScriptStyle')}
            </p>
            <Select
              value={speechConfig.style}
              onValueChange={(v) => onConfigChange({ ...speechConfig, style: v as SpeechStyle })}
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conversational">
                  {t('sessionDetail.speechScriptStyleConversational')}
                </SelectItem>
                <SelectItem value="formal">
                  {t('sessionDetail.speechScriptStyleFormal')}
                </SelectItem>
                <SelectItem value="storytelling">
                  {t('sessionDetail.speechScriptStyleStorytelling')}
                </SelectItem>
                <SelectItem value="custom">
                  {t('sessionDetail.speechScriptStyleCustom')}
                </SelectItem>
              </SelectContent>
            </Select>
            {speechConfig.style === 'custom' && (
              <textarea
                className="mt-2 w-full resize-none rounded-lg border border-[#d8ccb5] bg-white px-3 py-2 text-sm text-[#2c2820] placeholder:text-[#b0a898] focus:border-[#8fbc8f] focus:outline-none"
                rows={3}
                placeholder={t('sessionDetail.speechScriptStyleCustomPlaceholder')}
                value={speechConfig.customStyle ?? ''}
                onChange={(e) => onConfigChange({ ...speechConfig, customStyle: e.target.value })}
              />
            )}
          </div>

          {/* Length */}
          <div className="mb-6">
            <p className="mb-2.5 text-sm font-semibold text-[#2c2820]">
              {t('sessionDetail.speechScriptLength')}
            </p>
            <Select
              value={speechConfig.length}
              onValueChange={(v) => onConfigChange({ ...speechConfig, length: v as SpeechLength })}
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">{t('sessionDetail.speechScriptLengthShort')}</SelectItem>
                <SelectItem value="medium">{t('sessionDetail.speechScriptLengthMedium')}</SelectItem>
                <SelectItem value="long">{t('sessionDetail.speechScriptLengthLong')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Generate button */}
          <Button
            className="w-full gap-2 bg-[#7c5cbf] py-3 text-sm font-medium text-white hover:bg-[#6a4daa] disabled:opacity-60"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {speechProgress
                  ? t('sessionDetail.speechScriptGenerating', {
                      current: speechProgress.current,
                      total: speechProgress.total
                    })
                  : t('sessionDetail.speechScriptGeneratingInit')}
              </>
            ) : (
              t('sessionDetail.speechScriptGenerate')
            )}
          </Button>
        </div>
      )}

      {/* Result tab */}
      {tab === 'result' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {isGenerating ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-[#7c5cbf]" />
                <p className="text-center text-sm text-[#6b6358]">
                  {speechProgress
                    ? t('sessionDetail.speechScriptGenerating', {
                        current: speechProgress.current,
                        total: speechProgress.total
                      })
                    : t('sessionDetail.speechScriptGeneratingInit')}
                </p>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#2c2820]">
                {script}
              </pre>
            )}
          </div>

          {/* Result footer */}
          {!isGenerating && script && (
            <div className="flex shrink-0 flex-col gap-2 border-t border-[#e2d9cc] px-4 py-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 border-[#d8ccb5] bg-white text-[#3e3830] hover:bg-[#f0ebe0]"
                  onClick={() => void handleCopy()}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied
                    ? t('sessionDetail.speechScriptCopied')
                    : t('sessionDetail.speechScriptCopy')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 border-[#d8ccb5] bg-white text-[#3e3830] hover:bg-[#f0ebe0]"
                  onClick={handleDownload}
                >
                  <Download className="h-3.5 w-3.5" />
                  {t('sessionDetail.speechScriptDownload')}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-1.5 text-[#8a8078] hover:text-[#3e3830]"
                onClick={handleRegenerate}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('sessionDetail.speechScriptRegenerate')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

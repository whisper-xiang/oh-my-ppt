import { useState, type ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import { useT } from '@renderer/i18n'
import type { ThinkingStage } from '@shared/thinking'
import { CheckCircle2, FileText, LayoutList, Loader2, Sparkles } from 'lucide-react'

interface PageCard {
  pageNumber: number
  title: string
  role: string
  objective: string
  summary: string
  keyPoints: string[]
}

interface ThinkingPageCardsProps {
  thinkingMd: string
  stage: ThinkingStage
  onConfirmGenerate: () => void
  loading: boolean
}

function parsePageCards(thinkingMd: string): PageCard[] {
  const matches: Array<{ pageNumber: number; title: string; index: number; length: number }> = []
  const regex = /^##\s*Page\s+(\d+)\s*:\s*(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = regex.exec(thinkingMd)) !== null) {
    matches.push({
      pageNumber: Number.parseInt(match[1], 10),
      title: match[2].trim(),
      index: match.index,
      length: match[0].length
    })
  }
  return matches.map((item, index) => {
    const next = matches[index + 1]
    const contentStart = item.index + item.length
    const contentEnd = next?.index ?? thinkingMd.length
    const rawLines = thinkingMd
      .slice(contentStart, contentEnd)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const roleLine = rawLines.find((line) => /^-\s*Role\s*:/i.test(line))
    const objectiveLine = rawLines.find((line) => /^-\s*Objective\s*:/i.test(line))
    const role = roleLine?.replace(/^-\s*Role\s*:\s*/i, '').trim() || ''
    const objective = objectiveLine?.replace(/^-\s*Objective\s*:\s*/i, '').trim() || ''
    const bodyLines = rawLines.filter((line) => line !== roleLine && line !== objectiveLine)
    const keyPoints = bodyLines
      .filter((line) => /^-\s+/.test(line))
      .map((line) => line.replace(/^-\s+/, '').trim())
      .filter(Boolean)
    const summary = bodyLines
      .filter((line) => !/^-\s+/.test(line))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    return {
      pageNumber: item.pageNumber,
      title: item.title,
      role,
      objective,
      summary,
      keyPoints
    }
  })
}

const STAGE_COLORS: Record<ThinkingStage, { bg: string; text: string; border: string }> = {
  collect: { bg: 'bg-[#e8e0d0]', text: 'text-[#5d6b4d]', border: 'border-[#c8b89e]' },
  outline: { bg: 'bg-[#f5f1e8]', text: 'text-[#5d6b4d]', border: 'border-[#e0d8c8]' },
  draft: { bg: 'bg-[#e8e0d0]', text: 'text-[#5d6b4d]', border: 'border-[#c8b89e]' },
  refine: { bg: 'bg-[#f5f1e8]', text: 'text-[#5d6b4d]', border: 'border-[#e0d8c8]' },
  ready: { bg: 'bg-[#8fbc8f]', text: 'text-[#3e4a32]', border: 'border-[#8fbc8f]' }
}

const STAGE_I18N_KEYS: Record<ThinkingStage, string> = {
  collect: 'thinking.stageCollect',
  outline: 'thinking.stageOutline',
  draft: 'thinking.stageDraft',
  refine: 'thinking.stageRefine',
  ready: 'thinking.stageReady'
}

export function ThinkingPageCards({
  thinkingMd,
  stage,
  onConfirmGenerate,
  loading
}: ThinkingPageCardsProps): ReactElement {
  const t = useT()
  const [viewMode, setViewMode] = useState<'outline' | 'document'>('outline')
  const cards = parsePageCards(thinkingMd)
  const colors = STAGE_COLORS[stage]
  const canGenerate = cards.length > 0 && stage !== 'collect'
  const hasDocument = thinkingMd.trim().length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[#c8d6ba] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="organic-serif text-[22px] font-semibold leading-none text-[#3e4a32]">
              {t('thinking.pageCardsTitle')}
            </h3>
            <p className="mt-1 text-[11px] text-[#5d6b4d]">
              {cards.length > 0 ? t('thinking.pageCountLabel', { count: cards.length }) : t('thinking.noPagesYet')}
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${colors.bg} ${colors.text} ${colors.border}`}>
            {t(STAGE_I18N_KEYS[stage] as Parameters<typeof t>[0])}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-full border border-[#c8d6ba] bg-[#e8e0d0]/70 p-1">
          <button
            type="button"
            onClick={() => setViewMode('outline')}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-full text-[11px] font-semibold transition-colors ${
              viewMode === 'outline'
                ? 'bg-[#fffdf8] text-[#3e4a32] shadow-sm'
                : 'text-[#5d6b4d] hover:bg-[#fffdf8]/60'
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            {t('thinking.outlineView')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('document')}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-full text-[11px] font-semibold transition-colors ${
              viewMode === 'document'
                ? 'bg-[#fffdf8] text-[#3e4a32] shadow-sm'
                : 'text-[#5d6b4d] hover:bg-[#fffdf8]/60'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            thinking.md
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {viewMode === 'document' ? (
          hasDocument ? (
            <div className="rounded-[2rem] border border-[#e0d8c8] bg-[#fffdf8] px-4 py-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 border-b border-[#e8e0d0] pb-2 text-[11px] font-semibold text-[#5d6b4d]">
                <FileText className="h-3.5 w-3.5" />
                <span>thinking.md</span>
              </div>
              <div className="thinking-md-preview break-words text-[#2f3329] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="mb-3 text-[18px] font-bold leading-tight text-[#26301f]">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="mb-2 mt-4 border-t border-[#edf1e8] pt-3 text-[13px] font-bold leading-snug text-[#34422a]">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="mb-1.5 mt-3 text-[12px] font-semibold text-[#3f4c36]">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-2 whitespace-pre-wrap text-[12px] leading-relaxed text-[#4f5649]">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-2 list-disc space-y-1 pl-5 text-[12px] leading-relaxed marker:text-[#8b967e]">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-2 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed marker:text-[#8b967e]">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => <li className="text-[#4f5649]">{children}</li>,
                    code: ({ children }) => (
                      <code className="rounded bg-[#edf0e7] px-1 py-0.5 font-mono text-[11px] text-[#2f3329]">
                        {children}
                      </code>
                    ),
                    pre: ({ children }) => (
                      <pre className="mb-2 overflow-x-auto rounded-md bg-[#edf0e7] p-3 text-[11px] leading-relaxed text-[#2f3329]">
                        {children}
                      </pre>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="mb-2 border-l-2 border-[#d7ddcf] pl-3 text-[12px] leading-relaxed text-[#6f7867]">
                        {children}
                      </blockquote>
                    )
                  }}
                >
                  {thinkingMd}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[2rem] border border-dashed border-[#c8d6ba] bg-[#f5f1e8]/72 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-[5%_95%_10%_90%/85%_15%_85%_15%] bg-[#8fbc8f] text-white">
                <FileText className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#7a806c]">{t('thinking.noDocumentYet')}</p>
            </div>
          )
        ) : cards.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[2rem] border border-dashed border-[#c8d6ba] bg-[#f5f1e8]/72 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[5%_95%_10%_90%/85%_15%_85%_15%] bg-[#8fbc8f] text-white">
              <FileText className="h-5 w-5" />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#7a806c]">{t('thinking.noPagesYet')}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {cards.map((card) => (
              <div
                key={card.pageNumber}
                className="group rounded-[1.5rem] border border-[#c8d6ba] bg-[#f5f1e8] px-3 py-3 shadow-sm transition-colors hover:border-[#8fbc8f]"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8fbc8f] text-[11px] font-bold text-[#3e4a32]">
                    {card.pageNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="line-clamp-2 min-w-0 text-[13px] font-semibold leading-snug text-[#2f3329]">
                        {card.title}
                      </div>
                      <span className="shrink-0 rounded-full border border-[#c8d6ba] bg-[#fffdf8] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] text-[#5d6b4d]">
                        {card.role}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-[#4f6340]">
                      {card.objective}
                    </p>
                    {card.summary ? (
                      <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-[#747968]">
                        {card.summary}
                      </p>
                    ) : null}
                    {card.keyPoints.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-[#747968]">
                        {card.keyPoints.slice(0, 3).map((point, pointIndex) => (
                          <li key={pointIndex} className="flex gap-1.5">
                            <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-[#8fbc8f]" />
                            <span className="line-clamp-2">{point}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[#c8d6ba] bg-[#d4e4c1] p-3">
        <button
          type="button"
          onClick={onConfirmGenerate}
          disabled={loading || !canGenerate}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#3e4a32] text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#5d6b4d] disabled:opacity-40 disabled:hover:bg-[#3e4a32]"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : canGenerate ? (
            <Sparkles className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {loading ? t('thinking.thinking') : t('thinking.confirmAndGenerate')}
        </button>
        {!canGenerate && (
          <p className="mt-2 text-center text-[10px] text-[#7a806c]">
            {t('thinking.needMoreWork')}
          </p>
        )}
      </div>
    </div>
  )
}

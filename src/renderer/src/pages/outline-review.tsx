import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowRight, Loader2, RefreshCw, Send, Sparkles, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { ipc } from '@renderer/lib/ipc'
import { useToastStore } from '../store'

type OutlineItem = {
  pageNumber: number
  pageId: string
  title: string
  contentOutline: string
  layoutIntent?: string | null
  htmlPath?: string | null
}

type ChatTurn =
  | { role: 'user'; content: string; ts: number }
  | { role: 'assistant'; content: string; ts: number }

const layoutIntentLabel = (intent: string | null | undefined): string => {
  if (!intent) return ''
  const map: Record<string, string> = {
    cover: '封面',
    toc: '目录',
    'section-divider': '章节分隔',
    'data-focus': '数据',
    comparison: '对比',
    timeline: '时间线',
    concept: '概念',
    process: '流程',
    summary: '总结',
    quote: '引用',
    'image-focus': '图片'
  }
  return map[intent] || intent
}

export function OutlineReviewPage(): React.JSX.Element {
  const { id: sessionId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { error, success } = useToastStore()
  const locationState = location.state as { initialPrompt?: string; outlineGenerating?: boolean } | null
  const initialPrompt = locationState?.initialPrompt || ''
  /** true when navigated here from session-create (generation already fired in background) */
  const arrivedWithGeneration = locationState?.outlineGenerating === true

  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [isGenerating, setIsGenerating] = useState(arrivedWithGeneration)
  const [isRevising, setIsRevising] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([])
  const [hasTriggered, setHasTriggered] = useState(false)
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null)

  const loadOutline = useCallback(async (): Promise<OutlineItem[]> => {
    if (!sessionId) return []
    try {
      const { items } = await ipc.getOutline({ sessionId })
      setOutline(items)
      return items
    } catch (e) {
      error('加载大纲失败', {
        description: e instanceof Error ? e.message : '请稍后重试'
      })
      return []
    }
  }, [sessionId, error])

  const triggerOutlineGeneration = useCallback(async (): Promise<void> => {
    if (!sessionId || isGenerating) return
    setIsGenerating(true)
    try {
      await ipc.generateOutline({
        sessionId,
        userMessage: initialPrompt,
        type: 'deck',
        chatType: 'main'
      })
      await loadOutline()
    } catch (e) {
      error('生成大纲失败', {
        description: e instanceof Error ? e.message : '请稍后重试'
      })
    } finally {
      setIsGenerating(false)
    }
  }, [sessionId, initialPrompt, isGenerating, loadOutline, error])

  /**
   * Poll until the backend finishes generating the outline (used when generation was
   * already started by session-create before navigating here).
   */
  const pollUntilOutlineReady = useCallback(async (): Promise<void> => {
    if (!sessionId) return
    const MAX_POLLS = 60
    const POLL_INTERVAL_MS = 2000
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS))
      try {
        const items = await loadOutline()
        if (items.length > 0) {
          setIsGenerating(false)
          return
        }
      } catch {
        // ignore poll errors; keep retrying
      }
    }
    // timed out — let user retry manually
    setIsGenerating(false)
  }, [sessionId, loadOutline])

  // On first load: if navigated from session-create (generation already fired), poll for results;
  // otherwise check DB and auto-generate if empty.
  useEffect(() => {
    if (!sessionId || hasTriggered) return
    setHasTriggered(true)
    void (async (): Promise<void> => {
      if (arrivedWithGeneration) {
        // Generation was fired before navigation — just poll until results appear
        await pollUntilOutlineReady()
      } else {
        const existing = await loadOutline()
        if (existing.length === 0) {
          await triggerOutlineGeneration()
        }
      }
    })()
  }, [sessionId, hasTriggered, arrivedWithGeneration, loadOutline, triggerOutlineGeneration, pollUntilOutlineReady])

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatTurns.length, isRevising])

  const handleRevise = async (): Promise<void> => {
    const message = chatInput.trim()
    if (!message || !sessionId || isRevising) return
    setChatInput('')
    setChatTurns((prev) => [...prev, { role: 'user', content: message, ts: Date.now() }])
    setIsRevising(true)
    try {
      const result = await ipc.reviseOutline({ sessionId, message })
      setOutline(result.items)
      setChatTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `已按你的要求更新大纲（${result.items.length} 页）。`,
          ts: Date.now()
        }
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : '请稍后重试'
      // Don't show error toast when user cancelled intentionally
      const wasCancelled =
        e instanceof Error &&
        (e.message.includes('aborted') || e.message.includes('cancel') || e.message.includes('AbortError'))
      if (!wasCancelled) {
        setChatTurns((prev) => [
          ...prev,
          { role: 'assistant', content: `修订失败：${msg}`, ts: Date.now() }
        ])
        error('大纲修订失败', { description: msg })
      } else {
        setChatTurns((prev) => [
          ...prev,
          { role: 'assistant', content: '已取消本次修订。', ts: Date.now() }
        ])
      }
    } finally {
      setIsRevising(false)
    }
  }

  const handleCancelRevise = (): void => {
    if (!sessionId || !isRevising) return
    void ipc.cancelReviseOutline(sessionId)
  }

  // Cancel any in-flight revision when this page unmounts (e.g. user navigates away)
  useEffect(() => {
    return () => {
      if (sessionId) {
        void ipc.cancelReviseOutline(sessionId)
      }
    }
  }, [sessionId])

  const handleConfirm = async (): Promise<void> => {
    if (!sessionId || isConfirming) return
    if (outline.length === 0) {
      error('当前没有可生成的大纲')
      return
    }
    setIsConfirming(true)
    // Cancel any in-flight revision before navigating so the pending IPC call
    // does not resolve later and unexpectedly activate the app window.
    void ipc.cancelReviseOutline(sessionId)
    try {
      success('大纲已确认，开始生成 PPT', { duration: 1500 })
      navigate(`/sessions/${sessionId}/generating`, {
        state: { initialPrompt, fromOutlineConfirm: true }
      })
    } catch (e) {
      error('进入生成失败', {
        description: e instanceof Error ? e.message : '请稍后重试'
      })
    } finally {
      setIsConfirming(false)
    }
  }

  const handleRegenerate = async (): Promise<void> => {
    if (!sessionId || isGenerating) return
    setChatTurns([])
    setOutline([])
    await triggerOutlineGeneration()
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-[#e7e3f5] bg-[#fbfaff] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">OUTLINE REVIEW</p>
            <h1 className="organic-serif mt-1 text-[24px] font-semibold text-[#2d2560]">
              大纲预览与调整
            </h1>
            <p className="mt-1 text-[12px] text-muted-foreground">
              在这里确认大纲结构，可通过右侧对话调整；确认后再生成具体页面。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRegenerate()}
              disabled={isGenerating || isRevising || isConfirming}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              重新生成大纲
            </Button>
            <Button
              size="sm"
              onClick={() => void handleConfirm()}
              disabled={
                isGenerating || isRevising || isConfirming || outline.length === 0
              }
            >
              {isConfirming ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-1.5 h-4 w-4" />
              )}
              确认并生成 PPT
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: outline list */}
        <div className="flex-1 overflow-y-auto p-6">
          {isGenerating && outline.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#7a75a0]" />
              <p className="text-sm">正在生成大纲，请稍候…</p>
            </div>
          ) : outline.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p className="text-sm">尚未生成大纲</p>
              <Button className="mt-4" size="sm" onClick={() => void triggerOutlineGeneration()}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                生成大纲
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {outline.map((item) => (
                <Card key={item.pageId} className="!rounded-lg">
                  <CardContent className="py-4">
                    <div className="flex items-baseline gap-3">
                      <span className="shrink-0 rounded-md bg-[#eeeaff] px-2 py-0.5 text-xs font-semibold text-[#4c3fa8]">
                        第 {item.pageNumber} 页
                      </span>
                      <h3 className="flex-1 text-base font-semibold text-[#2d2560]">
                        {item.title}
                      </h3>
                      {item.layoutIntent && (
                        <span className="rounded-md border border-[#d4cef0]/80 bg-[#f8f7ff] px-1.5 py-0.5 text-[10px] font-medium text-[#4a4570]">
                          {layoutIntentLabel(item.layoutIntent)}
                        </span>
                      )}
                    </div>
                    {item.contentOutline ? (
                      <ul className="mt-2 space-y-1 pl-4 text-sm text-foreground/80">
                        {item.contentOutline
                          .split(/[；;\n]/)
                          .map((part) => part.trim())
                          .filter(Boolean)
                          .map((part, idx) => (
                            <li key={idx} className="list-disc">
                              {part}
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">（暂无要点）</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right: chat panel */}
        <div className="flex w-[380px] shrink-0 flex-col border-l border-[#e7e3f5] bg-[#fbfaff]">
          <div className="border-b border-[#e7e3f5] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#2d2560]">对话调整大纲</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              例：把第 4 页拆成 2 页 / 新增一页项目时间表 / 删除最后一页致谢
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {chatTurns.length === 0 && !isRevising ? (
              <p className="text-xs text-muted-foreground">还没有对话记录。</p>
            ) : (
              <div className="space-y-3">
                {chatTurns.map((turn) => (
                  <div
                    key={turn.ts}
                    className={
                      turn.role === 'user'
                        ? 'rounded-lg bg-[#4c3fa8] px-3 py-2 text-sm text-white'
                        : 'rounded-lg bg-white px-3 py-2 text-sm text-foreground border border-[#e7e3f5]'
                    }
                  >
                    {turn.content}
                  </div>
                ))}
                {isRevising && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>正在重新整理大纲…</span>
                    <button
                      type="button"
                      onClick={handleCancelRevise}
                      className="ml-1 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-[#9b4040] hover:bg-[#ffe8e8]/80 transition-colors"
                    >
                      <X className="h-3 w-3" />
                      取消
                    </button>
                  </div>
                )}
                <div ref={scrollAnchorRef} />
              </div>
            )}
          </div>
          <div className="border-t border-[#e7e3f5] p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleRevise()
                  }
                }}
                rows={3}
                placeholder="输入对大纲的修改要求…"
                disabled={isRevising || isGenerating || outline.length === 0}
                className="min-h-[64px] flex-1 resize-none rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {isRevising ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelRevise}
                  className="border-[#d4a0a0] text-[#9b4040] hover:bg-[#ffe8e8]/80 hover:text-[#7a2020]"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void handleRevise()}
                  disabled={isGenerating || outline.length === 0 || !chatInput.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {isRevising ? 'AI 正在修订中，点击 × 可取消' : 'Enter 发送，Shift+Enter 换行'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

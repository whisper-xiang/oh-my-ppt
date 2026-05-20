import { useCallback, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useThinkingStore } from '../store/thinkingStore'
import { useToastStore } from '../store'
import { useT } from '../i18n'
import {
  ArrowRight,
  FileText,
  Loader2,
  MessageCircle,
  Sparkles
} from 'lucide-react'

export function HomePage(): ReactElement {
  const navigate = useNavigate()
  const { createWorkspace } = useThinkingStore()
  const { error } = useToastStore()
  const t = useT()
  const [creating, setCreating] = useState(false)

  const handleQuickCreate = useCallback(() => {
    navigate('/create/session')
  }, [navigate])

  const handleExplore = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      const thinkingId = await createWorkspace()
      navigate(`/thinking/${thinkingId}`)
    } catch (err) {
      error(t('thinking.createFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      setCreating(false)
    }
  }, [creating, createWorkspace, navigate, error, t])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-9 text-[#3e4a32] lg:px-8">
      <section className="relative overflow-hidden border-b border-[#e0d8c8] pb-8">
        <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-[38%_62%_44%_56%/55%_45%_55%_45%] bg-[#d4e4c1]/55" />
        <div className="pointer-events-none absolute bottom-3 right-28 h-16 w-28 rounded-[8%_92%_12%_88%/78%_22%_78%_22%] bg-[#c8b89e]/30" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#d4e4c1]/78 px-4 py-1.5 text-[11px] font-semibold text-[#3e4a32] shadow-[0_6px_14px_rgba(93,107,77,0.10)]">
              <Sparkles className="h-3.5 w-3.5 text-[#5d6b4d]" />
              {t('home.eyebrow')}
            </div>
            <h1 className="organic-serif mt-5 text-[32px] font-semibold leading-none text-[#3e4a32] sm:text-[40px]">
              {t('thinking.homeTitle')}
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#5d6b4d]">
              {t('thinking.homeDescription')}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <button
          type="button"
          onClick={handleQuickCreate}
          className="group relative flex min-h-[240px] flex-col overflow-hidden rounded-[2rem] border border-[#e0d8c8] bg-[#e8e0d0] p-7 text-left shadow-[0_14px_34px_rgba(86,73,54,0.12)] transition-colors hover:border-[#c8b89e] hover:bg-[#e5dccb] disabled:cursor-not-allowed disabled:opacity-65"
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#d4e4c1]/70 transition-transform group-hover:scale-110" />
          <div className="pointer-events-none absolute -bottom-14 left-10 h-28 w-40 rounded-[8%_92%_12%_88%/78%_22%_78%_22%] bg-[#c8b89e]/35" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10%_90%_16%_84%/78%_22%_78%_22%] bg-[#8fbc8f] text-white shadow-[0_10px_22px_rgba(93,107,77,0.18)]">
              <FileText className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-[#fffdf8]/84 px-3 py-1.5 text-[11px] font-semibold text-[#5d6b4d] shadow-[0_6px_14px_rgba(86,73,54,0.08)]">
              {t('thinking.quickCreateBadge')}
            </span>
          </div>

          <div className="relative mt-7">
            <h2 className="organic-serif text-[30px] font-semibold leading-none text-[#3e4a32]">
              {t('thinking.quickCreate')}
            </h2>
            <p className="mt-3 max-w-[32rem] text-[14px] leading-relaxed text-[#5d6b4d]">
              {t('thinking.quickCreateDescription')}
            </p>
          </div>

          <div className="relative mt-auto pt-7">
            <span className="inline-flex h-11 items-center gap-2 rounded-full bg-[#5d6b4d] px-5 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(93,107,77,0.22)] transition-colors group-hover:bg-[#3e4a32]">
              {t('thinking.startQuickCreate')}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => void handleExplore()}
          disabled={creating}
          className="group relative flex min-h-[240px] flex-col overflow-hidden rounded-[2rem] border border-[#c8d6ba] bg-[#d4e4c1] p-7 text-left shadow-[0_14px_34px_rgba(86,73,54,0.12)] transition-colors hover:border-[#a9bd97] hover:bg-[#cedfb8] disabled:cursor-not-allowed disabled:opacity-65"
        >
          <div className="pointer-events-none absolute -bottom-12 -left-10 h-36 w-36 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#8fbc8f]/28 transition-transform group-hover:scale-110" />
          <div className="pointer-events-none absolute right-8 top-9 h-24 w-32 rounded-[8%_92%_12%_88%/78%_22%_78%_22%] bg-[#f5f1e8]/55" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10%_90%_16%_84%/78%_22%_78%_22%] bg-[#5d6b4d] text-white shadow-[0_10px_22px_rgba(93,107,77,0.18)]">
              <MessageCircle className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-[#fffdf8]/84 px-3 py-1.5 text-[11px] font-semibold text-[#5d6b4d] shadow-[0_6px_14px_rgba(86,73,54,0.08)]">
              {t('thinking.exploreProjectBadge')}
            </span>
          </div>

          <div className="relative mt-7">
            <h2 className="organic-serif text-[30px] font-semibold leading-none text-[#3e4a32]">
              {t('thinking.exploreProject')}
            </h2>
            <p className="mt-3 max-w-[32rem] text-[14px] leading-relaxed text-[#5d6b4d]">
              {t('thinking.exploreProjectDescription')}
            </p>
          </div>

          <div className="relative mt-auto pt-7">
            <span className="inline-flex h-11 items-center gap-2 rounded-full bg-[#3e4a32] px-5 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(62,74,50,0.20)] transition-colors group-hover:bg-[#5d6b4d]">
              {creating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('thinking.creatingExplore')}
                </>
              ) : (
                <>
                  {t('thinking.startExplore')}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </span>
          </div>
        </button>
      </section>

    </div>
  )
}

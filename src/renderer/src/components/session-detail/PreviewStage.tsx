import { useEffect, forwardRef } from 'react'
import { ChevronDown, Check, ImagePlus, Loader2, Pencil, Redo2, Sparkles, Undo2, Video } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useSessionDetailUiStore } from '@renderer/store/sessionDetailStore'
import { useToastStore } from '@renderer/store/toastStore'
import { Button } from '../ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/DropdownMenu'
import { PreviewIframe, type PreviewIframeHandle } from '../preview/PreviewIframe'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip'
import type { EditModeMovePayload, EditSelectionPayload } from '../preview/edit-mode-script'
import type { SessionPreviewPage } from './types'
import { useT } from '@renderer/i18n'

export const PreviewStage = forwardRef<
  PreviewIframeHandle,
  {
    selectedPage: SessionPreviewPage | null
    sessionTitle?: string | null
    isGenerating: boolean
    progressLabel?: string
    previewRefreshKey?: number
    isSavingEdits?: boolean
    canUndo: boolean
    canRedo: boolean
    hasPendingEdits: boolean
    onElementMoved: (payload: EditModeMovePayload) => void
    onElementSelected: (payload: EditSelectionPayload) => void
    onCancelTextEdit: () => void
    onUndo: () => void
    onRedo: () => void
    onReplayPendingEdits: () => void
    onSaveAllEdits: () => void
    onDiscardAllEdits: () => void
    onAddFromLibrary?: (type: 'image' | 'video') => void
    onAddFromLocal?: (type: 'image' | 'video') => void
    onDeleteRequest?: (selector: string) => void
  }
>(function PreviewStage(
  {
    selectedPage,
    sessionTitle,
    isGenerating,
    progressLabel,
    previewRefreshKey = 0,
    isSavingEdits = false,
    canUndo,
    canRedo,
    hasPendingEdits,
    onElementMoved,
    onElementSelected,
    onCancelTextEdit,
    onUndo,
    onRedo,
    onReplayPendingEdits,
    onSaveAllEdits,
    onDiscardAllEdits,
    onAddFromLibrary,
    onAddFromLocal,
    onDeleteRequest
  },
  ref
) {
  const t = useT()
  const toast = useToastStore()
  const previewKey = useSessionDetailUiStore((state) => state.previewKey)
  const interactionMode = useSessionDetailUiStore((state) => state.interactionMode)
  const setInteractionMode = useSessionDetailUiStore((state) => state.setInteractionMode)
  const setSelectedElement = useSessionDetailUiStore((state) => state.setSelectedElement)
  const clearSelectedElement = useSessionDetailUiStore((state) => state.clearSelectedElement)
  const displayTitle = sessionTitle || t('sessionDetail.sessionFallback')

  const isEditing = interactionMode === 'edit'
  const isInspecting = interactionMode === 'ai-inspect'

  useEffect(() => {
    if (interactionMode === 'preview') return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (isEditing) {
          onDiscardAllEdits()
        } else {
          setInteractionMode('preview')
          onCancelTextEdit()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [interactionMode, isEditing, onDiscardAllEdits, onCancelTextEdit, setInteractionMode])

  return (
    <main className="flex min-h-0 flex-1 flex-col px-3 py-3">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[2rem] bg-[#e8e0d0]/54 p-3 shadow-[0_24px_54px_rgba(93,107,77,0.15)]">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#d4e4c1]/48" />
        <div className="pointer-events-none absolute -bottom-24 left-8 h-48 w-64 rounded-[5%_95%_10%_90%/85%_15%_85%_15%] bg-[#c8b89e]/22" />
        {selectedPage ? (
          <div className="relative h-full overflow-hidden rounded-[1.55rem] bg-[#f5f1e8] p-2 shadow-[0_14px_32px_rgba(93,107,77,0.14)]">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="absolute left-3 top-3 z-20 max-w-[460px] truncate border-l-2 border-[#7f9468] bg-[#fffaf1]/68 px-3 py-1.5 text-sm font-medium leading-5 text-[#3e4a32] shadow-[0_8px_22px_rgba(74,59,42,0.08)] backdrop-blur-md">
                  {displayTitle}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                {displayTitle}
              </TooltipContent>
            </Tooltip>
            <PreviewIframe
              ref={ref}
              key={`preview-${selectedPage.pageId}-${previewKey}-${previewRefreshKey}`}
              src={selectedPage.sourceUrl}
              htmlPath={selectedPage.htmlPath}
              pageId={selectedPage.pageId}
              title={`preview-page-${selectedPage.pageNumber}`}
              inspectable
              inspecting={isInspecting}
              editMode={isEditing}
              onSelectorSelected={setSelectedElement}
              onElementMoved={onElementMoved}
              onElementSelected={onElementSelected}
              onInspectExit={() => {
                setInteractionMode('preview')
                onCancelTextEdit()
              }}
              onDidReload={onReplayPendingEdits}
              onDeleteRequest={onDeleteRequest}
            />
            {/* Top-left toolbar: undo/redo in edit mode */}
            {selectedPage.htmlPath && interactionMode === 'edit' && (
              <div className="absolute left-4 top-3 z-20 flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-[7px] border-transparent bg-[#fffaf1]/90 px-2 text-[10px] leading-none text-[#59664b] shadow-[0_8px_20px_rgba(74,59,42,0.10)] hover:bg-[#d4e4c1]/78 disabled:opacity-40"
                  onClick={onUndo}
                  disabled={isGenerating || isSavingEdits || !canUndo}
                >
                  <Undo2 className="mr-0.5 h-2.5 w-2.5" />
                  {t('sessionDetail.undo')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-[7px] border-transparent bg-[#fffaf1]/90 px-2 text-[10px] leading-none text-[#59664b] shadow-[0_8px_20px_rgba(74,59,42,0.10)] hover:bg-[#d4e4c1]/78 disabled:opacity-40"
                  onClick={onRedo}
                  disabled={isGenerating || isSavingEdits || !canRedo}
                >
                  <Redo2 className="mr-0.5 h-2.5 w-2.5" />
                  {t('sessionDetail.redo')}
                </Button>
              </div>
            )}
            {/* Top-right toolbar */}
            {selectedPage.htmlPath && (
              <div className="absolute right-4 top-3 z-20">
                {interactionMode === 'preview' && (
                  <div className="flex items-center gap-0.5 rounded-[9px] border border-[#d9cfbd]/72 bg-[#fffaf1]/90 p-0.5 shadow-[0_14px_34px_rgba(74,59,42,0.16)] backdrop-blur-xl">
                    <button
                      type="button"
                      className="inline-flex h-7 min-w-[52px] items-center justify-center rounded-[7px] bg-[#5d6b4d] px-2 text-[10px] font-semibold leading-none text-white shadow-[0_7px_16px_rgba(93,107,77,0.2)]"
                      disabled
                    >
                      {t('sessionDetail.previewMode')}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-7 min-w-[52px] items-center justify-center rounded-[7px] px-2 text-[10px] font-semibold leading-none transition-colors',
                        'text-[#59664b] hover:bg-[#d4e4c1]/78'
                      )}
                      onClick={() => {
                        setInteractionMode('edit')
                        toast.info(t('sessionDetail.editModeToast'))
                      }}
                      disabled={isGenerating || isSavingEdits}
                    >
                      <Pencil className="mr-0.5 h-2.5 w-2.5" />
                      {t('sessionDetail.editMode')}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-7 min-w-[52px] items-center justify-center rounded-[7px] px-2 text-[10px] font-semibold leading-none transition-colors',
                        'text-[#59664b] hover:bg-[#d4e4c1]/78'
                      )}
                      onClick={() => {
                        setInteractionMode('ai-inspect')
                        toast.info(t('sessionDetail.inspectActiveToast'))
                      }}
                      disabled={isGenerating || isSavingEdits}
                    >
                      <Sparkles className="mr-0.5 h-2.5 w-2.5" />
                      {t('sessionDetail.aiMode')}
                    </button>
                  </div>
                )}
                {interactionMode === 'edit' && (
                  <div className="flex items-center gap-1.5">
                    {onAddFromLibrary && onAddFromLocal && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-7 items-center gap-0.5 rounded-[7px] border-transparent bg-[#fffaf1]/90 px-2 text-[10px] font-semibold leading-none text-[#59664b] shadow-[0_8px_20px_rgba(74,59,42,0.10)] hover:bg-[#d4e4c1]/78"
                          >
                            <ImagePlus className="mr-0.5 h-2.5 w-2.5" />
                            {t('editMode.addImage')}
                            <ChevronDown className="ml-0.5 h-2.5 w-2.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[10rem]">
                          <DropdownMenuItem onClick={() => onAddFromLibrary('image')}>
                            {t('editMode.fromLibrary')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onAddFromLocal('image')}>
                            {t('editMode.fromLocal')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {onAddFromLibrary && onAddFromLocal && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-7 items-center gap-0.5 rounded-[7px] border-transparent bg-[#fffaf1]/90 px-2 text-[10px] font-semibold leading-none text-[#59664b] shadow-[0_8px_20px_rgba(74,59,42,0.10)] hover:bg-[#d4e4c1]/78"
                          >
                            <Video className="mr-0.5 h-2.5 w-2.5" />
                            {t('editMode.addVideo')}
                            <ChevronDown className="ml-0.5 h-2.5 w-2.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[10rem]">
                          <DropdownMenuItem onClick={() => onAddFromLibrary('video')}>
                            {t('editMode.fromLibrary')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onAddFromLocal('video')}>
                            {t('editMode.fromLocal')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {hasPendingEdits && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-7 rounded-[7px] bg-[#5d6b4d] px-2 text-[10px] leading-none text-white shadow-[0_8px_20px_rgba(93,107,77,0.16)]"
                        onClick={onSaveAllEdits}
                        disabled={isGenerating || isSavingEdits}
                      >
                        {isSavingEdits ? (
                          <Loader2 className="mr-0.5 h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Check className="mr-0.5 h-2.5 w-2.5" />
                        )}
                        {t('sessionDetail.exitAndSave')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-[7px] border-transparent bg-[#d4e4c1]/86 px-2 text-[10px] leading-none text-[#3e4a32] shadow-[0_8px_20px_rgba(93,107,77,0.14)] hover:bg-[#c8ddb2]"
                      onClick={onDiscardAllEdits}
                      disabled={isGenerating || isSavingEdits}
                    >
                      {t('sessionDetail.exitEditMode')}
                    </Button>
                  </div>
                )}
                {interactionMode === 'ai-inspect' && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-[7px] border-transparent bg-[#d4e4c1]/86 px-2 text-[10px] leading-none text-[#3e4a32] shadow-[0_8px_20px_rgba(93,107,77,0.14)] hover:bg-[#c8ddb2]"
                      onClick={() => {
                        clearSelectedElement()
                        setInteractionMode('preview')
                      }}
                      disabled={isGenerating || isSavingEdits}
                    >
                      {t('sessionDetail.exitAiMode')}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {selectedPage.status === 'failed' && (
              <div className="absolute bottom-5 left-5 z-20 max-w-[520px] rounded-[1rem] bg-[#fff4ef]/92 px-3 py-2 text-xs text-[#8e5a53] shadow-[0_10px_24px_rgba(142,90,83,0.12)] backdrop-blur-sm">
                {t('sessionDetail.failedPageHint')}
              </div>
            )}
            {isGenerating && (
              <div className="absolute inset-0 flex items-center justify-center rounded-[1.55rem] bg-[#f5f1e8]/68 backdrop-blur-sm transition-opacity">
                <div className="flex flex-col items-center gap-3 rounded-[1.5rem] bg-[#e8e0d0]/88 px-8 py-5 shadow-[0_20px_44px_rgba(93,107,77,0.16)]">
                  <Loader2 className="h-6 w-6 animate-spin text-[#6f8159]" />
                  {progressLabel ? <p className="text-sm text-[#5a674b]">{progressLabel}</p> : null}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative flex h-full min-h-[420px] flex-col items-center justify-center gap-4 rounded-[1.55rem] bg-[#f5f1e8]/84 text-center text-[#5d6b4d] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.32)]">
            {isGenerating ? (
              <Loader2 className="h-7 w-7 animate-spin text-[#5d6b4d]" />
            ) : (
              <Sparkles className="h-7 w-7 text-[#8fbc8f]" />
            )}
            <div className="space-y-1">
              <p className="text-base font-medium text-[#3e4a32]">
                {t('sessionDetail.emptyPreviewTitle')}
              </p>
              <p className="text-sm">
                {isGenerating ? t('sessionDetail.preparingPreview') : t('sessionDetail.briefHint')}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  )
})

import { Trash2, X } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger
} from '../ui/AlertDialog'
import { Input, Textarea } from '../ui/Input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui/Select'
import type { EditSelectionPayload } from '../preview/edit-mode-script'
import { useT } from '@renderer/i18n'

export interface ElementEditDraft {
  text: string
  color: string
  fontSize: string
  fontWeight: string
  layoutX: string
  layoutY: string
  layoutWidth: string
  layoutHeight: string
}

const LAYOUT_FIELDS: Array<{ key: keyof ElementEditDraft; label: string }> = [
  { key: 'layoutX', label: 'X' },
  { key: 'layoutY', label: 'Y' },
  { key: 'layoutWidth', label: 'W' },
  { key: 'layoutHeight', label: 'H' }
]

export function ElementInspectorPanel({
  selection,
  draft,
  onDraftChange,
  onClose,
  onDelete
}: {
  selection: EditSelectionPayload | null
  draft: ElementEditDraft
  onDraftChange: (draft: ElementEditDraft) => void
  onClose: () => void
  onDelete?: () => void
}): React.JSX.Element {
  const t = useT()
  const isText = selection?.isText ?? false

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-[2rem] border border-[#ded2bd]/60 bg-[#f3ecdf]/76 shadow-[0_20px_44px_rgba(74,59,42,0.13)] backdrop-blur-xl">
      {/* Header */}
      <div className="relative mx-2.5 mt-2.5 overflow-hidden rounded-[1.35rem] border border-[#e1d6c4]/72 bg-[#fffaf1]/78 px-3 pb-2.5 pt-3 shadow-[0_6px_16px_rgba(77,61,43,0.08)]">
        <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#c7d9b4]/12" />
        <div className="relative flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a875f]">
            {t('sessionDetail.elementInspector')}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#667257] transition-colors hover:bg-[#d4e4c1]/80 hover:text-[#34402c]"
            aria-label={t('sessionDetail.closeInspector')}
            title={t('sessionDetail.closeInspector')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2.5">
        {/* Layout display */}
        <div className="rounded-[1.15rem] border border-[#ded2bd]/72 bg-[#fffaf1]/82 px-3 py-2.5 shadow-[0_6px_14px_rgba(74,59,42,0.08)]">
          <span className="text-[11px] font-medium text-[#7a875f]">
            {t('sessionDetail.adjustLayout')}
          </span>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {LAYOUT_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1 text-center">
                <span className="text-[11px] font-medium text-[#7a875f]">{label}</span>
                <div className="flex h-8 items-center justify-center rounded-full border border-[#d7cbb7]/40 bg-[#f5efe4]/40 px-1.5 text-[11px] text-[#a0977e]/70">
                  {draft[key]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Text editing (only for text elements) */}
        {!isText && (
          <div className="rounded-[1.15rem] border border-[#e8c8c6]/72 bg-[#fdf0ef]/82 px-3 py-4 text-center shadow-[0_6px_14px_rgba(74,59,42,0.08)]">
            <p className="whitespace-pre-line text-[12px] leading-5 text-[#8e5a53]">
              {t('sessionDetail.nonTextElementHint')}
            </p>
          </div>
        )}
        {isText && (
          <>
            <div className="rounded-[1.15rem] border border-[#ded2bd]/72 bg-[#fffaf1]/82 px-3 py-2.5 shadow-[0_6px_14px_rgba(74,59,42,0.08)]">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium text-[#7a875f]">
                  {t('sessionDetail.textContent')}
                </span>
                <Textarea
                  value={draft.text}
                  onChange={(event) => onDraftChange({ ...draft, text: event.target.value })}
                  rows={5}
                  className="min-h-[120px] resize-none rounded-[1rem] border border-[#ded2bd]/72 bg-[#fffdf8]/88 px-3 py-2 text-[13px] leading-5 text-[#3f4b35] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9bb98a] focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </label>
            </div>

            <div className="rounded-[1.15rem] border border-[#ded2bd]/72 bg-[#fffaf1]/82 px-3 py-2.5 shadow-[0_6px_14px_rgba(74,59,42,0.08)]">
              <div className="space-y-2.5">
                <div className="grid grid-cols-[1fr_88px] gap-2.5">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium text-[#7a875f]">
                      {t('sessionDetail.textColor')}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={draft.color || '#34402c'}
                        onChange={(event) => onDraftChange({ ...draft, color: event.target.value })}
                        className="h-8 w-10 shrink-0 cursor-pointer rounded-full border border-[#d7cbb7]/70 bg-transparent p-1"
                        aria-label={t('sessionDetail.textColor')}
                      />
                      <Input
                        value={draft.color}
                        onChange={(event) => onDraftChange({ ...draft, color: event.target.value })}
                        className="h-8 rounded-full border border-[#ded2bd]/72 bg-[#fffdf8]/88 px-2.5 text-xs text-[#3f4b35] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9bb98a] focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium text-[#7a875f]">
                      {t('sessionDetail.fontSize')}
                    </span>
                    <Input
                      type="number"
                      min={8}
                      max={160}
                      value={draft.fontSize}
                      onChange={(event) => onDraftChange({ ...draft, fontSize: event.target.value })}
                      className="h-8 rounded-full border border-[#ded2bd]/72 bg-[#fffdf8]/88 px-2.5 text-xs text-[#3f4b35] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9bb98a] focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium text-[#7a875f]">
                    {t('sessionDetail.fontWeight')}
                  </span>
                  <Select
                    value={draft.fontWeight}
                    onValueChange={(value) => onDraftChange({ ...draft, fontWeight: value })}
                  >
                    <SelectTrigger className="h-8 rounded-full border-[#ded2bd]/72 bg-[#fffdf8]/88 px-2.5 text-xs text-[#3f4b35] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9bb98a]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="300">300</SelectItem>
                      <SelectItem value="400">400</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                      <SelectItem value="600">600</SelectItem>
                      <SelectItem value="700">700</SelectItem>
                      <SelectItem value="800">800</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
            </div>
          </>
        )}

        {/* Delete element */}
        {onDelete && (
          <div className="px-0.5 pb-1 pt-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="flex w-full h-8 items-center justify-center gap-1.5 rounded-full border border-[#e8c8c6]/80 bg-[#fffdf8]/60 text-xs font-medium text-[#8e5a53] transition-colors hover:border-[#c0392b]/40 hover:bg-[#fdf0ef] hover:shadow-[0_4px_12px_rgba(192,57,43,0.1)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('sessionDetail.deleteElement')}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>{t('sessionDetail.deleteElement')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('sessionDetail.deleteElementConfirm')}
                </AlertDialogDescription>
                <div className="flex justify-end gap-2">
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-[#c0392b] text-white hover:bg-[#a93226]"
                    onClick={onDelete}
                  >
                    {t('common.delete')}
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  )
}

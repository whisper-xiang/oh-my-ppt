import { Type } from 'lucide-react'
import { Input, Textarea } from '../../ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/Select'
import { ColorPicker } from '../../ui/ColorPicker'
import { InspectorSection } from './InspectorSection'
import type { ElementEditorProps } from './types'
import { useT } from '@renderer/i18n'

export function TextInspector({
  draft,
  onDraftChange
}: ElementEditorProps): React.JSX.Element {
  const t = useT()
  return (
    <>
      <InspectorSection
        title={t('sessionDetail.textContent')}
        icon={<Type className="h-3.5 w-3.5 text-[#7a75a0]" />}
      >
        <Textarea
          value={draft.text}
          onChange={(event) => onDraftChange({ ...draft, text: event.target.value })}
          onBlur={(event) =>
            onDraftChange({ ...draft, text: event.target.value }, { commit: true, fields: ['text'] })
          }
          rows={5}
          className="min-h-[120px] resize-none rounded-[1rem] border border-[#d4cef0]/72 bg-[#faf9fe]/88 px-3 py-2 text-[13px] leading-5 text-[#2d2560] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9d90e0] focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </InspectorSection>

      <InspectorSection title={t('sessionDetail.textStyle')}>
        <div className="space-y-2.5">
          <div className="grid grid-cols-[1fr_88px] gap-2.5">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-[#7a75a0]">
                {t('sessionDetail.textColor')}
              </span>
              <div className="flex items-center gap-2">
                <ColorPicker
                  value={draft.color || '#34402c'}
                  onChange={(v) => onDraftChange({ ...draft, color: v })}
                  onCommit={(v) =>
                    onDraftChange({ ...draft, color: v }, { commit: true, fields: ['color'] })
                  }
                />
                <Input
                  value={draft.color}
                  onChange={(event) => onDraftChange({ ...draft, color: event.target.value })}
                  onBlur={(event) =>
                    onDraftChange(
                      { ...draft, color: event.target.value },
                      { commit: true, fields: ['color'] }
                    )
                  }
                  className="h-8 rounded-full border border-[#d4cef0]/72 bg-[#faf9fe]/88 px-2.5 text-xs text-[#2d2560] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9d90e0] focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-[#7a75a0]">
                {t('sessionDetail.fontSize')}
              </span>
              <Input
                type="number"
                min={8}
                max={160}
                value={draft.fontSize}
                onChange={(event) => onDraftChange({ ...draft, fontSize: event.target.value })}
                onBlur={(event) =>
                  onDraftChange(
                    { ...draft, fontSize: event.target.value },
                    { commit: true, fields: ['fontSize'] }
                  )
                }
                className="h-8 rounded-full border border-[#d4cef0]/72 bg-[#faf9fe]/88 px-2.5 text-xs text-[#2d2560] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9d90e0] focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-[#7a75a0]">
              {t('sessionDetail.fontWeight')}
            </span>
            <Select
              value={draft.fontWeight}
              onValueChange={(value) =>
                onDraftChange(
                  { ...draft, fontWeight: value },
                  { commit: true, fields: ['fontWeight'] }
                )
              }
            >
              <SelectTrigger className="h-8 rounded-full border-[#d4cef0]/72 bg-[#faf9fe]/88 px-2.5 text-xs text-[#2d2560] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9d90e0]">
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
      </InspectorSection>
    </>
  )
}

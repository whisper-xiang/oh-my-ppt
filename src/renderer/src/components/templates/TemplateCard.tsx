import { CopyPlus, Eye, PencilLine, Play, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover'
import type { TemplateListItem } from '@renderer/lib/ipc'
import dayjs from 'dayjs'

const localAssetUrl = (filePath: string): string => `local-asset://${encodeURIComponent(filePath)}`

export function TemplateCard({
  template,
  onUse,
  onEdit,
  onDelete
}: {
  template: TemplateListItem
  onUse: (template: TemplateListItem) => void
  onEdit: (template: TemplateListItem) => void
  onDelete: (template: TemplateListItem) => void
}): React.JSX.Element {
  return (
    <Popover>
      <Card className="group !rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(88,75,56,0.18)]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-start justify-between gap-3 text-base">
            <span className="min-w-0 truncate text-[#3e4a32]">{template.name}</span>
            <span className="shrink-0 rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-2 py-1 text-[11px] font-medium text-[#7c6a4c]">
              {template.pageCount} 页
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 min-h-[40px] text-xs leading-5 text-muted-foreground">
            {template.description || '暂无描述'}
          </p>
          {template.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {template.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-1.5 py-0.5 text-[11px] text-[#7c6a4c]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[11px] text-muted-foreground">
              {dayjs(template.updatedAt).format('YYYY/MM/DD HH:mm')}
            </span>
            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              {template.previewHtmlPath ? (
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    预览
                  </Button>
                </PopoverTrigger>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => onEdit(template)}>
                <PencilLine className="mr-1.5 h-3.5 w-3.5" />
                编辑
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDelete(template)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                删除
              </Button>
              <Button size="sm" onClick={() => onUse(template)}>
                <CopyPlus className="mr-1.5 h-3.5 w-3.5" />
                使用
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {template.previewHtmlPath ? (
        <PopoverContent
          side="right"
          align="start"
          sideOffset={12}
          className="w-auto overflow-hidden rounded-lg border border-[#d8cfbc]/80 bg-[#fffaf0] p-2 shadow-[0_18px_44px_rgba(64,52,38,0.22)] data-[state=closed]:animate-none data-[state=open]:animate-none"
        >
          <div className="relative aspect-video w-[380px] overflow-hidden rounded-md border border-[#e3dac8] bg-white">
            <iframe
              src={localAssetUrl(template.previewHtmlPath)}
              className="absolute left-0 top-0 h-[900px] w-[1600px] origin-top-left border-0 bg-white"
              style={{ transform: 'scale(0.2375)' }}
              title={`${template.name} preview`}
            />
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  )
}

export function TemplateEmptyState(): React.JSX.Element {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Play className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-medium">暂无模板</h3>
        <p className="text-sm text-muted-foreground">在会话列表或编辑页把满意的演示保存为模板。</p>
      </CardContent>
    </Card>
  )
}

import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/Dialog'
import { Input } from '../ui/Input'

export function SaveTemplateDialog({
  open,
  defaultName,
  defaultDescription = '',
  defaultTags,
  mode = 'create',
  saving,
  onOpenChange,
  onSubmit
}: {
  open: boolean
  defaultName: string
  defaultDescription?: string
  defaultTags?: string[]
  mode?: 'create' | 'edit'
  saving?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: { name: string; description: string; tags: string[] }) => void
}): React.JSX.Element {
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    if (!open) return
    setName(defaultName)
    setDescription(defaultDescription)
    setTags((defaultTags || []).join('，'))
  }, [defaultDescription, defaultName, defaultTags, open])

  const submit = (): void => {
    const cleanName = name.trim()
    if (!cleanName || saving) return
    onSubmit({
      name: cleanName,
      description: description.trim(),
      tags: tags
        .split(/[,，\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? '编辑模板信息' : '保存为模板'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? '修改模板名称、描述和标签，不影响已创建的会话。'
              : '将当前演示保存到模板库，后续可以直接从这个模板创建新会话。'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5f6b50]">模板名称</label>
            <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5f6b50]">描述</label>
            <textarea
              value={description}
              maxLength={240}
              className="min-h-[74px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
              placeholder="适合什么场景、内容结构或视觉风格"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5f6b50]">标签</label>
            <Input
              value={tags}
              placeholder="用逗号分隔，例如：商务，复盘，数据"
              onChange={(event) => setTags(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={saving || !name.trim()}>
            {saving ? '保存中...' : mode === 'edit' ? '更新' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

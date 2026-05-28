import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { ipc } from '@renderer/lib/ipc'
import { useToastStore } from '../store'

const MAX_RULE_PROMPT_CHARS = 4000

const DEFAULT_TEMPLATE = `第 1 页：封面页，包含演示标题、副标题和演讲者信息。
第 2 页：目录页，列出本次演示的所有主要章节标题。
第 3 页起：正文内容页，每页围绕一个核心知识点展开。
最后一页：结束页 / 致谢页。`

export function OutlineRuleEditorPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { ruleId } = useParams<{ ruleId?: string }>()
  const isCreate = !ruleId || ruleId === 'new'

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rulePrompt, setRulePrompt] = useState(isCreate ? DEFAULT_TEMPLATE : '')
  const [source, setSource] = useState<'builtin' | 'custom'>('custom')
  const { error, success } = useToastStore()

  const loadRule = useCallback(async (): Promise<void> => {
    if (isCreate || !ruleId) return
    setLoading(true)
    try {
      const detail = await ipc.getOutlineRuleDetail(ruleId)
      if (!detail) {
        error('未找到该大纲规则')
        navigate('/outline-rules', { replace: true })
        return
      }
      setName(detail.name)
      setDescription(detail.description)
      setRulePrompt(detail.rulePrompt)
      setSource(detail.source)
    } catch (e) {
      error('加载大纲规则失败', {
        description: e instanceof Error ? e.message : '请稍后重试'
      })
    } finally {
      setLoading(false)
    }
  }, [isCreate, ruleId, error, navigate])

  useEffect(() => {
    void loadRule()
  }, [loadRule])

  const readOnly = source === 'builtin'

  const handleSave = async (): Promise<void> => {
    const trimmedName = name.trim()
    const trimmedPrompt = rulePrompt.trim()
    if (!trimmedName) {
      error('名称不能为空')
      return
    }
    if (!trimmedPrompt) {
      error('规则正文不能为空')
      return
    }
    if (trimmedPrompt.length > MAX_RULE_PROMPT_CHARS) {
      error(`规则正文不能超过 ${MAX_RULE_PROMPT_CHARS} 字符`)
      return
    }
    setSaving(true)
    try {
      if (isCreate) {
        await ipc.createOutlineRule({
          name: trimmedName,
          description: description.trim(),
          rulePrompt: trimmedPrompt
        })
        success('已创建大纲规则')
      } else {
        await ipc.updateOutlineRule({
          id: ruleId!,
          name: trimmedName,
          description: description.trim(),
          rulePrompt: trimmedPrompt
        })
        success('已更新大纲规则')
      }
      navigate('/outline-rules')
    } catch (e) {
      error('保存大纲规则失败', {
        description: e instanceof Error ? e.message : '请稍后重试'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/outline-rules')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          返回列表
        </Button>
        <h1 className="organic-serif text-[24px] font-semibold text-[#2d2560]">
          {isCreate ? '新建大纲规则' : '编辑大纲规则'}
        </h1>
        {readOnly && (
          <span className="rounded-md bg-[#fff7ed] px-2 py-0.5 text-xs text-[#92400e]">
            内置规则，仅查看
          </span>
        )}
      </div>

      <Card className="!rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">基础信息</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">名称</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：标准 PPT 结构"
              disabled={readOnly || loading}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              简介 <span className="text-muted-foreground">（可选）</span>
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话说明这个规则的用途"
              disabled={readOnly || loading}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">规则正文</label>
              <span className="text-xs text-muted-foreground">
                {rulePrompt.length} / {MAX_RULE_PROMPT_CHARS}
              </span>
            </div>
            <textarea
              value={rulePrompt}
              onChange={(e) => setRulePrompt(e.target.value)}
              placeholder="按页描述结构约束，会被注入到大纲规划阶段。"
              rows={14}
              disabled={readOnly || loading}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              建议按"第 N 页：…"格式逐条罗列，LLM 会严格遵循。
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/outline-rules')}>
          取消
        </Button>
        <Button onClick={() => void handleSave()} disabled={readOnly || saving || loading}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  )
}

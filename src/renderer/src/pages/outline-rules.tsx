import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, PencilLine, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from '../components/ui/AlertDialog'
import { ipc, type OutlineRuleSummary } from '@renderer/lib/ipc'
import { useToastStore } from '../store'

export function OutlineRulesPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [rules, setRules] = useState<OutlineRuleSummary[]>([])
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const { error, success } = useToastStore()

  const loadRules = useCallback(async (): Promise<void> => {
    try {
      const { items } = await ipc.listOutlineRules()
      setRules(items)
    } catch (e) {
      error('加载大纲规则失败', {
        description: e instanceof Error ? e.message : '请稍后重试'
      })
    }
  }, [error])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const handleDelete = async (ruleId: string): Promise<void> => {
    try {
      const result = await ipc.deleteOutlineRule(ruleId)
      if (result.success) {
        success('已删除大纲规则')
        await loadRules()
      } else {
        error('删除失败', { description: result.message || '未知错误' })
      }
    } catch (e) {
      error('删除大纲规则失败', {
        description: e instanceof Error ? e.message : '请稍后重试'
      })
    } finally {
      setPendingDeleteId(null)
    }
  }

  const pendingDeleteRule = rules.find((r) => r.id === pendingDeleteId) || null

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          OUTLINE RULES
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#2d2560]">
              大纲规则
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <Button
              size="sm"
              className="min-w-[112px]"
              onClick={() => navigate('/outline-rules/new')}
            >
              <Plus className="mr-2 h-4 w-4" />
              新建规则
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          维护一组结构性 PPT 规则（例：第 1 页必须是封面，第 2 页必须是目录涵盖 3 个章节）。新建会话时可选中，强制约束大纲生成。
        </p>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#d4cef0] bg-[#faf9fe] p-10 text-center">
          <p className="text-sm text-muted-foreground">还没有大纲规则</p>
          <Button className="mt-4" size="sm" onClick={() => navigate('/outline-rules/new')}>
            <Plus className="mr-2 h-4 w-4" />
            新建第一条规则
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rules.map((rule) => (
            <Card
              key={rule.id}
              className="group !rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(88,75,56,0.18)]"
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="truncate transition-colors duration-200 group-hover:text-foreground">
                    {rule.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="transition-all duration-200 group-hover:-translate-y-0.5"
                      onClick={() => navigate(`/outline-rules/${rule.id}`)}
                    >
                      <PencilLine className="mr-1.5 h-3.5 w-3.5" />
                      编辑
                    </Button>
                    {rule.source !== 'builtin' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setPendingDeleteId(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-2 text-[12px] text-muted-foreground/80">
                  {rule.description || '（无描述）'}
                </p>
                <pre className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-md bg-[#f5f3ff] p-2 text-[11px] text-[#4a4570]">
                  {rule.rulePrompt}
                </pre>
                <p className="mt-2 text-xs text-muted-foreground/60">
                  {rule.source === 'builtin' ? '内置' : '自定义'} ·{' '}
                  {new Date(rule.updatedAt * 1000).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <AlertDialogTitle>删除大纲规则？</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除规则「{pendingDeleteRule?.name}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDeleteId && void handleDelete(pendingDeleteId)}
            >
              确认删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

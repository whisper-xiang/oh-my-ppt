import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog'
import { useUserStore } from '@renderer/store/userStore'
import { useT } from '@renderer/i18n'

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps): React.JSX.Element {
  const t = useT()
  const { currentUser, updateProfile } = useUserStore()

  const [nickname, setNickname] = useState(currentUser?.nickname ?? '')
  const [avatar, setAvatar] = useState(currentUser?.avatar ?? '')
  const [saved, setSaved] = useState(false)

  const handleSave = (): void => {
    updateProfile({
      nickname: nickname.trim() || currentUser?.nickname,
      avatar: avatar.trim().slice(0, 2) || currentUser?.avatar
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-[2rem] border border-[#ded2bd]/60 bg-[#fffaf1] shadow-[0_20px_48px_rgba(74,59,42,0.13)]">
        <DialogHeader>
          <DialogTitle className="text-[#2f3b28]">{t('profile.title')}</DialogTitle>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-5">
          {/* Avatar preview */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8faa72] to-[#5a7845] text-2xl font-bold text-white shadow-md">
              {(avatar.trim() || currentUser?.avatar || '?').slice(0, 2)}
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-[#4a5a3d]">
                {t('profile.avatar')}
              </label>
              <input
                type="text"
                maxLength={2}
                value={avatar}
                placeholder={currentUser?.avatar ?? '?'}
                onChange={(e) => setAvatar(e.target.value)}
                className="w-full rounded-xl border border-[#d8ccb5]/80 bg-[#fffdf8] px-3 py-2 text-sm text-[#3f4b35] placeholder:text-[#b0a898] focus:border-[#9bb98a] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-[#9a8f80]">{t('profile.avatarHint')}</p>
            </div>
          </div>

          {/* Nickname */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#4a5a3d]">
              {t('profile.nickname')}
            </label>
            <input
              type="text"
              value={nickname}
              placeholder={currentUser?.nickname ?? ''}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full rounded-xl border border-[#d8ccb5]/80 bg-[#fffdf8] px-3 py-2 text-sm text-[#3f4b35] placeholder:text-[#b0a898] focus:border-[#9bb98a] focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-xl bg-gradient-to-r from-[#6f8159] to-[#4f613f] py-2.5 text-sm font-semibold text-white shadow-md shadow-[#5d6b4d]/20 transition-all hover:translate-y-[-1px]"
          >
            {saved ? t('profile.saved') : t('profile.save')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

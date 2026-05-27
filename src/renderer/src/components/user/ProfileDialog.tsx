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
      <DialogContent className="max-w-sm rounded-[2rem] border border-[#d4cef0]/60 bg-[#faf9fe] shadow-[0_20px_48px_rgba(70,55,140,0.13)]">
        <DialogHeader>
          <DialogTitle className="text-[#2d2560]">{t('profile.title')}</DialogTitle>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-5">
          {/* Avatar preview */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#9d90e0] to-[#6b5fbd] text-2xl font-bold text-white shadow-md">
              {(avatar.trim() || currentUser?.avatar || '?').slice(0, 2)}
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-[#4a4570]">
                {t('profile.avatar')}
              </label>
              <input
                type="text"
                maxLength={2}
                value={avatar}
                placeholder={currentUser?.avatar ?? '?'}
                onChange={(e) => setAvatar(e.target.value)}
                className="w-full rounded-xl border border-[#d4cef0]/80 bg-[#faf9fe] px-3 py-2 text-sm text-[#2d2560] placeholder:text-[#a09ab8] focus:border-[#9d90e0] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-[#9a95b8]">{t('profile.avatarHint')}</p>
            </div>
          </div>

          {/* Nickname */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#4a4570]">
              {t('profile.nickname')}
            </label>
            <input
              type="text"
              value={nickname}
              placeholder={currentUser?.nickname ?? ''}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full rounded-xl border border-[#d4cef0]/80 bg-[#faf9fe] px-3 py-2 text-sm text-[#2d2560] placeholder:text-[#a09ab8] focus:border-[#9d90e0] focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-xl bg-gradient-to-r from-[#7c6fd4] to-[#4c3fa8] py-2.5 text-sm font-semibold text-white shadow-md shadow-[#6b5fbd]/20 transition-all hover:translate-y-[-1px]"
          >
            {saved ? t('profile.saved') : t('profile.save')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

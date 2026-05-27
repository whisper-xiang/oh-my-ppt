import { useState } from 'react'
import { useUserStore } from '@renderer/store/userStore'
import { useT } from '@renderer/i18n'
import logoUrl from '@renderer/assets/images/logo.png'

type Mode = 'login' | 'register'

export function AuthPage(): React.JSX.Element {
  const t = useT()
  const { login, register } = useUserStore()

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) {
      setError(t('auth.errorEmpty'))
      return
    }
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(username.trim(), password)
      } else {
        await register(username.trim(), password, nickname.trim())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (): void => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[#f5f0e8] px-4">
      {/* decorative blobs */}
      <div className="pointer-events-none fixed -left-32 -top-32 h-72 w-72 rounded-full bg-[#d4e4c1]/40 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-24 -right-24 h-64 w-64 rounded-full bg-[#c8b89e]/30 blur-3xl" />

      <div className="relative w-full max-w-[380px]">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <img src={logoUrl} alt="logo" className="h-16 w-16 select-none" draggable={false} />
          <h1 className="organic-serif text-2xl font-semibold text-[#3e4a32]">Oh My PPT</h1>
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-[2rem] border border-[#ded2bd]/60 bg-[#fffaf1]/90 shadow-[0_20px_48px_rgba(74,59,42,0.12)] backdrop-blur-xl">
          <div className="px-8 pb-8 pt-7">
            <h2 className="text-lg font-semibold text-[#2f3b28]">
              {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
            </h2>
            <p className="mt-1 text-sm text-[#7a6b56]">
              {mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}
            </p>

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 flex flex-col gap-4">
              {/* Username */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#4a5a3d]">{t('auth.username')}</label>
                <input
                  type="text"
                  autoComplete="username"
                  placeholder={t('auth.usernamePlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="rounded-xl border border-[#d8ccb5]/80 bg-[#fffdf8] px-3.5 py-2.5 text-sm text-[#3f4b35] placeholder:text-[#b0a898] focus:border-[#9bb98a] focus:outline-none"
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#4a5a3d]">{t('auth.password')}</label>
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl border border-[#d8ccb5]/80 bg-[#fffdf8] px-3.5 py-2.5 text-sm text-[#3f4b35] placeholder:text-[#b0a898] focus:border-[#9bb98a] focus:outline-none"
                />
              </div>

              {/* Nickname (register only) */}
              {mode === 'register' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[#4a5a3d]">{t('auth.nickname')}</label>
                  <input
                    type="text"
                    autoComplete="nickname"
                    placeholder={t('auth.nicknamePlaceholder')}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="rounded-xl border border-[#d8ccb5]/80 bg-[#fffdf8] px-3.5 py-2.5 text-sm text-[#3f4b35] placeholder:text-[#b0a898] focus:border-[#9bb98a] focus:outline-none"
                  />
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="rounded-xl bg-[#fff0ee] px-3.5 py-2 text-xs text-[#9b4040]">{error}</p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full rounded-xl bg-gradient-to-r from-[#6f8159] to-[#4f613f] py-2.5 text-sm font-semibold text-white shadow-md shadow-[#5d6b4d]/30 transition-all hover:translate-y-[-1px] hover:shadow-lg disabled:opacity-60"
              >
                {loading
                  ? mode === 'login'
                    ? t('auth.loggingIn')
                    : t('auth.registering')
                  : mode === 'login'
                    ? t('auth.loginBtn')
                    : t('auth.registerBtn')}
              </button>
            </form>

            {/* Switch mode */}
            <button
              type="button"
              onClick={switchMode}
              className="mt-4 w-full text-center text-xs text-[#7a875f] hover:text-[#4f613f]"
            >
              {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

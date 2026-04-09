import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2, User, Lock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/auth'
import toast from 'react-hot-toast'

interface ProfileForm {
  username: string
}

interface PasswordForm {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const [profileLoading, setProfileLoading] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)

  const profileForm = useForm<ProfileForm>({ defaultValues: { username: user?.username || '' } })
  const pwdForm = useForm<PasswordForm>()

  const onUpdateProfile = async (data: ProfileForm) => {
    setProfileLoading(true)
    try {
      const updated = await authApi.updateProfile(data)
      updateUser(updated)
      toast.success('资料更新成功')
    } finally {
      setProfileLoading(false)
    }
  }

  const onChangePassword = async (data: PasswordForm) => {
    if (data.newPassword !== data.confirmPassword) {
      pwdForm.setError('confirmPassword', { message: '两次密码不一致' })
      return
    }
    setPwdLoading(true)
    try {
      await authApi.changePassword({ oldPassword: data.oldPassword, newPassword: data.newPassword })
      toast.success('密码修改成功，请重新登录')
      pwdForm.reset()
    } finally {
      setPwdLoading(false)
    }
  }

  const initials = user?.username?.slice(0, 2).toUpperCase() || 'U'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">个人中心</h1>
        <p className="text-muted-foreground mt-1">管理您的账号信息</p>
      </div>

      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{user?.username}</CardTitle>
              <CardDescription>{user?.email}</CardDescription>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full mt-1 inline-block">
                {user?.role}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onUpdateProfile)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <User className="w-4 h-4" /> 用户名
              </label>
              <Input
                {...profileForm.register('username', { required: '请输入用户名' })}
                placeholder="用户名"
              />
              {profileForm.formState.errors.username && (
                <p className="text-xs text-destructive">{profileForm.formState.errors.username.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">邮箱</label>
              <Input value={user?.email || ''} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">邮箱不可修改</p>
            </div>
            <Button type="submit" disabled={profileLoading} className="gap-2">
              {profileLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              保存修改
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 修改密码 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4" /> 修改密码
          </CardTitle>
          <CardDescription>定期修改密码以保障账号安全</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={pwdForm.handleSubmit(onChangePassword)} className="space-y-4">
            {(['oldPassword', 'newPassword', 'confirmPassword'] as const).map((field, i) => {
              const labels = ['当前密码', '新密码', '确认新密码']
              return (
                <div key={field} className="space-y-1.5">
                  <label className="text-sm font-medium">{labels[i]}</label>
                  <Input
                    type="password"
                    {...pwdForm.register(field, { required: `请输入${labels[i]}`, minLength: { value: 6, message: '密码至少6位' } })}
                    placeholder={labels[i]}
                  />
                  {pwdForm.formState.errors[field] && (
                    <p className="text-xs text-destructive">{pwdForm.formState.errors[field]?.message}</p>
                  )}
                </div>
              )
            })}
            <Button type="submit" disabled={pwdLoading} className="gap-2">
              {pwdLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              修改密码
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'

const mq = '(max-width: 639.98px)'

/** 桌面端 top-right（顶栏下偏移）；窄屏 bottom-center，避免挡顶栏控件 */
export function WorkspaceToaster() {
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const m = window.matchMedia(mq)
    const apply = () => setMobile(m.matches)
    apply()
    m.addEventListener('change', apply)
    return () => m.removeEventListener('change', apply)
  }, [])

  return (
    <Toaster
      position={mobile ? 'bottom-center' : 'top-right'}
      gutter={mobile ? 12 : 10}
      containerStyle={
        mobile
          ? {
              bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'min(420px, calc(100vw - 32px))',
            }
          : {
              top: 'calc(var(--layout-header-height, 4rem) + 20px)',
              right: 20,
            }
      }
      toastOptions={{
        duration: 3500,
        className: 'ui-toast ui-toast-motion',
        style: {
          animation: mobile
            ? 'ui-toast-in-mobile 0.2s ease-out both'
            : 'ui-toast-in-desktop 0.2s ease-out both',
        },
        success: {
          duration: 3500,
          iconTheme: {
            primary: 'var(--ui-text-success)',
            secondary: 'var(--ui-toast-bg)',
          },
          ariaProps: {
            role: 'status',
            'aria-live': 'polite',
          },
        },
        error: {
          duration: 5500,
          iconTheme: {
            primary: 'var(--ui-text-danger)',
            secondary: 'var(--ui-toast-bg)',
          },
          ariaProps: {
            role: 'alert',
            'aria-live': 'assertive',
          },
        },
      }}
    />
  )
}

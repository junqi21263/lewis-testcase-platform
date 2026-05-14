import { create } from 'zustand'
import type { ReactNode } from 'react'

export type AppConfirmPayload = {
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'default' | 'destructive'
  size?: 'confirm' | 'form'
}

type State = {
  open: boolean
  payload: AppConfirmPayload | null
  resolve: ((ok: boolean) => void) | null
}

export const useAppConfirmStore = create<State>(() => ({
  open: false,
  payload: null,
  resolve: null,
}))

export function appConfirm(payload: AppConfirmPayload): Promise<boolean> {
  return new Promise((resolve) => {
    useAppConfirmStore.setState({ open: true, payload, resolve })
  })
}

export function resolveAppConfirm(ok: boolean) {
  const { resolve } = useAppConfirmStore.getState()
  if (!resolve) return
  useAppConfirmStore.setState({ open: false, payload: null, resolve: null })
  resolve(ok)
}

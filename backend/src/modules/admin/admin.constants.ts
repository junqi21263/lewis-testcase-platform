/** 写入 admin_audit_logs.action，便于检索与前端展示 */
export const ADMIN_AUDIT_ACTION = {
  RESET_PASSWORD: 'ADMIN_RESET_PASSWORD',
  UPDATE_ROLE: 'ADMIN_UPDATE_ROLE',
} as const

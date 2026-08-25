import { apiFetch } from './client'

export interface PushRecipient {
  tenant_id: string
  staff_id: string
  staff_name: string
  tenant_name: string
  devices: number
}

export async function getPushRecipients(): Promise<PushRecipient[]> {
  const res = (await apiFetch('/pwa/superadmin/push/recipients')) as {
    recipients: PushRecipient[]
  }
  return res.recipients
}

export interface PushSendResult {
  total: number
  results: { staff_id: string; sent: number }[]
}

export async function sendAdminPush(
  targets: { tenant_id: string; staff_id: string }[],
  title: string,
  body: string,
): Promise<PushSendResult> {
  return apiFetch<PushSendResult>('/pwa/superadmin/push/send', {
    method: 'POST',
    body: JSON.stringify({ targets, title, body }),
  })
}

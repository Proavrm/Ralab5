import { getApiErrorMessage } from '@/services/api'

export function feedbackOk(msg) {
  return { type: 'ok', msg }
}

export function feedbackErr(error, prefix = '') {
  const message = getApiErrorMessage(error)
  return { type: 'err', msg: prefix ? `${prefix}${message}` : message }
}

export function feedbackInfo(msg) {
  return { type: 'info', msg }
}

export function formatDstImportSuccess(data) {
  return `✓ Import terminé\nInsérés : ${data.inserted}\nMis à jour : ${data.updated}\nIgnorés : ${data.skipped}\nTotal lignes : ${data.total_rows}`
}

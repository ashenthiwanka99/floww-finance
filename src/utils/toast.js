import { Notify } from 'quasar'

export function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function showToast(message, type = 'success') {
  const icons = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info',
    delete: 'delete',
    edit: 'check_circle',
    paid: 'paid'
  }
  const icon = icons[type] || icons.success

  Notify.create({
    message: `<span class="material-symbols-outlined toast-icon">${icon}</span> ${escapeHtml(message)}`,
    html: true,
    color: 'dark',
    textColor: 'white',
    position: 'bottom',
    timeout: 2000,
    classes: `floww-toast floww-toast--${type}`
  })
}

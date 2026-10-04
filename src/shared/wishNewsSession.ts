/**
 * Merker für «Neues zu deinen Wünschen» (WishNewsNotice): pro Seitenaufruf
 * einmal. Die Blase wird in der PWA je nach Screen ein- und ausgehängt — ohne
 * diesen Merker käme der Hinweis nach «Später» bei jedem Screenwechsel zurück.
 * Bewusst kein localStorage: beim nächsten Start soll er wieder erscheinen,
 * solange niemand quittiert hat.
 */
let dismissed = false

export function wishNewsDismissed(): boolean {
  return dismissed
}

export function dismissWishNews() {
  dismissed = true
}

export function resetWishNewsNoticeForTests() {
  dismissed = false
}

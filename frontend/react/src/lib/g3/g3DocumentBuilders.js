export function openG3002Preview(html, title = 'Programme des reconnaissances G3') {
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return false
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.document.title = title
  return true
}

export function printG3002(html) {
  if (!openG3002Preview(html)) return
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.onload = () => win.print()
}

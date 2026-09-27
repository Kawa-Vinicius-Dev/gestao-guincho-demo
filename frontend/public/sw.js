// Service worker so para os avisos no celular: nao guarda nada em cache, o
// sistema continua precisando de internet como sempre.

self.addEventListener('push', evento => {
  const aviso = evento.data ? evento.data.json() : {}
  evento.waitUntil(self.registration.showNotification(aviso.titulo || 'J M S', {
    body: aviso.texto || '',
    icon: '/favicon-192x192.png',
    badge: '/favicon-192x192.png',
    data: { url: aviso.url || '/' },
  }))
})

// Tocar no aviso abre a tela certa, reaproveitando o app se ele ja estiver aberto.
self.addEventListener('notificationclick', evento => {
  evento.notification.close()
  const url = evento.notification.data?.url || '/'
  evento.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
    const aberta = janelas.find(j => 'focus' in j)
    if (aberta) return aberta.navigate(url).then(j => (j || aberta).focus())
    return self.clients.openWindow(url)
  }))
})

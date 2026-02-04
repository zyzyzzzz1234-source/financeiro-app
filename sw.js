// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    SERVICE WORKER - SISTEMA FINANCEIRO                    ║
// ║                     Gerencia cache e modo offline                         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const CACHE_NAME = 'financeiro-pwa-v1';
const CACHE_DYNAMIC = 'financeiro-dynamic-v1';

// Arquivos para cachear na instalação (funcionam offline)
const STATIC_ASSETS = [
  './',
  './index.html',
  './cadastro.html',
  './visualizador.html',
  './nomes.html',
  './styles.css',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons'
];

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                              INSTALAÇÃO                                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cacheando arquivos estáticos...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Instalação concluída!');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Erro na instalação:', error);
      })
  );
});

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                              ATIVAÇÃO                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Remove caches antigos
            if (cacheName !== CACHE_NAME && cacheName !== CACHE_DYNAMIC) {
              console.log('[SW] Removendo cache antigo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Ativação concluída!');
        return self.clients.claim();
      })
  );
});

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                         INTERCEPTAR REQUISIÇÕES                           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Ignora requisições para a API do Google Apps Script
  // Estas precisam sempre ir para a rede (quando disponível)
  if (url.hostname.includes('script.google.com') || 
      url.hostname.includes('googleapis.com')) {
    
    event.respondWith(
      fetch(request)
        .then((response) => {
          return response;
        })
        .catch((error) => {
          console.log('[SW] API offline, retornando erro controlado');
          // Retorna uma resposta de erro JSON
          return new Response(
            JSON.stringify({ 
              success: false, 
              offline: true,
              error: 'Você está offline. Os dados serão sincronizados quando a conexão for restaurada.' 
            }),
            { 
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }
  
  // Para arquivos estáticos: Cache First (busca no cache primeiro)
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Encontrou no cache, retorna
          console.log('[SW] Servindo do cache:', url.pathname);
          return cachedResponse;
        }
        
        // Não está no cache, busca na rede
        return fetch(request)
          .then((networkResponse) => {
            // Se a resposta é válida, adiciona ao cache dinâmico
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              
              caches.open(CACHE_DYNAMIC)
                .then((cache) => {
                  cache.put(request, responseToCache);
                });
            }
            
            return networkResponse;
          })
          .catch((error) => {
            console.log('[SW] Erro ao buscar:', url.pathname, error);
            
            // Se é uma página HTML, retorna a página offline
            if (request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
            
            // Para outros recursos, retorna erro
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                         SINCRONIZAÇÃO EM BACKGROUND                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Recebe mensagens da página
self.addEventListener('message', (event) => {
  const data = event.data;
  
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (data && data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
  
  if (data && data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => {
        caches.delete(name);
      });
    });
    event.ports[0].postMessage({ cleared: true });
  }
});

// Evento de sync (quando volta online)
self.addEventListener('sync', (event) => {
  console.log('[SW] Evento de sync:', event.tag);
  
  if (event.tag === 'sync-pendentes') {
    event.waitUntil(
      // Notifica a página para sincronizar
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SYNC_REQUIRED',
            timestamp: Date.now()
          });
        });
      })
    );
  }
});

// Evento de conectividade
self.addEventListener('online', () => {
  console.log('[SW] Conexão restaurada!');
  
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'ONLINE',
        timestamp: Date.now()
      });
    });
  });
});

self.addEventListener('offline', () => {
  console.log('[SW] Conexão perdida!');
  
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'OFFLINE',
        timestamp: Date.now()
      });
    });
  });
});

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                              UTILITÁRIOS                                  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Log de versão
console.log('[SW] Service Worker versão:', CACHE_NAME);

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║               SISTEMA FINANCEIRO PWA - JAVASCRIPT PRINCIPAL               ║
// ║                     Funciona Online e Offline!                            ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// ============================================================================
// ⚠️  CONFIGURAÇÃO - ALTERE A URL ABAIXO!
// ============================================================================
// Cole aqui a URL do seu Web App do Google Apps Script
// Exemplo: 'https://script.google.com/macros/s/AKfycbx.../exec'

const API_URL = 'https://script.google.com/macros/s/AKfycbw4_4z9vF8gglY-2UROoYEXZUn-cbpQqhmDnBfvxuRUgDNo59dJ14Cdi6ATPcIOS2Gq/exec';

// ============================================================================


// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                         ESTADO GLOBAL                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const AppState = {
  isOnline: navigator.onLine,
  isSyncing: false,
  db: null,
  lastSync: null,
  pendingCount: 0
};

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                         INDEXEDDB - BANCO LOCAL                           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const DB_NAME = 'FinanceiroPWA';
const DB_VERSION = 1;

/**
 * Inicializa o banco de dados IndexedDB
 */
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('[DB] Erro ao abrir banco:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      AppState.db = request.result;
      console.log('[DB] Banco inicializado com sucesso');
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store para registros financeiros
      if (!db.objectStoreNames.contains('registros')) {
        const registrosStore = db.createObjectStore('registros', { keyPath: 'localId', autoIncrement: true });
        registrosStore.createIndex('linha', 'linha', { unique: false });
        registrosStore.createIndex('data', 'data', { unique: false });
      }
      
      // Store para categorias
      if (!db.objectStoreNames.contains('categorias')) {
        db.createObjectStore('categorias', { keyPath: 'tipo' });
      }
      
      // Store para cartões
      if (!db.objectStoreNames.contains('cartoes')) {
        db.createObjectStore('cartoes', { keyPath: 'nome' });
      }
      
      // Store para operações pendentes (sync offline)
      if (!db.objectStoreNames.contains('pendentes')) {
        const pendentesStore = db.createObjectStore('pendentes', { keyPath: 'id', autoIncrement: true });
        pendentesStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Store para cache geral
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
      
      console.log('[DB] Estrutura criada/atualizada');
    };
  });
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    OPERAÇÕES NO BANCO LOCAL                               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Salva dados no IndexedDB
 */
async function dbSave(storeName, data) {
  return new Promise((resolve, reject) => {
    if (!AppState.db) {
      reject(new Error('Banco não inicializado'));
      return;
    }
    
    const transaction = AppState.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Busca dados do IndexedDB
 */
async function dbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    if (!AppState.db) {
      reject(new Error('Banco não inicializado'));
      return;
    }
    
    const transaction = AppState.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Busca todos os dados de uma store
 */
async function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    if (!AppState.db) {
      reject(new Error('Banco não inicializado'));
      return;
    }
    
    const transaction = AppState.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove um item do IndexedDB
 */
async function dbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    if (!AppState.db) {
      reject(new Error('Banco não inicializado'));
      return;
    }
    
    const transaction = AppState.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Limpa todos os dados de uma store
 */
async function dbClear(storeName) {
  return new Promise((resolve, reject) => {
    if (!AppState.db) {
      reject(new Error('Banco não inicializado'));
      return;
    }
    
    const transaction = AppState.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    OPERAÇÕES PENDENTES (OFFLINE)                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Adiciona uma operação à fila de pendentes
 */
async function addPendingOperation(tipo, dados) {
  const operacao = {
    tipo: tipo,
    dados: dados,
    timestamp: Date.now(),
    tentativas: 0
  };
  
  const id = await dbSave('pendentes', operacao);
  await updatePendingCount();
  
  console.log('[Offline] Operação adicionada à fila:', tipo);
  return id;
}

/**
 * Obtém todas as operações pendentes
 */
async function getPendingOperations() {
  return await dbGetAll('pendentes');
}

/**
 * Remove uma operação pendente
 */
async function removePendingOperation(id) {
  await dbDelete('pendentes', id);
  await updatePendingCount();
}

/**
 * Atualiza o contador de operações pendentes
 */
async function updatePendingCount() {
  const pendentes = await getPendingOperations();
  AppState.pendingCount = pendentes.length;
  
  // Atualiza a UI se existir o elemento
  const badge = document.getElementById('pendingBadge');
  if (badge) {
    if (AppState.pendingCount > 0) {
      badge.textContent = AppState.pendingCount;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }
  
  return AppState.pendingCount;
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                         COMUNICAÇÃO COM API                               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Faz uma requisição para a API
 */
async function apiRequest(acao, dados = {}) {
  // Verifica se está online
  if (!navigator.onLine) {
    return { 
      success: false, 
      offline: true, 
      error: 'Sem conexão com internet' 
    };
  }
  
  try {
    const payload = {
      acao: acao,
      ...dados
    };
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    return result;
    
  } catch (error) {
    console.error('[API] Erro na requisição:', error);
    return { 
      success: false, 
      error: error.message,
      offline: !navigator.onLine
    };
  }
}

/**
 * Executa uma operação (online ou offline)
 */
async function executeOperation(tipo, dados, options = {}) {
  const { forceOnline = false, skipQueue = false } = options;
  
  // Se está online, tenta executar diretamente
  if (navigator.onLine || forceOnline) {
    const result = await apiRequest(tipo, dados);
    
    if (result.success) {
      return result;
    }
    
    // Se falhou e não está offline, retorna o erro
    if (!result.offline) {
      return result;
    }
  }
  
  // Se está offline ou falhou, adiciona à fila
  if (!skipQueue) {
    await addPendingOperation(tipo, dados);
    showToast('Salvo offline! Será sincronizado quando conectar.', 'warning');
  }
  
  return { 
    success: true, 
    offline: true, 
    queued: true,
    message: 'Operação salva para sincronização' 
  };
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                         SINCRONIZAÇÃO                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Sincroniza operações pendentes com o servidor
 */
async function syncPendingOperations() {
  if (AppState.isSyncing) {
    console.log('[Sync] Sincronização já em andamento');
    return;
  }
  
  if (!navigator.onLine) {
    console.log('[Sync] Sem conexão, sincronização adiada');
    return;
  }
  
  const pendentes = await getPendingOperations();
  
  if (pendentes.length === 0) {
    console.log('[Sync] Nada para sincronizar');
    return { success: true, synced: 0 };
  }
  
  AppState.isSyncing = true;
  updateStatusBar();
  
  console.log(`[Sync] Iniciando sincronização de ${pendentes.length} operações...`);
  
  try {
    // Envia todas as operações de uma vez
    const result = await apiRequest('syncOperacoes', { operacoes: pendentes });
    
    if (result.success && result.resultados) {
      let sucessos = 0;
      let falhas = 0;
      
      for (const res of result.resultados) {
        if (res.success) {
          await removePendingOperation(res.operacaoId);
          sucessos++;
        } else {
          falhas++;
          console.error('[Sync] Falha na operação:', res);
        }
      }
      
      console.log(`[Sync] Concluído: ${sucessos} ok, ${falhas} falhas`);
      
      if (falhas > 0) {
        showToast(`Sincronizado: ${sucessos} ok, ${falhas} falhas`, 'warning');
      } else {
        showToast(`${sucessos} operações sincronizadas!`, 'success');
      }
      
      return { success: true, synced: sucessos, failed: falhas };
    } else {
      throw new Error(result.error || 'Erro na sincronização');
    }
    
  } catch (error) {
    console.error('[Sync] Erro:', error);
    showToast('Erro na sincronização', 'error');
    return { success: false, error: error.message };
    
  } finally {
    AppState.isSyncing = false;
    updateStatusBar();
    await updatePendingCount();
  }
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                      STATUS DE CONEXÃO                                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Atualiza a barra de status de conexão
 */
function updateStatusBar() {
  const statusBar = document.getElementById('statusBar');
  if (!statusBar) return;
  
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const pendingBadge = document.getElementById('pendingBadge');
  
  if (AppState.isSyncing) {
    statusBar.className = 'status-bar syncing';
    if (statusIcon) statusIcon.textContent = '🔄';
    if (statusText) statusText.textContent = 'Sincronizando...';
  } else if (navigator.onLine) {
    statusBar.className = 'status-bar online';
    if (statusIcon) statusIcon.textContent = '🟢';
    if (statusText) statusText.textContent = 'Online';
  } else {
    statusBar.className = 'status-bar offline';
    if (statusIcon) statusIcon.textContent = '🟠';
    if (statusText) statusText.textContent = 'Offline';
  }
  
  if (pendingBadge) {
    if (AppState.pendingCount > 0) {
      pendingBadge.textContent = AppState.pendingCount;
      pendingBadge.style.display = 'inline';
    } else {
      pendingBadge.style.display = 'none';
    }
  }
}

/**
 * Configura os listeners de conexão
 */
function setupConnectionListeners() {
  window.addEventListener('online', async () => {
    console.log('[Conexão] Online!');
    AppState.isOnline = true;
    updateStatusBar();
    showToast('Conexão restaurada!', 'success');
    
    // Tenta sincronizar automaticamente
    setTimeout(() => {
      syncPendingOperations();
    }, 1000);
  });
  
  window.addEventListener('offline', () => {
    console.log('[Conexão] Offline!');
    AppState.isOnline = false;
    updateStatusBar();
    showToast('Você está offline. Alterações serão salvas localmente.', 'warning');
  });
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                      SERVICE WORKER                                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Registra o Service Worker
 */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Workers não suportados');
    return false;
  }
  
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', {
      scope: './'
    });
    
    console.log('[SW] Registrado com sucesso:', registration.scope);
    
    // Listener para atualizações
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('[SW] Nova versão encontrada');
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('Nova versão disponível! Recarregue a página.', 'warning');
        }
      });
    });
    
    // Listener para mensagens do SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data;
      
      if (data.type === 'SYNC_REQUIRED') {
        syncPendingOperations();
      }
      
      if (data.type === 'ONLINE') {
        AppState.isOnline = true;
        updateStatusBar();
      }
      
      if (data.type === 'OFFLINE') {
        AppState.isOnline = false;
        updateStatusBar();
      }
    });
    
    return true;
    
  } catch (error) {
    console.error('[SW] Erro no registro:', error);
    return false;
  }
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                      UTILITÁRIOS                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Formata valor como moeda BRL
 */
function formatMoney(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata data DD/MM/YYYY
 */
function formatDate(date) {
  if (!date) return '-';
  
  if (typeof date === 'string' && date.includes('/')) {
    return date;
  }
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Converte data para formato YYYY-MM-DD
 */
function dateToISO(dateStr) {
  if (!dateStr) return '';
  
  if (dateStr.includes('-')) return dateStr;
  
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  
  return dateStr;
}

/**
 * Normaliza texto (remove acentos, lowercase)
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Obtém classe de cor do cartão
 */
function getCardColorClass(cardName) {
  if (!cardName) return '';
  
  const name = normalizeText(cardName);
  const colors = {
    'nubank': 'nubank',
    'inter': 'inter',
    'c6': 'c6',
    'itau': 'itau',
    'bradesco': 'bradesco',
    'santander': 'santander',
    'banco do brasil': 'bb',
    'bb': 'bb',
    'caixa': 'caixa',
    'picpay': 'picpay',
    'pagbank': 'pagbank',
    'mercado pago': 'mercadopago'
  };
  
  for (const [key, value] of Object.entries(colors)) {
    if (name.includes(key)) return value;
  }
  
  return '';
}

/**
 * Máscara de moeda para input
 */
function maskMoney(event) {
  let value = event.target.value.replace(/\D/g, '');
  if (value) {
    value = (parseInt(value) / 100).toFixed(2);
    event.target.value = formatMoney(value);
  } else {
    event.target.value = '';
  }
}

/**
 * Extrai valor numérico de string formatada
 */
function parseMoney(str) {
  if (!str) return 0;
  const clean = str.replace(/[^\d,]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

/**
 * Gera ID único
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                         TOAST NOTIFICATIONS                               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Exibe uma notificação toast
 */
function showToast(message, type = 'info', duration = 3000) {
  // Remove toast existente
  const existing = document.querySelector('.toast');
  if (existing) {
    existing.remove();
  }
  
  // Cria container se não existir
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  // Cria toast
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // Remove após duração
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                         LOADER                                            ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Mostra/esconde o loader
 */
function showLoader(show, message = 'Carregando...') {
  let loader = document.getElementById('loaderOverlay');
  
  if (!loader && show) {
    loader = document.createElement('div');
    loader.id = 'loaderOverlay';
    loader.className = 'loader-overlay';
    loader.innerHTML = `
      <div class="spinner"></div>
      <div class="loader-text">${message}</div>
    `;
    document.body.appendChild(loader);
  }
  
  if (loader) {
    loader.classList.toggle('active', show);
    const text = loader.querySelector('.loader-text');
    if (text) text.textContent = message;
  }
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    CACHE DE DADOS                                         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Salva dados no cache local
 */
async function cacheData(key, data, ttl = 3600000) { // TTL padrão: 1 hora
  const cacheItem = {
    key: key,
    data: data,
    timestamp: Date.now(),
    expiry: Date.now() + ttl
  };
  
  await dbSave('cache', cacheItem);
}

/**
 * Obtém dados do cache local
 */
async function getCachedData(key) {
  try {
    const item = await dbGet('cache', key);
    
    if (!item) return null;
    
    // Verifica se expirou
    if (Date.now() > item.expiry) {
      await dbDelete('cache', key);
      return null;
    }
    
    return item.data;
  } catch (error) {
    return null;
  }
}

/**
 * Invalida cache por chave
 */
async function invalidateCache(key) {
  await dbDelete('cache', key);
}

/**
 * Limpa todo o cache
 */
async function clearAllCache() {
  await dbClear('cache');
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    INICIALIZAÇÃO                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Inicializa o aplicativo
 */
async function initApp() {
  console.log('[App] Iniciando Sistema Financeiro PWA...');
  
  try {
    // 1. Inicializa o banco de dados
    await initDB();
    console.log('[App] ✅ Banco de dados OK');
    
    // 2. Registra Service Worker
    await registerServiceWorker();
    console.log('[App] ✅ Service Worker OK');
    
    // 3. Configura listeners de conexão
    setupConnectionListeners();
    console.log('[App] ✅ Listeners de conexão OK');
    
    // 4. Atualiza contagem de pendentes
    await updatePendingCount();
    
    // 5. Atualiza barra de status
    updateStatusBar();
    
    // 6. Se está online, tenta sincronizar
    if (navigator.onLine) {
      setTimeout(() => {
        syncPendingOperations();
      }, 2000);
    }
    
    console.log('[App] ✅ Inicialização concluída!');
    return true;
    
  } catch (error) {
    console.error('[App] ❌ Erro na inicialização:', error);
    showToast('Erro ao inicializar aplicativo', 'error');
    return false;
  }
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    VERIFICAÇÃO DE CONFIGURAÇÃO                            ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Verifica se a URL da API foi configurada
 */
function checkApiConfig() {
  if (API_URL === 'COLE_AQUI_SUA_URL_DO_APPS_SCRIPT' || !API_URL) {
    console.error('⚠️ ATENÇÃO: Configure a URL da API no arquivo app.js!');
    showToast('Configure a URL da API no arquivo app.js', 'error', 10000);
    return false;
  }
  return true;
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    AUTO-INICIALIZAÇÃO                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    checkApiConfig();
    initApp();
  });
} else {
  checkApiConfig();
  initApp();
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    EXPORTA FUNÇÕES GLOBAIS                                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Disponibiliza funções globalmente para uso nas páginas
window.FinanceiroApp = {
  // Estado
  state: AppState,
  
  // API
  apiRequest,
  executeOperation,
  
  // Sync
  syncPendingOperations,
  getPendingOperations,
  
  // Banco local
  dbSave,
  dbGet,
  dbGetAll,
  dbDelete,
  dbClear,
  
  // Cache
  cacheData,
  getCachedData,
  invalidateCache,
  clearAllCache,
  
  // UI
  showToast,
  showLoader,
  updateStatusBar,
  
  // Utilitários
  formatMoney,
  formatDate,
  dateToISO,
  normalizeText,
  getCardColorClass,
  maskMoney,
  parseMoney,
  generateId
};

console.log('[App] Sistema Financeiro PWA carregado!');

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                     FINANCEIRO PWA - APP.JS                               ║
 * ║                    Versão Corrigida e Simplificada                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

(function() {
  'use strict';

  // ========================================
  // CONFIGURAÇÃO DA API
  // Cole aqui a URL do seu Apps Script
  // ========================================
  const API_URL = 'https://script.google.com/macros/s/AKfycbw4_4z9vF8gglY-2UROoYEXZUn-cbpQqhmDnBfvxuRUgDNo59dJ14Cdi6ATPcIOS2Gq/exec';
  
  // Salva no localStorage para outras páginas usarem
  if (API_URL && API_URL !== 'https://script.google.com/macros/s/AKfycbw4_4z9vF8gglY-2UROoYEXZUn-cbpQqhmDnBfvxuRUgDNo59dJ14Cdi6ATPcIOS2Gq/exec') {
    localStorage.setItem('API_URL', API_URL);
  }

  // ========================================
  // FUNÇÕES DE API
  // ========================================
  
  /**
   * Faz requisição para a API do Google Apps Script
   */
  async function apiRequest(acao, params = {}) {
    const url = localStorage.getItem('API_URL') || API_URL;
    
    if (!url || url === 'https://script.google.com/macros/s/AKfycbw4_4z9vF8gglY-2UROoYEXZUn-cbpQqhmDnBfvxuRUgDNo59dJ14Cdi6ATPcIOS2Gq/exec') {
      console.error('URL da API não configurada!');
      return { success: false, error: 'URL da API não configurada' };
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({ acao, ...params })
      });
      
      const text = await response.text();
      
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error('Resposta não é JSON:', text);
        return { success: false, error: 'Resposta inválida da API' };
      }
    } catch (error) {
      console.error('Erro na requisição:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Testa conexão com a API
   */
  async function testarConexao() {
    try {
      const result = await apiRequest('verificarConexao');
      return result.success === true;
    } catch (e) {
      return false;
    }
  }

  // ========================================
  // FUNÇÕES UTILITÁRIAS
  // ========================================
  
  /**
   * Formata valor para moeda brasileira
   */
  function formatMoney(value) {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Converte string de moeda para número
   */
  function parseMoney(str) {
    if (!str) return 0;
    const clean = str.replace(/[R$\s.]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  }

  /**
   * Máscara de input para dinheiro
   */
  function maskMoney(event) {
    let value = event.target.value.replace(/\D/g, '');
    value = (parseInt(value) / 100).toFixed(2);
    value = value.replace('.', ',');
    value = value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    event.target.value = 'R$ ' + value;
  }

  /**
   * Formata data ISO para DD/MM/YYYY
   */
  function formatDate(isoDate) {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  /**
   * Converte DD/MM/YYYY para ISO
   */
  function dateToISO(brDate) {
    if (!brDate) return '';
    if (brDate.includes('-')) return brDate;
    const parts = brDate.split('/');
    if (parts.length !== 3) return brDate;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }

  /**
   * Gera ID único
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Retorna classe CSS baseada no nome do cartão
   */
  function getCardColorClass(cardName) {
    if (!cardName) return '';
    const name = cardName.toLowerCase().trim();
    
    const colors = {
      'nubank': 'nubank',
      'inter': 'inter',
      'c6': 'c6',
      'itau': 'itau',
      'itaú': 'itau',
      'bradesco': 'bradesco',
      'santander': 'santander',
      'bb': 'bb',
      'banco do brasil': 'bb',
      'caixa': 'caixa',
      'picpay': 'picpay',
      'pagbank': 'pagbank',
      'pagseguro': 'pagbank',
      'mercado pago': 'mercadopago',
      'mercadopago': 'mercadopago'
    };
    
    for (const [key, value] of Object.entries(colors)) {
      if (name.includes(key)) return value;
    }
    return '';
  }

  // ========================================
  // TOAST / NOTIFICAÇÕES
  // ========================================
  
  function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toastContainer');
    
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ========================================
  // LOADER
  // ========================================
  
  function showLoader(show, text = 'Carregando...') {
    let loader = document.getElementById('loaderOverlay');
    
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'loaderOverlay';
      loader.className = 'loader-overlay';
      loader.innerHTML = `
        <div class="spinner"></div>
        <div class="loader-text">${text}</div>
      `;
      document.body.appendChild(loader);
    }
    
    const loaderText = loader.querySelector('.loader-text');
    if (loaderText) loaderText.textContent = text;
    
    loader.classList.toggle('active', show);
  }

  // ========================================
  // STATUS ONLINE/OFFLINE
  // ========================================
  
  function updateOnlineStatus() {
    const statusBar = document.getElementById('statusBar');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const statusIndicator = document.getElementById('statusIndicator');
    
    const isOnline = navigator.onLine;
    
    if (statusBar) {
      statusBar.className = `status-bar ${isOnline ? 'online' : 'offline'}`;
    }
    
    if (statusIcon) {
      statusIcon.textContent = isOnline ? '🟢' : '🔴';
    }
    
    if (statusText) {
      statusText.textContent = isOnline ? 'Online' : 'Offline';
    }
    
    if (statusIndicator) {
      statusIndicator.classList.toggle('offline', !isOnline);
    }
  }

  // ========================================
  // CACHE LOCAL (IndexedDB simplificado via localStorage)
  // ========================================
  
  const CACHE_PREFIX = 'fin_cache_';
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
  
  function cacheData(key, data, duration = CACHE_DURATION) {
    try {
      const item = {
        data: data,
        timestamp: Date.now(),
        expiry: Date.now() + duration
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
      return true;
    } catch (e) {
      console.error('Erro ao salvar cache:', e);
      return false;
    }
  }
  
  function getCachedData(key) {
    try {
      const item = localStorage.getItem(CACHE_PREFIX + key);
      if (!item) return null;
      
      const parsed = JSON.parse(item);
      
      if (Date.now() > parsed.expiry) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      
      return parsed.data;
    } catch (e) {
      return null;
    }
  }
  
  function clearCache(key) {
    if (key) {
      localStorage.removeItem(CACHE_PREFIX + key);
    } else {
      // Limpa todo o cache
      const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
      keys.forEach(k => localStorage.removeItem(k));
    }
  }

  // ========================================
  // REGISTRO SERVICE WORKER
  // ========================================
  
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.log('Service Worker registrado:', reg.scope);
        })
        .catch(err => {
          console.error('Erro ao registrar SW:', err);
        });
    }
  }

  // ========================================
  // INICIALIZAÇÃO
  // ========================================
  
  function init() {
    // Registra Service Worker
    registerServiceWorker();
    
    // Configura listeners de online/offline
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Atualiza status inicial
    updateOnlineStatus();
    
    console.log('FinanceiroApp inicializado');
  }

  // ========================================
  // EXPORTA PARA GLOBAL
  // ========================================
  
  window.FinanceiroApp = {
    // API
    apiRequest,
    testarConexao,
    API_URL: () => localStorage.getItem('API_URL') || API_URL,
    
    // Utilitários
    formatMoney,
    parseMoney,
    maskMoney,
    formatDate,
    dateToISO,
    generateId,
    getCardColorClass,
    
    // UI
    showToast,
    showLoader,
    updateOnlineStatus,
    
    // Cache
    cacheData,
    getCachedData,
    clearCache,
    
    // Init
    init
  };

  // Inicializa quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

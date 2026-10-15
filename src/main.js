import './style.css';
import { store } from './state.js';
import { p2p } from './p2p.js';
import { firebaseManager } from './firebase.js';
import { RegisterComponent } from './components/register.js';
import { KitchenComponent } from './components/kitchen.js';
import { AnalyticsComponent } from './components/analytics.js';
import { MenuManagerComponent } from './components/menuManager.js';
import { SettingsComponent } from './components/settings.js';

class App {
  constructor() {
    this.currentTab = 'register';
    this.init();
  }

  init() {
    this.setupHeader();
    this.setupComponents();
    this.setupNavigation();
    this.initFirebase();
    this.initP2P();
    this.setupKeyboardShortcuts();
  }

  setupHeader() {
    const storeTitleEl = document.getElementById('headerStoreTitle');
    const terminalNameEl = document.getElementById('headerTerminalBadge');
    const syncDot = document.getElementById('headerSyncDot');
    const syncText = document.getElementById('headerSyncText');

    const updateHeaderInfo = () => {
      const state = store.get();
      if (storeTitleEl) storeTitleEl.textContent = state.storeName;
      if (terminalNameEl) terminalNameEl.textContent = state.terminalName;
    };

    updateHeaderInfo();
    store.subscribe('settings:updated', updateHeaderInfo);

    const updateSyncIndicator = () => {
      if (!syncDot || !syncText) return;

      if (firebaseManager.status === 'connected') {
        syncDot.className = 'status-dot connected';
        syncText.textContent = '🔥 Firebase同期中';
      } else if (firebaseManager.status === 'connecting') {
        syncDot.className = 'status-dot connecting';
        syncText.textContent = 'Firebase接続中...';
      } else if (p2p.status === 'connected') {
        syncDot.className = 'status-dot connected';
        syncText.textContent = p2p.getPeerCount() > 0 ? `P2P同期 (${p2p.getPeerCount()}台)` : 'P2P待機中';
      } else {
        syncDot.className = 'status-dot';
        syncText.textContent = 'スタンドアロン';
      }
    };

    firebaseManager.onStatusChange(updateSyncIndicator);
    p2p.onStatusChange(updateSyncIndicator);
  }

  initFirebase() {
    firebaseManager.init();
  }

  setupComponents() {
    new RegisterComponent(document.getElementById('viewRegister'));
    new KitchenComponent(document.getElementById('viewKitchen'));
    new AnalyticsComponent(document.getElementById('viewAnalytics'));
    new MenuManagerComponent(document.getElementById('viewMenu'));
    new SettingsComponent(document.getElementById('viewSettings'));
  }

  setupNavigation() {
    const tabButtons = document.querySelectorAll('.nav-tab-btn');
    const views = document.querySelectorAll('.view-section');

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // URLハッシュまたはパラメータによるタブ指定
    const hash = window.location.hash.replace('#', '');
    if (['register', 'kitchen', 'analytics', 'menu', 'settings'].includes(hash)) {
      this.switchTab(hash);
    }
  }

  switchTab(tab) {
    this.currentTab = tab;

    // タブボタンのアクティブ切り替え
    document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // ビュー表示切り替え
    document.querySelectorAll('.view-section').forEach((view) => {
      view.classList.toggle('active', view.id === `view${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    });

    window.location.hash = tab;
  }

  initP2P() {
    p2p.setupBroadcastChannel();
    p2p.init();
  }

  setupKeyboardShortcuts() {
    // F1〜F5キーでタブ切り替え
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        this.switchTab('register');
      } else if (e.key === 'F2') {
        e.preventDefault();
        this.switchTab('kitchen');
      } else if (e.key === 'F3') {
        e.preventDefault();
        this.switchTab('analytics');
      } else if (e.key === 'F4') {
        e.preventDefault();
        this.switchTab('menu');
      } else if (e.key === 'F5' && e.ctrlKey) {
        // 通常のリロード許可
      } else if (e.key === 'F5') {
        e.preventDefault();
        this.switchTab('settings');
      }
    });
  }
}

// アプリケーション初期化
window.addEventListener('DOMContentLoaded', () => {
  new App();
});

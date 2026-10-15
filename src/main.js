import './style.css';
import { store } from './state.js';
import { firebaseManager } from './firebase.js';
import { RegisterComponent } from './components/register.js';
import { KitchenComponent } from './components/kitchen.js';
import { CallDisplayComponent } from './components/callDisplay.js';
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
        syncText.textContent = '🔥 リアルタイム同期中';
      } else if (firebaseManager.status === 'connecting') {
        syncDot.className = 'status-dot connecting';
        syncText.textContent = '同期接続中...';
      } else if (firebaseManager.status === 'error') {
        syncDot.className = 'status-dot';
        syncText.textContent = '接続エラー';
      } else {
        syncDot.className = 'status-dot';
        syncText.textContent = '接続中...';
      }
    };

    firebaseManager.onStatusChange(updateSyncIndicator);
  }

  initFirebase() {
    firebaseManager.init();
  }

  setupComponents() {
    new RegisterComponent(document.getElementById('viewRegister'));
    new KitchenComponent(document.getElementById('viewKitchen'));
    new CallDisplayComponent(document.getElementById('viewCall'));
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
        if (tab) this.switchTab(tab);
      });
    });

    // URLハッシュまたはパラメータによるタブ指定
    const hash = window.location.hash.replace('#', '');
    if (['register', 'kitchen', 'call', 'analytics', 'menu', 'settings'].includes(hash)) {
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

  setupKeyboardShortcuts() {
    // F1〜F6キーでタブ切り替え
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        this.switchTab('register');
      } else if (e.key === 'F2') {
        e.preventDefault();
        this.switchTab('kitchen');
      } else if (e.key === 'F3') {
        e.preventDefault();
        this.switchTab('call');
      } else if (e.key === 'F4') {
        e.preventDefault();
        this.switchTab('analytics');
      } else if (e.key === 'F5' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.switchTab('menu');
      } else if (e.key === 'F6') {
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

import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getDatabase, ref, set, update, onValue, onChildAdded, onChildChanged, off } from 'firebase/database';
import { store } from './state.js';
import { playDingDong, playPop } from './sound.js';

const FIREBASE_CONFIG_STORAGE_KEY = 'bunkasai_pos_firebase_config_v1';

// あらかじめ設定しておくFirebase設定（ここに書き込んでおけば画面での入力不要で全自動接続）
export const BUILTIN_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCNGOb_IPQZX_endgeKmJdfRAVdImOVTac",
  authDomain: "schoolfestival-4128d.firebaseapp.com",
  databaseURL: "https://schoolfestival-4128d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "schoolfestival-4128d",
  storageBucket: "schoolfestival-4128d.firebasestorage.app",
  messagingSenderId: "1050384111321",
  appId: "1:1050384111321:web:aeb5ff683b4878535dd0c8",
  measurementId: "G-Y4B4QKBCR2"
};

class FirebaseManager {
  constructor() {
    this.app = null;
    this.db = null;
    this.statusListeners = new Set();
    this.status = 'unconfigured';
    this.initialized = false;
    this.listeners = [];
    this.isLocalUpdate = false;
  }

  // 設定の取得（localStorage優先、無ければ環境変数、無ければ組み込み初期設定）
  getConfig() {
    try {
      const saved = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to parse saved firebase config', e);
    }

    // 環境変数からのフォールバック
    const envConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || BUILTIN_FIREBASE_CONFIG.apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || BUILTIN_FIREBASE_CONFIG.authDomain,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || BUILTIN_FIREBASE_CONFIG.databaseURL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || BUILTIN_FIREBASE_CONFIG.projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || BUILTIN_FIREBASE_CONFIG.storageBucket,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || BUILTIN_FIREBASE_CONFIG.messagingSenderId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || BUILTIN_FIREBASE_CONFIG.appId
    };

    if (envConfig.apiKey || envConfig.databaseURL) {
      return envConfig;
    }

    return null;
  }

  saveConfig(config) {
    if (!config) {
      localStorage.removeItem(FIREBASE_CONFIG_STORAGE_KEY);
      this.disconnect();
      this.updateStatus('unconfigured');
      return;
    }
    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
    this.init(config);
  }

  async init(customConfig = null) {
    const config = customConfig || this.getConfig();

    if (!config || (!config.databaseURL && !config.projectId)) {
      this.updateStatus('unconfigured');
      return false;
    }

    // 既存アプリがあればクリーンアップ
    this.disconnect();

    this.updateStatus('connecting');

    try {
      // databaseURL が未指定で projectId がある場合の補完
      if (!config.databaseURL && config.projectId) {
        config.databaseURL = `https://${config.projectId}-default-rtdb.firebaseio.com`;
      }

      this.app = initializeApp(config, 'bunkasai-pos-' + Date.now());
      this.db = getDatabase(this.app);

      // 接続ステータス監視
      const connectedRef = ref(this.db, '.info/connected');
      onValue(connectedRef, (snap) => {
        const isConnected = snap.val() === true;
        this.updateStatus(isConnected ? 'connected' : 'disconnected');
      });

      // リアルタイムリスナーのセットアップ
      this.setupDatabaseListeners();

      this.initialized = true;
      return true;
    } catch (err) {
      console.error('[Firebase] 初期化エラー:', err);
      this.updateStatus('error', err.message);
      return false;
    }
  }

  disconnect() {
    this.listeners.forEach(({ refObj, callback }) => {
      off(refObj, 'value', callback);
    });
    this.listeners = [];

    if (this.app) {
      try {
        deleteApp(this.app);
      } catch (e) {}
      this.app = null;
      this.db = null;
    }
    this.initialized = false;
  }

  updateStatus(status, errorMsg = '') {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status, errorMsg));
  }

  onStatusChange(cb) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  isReady() {
    return this.initialized && this.db !== null && this.status === 'connected';
  }

  // Realtime Database リスナー
  setupDatabaseListeners() {
    if (!this.db) return;

    const roomId = store.get().roomId || '1-16-pos';
    const basePath = `rooms/${roomId}`;

    // 1. 注文リストの監視
    const ordersRef = ref(this.db, `${basePath}/orders`);
    onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const remoteOrders = Object.values(data);
      let newOrderDetected = false;

      // 降順ソート
      remoteOrders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      remoteOrders.forEach((remoteOrder) => {
        const existing = store.get().orders.find((o) => o.id === remoteOrder.id);
        if (!existing) {
          store.mergeRemoteOrder(remoteOrder);
          newOrderDetected = true;
        } else if (existing.status !== remoteOrder.status) {
          store.mergeRemoteOrderStatus(remoteOrder.id, remoteOrder.status);
        }
      });

      if (newOrderDetected) {
        playDingDong();
      }
    });

    // 2. 在庫・商品同期の監視
    const productsRef = ref(this.db, `${basePath}/products`);
    onValue(productsRef, (snapshot) => {
      const productsData = snapshot.val();
      if (productsData && Array.isArray(productsData)) {
        store.setProducts(productsData);
      }
    });
  }

  // 注文をFirebaseに送信
  async pushOrder(order) {
    if (!this.db) return false;

    const roomId = store.get().roomId || '1-16-pos';
    const orderRef = ref(this.db, `rooms/${roomId}/orders/${order.id}`);

    try {
      await set(orderRef, order);
      console.log('[Firebase] 注文をRealtime Databaseに保存完了:', order.orderNumber);

      // 在庫の最新状態もFirebaseに同期
      await this.syncProducts(store.get().products);
      return true;
    } catch (err) {
      console.error('[Firebase] 注文送信失敗:', err);
      return false;
    }
  }

  // 厨房ステータス更新をFirebaseに反映
  async updateOrderStatus(orderId, status) {
    if (!this.db) return false;

    const roomId = store.get().roomId || '1-16-pos';
    const statusRef = ref(this.db, `rooms/${roomId}/orders/${orderId}`);

    try {
      const updateData = { status };
      if (status === 'ready') {
        updateData.readyAt = new Date().toISOString();
      } else if (status === 'delivered') {
        updateData.deliveredAt = new Date().toISOString();
      }
      await update(statusRef, updateData);
      return true;
    } catch (err) {
      console.error('[Firebase] ステータス更新失敗:', err);
      return false;
    }
  }

  // 商品・在庫マスターをFirebaseに一括保存
  async syncProducts(products) {
    if (!this.db) return false;

    const roomId = store.get().roomId || '1-16-pos';
    const productsRef = ref(this.db, `rooms/${roomId}/products`);

    try {
      await set(productsRef, products);
      return true;
    } catch (err) {
      console.warn('[Firebase] 在庫同期失敗:', err);
      return false;
    }
  }

  // 注文データの全削除（リセット時）
  async clearRoomOrders() {
    if (!this.db) return false;
    const roomId = store.get().roomId || '1-16-pos';
    const ordersRef = ref(this.db, `rooms/${roomId}/orders`);
    try {
      await set(ordersRef, null);
      return true;
    } catch (err) {
      console.error('[Firebase] 注文リセット失敗:', err);
      return false;
    }
  }

  // テスト接続
  async testConnection(config) {
    try {
      const tempApp = initializeApp(config, 'test-app-' + Date.now());
      const tempDb = getDatabase(tempApp);
      const testRef = ref(tempDb, `_test_connection/${Date.now()}`);
      await set(testRef, {
        status: 'ok',
        time: new Date().toISOString()
      });
      // 削除
      await set(testRef, null);
      deleteApp(tempApp);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

export const firebaseManager = new FirebaseManager();

import { defaultCategories, defaultProducts } from './data/defaultMenu.js';
import { setSoundEnabled as setAudioSoundEnabled } from './sound.js';

const STORAGE_KEY = 'bunkasai_pos_state_v1';

// 初期状態
const initialTerminalId = 'レジ-' + Math.floor(100 + Math.random() * 900);

const defaultState = {
  storeName: '1-16 カフェ',
  terminalName: initialTerminalId,
  roomId: '1-16-pos',
  categories: defaultCategories,
  products: defaultProducts,
  cart: [],
  orders: [],
  orderSeq: 1,
  gasUrl: '',
  gasQueue: [],
  soundEnabled: true,
  autoPrintReceipt: false
};

class StateStore {
  constructor() {
    this.listeners = new Map();
    this.state = this.loadState();
    setAudioSoundEnabled(this.state.soundEnabled);
  }

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultState,
          ...parsed,
          cart: [] // カートは起動時リセット
        };
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage', e);
    }
    return { ...defaultState };
  }

  saveState() {
    try {
      const toSave = {
        storeName: this.state.storeName,
        terminalName: this.state.terminalName,
        roomId: this.state.roomId,
        categories: this.state.categories,
        products: this.state.products,
        orders: this.state.orders,
        orderSeq: this.state.orderSeq,
        gasUrl: this.state.gasUrl,
        gasQueue: this.state.gasQueue,
        soundEnabled: this.state.soundEnabled,
        autoPrintReceipt: this.state.autoPrintReceipt
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('Failed to save state to localStorage', e);
    }
  }

  get() {
    return this.state;
  }

  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => cb(data, this.state));
    }
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach((cb) => cb({ event, data }, this.state));
    }
  }

  // --- カート操作 ---
  addToCart(productId) {
    const product = this.state.products.find((p) => p.id === productId);
    if (!product) return;

    // 在庫チェック
    const existing = this.state.cart.find((item) => item.id === productId);
    const currentQty = existing ? existing.quantity : 0;
    if (product.stock !== null && product.stock !== undefined && product.stock <= currentQty) {
      alert(`「${product.name}」は在庫上限（残り${product.stock}個）に達しています`);
      return;
    }

    if (existing) {
      existing.quantity += 1;
    } else {
      this.state.cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        emoji: product.emoji || '🍽️',
        quantity: 1
      });
    }
    this.emit('cart:updated', this.state.cart);
  }

  updateCartQuantity(productId, delta) {
    const itemIndex = this.state.cart.findIndex((item) => item.id === productId);
    if (itemIndex === -1) return;

    const item = this.state.cart[itemIndex];
    const product = this.state.products.find((p) => p.id === productId);

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      this.state.cart.splice(itemIndex, 1);
    } else {
      if (product && product.stock !== null && product.stock !== undefined && newQty > product.stock) {
        alert(`在庫数（残り${product.stock}個）を超えています`);
        return;
      }
      item.quantity = newQty;
    }
    this.emit('cart:updated', this.state.cart);
  }

  removeFromCart(productId) {
    this.state.cart = this.state.cart.filter((item) => item.id !== productId);
    this.emit('cart:updated', this.state.cart);
  }

  clearCart() {
    this.state.cart = [];
    this.emit('cart:updated', this.state.cart);
  }

  getCartTotal() {
    return this.state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  // --- 会計完了 ---
  checkout(paymentInfo) {
    const total = this.getCartTotal();
    if (this.state.cart.length === 0 || total === 0) return null;

    const orderNumber = String(this.state.orderSeq).padStart(3, '0');
    const orderId = 'ord_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    const newOrder = {
      id: orderId,
      orderNumber: `#${orderNumber}`,
      items: JSON.parse(JSON.stringify(this.state.cart)),
      total: total,
      received: paymentInfo.received,
      change: paymentInfo.change,
      paymentMethod: paymentInfo.method || 'cash',
      status: 'cooking', // 'cooking' -> 'ready' -> 'delivered'
      timestamp: new Date().toISOString(),
      terminal: this.state.terminalName
    };

    // 在庫を減算
    this.state.cart.forEach((cartItem) => {
      const prod = this.state.products.find((p) => p.id === cartItem.id);
      if (prod && typeof prod.stock === 'number') {
        prod.stock = Math.max(0, prod.stock - cartItem.quantity);
      }
    });

    // 履歴に追加
    this.state.orders.unshift(newOrder);
    this.state.orderSeq += 1;
    this.state.cart = [];

    this.saveState();
    this.emit('order:created', newOrder);
    this.emit('stock:updated', this.state.products);
    this.emit('cart:updated', this.state.cart);

    return newOrder;
  }

  // 注文ステータス更新（厨房・受渡画面用）
  updateOrderStatus(orderId, nextStatus) {
    const order = this.state.orders.find((o) => o.id === orderId);
    if (!order) return;
    order.status = nextStatus;
    if (nextStatus === 'ready') {
      order.readyAt = new Date().toISOString();
    } else if (nextStatus === 'delivered') {
      order.deliveredAt = new Date().toISOString();
    }
    this.saveState();
    this.emit('order:status_changed', order);
  }

  // 外部（Peer同期等）から受信した新規注文を統合
  mergeRemoteOrder(remoteOrder) {
    const exists = this.state.orders.some((o) => o.id === remoteOrder.id);
    if (!exists) {
      this.state.orders.unshift(remoteOrder);
      // 在庫を同期
      if (remoteOrder.items) {
        remoteOrder.items.forEach((item) => {
          const prod = this.state.products.find((p) => p.id === item.id);
          if (prod && typeof prod.stock === 'number') {
            prod.stock = Math.max(0, prod.stock - item.quantity);
          }
        });
      }
      this.saveState();
      this.emit('order:remote_received', remoteOrder);
      this.emit('stock:updated', this.state.products);
    }
  }

  mergeRemoteOrderStatus(orderId, status) {
    const order = this.state.orders.find((o) => o.id === orderId);
    if (order && order.status !== status) {
      order.status = status;
      this.saveState();
      this.emit('order:status_changed', order);
    }
  }

  // --- 商品管理 ---
  updateProduct(updatedProduct) {
    const idx = this.state.products.findIndex((p) => p.id === updatedProduct.id);
    if (idx !== -1) {
      this.state.products[idx] = { ...this.state.products[idx], ...updatedProduct };
    } else {
      this.state.products.push(updatedProduct);
    }
    this.saveState();
    this.emit('products:updated', this.state.products);
  }

  deleteProduct(productId) {
    this.state.products = this.state.products.filter((p) => p.id !== productId);
    this.saveState();
    this.emit('products:updated', this.state.products);
  }

  setProducts(newProducts) {
    this.state.products = newProducts;
    this.saveState();
    this.emit('products:updated', this.state.products);
  }

  updateStock(productId, newStock) {
    const prod = this.state.products.find((p) => p.id === productId);
    if (prod) {
      prod.stock = Math.max(0, parseInt(newStock, 10) || 0);
      this.saveState();
      this.emit('stock:updated', this.state.products);
    }
  }

  // --- カテゴリー管理 ---
  addCategory(category) {
    const exists = this.state.categories.some((c) => c.id === category.id);
    if (!exists) {
      this.state.categories.push(category);
      this.saveState();
      this.emit('categories:updated', this.state.categories);
    }
  }

  updateCategory(updatedCategory) {
    const idx = this.state.categories.findIndex((c) => c.id === updatedCategory.id);
    if (idx !== -1) {
      this.state.categories[idx] = { ...this.state.categories[idx], ...updatedCategory };
      this.saveState();
      this.emit('categories:updated', this.state.categories);
    }
  }

  deleteCategory(categoryId) {
    if (categoryId === 'all') return; // 「すべて」は削除不可
    this.state.categories = this.state.categories.filter((c) => c.id !== categoryId);
    this.saveState();
    this.emit('categories:updated', this.state.categories);
  }

  setCategories(newCategories) {
    this.state.categories = newCategories;
    this.saveState();
    this.emit('categories:updated', this.state.categories);
  }

  // --- 設定更新 ---
  updateSettings(newSettings) {
    this.state = {
      ...this.state,
      ...newSettings
    };
    if (typeof newSettings.soundEnabled === 'boolean') {
      setAudioSoundEnabled(newSettings.soundEnabled);
    }
    this.saveState();
    this.emit('settings:updated', this.state);
  }

  // 全注文履歴のリセット
  resetSalesData() {
    this.state.orders = [];
    this.state.orderSeq = 1;
    this.state.gasQueue = [];
    this.saveState();
    this.emit('sales:reset');
  }

  // 全データを初期化
  resetAllData() {
    this.state = {
      ...defaultState,
      products: JSON.parse(JSON.stringify(defaultProducts)),
      categories: JSON.parse(JSON.stringify(defaultCategories))
    };
    this.saveState();
    this.emit('all:reset');
  }
}

export const store = new StateStore();

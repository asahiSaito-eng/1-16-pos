import { store } from '../state.js';
import { playPop } from '../sound.js';
import { firebaseManager } from '../firebase.js';

export class KitchenComponent {
  constructor(container) {
    this.container = container;
    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();

    // 注文イベントの監視
    store.subscribe('order:created', () => this.updateOrdersView());
    store.subscribe('order:remote_received', () => this.updateOrdersView());
    store.subscribe('order:status_changed', () => this.updateOrdersView());
    store.subscribe('sales:reset', () => this.updateOrdersView());
  }

  render() {
    this.container.innerHTML = `
      <div class="kitchen-view-container">
        <!-- ツールバー -->
        <div class="kitchen-toolbar">
          <div class="kitchen-stats-pills">
            <div class="k-stat-pill cooking">
              <span>🍳 調理待ち:</span>
              <strong id="kStatCookingCount">0件</strong>
            </div>
            <div class="k-stat-pill ready">
              <span>🔔 呼出・お渡し中:</span>
              <strong id="kStatReadyCount">0件</strong>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">※番号の若い順（昇順）に上から表示されます</span>
            <button class="btn-primary" id="btnGoToCallDisplay" style="background: linear-gradient(135deg, #0ea5e9, #0284c7);">
              <span>📢 呼出モニター画面へ (F3)</span>
            </button>
          </div>
        </div>

        <!-- カンバンボード -->
        <div class="kitchen-columns-grid">
          <!-- 調理中列 -->
          <div class="kitchen-col">
            <div class="col-header cooking">
              <h3 class="col-title">
                <span>🍳</span>
                <span>調理中 / 準備中（番号順）</span>
              </h3>
              <span id="colCookingBadge" style="font-weight: 800; font-size: 0.9rem;">0件</span>
            </div>
            <div class="orders-flow-container" id="cookingOrdersList"></div>
          </div>

          <!-- お渡し可能（呼出中）列 -->
          <div class="kitchen-col">
            <div class="col-header ready">
              <h3 class="col-title">
                <span>🔔</span>
                <span>お渡し可能（呼出中・番号順）</span>
              </h3>
              <span id="colReadyBadge" style="font-weight: 800; font-size: 0.9rem;">0件</span>
            </div>
            <div class="orders-flow-container" id="readyOrdersList"></div>
          </div>
        </div>
      </div>
    `;

    this.updateOrdersView();
  }

  updateOrdersView() {
    const orders = store.get().orders || [];
    let cookingOrders = orders.filter((o) => o.status === 'cooking');
    let readyOrders = orders.filter((o) => o.status === 'ready');

    // 注文番号を数値としてパース（例: '#003' -> 3, 'A-012' -> 12）
    const parseOrderNum = (order) => {
      if (!order || !order.orderNumber) return 0;
      const num = parseInt(String(order.orderNumber).replace(/[^0-9]/g, ''), 10);
      return isNaN(num) ? 0 : num;
    };

    // ★重要: 番号が若い順（昇順: #001 -> #002 -> #003）にソートして一番上に表示
    cookingOrders.sort((a, b) => {
      const numA = parseOrderNum(a);
      const numB = parseOrderNum(b);
      if (numA !== numB) return numA - numB;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    readyOrders.sort((a, b) => {
      const numA = parseOrderNum(a);
      const numB = parseOrderNum(b);
      if (numA !== numB) return numA - numB;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    // 件数更新
    this.container.querySelector('#kStatCookingCount').textContent = `${cookingOrders.length}件`;
    this.container.querySelector('#kStatReadyCount').textContent = `${readyOrders.length}件`;
    this.container.querySelector('#colCookingBadge').textContent = `${cookingOrders.length}件`;
    this.container.querySelector('#colReadyBadge').textContent = `${readyOrders.length}件`;

    const cookingList = this.container.querySelector('#cookingOrdersList');
    const readyList = this.container.querySelector('#readyOrdersList');

    // 調理中リスト描画
    if (cookingOrders.length === 0) {
      cookingList.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); margin: auto; padding: 2rem;">
          <span style="font-size: 2rem;">✨</span>
          <p>調理待ちの注文はありません</p>
        </div>
      `;
    } else {
      cookingList.innerHTML = cookingOrders.map((o) => this.renderOrderCard(o, 'cooking')).join('');
    }

    // お渡し可能リスト描画
    if (readyOrders.length === 0) {
      readyList.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); margin: auto; padding: 2rem;">
          <span style="font-size: 2rem;">☕</span>
          <p>お渡し待ちの注文はありません</p>
        </div>
      `;
    } else {
      readyList.innerHTML = readyOrders.map((o) => this.renderOrderCard(o, 'ready')).join('');
    }

    // アクションボタンのイベントリスナー設定
    this.container.querySelectorAll('.btn-to-ready').forEach((btn) => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        playPop();
        store.updateOrderStatus(orderId, 'ready');
        firebaseManager.updateOrderStatus(orderId, 'ready');
      });
    });

    this.container.querySelectorAll('.btn-to-delivered').forEach((btn) => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        playPop();
        store.updateOrderStatus(orderId, 'delivered');
        firebaseManager.updateOrderStatus(orderId, 'delivered');
      });
    });
  }

  renderOrderCard(order, type) {
    const timeStr = new Date(order.timestamp).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const isCooking = type === 'cooking';

    return `
      <div class="kitchen-order-card ${isCooking ? 'cooking-card' : 'ready-card'}" data-id="${order.id}">
        <div class="k-card-header">
          <span class="k-order-num">${order.orderNumber}</span>
          <span class="k-order-time">${timeStr} (${order.terminal || 'レジ'})</span>
        </div>

        <div class="k-card-items-list">
          ${order.items.map((it) => `
            <div class="k-card-item-row">
              <span>${it.emoji} ${it.name}</span>
              <span class="k-card-item-qty">×${it.quantity}</span>
            </div>
          `).join('')}
        </div>

        ${isCooking ? `
          <button class="btn-kitchen-action btn-to-ready" data-id="${order.id}">
            <span>🔔 調理完了・呼出する</span>
          </button>
        ` : `
          <button class="btn-kitchen-action btn-to-delivered" data-id="${order.id}">
            <span>✅ お渡し完了</span>
          </button>
        `}
      </div>
    `;
  }

  setupEventListeners() {
    this.container.querySelector('#btnGoToCallDisplay')?.addEventListener('click', () => {
      document.getElementById('tabCall')?.click();
    });
  }
}

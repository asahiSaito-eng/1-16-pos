import { store } from '../state.js';
import { playPop } from '../sound.js';
import { firebaseManager } from '../firebase.js';
import { p2p } from '../p2p.js';

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
              <span>🍳 調理中:</span>
              <strong id="kStatCookingCount">0件</strong>
            </div>
            <div class="k-stat-pill ready">
              <span>🔔 お渡し可能:</span>
              <strong id="kStatReadyCount">0件</strong>
            </div>
          </div>
          <div>
            <button class="btn-primary" id="btnOpenCallDisplay">
              <span>📢 お客様用 呼出画面</span>
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
                <span>調理中 / 準備中</span>
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
                <span>お渡し可能（呼出中）</span>
              </h3>
              <span id="colReadyBadge" style="font-weight: 800; font-size: 0.9rem;">0件</span>
            </div>
            <div class="orders-flow-container" id="readyOrdersList"></div>
          </div>
        </div>
      </div>

      <!-- お客様用呼出特大ディスプレイモーダル -->
      <div class="modal-overlay" id="callDisplayModal">
        <div class="call-display-modal">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 1rem;">
            <h2 style="font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem;">
              <span>📢</span>
              <span>出来上がり呼出状況</span>
            </h2>
            <button class="modal-close-btn" style="color: white;" id="btnCloseCallDisplay">&times;</button>
          </div>

          <div class="call-display-grid">
            <!-- 呼出中（お渡し可能） -->
            <div class="call-block" style="border: 2px solid #10b981;">
              <h3 class="call-block-title" style="color: #34d399;">🔔 お受け取りいただけます</h3>
              <div class="call-number-tags" id="callReadyNumbersContainer"></div>
            </div>

            <!-- 調理中 -->
            <div class="call-block">
              <h3 class="call-block-title" style="color: #94a3b8;">🍳 ただいま準備中</h3>
              <div class="call-number-tags" id="callCookingNumbersContainer"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.updateOrdersView();
  }

  updateOrdersView() {
    const orders = store.get().orders || [];
    const cookingOrders = orders.filter((o) => o.status === 'cooking');
    const readyOrders = orders.filter((o) => o.status === 'ready');

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
        p2p.broadcastStatus(orderId, 'ready');
      });
    });

    this.container.querySelectorAll('.btn-to-delivered').forEach((btn) => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        playPop();
        store.updateOrderStatus(orderId, 'delivered');
        firebaseManager.updateOrderStatus(orderId, 'delivered');
        p2p.broadcastStatus(orderId, 'delivered');
      });
    });

    // 呼出モニターの数字更新
    this.updateCallDisplayNumbers(cookingOrders, readyOrders);
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

  updateCallDisplayNumbers(cookingOrders, readyOrders) {
    const readyContainer = this.container.querySelector('#callReadyNumbersContainer');
    const cookingContainer = this.container.querySelector('#callCookingNumbersContainer');

    if (readyContainer) {
      if (readyOrders.length === 0) {
        readyContainer.innerHTML = '<span style="color: #64748b; font-size: 1.1rem;">お呼び出し中の番号はありません</span>';
      } else {
        readyContainer.innerHTML = readyOrders.map((o) => `
          <span class="call-tag ready-tag">${o.orderNumber}</span>
        `).join('');
      }
    }

    if (cookingContainer) {
      if (cookingOrders.length === 0) {
        cookingContainer.innerHTML = '<span style="color: #64748b; font-size: 1.1rem;">準備中の注文はありません</span>';
      } else {
        cookingContainer.innerHTML = cookingOrders.map((o) => `
          <span class="call-tag cooking-tag">${o.orderNumber}</span>
        `).join('');
      }
    }
  }

  setupEventListeners() {
    const callModal = this.container.querySelector('#callDisplayModal');
    this.container.querySelector('#btnOpenCallDisplay')?.addEventListener('click', () => {
      callModal.classList.add('active');
    });
    this.container.querySelector('#btnCloseCallDisplay')?.addEventListener('click', () => {
      callModal.classList.remove('active');
    });
  }
}

import { store } from '../state.js';
import { playPop, playDingDong } from '../sound.js';
import { firebaseManager } from '../firebase.js';

export class DeliveryComponent {
  constructor(container) {
    this.container = container;
    this.previousReadyIds = new Set();
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
      <div class="delivery-view-container single-stage-container">
        <!-- ツールバー -->
        <div class="kitchen-toolbar">
          <div class="kitchen-stats-pills">
            <div class="k-stat-pill ready" style="background: #ecfdf5; border-color: #10b981; color: #047857;">
              <span>🔔 お渡し待ち:</span>
              <strong id="dStatReadyCount">0件</strong>
            </div>
            <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: 700; margin-left: 0.5rem;">
              ※番号の若い順（#001〜）に一番上から並びます
            </span>
          </div>
          <div style="display: flex; gap: 0.75rem; align-items: center;">
            <button class="btn-primary" id="btnGoToCookingTab" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
              <span>🍳 調理中画面へ (F2) ➔</span>
            </button>
          </div>
        </div>

        <!-- お渡し待ちカード一覧 -->
        <div class="single-stage-board">
          <div class="single-stage-header delivery-header">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-size: 1.5rem;">🔔</span>
              <h3 style="margin: 0; font-size: 1.25rem; font-weight: 800; color: #047857;">
                出来上がり・お渡し可能オーダー（お客様呼出・受渡口）
              </h3>
            </div>
            <span id="colReadyBadge" class="badge-count-pill ready-pill">0件</span>
          </div>
          <div class="orders-cards-grid" id="readyOrdersList"></div>
        </div>
      </div>
    `;

    this.updateOrdersView();
  }

  updateOrdersView() {
    const orders = store.get().orders || [];
    let readyOrders = orders.filter((o) => o.status === 'ready');

    // 注文番号を数値としてパース（例: '#003' -> 3, 'A-012' -> 12）
    const parseOrderNum = (order) => {
      if (!order || !order.orderNumber) return 0;
      const num = parseInt(String(order.orderNumber).replace(/[^0-9]/g, ''), 10);
      return isNaN(num) ? 0 : num;
    };

    // ★重要: 番号が若い順（昇順: #001 -> #002 -> #003）にソートして一番上に表示
    readyOrders.sort((a, b) => {
      const numA = parseOrderNum(a);
      const numB = parseOrderNum(b);
      if (numA !== numB) return numA - numB;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    // 新たに調理完了してお渡し待ちに入った注文があればチャイム音
    const currentReadyIds = new Set(readyOrders.map((o) => o.id));
    let hasNewReady = false;
    currentReadyIds.forEach((id) => {
      if (!this.previousReadyIds.has(id)) {
        hasNewReady = true;
      }
    });
    if (hasNewReady && this.previousReadyIds.size > 0) {
      playDingDong();
    }
    this.previousReadyIds = currentReadyIds;

    // 件数更新
    const countText = `${readyOrders.length}件`;
    const countEl = this.container.querySelector('#dStatReadyCount');
    const badgeEl = this.container.querySelector('#colReadyBadge');
    if (countEl) countEl.textContent = countText;
    if (badgeEl) badgeEl.textContent = countText;

    const readyList = this.container.querySelector('#readyOrdersList');
    if (!readyList) return;

    // お渡し可能リスト描画
    if (readyOrders.length === 0) {
      readyList.innerHTML = `
        <div class="empty-orders-placeholder">
          <span style="font-size: 3rem;">☕</span>
          <p style="font-size: 1.2rem; font-weight: 700; color: var(--text-muted); margin: 0.5rem 0 0 0;">
            現在、お渡し待ちの注文はありません
          </p>
          <span style="font-size: 0.85rem; color: #94a3b8;">厨房で調理完了されると、ここに自動で表示されます</span>
        </div>
      `;
    } else {
      readyList.innerHTML = readyOrders.map((o) => this.renderOrderCard(o)).join('');
    }

    // 「お渡し完了」ボタンのイベント設定
    this.container.querySelectorAll('.btn-to-delivered').forEach((btn) => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        playPop();
        store.updateOrderStatus(orderId, 'delivered');
        firebaseManager.updateOrderStatus(orderId, 'delivered');
      });
    });
  }

  renderOrderCard(order) {
    const timeStr = new Date(order.timestamp).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return `
      <div class="kitchen-order-card ready-card prominent-card" data-id="${order.id}">
        <div class="k-card-header ready-header">
          <div style="display: flex; align-items: baseline; gap: 0.6rem;">
            <span class="k-order-num ready-num">${order.orderNumber}</span>
            <span class="badge-call-now">📢 お呼出中</span>
          </div>
          <span class="k-order-time">${timeStr} (${order.terminal || 'レジ'})</span>
        </div>

        <div class="k-card-items-list">
          ${order.items.map((it) => `
            <div class="k-card-item-row">
              <span class="item-name">${it.emoji} ${it.name}</span>
              <span class="k-card-item-qty">×${it.quantity}</span>
            </div>
          `).join('')}
        </div>

        <button class="btn-kitchen-action btn-to-delivered" data-id="${order.id}">
          <span>✅ お客様にお渡し完了（引換券回収）</span>
        </button>
      </div>
    `;
  }

  setupEventListeners() {
    this.container.querySelector('#btnGoToCookingTab')?.addEventListener('click', () => {
      document.getElementById('tabKitchen')?.click();
    });
  }
}

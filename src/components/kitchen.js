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
      <div class="kitchen-view-container single-stage-container">
        <!-- ツールバー -->
        <div class="kitchen-toolbar">
          <div class="kitchen-stats-pills">
            <div class="k-stat-pill cooking">
              <span>🍳 調理待ち:</span>
              <strong id="kStatCookingCount">0件</strong>
            </div>
            <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: 700; margin-left: 0.5rem;">
              ※番号の若い順（#001〜）に一番上から並びます
            </span>
          </div>
          <div style="display: flex; gap: 0.75rem; align-items: center;">
            <button class="btn-primary" id="btnGoToDeliveryTab" style="background: linear-gradient(135deg, #10b981, #059669);">
              <span>🔔 お渡し可能画面へ (F3) ➔</span>
            </button>
          </div>
        </div>

        <!-- 調理待ちカード一覧 -->
        <div class="single-stage-board">
          <div class="single-stage-header cooking-header">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-size: 1.5rem;">🍳</span>
              <h3 style="margin: 0; font-size: 1.25rem; font-weight: 800; color: #b45309;">
                調理中・準備中オーダー（先入れ先出し・番号順）
              </h3>
            </div>
            <span id="colCookingBadge" class="badge-count-pill cooking-pill">0件</span>
          </div>
          <div class="orders-cards-grid" id="cookingOrdersList"></div>
        </div>
      </div>
    `;

    this.updateOrdersView();
  }

  updateOrdersView() {
    const orders = store.get().orders || [];
    let cookingOrders = orders.filter((o) => o.status === 'cooking');

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

    // 件数更新
    const countText = `${cookingOrders.length}件`;
    const countEl = this.container.querySelector('#kStatCookingCount');
    const badgeEl = this.container.querySelector('#colCookingBadge');
    if (countEl) countEl.textContent = countText;
    if (badgeEl) badgeEl.textContent = countText;

    const cookingList = this.container.querySelector('#cookingOrdersList');
    if (!cookingList) return;

    // 調理中リスト描画
    if (cookingOrders.length === 0) {
      cookingList.innerHTML = `
        <div class="empty-orders-placeholder">
          <span style="font-size: 3rem;">✨</span>
          <p style="font-size: 1.2rem; font-weight: 700; color: var(--text-muted); margin: 0.5rem 0 0 0;">
            現在、調理待ちの注文はありません
          </p>
          <span style="font-size: 0.85rem; color: #94a3b8;">レジで会計されると自動でここに表示されます</span>
        </div>
      `;
    } else {
      cookingList.innerHTML = cookingOrders.map((o) => this.renderOrderCard(o)).join('');
    }

    // 「調理完了・お渡しへ送る」ボタンのイベント設定
    this.container.querySelectorAll('.btn-to-ready').forEach((btn) => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        playPop();
        store.updateOrderStatus(orderId, 'ready');
        firebaseManager.updateOrderStatus(orderId, 'ready');
      });
    });
  }

  renderOrderCard(order) {
    const timeStr = new Date(order.timestamp).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // 注文からの経過分数を計算
    const elapsedMinutes = Math.floor((Date.now() - order.timestamp) / 60000);
    const elapsedBadge = elapsedMinutes > 5 
      ? `<span class="elapsed-warning">⏱️ ${elapsedMinutes}分経過</span>` 
      : `<span class="elapsed-normal">⏱️ ${elapsedMinutes}分前</span>`;

    return `
      <div class="kitchen-order-card cooking-card prominent-card" data-id="${order.id}">
        <div class="k-card-header">
          <div style="display: flex; align-items: baseline; gap: 0.6rem;">
            <span class="k-order-num">${order.orderNumber}</span>
            ${elapsedBadge}
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

        <button class="btn-kitchen-action btn-to-ready" data-id="${order.id}">
          <span>🔔 調理完了（お渡しへ送る）</span>
        </button>
      </div>
    `;
  }

  setupEventListeners() {
    this.container.querySelector('#btnGoToDeliveryTab')?.addEventListener('click', () => {
      document.getElementById('tabDelivery')?.click();
    });
  }
}

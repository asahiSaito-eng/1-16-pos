import confetti from 'canvas-confetti';
import { store } from '../state.js';
import { playBeep, playCashRegister, playCancel } from '../sound.js';
import { firebaseManager } from '../firebase.js';
import { p2p } from '../p2p.js';

export class RegisterComponent {
  constructor(container) {
    this.container = container;
    this.selectedCategory = 'all';
    this.tenderedAmount = ''; // 入力中の預かり金額文字列
    this.currentCompletedOrder = null;

    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();

    // 状態変更の監視
    store.subscribe('cart:updated', () => this.updateCartView());
    store.subscribe('stock:updated', () => this.renderProductsGrid());
    store.subscribe('products:updated', () => {
      this.renderCategoryChips();
      this.renderProductsGrid();
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="register-layout">
        <!-- 左側：商品一覧パネル -->
        <div class="products-panel">
          <div class="category-bar" id="categoryChipsContainer"></div>
          <div class="products-grid" id="productsGridContainer"></div>
        </div>

        <!-- 右側：カート＆会計パネル -->
        <div class="cart-panel">
          <div class="cart-header">
            <h2>
              <span>🛒</span>
              <span>注文リスト</span>
            </h2>
            <button class="btn-clear-cart" id="btnClearCart" title="カートを空にする">全て取消</button>
          </div>

          <div class="cart-items-list" id="cartItemsList"></div>

          <div class="cart-summary">
            <div class="summary-row">
              <span style="color: var(--text-muted); font-weight: 600;">商品点数</span>
              <span id="cartTotalItemsCount" style="font-weight: 800;">0 点</span>
            </div>
            <div class="summary-row total">
              <span>合計</span>
              <span class="amount" id="cartTotalAmount">¥0</span>
            </div>
            <button class="btn-proceed-checkout" id="btnOpenCheckout" disabled>
              <span>お会計に進む</span>
              <span>➔</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 会計（テンキー・お釣り）モーダル -->
      <div class="modal-overlay" id="checkoutModal">
        <div class="checkout-modal-card">
          <div class="modal-header">
            <h3>現金お会計</h3>
            <button class="modal-close-btn" id="btnCloseCheckoutModal">&times;</button>
          </div>
          <div class="checkout-modal-body">
            <div class="payment-display-grid">
              <div class="pay-stat-box">
                <span class="pay-stat-label">お会計合計</span>
                <span class="pay-stat-value total-highlight" id="modalBillTotal">¥0</span>
              </div>
              <div class="pay-stat-box">
                <span class="pay-stat-label">預かり金額</span>
                <span class="pay-stat-value" id="modalReceivedDisplay">¥0</span>
              </div>
            </div>

            <div class="pay-stat-box" style="background: #f8fafc; padding: 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--card-border);">
              <span class="pay-stat-label">お釣り</span>
              <span class="pay-stat-value change-highlight" id="modalChangeDisplay">¥0</span>
            </div>

            <!-- クイック金額ボタン -->
            <div class="quick-cash-row">
              <button class="btn-quick-cash btn-quick-exact" id="btnQuickExact">ちょうど</button>
              <button class="btn-quick-cash" data-add="1000">+1,000円</button>
              <button class="btn-quick-cash" data-add="5000">+5,000円</button>
              <button class="btn-quick-cash" data-add="10000">+10,000円</button>
            </div>

            <!-- テンキー -->
            <div class="numpad-grid">
              <button class="numpad-btn" data-key="7">7</button>
              <button class="numpad-btn" data-key="8">8</button>
              <button class="numpad-btn" data-key="9">9</button>
              <button class="numpad-btn" data-key="4">4</button>
              <button class="numpad-btn" data-key="5">5</button>
              <button class="numpad-btn" data-key="6">6</button>
              <button class="numpad-btn" data-key="1">1</button>
              <button class="numpad-btn" data-key="2">2</button>
              <button class="numpad-btn" data-key="3">3</button>
              <button class="numpad-btn" data-key="00">00</button>
              <button class="numpad-btn" data-key="0">0</button>
              <button class="numpad-btn action-clear" id="btnNumpadClear">クリア</button>
            </div>

            <button class="btn-finalize-pay" id="btnFinalizePay" disabled>
              <span>会計完了・引換券発行</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 会計完了・引換券チケットモーダル -->
      <div class="modal-overlay" id="receiptModal">
        <div class="checkout-modal-card" style="max-width: 440px;">
          <div class="modal-header">
            <h3>注文受付完了</h3>
            <button class="modal-close-btn" id="btnCloseReceiptModal">&times;</button>
          </div>
          <div class="checkout-modal-body printable-area" id="receiptPrintArea">
            <div class="receipt-ticket">
              <div style="font-weight: 800; font-size: 1.1rem; color: var(--text-main);" id="ticketStoreName">1-16 カフェ</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;" id="ticketDateDisplay">2026/10/10 12:00:00</div>
              
              <div class="ticket-number-box">
                <div class="ticket-call-label">お呼び出し番号</div>
                <div class="ticket-number-display" id="ticketNumberDisplay">#001</div>
              </div>

              <div class="receipt-details-list" id="ticketItemsList"></div>

              <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 1.1rem; margin-top: 0.5rem;">
                <span>合計金額</span>
                <span id="ticketTotalAmount">¥0</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
                <span>お預かり</span>
                <span id="ticketReceivedAmount">¥0</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.95rem; font-weight: 700; color: var(--color-accent-green); margin-top: 0.25rem;">
                <span>お釣り</span>
                <span id="ticketChangeAmount">¥0</span>
              </div>

              <p style="margin-top: 1rem; font-size: 0.78rem; color: var(--text-muted);">
                番号が呼ばれるまで少々お待ちください♪
              </p>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
              <button class="btn-secondary" style="flex: 1; justify-content: center;" id="btnPrintTicket">
                <span>🖨️ 印刷</span>
              </button>
              <button class="btn-primary" style="flex: 2; justify-content: center;" id="btnNextCustomer">
                <span>次の会計へ ➔</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderCategoryChips();
    this.renderProductsGrid();
    this.updateCartView();
  }

  renderCategoryChips() {
    const container = this.container.querySelector('#categoryChipsContainer');
    if (!container) return;
    const categories = store.get().categories || [];

    container.innerHTML = categories.map((cat) => `
      <button class="category-chip ${this.selectedCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
        <span>${cat.name}</span>
      </button>
    `).join('');

    container.querySelectorAll('.category-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedCategory = btn.dataset.cat;
        playBeep();
        this.renderCategoryChips();
        this.renderProductsGrid();
      });
    });
  }

  renderProductsGrid() {
    const grid = this.container.querySelector('#productsGridContainer');
    if (!grid) return;
    const state = store.get();
    const products = state.products || [];

    const filtered = this.selectedCategory === 'all'
      ? products
      : products.filter((p) => p.category === this.selectedCategory);

    grid.innerHTML = filtered.map((prod) => {
      const isSoldOut = typeof prod.stock === 'number' && prod.stock <= 0;
      const isStockLow = typeof prod.stock === 'number' && prod.stock > 0 && prod.stock <= 5;

      return `
        <div class="product-card ${isSoldOut ? 'sold-out' : ''}" data-id="${prod.id}">
          ${isSoldOut ? '<span class="sold-out-badge">SOLD OUT</span>' : ''}
          ${isStockLow ? `<span class="stock-low-badge">残少: ${prod.stock}</span>` : ''}
          <div class="card-top">
            <span class="card-emoji">${prod.emoji || '🍽️'}</span>
            <div class="card-title-group">
              <h3 class="card-title">${prod.name}</h3>
              <p class="card-desc">${prod.description || ''}</p>
            </div>
          </div>
          <div class="card-bottom">
            <span class="card-price">¥${prod.price.toLocaleString()}</span>
            <span class="card-stock-info">${typeof prod.stock === 'number' ? `残 ${prod.stock}点` : '在庫無制限'}</span>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.product-card').forEach((card) => {
      card.addEventListener('click', () => {
        const prodId = card.dataset.id;
        const prod = products.find((p) => p.id === prodId);
        if (prod && typeof prod.stock === 'number' && prod.stock <= 0) {
          playCancel();
          return;
        }
        playBeep();
        store.addToCart(prodId);
      });
    });
  }

  updateCartView() {
    const state = store.get();
    const cart = state.cart || [];
    const list = this.container.querySelector('#cartItemsList');
    const totalCountEl = this.container.querySelector('#cartTotalItemsCount');
    const totalAmountEl = this.container.querySelector('#cartTotalAmount');
    const checkoutBtn = this.container.querySelector('#btnOpenCheckout');

    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = store.getCartTotal();

    totalCountEl.textContent = `${totalCount} 点`;
    totalAmountEl.textContent = `¥${totalAmount.toLocaleString()}`;
    checkoutBtn.disabled = cart.length === 0 || totalAmount <= 0;

    if (cart.length === 0) {
      list.innerHTML = `
        <div class="empty-cart-view">
          <span style="font-size: 2.5rem;">🛍️</span>
          <p>商品を選んでタップしてください</p>
        </div>
      `;
      return;
    }

    list.innerHTML = cart.map((item) => `
      <div class="cart-item-row" data-id="${item.id}">
        <div class="cart-item-info">
          <span style="font-size: 1.25rem;">${item.emoji}</span>
          <div>
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-unit-price">¥${item.price.toLocaleString()}</div>
          </div>
        </div>
        <div class="cart-item-actions">
          <button class="qty-btn" data-action="minus" data-id="${item.id}">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" data-action="plus" data-id="${item.id}">+</button>
          <span class="cart-item-subtotal">¥${(item.price * item.quantity).toLocaleString()}</span>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.qty-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        playBeep();
        if (action === 'plus') {
          store.updateCartQuantity(id, 1);
        } else {
          store.updateCartQuantity(id, -1);
        }
      });
    });
  }

  setupEventListeners() {
    // カートクリア
    this.container.querySelector('#btnClearCart')?.addEventListener('click', () => {
      if (store.get().cart.length > 0) {
        playCancel();
        store.clearCart();
      }
    });

    // お会計モーダルを開く
    this.container.querySelector('#btnOpenCheckout')?.addEventListener('click', () => {
      this.openCheckoutModal();
    });

    // お会計モーダルを閉じる
    this.container.querySelector('#btnCloseCheckoutModal')?.addEventListener('click', () => {
      this.closeCheckoutModal();
    });

    // テンキーボタン
    this.container.querySelectorAll('.numpad-btn[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playBeep();
        const key = btn.dataset.key;
        this.tenderedAmount += key;
        // 先頭の余分な0をカット
        this.tenderedAmount = String(parseInt(this.tenderedAmount || '0', 10));
        this.updatePaymentCalculations();
      });
    });

    // クリアボタン
    this.container.querySelector('#btnNumpadClear')?.addEventListener('click', () => {
      playCancel();
      this.tenderedAmount = '';
      this.updatePaymentCalculations();
    });

    // クイック「ちょうど」ボタン
    this.container.querySelector('#btnQuickExact')?.addEventListener('click', () => {
      playBeep();
      this.tenderedAmount = String(store.getCartTotal());
      this.updatePaymentCalculations();
    });

    // クイック加算ボタン (+1000, +5000, +10000)
    this.container.querySelectorAll('.btn-quick-cash[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playBeep();
        const add = parseInt(btn.dataset.add, 10);
        const current = parseInt(this.tenderedAmount || '0', 10);
        this.tenderedAmount = String(current + add);
        this.updatePaymentCalculations();
      });
    });

    // 会計確定ボタン
    this.container.querySelector('#btnFinalizePay')?.addEventListener('click', () => {
      this.finalizePayment();
    });

    // キーボードショートカット（数字キー、Enterキー）
    window.addEventListener('keydown', (e) => {
      const checkoutModal = this.container.querySelector('#checkoutModal');
      if (checkoutModal && checkoutModal.classList.contains('active')) {
        if (e.key >= '0' && e.key <= '9') {
          playBeep();
          this.tenderedAmount += e.key;
          this.tenderedAmount = String(parseInt(this.tenderedAmount || '0', 10));
          this.updatePaymentCalculations();
        } else if (e.key === 'Backspace') {
          playCancel();
          this.tenderedAmount = this.tenderedAmount.slice(0, -1);
          this.updatePaymentCalculations();
        } else if (e.key === 'Enter') {
          const finalizeBtn = this.container.querySelector('#btnFinalizePay');
          if (finalizeBtn && !finalizeBtn.disabled) {
            this.finalizePayment();
          }
        } else if (e.key === 'Escape') {
          this.closeCheckoutModal();
        }
      }
    });

    // 引換券モーダル操作
    this.container.querySelector('#btnCloseReceiptModal')?.addEventListener('click', () => {
      this.closeReceiptModal();
    });
    this.container.querySelector('#btnNextCustomer')?.addEventListener('click', () => {
      this.closeReceiptModal();
    });
    this.container.querySelector('#btnPrintTicket')?.addEventListener('click', () => {
      window.print();
    });
  }

  openCheckoutModal() {
    this.tenderedAmount = '';
    const total = store.getCartTotal();
    this.container.querySelector('#modalBillTotal').textContent = `¥${total.toLocaleString()}`;
    this.updatePaymentCalculations();
    this.container.querySelector('#checkoutModal').classList.add('active');
  }

  closeCheckoutModal() {
    this.container.querySelector('#checkoutModal').classList.remove('active');
  }

  updatePaymentCalculations() {
    const total = store.getCartTotal();
    const received = parseInt(this.tenderedAmount || '0', 10);
    const change = received - total;

    const receivedDisplay = this.container.querySelector('#modalReceivedDisplay');
    const changeDisplay = this.container.querySelector('#modalChangeDisplay');
    const finalizeBtn = this.container.querySelector('#btnFinalizePay');

    receivedDisplay.textContent = `¥${received.toLocaleString()}`;

    if (received < total) {
      changeDisplay.textContent = `不足 ¥${Math.abs(change).toLocaleString()}`;
      changeDisplay.classList.add('insufficient');
      finalizeBtn.disabled = true;
    } else {
      changeDisplay.textContent = `¥${change.toLocaleString()}`;
      changeDisplay.classList.remove('insufficient');
      finalizeBtn.disabled = false;
    }
  }

  finalizePayment() {
    const total = store.getCartTotal();
    const received = parseInt(this.tenderedAmount || '0', 10);
    const change = received - total;

    // 会計処理
    const newOrder = store.checkout({
      received: received,
      change: change,
      method: 'cash'
    });

    if (!newOrder) return;

    // 音と紙吹雪演出
    playCashRegister();
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Firebase & P2P リアルタイム同期
    firebaseManager.pushOrder(newOrder);
    p2p.broadcastOrder(newOrder);

    this.closeCheckoutModal();
    this.showReceiptModal(newOrder);
  }

  showReceiptModal(order) {
    this.currentCompletedOrder = order;
    const state = store.get();

    this.container.querySelector('#ticketStoreName').textContent = state.storeName;
    this.container.querySelector('#ticketDateDisplay').textContent = new Date(order.timestamp).toLocaleString('ja-JP');
    this.container.querySelector('#ticketNumberDisplay').textContent = order.orderNumber;
    this.container.querySelector('#ticketTotalAmount').textContent = `¥${order.total.toLocaleString()}`;
    this.container.querySelector('#ticketReceivedAmount').textContent = `¥${order.received.toLocaleString()}`;
    this.container.querySelector('#ticketChangeAmount').textContent = `¥${order.change.toLocaleString()}`;

    const itemsList = this.container.querySelector('#ticketItemsList');
    itemsList.innerHTML = order.items.map((it) => `
      <div class="receipt-details-row">
        <span>${it.emoji} ${it.name} × ${it.quantity}</span>
        <span>¥${(it.price * it.quantity).toLocaleString()}</span>
      </div>
    `).join('');

    this.container.querySelector('#receiptModal').classList.add('active');

    // 自動印刷設定がONの場合
    if (state.autoPrintReceipt) {
      setTimeout(() => {
        window.print();
      }, 300);
    }
  }

  closeReceiptModal() {
    this.container.querySelector('#receiptModal').classList.remove('active');
  }
}

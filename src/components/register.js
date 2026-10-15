import confetti from 'canvas-confetti';
import { store } from '../state.js';
import { playBeep, playCashRegister, playCancel } from '../sound.js';
import { firebaseManager } from '../firebase.js';

export class RegisterComponent {
  constructor(container) {
    this.container = container;
    this.selectedCategory = 'all';
    this.selectedPaymentMethod = 'cash'; // 'cash' | 'dpay'
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
    store.subscribe('categories:updated', () => {
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

      <!-- 会計モーダル（現金 / d払い両対応） -->
      <div class="modal-overlay" id="checkoutModal">
        <div class="checkout-modal-card">
          <div class="modal-header">
            <h3>お会計</h3>
            <button class="modal-close-btn" id="btnCloseCheckoutModal">&times;</button>
          </div>
          <div class="checkout-modal-body">
            <!-- 支払い方法タブ -->
            <div style="display: flex; gap: 0.5rem; background: #f1f5f9; padding: 4px; border-radius: var(--radius-md); margin-bottom: 0.5rem;">
              <button class="btn-secondary" id="btnSelectCash" style="flex: 1; justify-content: center; font-weight: 800; border-radius: var(--radius-sm); border: none; padding: 0.6rem; background: white; color: var(--color-primary); box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
                <span>💵 現金</span>
              </button>
              <button class="btn-secondary" id="btnSelectDpay" style="flex: 1; justify-content: center; font-weight: 800; border-radius: var(--radius-sm); border: none; padding: 0.6rem; background: transparent; color: var(--text-muted);">
                <span>📱 d払い</span>
              </button>
            </div>

            <!-- 現金決済セクション -->
            <div id="cashPaymentSection">
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

              <div class="pay-stat-box" style="background: #f8fafc; padding: 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--card-border); margin: 0.6rem 0;">
                <span class="pay-stat-label">お釣り</span>
                <span class="pay-stat-value change-highlight" id="modalChangeDisplay">¥0</span>
              </div>

              <!-- クイック金額ボタン -->
              <div class="quick-cash-row" style="margin-bottom: 0.6rem;">
                <button class="btn-quick-cash btn-quick-exact" id="btnQuickExact">ちょうど</button>
                <button class="btn-quick-cash" data-add="1000">+1,000円</button>
                <button class="btn-quick-cash" data-add="5000">+5,000円</button>
                <button class="btn-quick-cash" data-add="10000">+10,000円</button>
              </div>

              <!-- テンキー -->
              <div class="numpad-grid" style="margin-bottom: 0.75rem;">
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
                <span>現金 会計完了・引換券発行</span>
              </button>
            </div>

            <!-- d払い決済セクション -->
            <div id="dpayPaymentSection" style="display: none; flex-direction: column; gap: 1rem;">
              <div style="background: linear-gradient(135deg, #fff1f2, #ffe4e6); border: 2px solid #fda4af; border-radius: var(--radius-md); padding: 1.25rem; text-align: center;">
                <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: #e11d48; color: white; padding: 0.25rem 0.75rem; border-radius: var(--radius-full); font-size: 0.82rem; font-weight: 800; margin-bottom: 0.5rem;">
                  <span>📱</span><span>d払い QRコード決済</span>
                </div>
                <div style="font-size: 0.85rem; color: #9f1239; font-weight: 700; margin-bottom: 0.25rem;">お客様に入力してもらう金額</div>
                <div style="font-size: 2.8rem; font-weight: 800; color: #be123c; letter-spacing: -0.02em;" id="dpayBillTotal">¥0</div>
                <p style="font-size: 0.82rem; color: #881337; margin-top: 0.5rem; line-height: 1.5;">
                  ① レジ前の<strong>d払いQRコード</strong>をお客様に読み取ってもらいます<br/>
                  ② 上記の金額（<strong id="dpayGuideAmount">¥0</strong>）を入力して支払ってもらいます<br/>
                  ③ お客様のスマホ画面で<strong>「支払い完了」</strong>を確認してください
                </p>
              </div>

              <button class="btn-finalize-pay" id="btnFinalizeDpay" style="background: linear-gradient(135deg, #e11d48, #be123c); box-shadow: 0 6px 16px rgba(225, 29, 72, 0.35);">
                <span>✅ お客様の支払い確認完了（引換券発行）</span>
              </button>
            </div>
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
                <span>お支払い方法</span>
                <span id="ticketPaymentMethodDisplay" style="font-weight: 700;">💵 現金</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;" id="ticketReceivedRow">
                <span>お預かり</span>
                <span id="ticketReceivedAmount">¥0</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.95rem; font-weight: 700; color: var(--color-accent-green); margin-top: 0.25rem;" id="ticketChangeRow">
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

    // 支払い方法切り替えボタン
    this.container.querySelector('#btnSelectCash')?.addEventListener('click', () => {
      playBeep();
      this.switchPaymentMethod('cash');
    });

    this.container.querySelector('#btnSelectDpay')?.addEventListener('click', () => {
      playBeep();
      this.switchPaymentMethod('dpay');
    });

    // テンキーボタン
    this.container.querySelectorAll('.numpad-btn[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playBeep();
        const key = btn.dataset.key;
        this.tenderedAmount += key;
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

    // 現金 会計確定ボタン
    this.container.querySelector('#btnFinalizePay')?.addEventListener('click', () => {
      this.finalizePayment('cash');
    });

    // d払い 会計確定ボタン
    this.container.querySelector('#btnFinalizeDpay')?.addEventListener('click', () => {
      this.finalizePayment('dpay');
    });

    // キーボードショートカット（数字キー、Enterキー）
    window.addEventListener('keydown', (e) => {
      const checkoutModal = this.container.querySelector('#checkoutModal');
      if (checkoutModal && checkoutModal.classList.contains('active')) {
        if (this.selectedPaymentMethod === 'cash') {
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
              this.finalizePayment('cash');
            }
          }
        } else if (this.selectedPaymentMethod === 'dpay') {
          if (e.key === 'Enter') {
            this.finalizePayment('dpay');
          }
        }
        if (e.key === 'Escape') {
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

  switchPaymentMethod(method) {
    this.selectedPaymentMethod = method;
    const btnCash = this.container.querySelector('#btnSelectCash');
    const btnDpay = this.container.querySelector('#btnSelectDpay');
    const cashSection = this.container.querySelector('#cashPaymentSection');
    const dpaySection = this.container.querySelector('#dpayPaymentSection');

    if (method === 'cash') {
      btnCash.style.background = 'white';
      btnCash.style.color = 'var(--color-primary)';
      btnCash.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';

      btnDpay.style.background = 'transparent';
      btnDpay.style.color = 'var(--text-muted)';
      btnDpay.style.boxShadow = 'none';

      cashSection.style.display = 'block';
      dpaySection.style.display = 'none';
      this.updatePaymentCalculations();
    } else {
      btnDpay.style.background = '#e11d48';
      btnDpay.style.color = 'white';
      btnDpay.style.boxShadow = '0 2px 6px rgba(225,29,72,0.25)';

      btnCash.style.background = 'transparent';
      btnCash.style.color = 'var(--text-muted)';
      btnCash.style.boxShadow = 'none';

      cashSection.style.display = 'none';
      dpaySection.style.display = 'flex';

      const total = store.getCartTotal();
      this.container.querySelector('#dpayBillTotal').textContent = `¥${total.toLocaleString()}`;
      this.container.querySelector('#dpayGuideAmount').textContent = `¥${total.toLocaleString()}`;
    }
  }

  openCheckoutModal() {
    this.tenderedAmount = '';
    const total = store.getCartTotal();
    this.container.querySelector('#modalBillTotal').textContent = `¥${total.toLocaleString()}`;
    this.container.querySelector('#dpayBillTotal').textContent = `¥${total.toLocaleString()}`;
    this.container.querySelector('#dpayGuideAmount').textContent = `¥${total.toLocaleString()}`;
    
    // デフォルトは現金モードで開く
    this.switchPaymentMethod('cash');
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

  finalizePayment(method = 'cash') {
    const total = store.getCartTotal();
    let received = total;
    let change = 0;

    if (method === 'cash') {
      received = parseInt(this.tenderedAmount || '0', 10);
      change = received - total;
      if (received < total) return;
    }

    // 会計処理
    const newOrder = store.checkout({
      received: received,
      change: change,
      method: method
    });

    if (!newOrder) return;

    // 音と紙吹雪演出
    playCashRegister();
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Firebase リアルタイム同期
    firebaseManager.pushOrder(newOrder);

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

    const isDpay = order.paymentMethod === 'dpay';
    const payMethodDisplay = this.container.querySelector('#ticketPaymentMethodDisplay');
    const receivedRow = this.container.querySelector('#ticketReceivedRow');
    const changeRow = this.container.querySelector('#ticketChangeRow');

    if (isDpay) {
      payMethodDisplay.innerHTML = '<span style="color: #e11d48;">📱 d払い (決済確認済)</span>';
      receivedRow.style.display = 'none';
      changeRow.style.display = 'none';
    } else {
      payMethodDisplay.textContent = '💵 現金';
      receivedRow.style.display = 'flex';
      changeRow.style.display = 'flex';
      this.container.querySelector('#ticketReceivedAmount').textContent = `¥${order.received.toLocaleString()}`;
      this.container.querySelector('#ticketChangeAmount').textContent = `¥${order.change.toLocaleString()}`;
    }

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

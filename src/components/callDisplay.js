import { store } from '../state.js';
import { playDingDong } from '../sound.js';

export class CallDisplayComponent {
  constructor(container) {
    this.container = container;
    this.previousReadyIds = new Set();
    this.soundEnabled = true;
    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();
    this.startClock();

    // 注文イベントのリアルタイム監視
    store.subscribe('order:created', () => this.updateCallView());
    store.subscribe('order:remote_received', () => this.updateCallView());
    store.subscribe('order:status_changed', () => this.updateCallView());
    store.subscribe('sales:reset', () => this.updateCallView());
    store.subscribe('settings:updated', () => this.updateStoreName());
  }

  render() {
    const state = store.get();
    this.container.innerHTML = `
      <div class="call-display-page" id="callPageRoot">
        <!-- 呼出画面トップバー -->
        <div class="call-page-header">
          <div class="call-brand">
            <span class="call-brand-icon">📢</span>
            <div>
              <h2 class="call-brand-title" id="callDisplayStoreName">${state.storeName || '1-16 カフェ'}</h2>
              <span class="call-brand-sub">出来上がり・お呼出モニター</span>
            </div>
          </div>

          <div class="call-header-center">
            <div class="call-notice-ticker">
              <span class="ticker-icon">🎫</span>
              <span class="ticker-text">番号が呼ばれましたら、引換券を持って受取口までお越しください</span>
            </div>
          </div>

          <div class="call-header-controls">
            <div class="call-digital-clock" id="callDigitalClock">12:00:00</div>
            <button class="call-ctrl-btn" id="btnToggleSound" title="音声チャイムのON/OFF">
              <span id="callSoundIcon">🔔</span>
              <span id="callSoundText">音:ON</span>
            </button>
            <button class="call-ctrl-btn btn-fullscreen" id="btnToggleFullscreen" title="プロジェクター用 全画面表示 (F11)">
              <span>⛶</span>
              <span>全画面</span>
            </button>
          </div>
        </div>

        <!-- メイン呼出ボード（2大カラム） -->
        <div class="call-board-grid">
          <!-- お受け取り可能（呼出中）列 -->
          <div class="call-board-col ready-col">
            <div class="call-col-banner ready-banner">
              <div class="banner-icon-wrap">🔔</div>
              <div class="banner-text-wrap">
                <h3 class="banner-title">お受け取りいただけます</h3>
                <p class="banner-desc">引換券をご準備のうえ、受取口へお越しください</p>
              </div>
              <div class="banner-counter" id="callReadyCount">0組</div>
            </div>

            <div class="call-numbers-area" id="callReadyNumbersGrid">
              <!-- 番号が若い順（昇順）に並ぶ -->
            </div>
          </div>

          <!-- ただいま準備中（調理中）列 -->
          <div class="call-board-col cooking-col">
            <div class="call-col-banner cooking-banner">
              <div class="banner-icon-wrap">🍳</div>
              <div class="banner-text-wrap">
                <h3 class="banner-title">ただいま準備中</h3>
                <p class="banner-desc">ただいま心を込めてお作りしております</p>
              </div>
              <div class="banner-counter" id="callCookingCount">0組</div>
            </div>

            <div class="call-numbers-area cooking-numbers-area" id="callCookingNumbersGrid">
              <!-- 番号が若い順（昇順）に並ぶ -->
            </div>
          </div>
        </div>

        <!-- フッターインフォ -->
        <div class="call-page-footer">
          <div class="footer-left">
            <span>✨ リアルタイムクラウド同期中</span>
            <span class="footer-dot"></span>
            <span>番号順（昇順）に表示中</span>
          </div>
          <div class="footer-right">
            <span>※引換券を紛失された際はお近くのスタッフまでお声がけください</span>
          </div>
        </div>
      </div>
    `;

    this.updateCallView();
  }

  updateStoreName() {
    const storeNameEl = this.container.querySelector('#callDisplayStoreName');
    if (storeNameEl) {
      storeNameEl.textContent = store.get().storeName || '1-16 カフェ';
    }
  }

  startClock() {
    const clockEl = this.container.querySelector('#callDigitalClock');
    if (!clockEl) return;

    const tick = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = `${h}:${m}:${s}`;
    };

    tick();
    setInterval(tick, 1000);
  }

  updateCallView() {
    const orders = store.get().orders || [];
    let readyOrders = orders.filter((o) => o.status === 'ready');
    let cookingOrders = orders.filter((o) => o.status === 'cooking');

    // 注文番号を数値としてパース（例: '#003' -> 3, 'A-012' -> 12）
    const parseOrderNum = (order) => {
      if (!order || !order.orderNumber) return 0;
      const num = parseInt(String(order.orderNumber).replace(/[^0-9]/g, ''), 10);
      return isNaN(num) ? 0 : num;
    };

    // ★重要: どちらも番号が若い順（昇順: #001 -> #002 -> #003）にソート
    readyOrders.sort((a, b) => {
      const numA = parseOrderNum(a);
      const numB = parseOrderNum(b);
      if (numA !== numB) return numA - numB;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    cookingOrders.sort((a, b) => {
      const numA = parseOrderNum(a);
      const numB = parseOrderNum(b);
      if (numA !== numB) return numA - numB;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    // カウンター更新
    const readyCountEl = this.container.querySelector('#callReadyCount');
    const cookingCountEl = this.container.querySelector('#callCookingCount');
    if (readyCountEl) readyCountEl.textContent = `${readyOrders.length}組`;
    if (cookingCountEl) cookingCountEl.textContent = `${cookingOrders.length}組`;

    // 新たに呼出状態になった注文があればチャイム音を再生
    const currentReadyIds = new Set(readyOrders.map((o) => o.id));
    let hasNewReady = false;
    currentReadyIds.forEach((id) => {
      if (!this.previousReadyIds.has(id)) {
        hasNewReady = true;
      }
    });

    if (hasNewReady && this.previousReadyIds.size > 0 && this.soundEnabled) {
      playDingDong();
    }
    this.previousReadyIds = currentReadyIds;

    // 呼出中（お受け取り可能）コンテナ描画
    const readyContainer = this.container.querySelector('#callReadyNumbersGrid');
    if (readyContainer) {
      if (readyOrders.length === 0) {
        readyContainer.innerHTML = `
          <div class="call-empty-state">
            <span class="empty-icon">☕</span>
            <p class="empty-text">現在お呼び出し中の番号はありません</p>
            <p class="empty-sub">調理完了次第、こちらに番号が表示されます</p>
          </div>
        `;
      } else {
        readyContainer.innerHTML = readyOrders.map((order) => {
          return `
            <div class="call-giant-card ready-giant">
              <span class="giant-label">呼出中</span>
              <span class="giant-number">${order.orderNumber}</span>
              <span class="giant-badge">受取口へどうぞ</span>
            </div>
          `;
        }).join('');
      }
    }

    // 調理中（準備中）コンテナ描画
    const cookingContainer = this.container.querySelector('#callCookingNumbersGrid');
    if (cookingContainer) {
      if (cookingOrders.length === 0) {
        cookingContainer.innerHTML = `
          <div class="call-empty-state">
            <span class="empty-icon">✨</span>
            <p class="empty-text">現在準備中の注文はありません</p>
          </div>
        `;
      } else {
        cookingContainer.innerHTML = cookingOrders.map((order) => {
          return `
            <div class="call-giant-card cooking-giant">
              <span class="giant-label">準備中</span>
              <span class="giant-number">${order.orderNumber}</span>
            </div>
          `;
        }).join('');
      }
    }
  }

  setupEventListeners() {
    // 全画面表示ボタン
    const btnFullscreen = this.container.querySelector('#btnToggleFullscreen');
    const root = this.container.querySelector('#callPageRoot');

    btnFullscreen?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        root.requestFullscreen().catch((err) => {
          console.warn('Fullscreen error:', err);
        });
      } else {
        document.exitFullscreen().catch((err) => {
          console.warn('Exit fullscreen error:', err);
        });
      }
    });

    // サウンド切替ボタン
    const btnSound = this.container.querySelector('#btnToggleSound');
    const soundIcon = this.container.querySelector('#callSoundIcon');
    const soundText = this.container.querySelector('#callSoundText');

    btnSound?.addEventListener('click', () => {
      this.soundEnabled = !this.soundEnabled;
      if (this.soundEnabled) {
        soundIcon.textContent = '🔔';
        soundText.textContent = '音:ON';
        btnSound.style.opacity = '1';
        playDingDong();
      } else {
        soundIcon.textContent = '🔕';
        soundText.textContent = '音:OFF';
        btnSound.style.opacity = '0.6';
      }
    });
  }
}

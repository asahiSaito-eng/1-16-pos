import { store } from '../state.js';
import { firebaseManager } from '../firebase.js';

export class SettingsComponent {
  constructor(container) {
    this.container = container;
    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();

    // Firebase接続状態の監視
    firebaseManager.onStatusChange((status, errorMsg) => {
      this.updateFirebaseStatusDisplay(status, errorMsg);
    });

    store.subscribe('settings:updated', () => {
      this.refreshFormValues();
    });
  }

  render() {
    const state = store.get();

    this.container.innerHTML = `
      <div class="settings-container">
        <!-- 🔥 クラウドリアルタイム同期ステータス -->
        <div class="settings-card" style="border-left: 6px solid #10b981; background: linear-gradient(135deg, rgba(240, 253, 244, 0.8), rgba(255, 255, 255, 0.9));">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: gap;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="font-size: 2rem;">🔥</span>
              <div>
                <h3 style="font-size: 1.15rem; font-weight: 800; color: #065f46;">Firebase クラウド同期</h3>
                <p style="font-size: 0.82rem; color: #047857; margin-top: 0.15rem;">
                  事前設定済みのため、設定不要で全端末が自動同期されます
                </p>
              </div>
            </div>
            <span id="fbStatusBadge" style="font-size: 0.85rem; font-weight: 800; padding: 0.4rem 0.9rem; border-radius: var(--radius-full); background: #d1fae5; color: #065f46; box-shadow: 0 2px 8px rgba(16,185,129,0.15);">
              🟢 リアルタイム同期中
            </span>
          </div>
        </div>

        <!-- 基本設定 -->
        <div class="settings-card">
          <div class="settings-card-header">
            <h3>⚙️ 端末・店舗設定</h3>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label for="setStoreName">店舗名・クラス名</label>
              <input type="text" id="setStoreName" class="form-input" value="${state.storeName}" />
            </div>

            <div class="form-group">
              <label for="setTerminalName">この端末の役割・名称</label>
              <input type="text" id="setTerminalName" class="form-input" value="${state.terminalName}" placeholder="例: レジ-1, 厨房モニター, 受渡口" />
            </div>
          </div>

          <div style="display: flex; gap: 2rem; align-items: center; margin-top: 0.5rem; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.95rem; font-weight: 600;">
              <input type="checkbox" id="setSoundEnabled" ${state.soundEnabled ? 'checked' : ''} style="width: 18px; height: 18px;" />
              <span>効果音（レジ音・呼び出し音）を有効にする</span>
            </label>

            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.95rem; font-weight: 600;">
              <input type="checkbox" id="setAutoPrint" ${state.autoPrintReceipt ? 'checked' : ''} style="width: 18px; height: 18px;" />
              <span>会計完了時に自動で印刷ダイアログを開く</span>
            </label>
          </div>

          <button class="btn-primary" id="btnSaveBasicSettings" style="align-self: flex-start;">
            <span>設定を保存</span>
          </button>
        </div>

        <!-- ⚠️ データリセット -->
        <div class="settings-card" style="border-color: #fecdd3;">
          <div class="settings-card-header">
            <h3 style="color: var(--color-accent-red);">⚠️ データリセット</h3>
          </div>

          <p style="font-size: 0.85rem; color: var(--text-muted);">
            本番直前やテスト終了後に注文データを消去して初期化したい場合にご利用ください。
          </p>

          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <button class="btn-secondary" id="btnResetSalesOnly" style="color: var(--color-accent-red); border-color: #fca5a5;">
              <span>🗑️ 売上・注文履歴のみをクリア（メニューは維持）</span>
            </button>
            <button class="btn-secondary" id="btnResetAll" style="color: var(--color-accent-red); border-color: #fca5a5;">
              <span>💥 全データを完全初期化（初期状態に戻す）</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.updateFirebaseStatusDisplay(firebaseManager.status);
  }

  updateFirebaseStatusDisplay(status, errorMsg) {
    const badge = this.container.querySelector('#fbStatusBadge');
    if (!badge) return;

    if (status === 'connected') {
      badge.textContent = '🟢 リアルタイム同期中';
      badge.style.background = '#d1fae5';
      badge.style.color = '#065f46';
    } else if (status === 'connecting') {
      badge.textContent = '🟡 接続試行中...';
      badge.style.background = '#fef3c7';
      badge.style.color = '#92400e';
    } else if (status === 'error') {
      badge.textContent = `🔴 接続エラー: ${errorMsg || '通信確認'}`;
      badge.style.background = '#fee2e2';
      badge.style.color = '#991b1b';
    } else {
      badge.textContent = '⚪ 接続中...';
      badge.style.background = '#f1f5f9';
      badge.style.color = '#64748b';
    }
  }

  refreshFormValues() {
    const state = store.get();
    const storeNameEl = this.container.querySelector('#setStoreName');
    const termNameEl = this.container.querySelector('#setTerminalName');
    const soundEl = this.container.querySelector('#setSoundEnabled');
    const printEl = this.container.querySelector('#setAutoPrint');

    if (storeNameEl) storeNameEl.value = state.storeName;
    if (termNameEl) termNameEl.value = state.terminalName;
    if (soundEl) soundEl.checked = state.soundEnabled;
    if (printEl) printEl.checked = state.autoPrintReceipt;
  }

  setupEventListeners() {
    // 基本設定保存
    this.container.querySelector('#btnSaveBasicSettings')?.addEventListener('click', () => {
      const storeName = this.container.querySelector('#setStoreName').value.trim() || '1-16 カフェ';
      const terminalName = this.container.querySelector('#setTerminalName').value.trim() || 'レジ';
      const soundEnabled = this.container.querySelector('#setSoundEnabled').checked;
      const autoPrintReceipt = this.container.querySelector('#setAutoPrint').checked;

      store.updateSettings({
        storeName,
        terminalName,
        soundEnabled,
        autoPrintReceipt
      });
      alert('設定を保存しました！');
    });

    // 売上クリア
    this.container.querySelector('#btnResetSalesOnly')?.addEventListener('click', async () => {
      if (confirm('【確認】売上履歴・会計データのみを削除しますか？\n※商品メニューやカテゴリーは保持されます。')) {
        store.resetSalesData();
        await firebaseManager.clearRoomOrders();
        alert('売上履歴をクリアしました');
      }
    });

    // 全データ初期化
    this.container.querySelector('#btnResetAll')?.addEventListener('click', async () => {
      if (confirm('【危険】全データを初期化しますか？\nメニューや設定も全て初期状態に戻ります。')) {
        store.resetAllData();
        await firebaseManager.clearRoomOrders();
        alert('全てのデータを初期化しました');
        location.reload();
      }
    });
  }
}

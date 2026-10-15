import { store } from '../state.js';
import { p2p } from '../p2p.js';
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

    // P2Pステータスの監視
    p2p.onStatusChange((status, count) => {
      this.updateP2PStatusDisplay(status, count);
    });

    store.subscribe('settings:updated', () => {
      this.refreshFormValues();
    });
  }

  render() {
    const state = store.get();
    const fbConfig = firebaseManager.getConfig() || {};

    this.container.innerHTML = `
      <div class="settings-container">
        <!-- 基本設定 -->
        <div class="settings-card">
          <div class="settings-card-header">
            <h3>⚙️ 基本設定</h3>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label for="setStoreName">店舗名・クラス名</label>
              <input type="text" id="setStoreName" class="form-input" value="${state.storeName}" />
            </div>

            <div class="form-group">
              <label for="setTerminalName">この端末の名称</label>
              <input type="text" id="setTerminalName" class="form-input" value="${state.terminalName}" placeholder="例: レジ-1, 厨房モニター" />
            </div>
          </div>

          <div style="display: flex; gap: 2rem; align-items: center; margin-top: 0.5rem; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.95rem; font-weight: 600;">
              <input type="checkbox" id="setSoundEnabled" ${state.soundEnabled ? 'checked' : ''} style="width: 18px; height: 18px;" />
              <span>効果音（レジ音・ベル音）を有効にする</span>
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

        <!-- 🔥 Firebase Realtime Database 連携 -->
        <div class="settings-card" style="border: 1px solid #fed7aa;">
          <div class="settings-card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="color: #ea580c;">🔥 Firebase Realtime Database リアルタイム連携</h3>
            <span id="fbStatusBadge" style="font-size: 0.85rem; font-weight: 700; padding: 0.3rem 0.8rem; border-radius: var(--radius-full); background: #f1f5f9; color: var(--text-muted);">
              ⚪ 未設定
            </span>
          </div>

          <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.5;">
            Firebase Realtime Database を使うことで、複数台のレジ・厨房モニター・売上分析が<strong>ミリ秒単位で超高速同期</strong>します。ネットが途切れてもオフラインキャッシュが自動で働き、復帰時に即座に同期されます。
          </p>

          <!-- クイックJSON貼り付け or 各項目入力 -->
          <div class="form-group">
            <label for="fbConfigPasteArea">
              <span>Firebase 設定の貼り付け (firebaseConfig オブジェクトまたは JSON)</span>
              <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-left: 0.5rem;">※Firebaseコンソールのウェブアプリ設定をそのままコピペできます</span>
            </label>
            <textarea id="fbConfigPasteArea" class="form-input" rows="4" style="font-family: monospace; font-size: 0.82rem;" placeholder='{\n  "apiKey": "AIzaSy...",\n  "authDomain": "my-project.firebaseapp.com",\n  "databaseURL": "https://my-project-default-rtdb.firebaseio.com",\n  "projectId": "my-project",\n  "appId": "1:..."\n}'></textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="form-group">
              <label for="fbDatabaseUrl">Database URL *</label>
              <input type="text" id="fbDatabaseUrl" class="form-input" value="${fbConfig.databaseURL || ''}" placeholder="https://xxx-default-rtdb.firebaseio.com" />
            </div>
            <div class="form-group">
              <label for="fbProjectId">Project ID *</label>
              <input type="text" id="fbProjectId" class="form-input" value="${fbConfig.projectId || ''}" placeholder="my-project-id" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="form-group">
              <label for="fbApiKey">API Key</label>
              <input type="text" id="fbApiKey" class="form-input" value="${fbConfig.apiKey || ''}" placeholder="AIzaSy..." />
            </div>
            <div class="form-group">
              <label for="fbAppId">App ID</label>
              <input type="text" id="fbAppId" class="form-input" value="${fbConfig.appId || ''}" placeholder="1:123456789:web:..." />
            </div>
          </div>

          <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
            <button class="btn-primary" id="btnSaveFirebaseConfig" style="background: linear-gradient(135deg, #f97316, #ea580c);">
              <span>🔥 Firebase設定を保存して接続</span>
            </button>
            <button class="btn-secondary" id="btnTestFirebase">
              <span>接続テスト</span>
            </button>
            <button class="btn-clear-cart" id="btnClearFirebase" style="color: var(--color-accent-red); margin-left: auto;">
              Firebase設定を解除
            </button>
          </div>

          <!-- セットアップ手順ガイド -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-md); padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
            <strong style="font-size: 0.9rem;">📖 Firebase Realtime Database 3分セットアップ手順</strong>
            <ol style="font-size: 0.82rem; color: var(--text-muted); padding-left: 1.25rem; line-height: 1.6;">
              <li><a href="https://console.firebase.google.com/" target="_blank" style="color: var(--color-primary); font-weight: 700;">Firebase Console</a> にアクセスし、「プロジェクトを追加」をクリックします（無料プラン Spark で十分稼働します）。</li>
              <li>左メニューの「構築」➔「Realtime Database」を選択し、「データベースの作成」を押します。</li>
              <li>ロケーション（米国など推奨）を選び、セキュリティルールは<strong>「テストモードで開始」</strong>（30日間読み書き許可）を選択して「有効にする」を押します。</li>
              <li>プロジェクトの設定（歯車マーク）➔「全般」下部の「マイアプリ」で「</>（ウェブ）」を追加し、表示された <code>const firebaseConfig = { ... }</code> を上の入力枠にコピペして保存するだけで完了です！</li>
            </ol>
          </div>
        </div>

        <!-- 🔗 端末間同期・ルームID -->
        <div class="settings-card">
          <div class="settings-card-header">
            <h3>🔗 端末間同期（同一ルーム設定）</h3>
          </div>

          <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.5;">
            同じ文化祭ルームIDを設定したすべての端末（iPad、スマホ、ノートPC）が同期対象となります。
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label for="setRoomId">同期ルームID</label>
              <div style="display: flex; gap: 0.5rem;">
                <input type="text" id="setRoomId" class="form-input" style="flex: 1;" value="${state.roomId || '1-16-pos'}" />
                <button class="btn-secondary" id="btnApplyRoomId">適用</button>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; justify-content: center;">
              <div style="font-size: 0.85rem; font-weight: 700;">P2Pバックアップ同期</div>
              <div id="p2pStatusDisplay" style="font-size: 0.95rem; font-weight: 800; color: var(--color-accent-green); margin-top: 0.2rem;">
                待機中
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 1.5rem; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-md); padding: 1.25rem;">
            <div id="qrCodeContainer" style="width: 140px; height: 140px; background: white; border-radius: var(--radius-sm); border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 0.8rem; color: var(--text-muted);">QR生成中...</span>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
              <strong style="font-size: 0.95rem;">📱 別端末（iPad・スマホ・厨房モニター）を簡単接続</strong>
              <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.4;">
                カメラアプリでこのQRコードを読み取ると、同じルームIDで即座に連携して操作できます。
              </p>
              <button class="btn-secondary" id="btnCopyInviteLink" style="align-self: flex-start;">
                🔗 参加URLをコピー
              </button>
            </div>
          </div>
        </div>

        <!-- ▲ Vercel デプロイガイド -->
        <div class="settings-card" style="border-left: 5px solid #000;">
          <div class="settings-card-header">
            <h3>▲ Vercel デプロイ対応済み</h3>
          </div>
          <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.5;">
            本システムは <code>vercel.json</code> を完備しており、Vercel 上で高速・無料で常時ホスティングできます。
          </p>
          <div style="background: #1e293b; color: #f8fafc; padding: 1rem; border-radius: var(--radius-md); font-family: monospace; font-size: 0.85rem;">
            # Vercel CLIでデプロイする場合<br/>
            npx vercel<br/><br/>
            # または GitHub にプッシュして Vercel にインポートするだけで自動公開されます
          </div>
        </div>

        <!-- ⚠️ データリセット -->
        <div class="settings-card" style="border-color: #fecdd3;">
          <div class="settings-card-header">
            <h3 style="color: var(--color-accent-red);">⚠️ データリセット</h3>
          </div>

          <p style="font-size: 0.85rem; color: var(--text-muted);">
            本番直前のテスト注文データを消去して初期化したい場合にご利用ください。
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

    this.renderQrCode();
    this.updateFirebaseStatusDisplay(firebaseManager.status);
  }

  updateFirebaseStatusDisplay(status, errorMsg) {
    const badge = this.container.querySelector('#fbStatusBadge');
    if (!badge) return;

    if (status === 'connected') {
      badge.textContent = '🟢 接続中 (Realtime DB 稼働中)';
      badge.style.background = '#d1fae5';
      badge.style.color = '#065f46';
    } else if (status === 'connecting') {
      badge.textContent = '🟡 接続試行中...';
      badge.style.background = '#fef3c7';
      badge.style.color = '#92400e';
    } else if (status === 'error') {
      badge.textContent = `🔴 接続エラー: ${errorMsg || '認証失敗'}`;
      badge.style.background = '#fee2e2';
      badge.style.color = '#991b1b';
    } else {
      badge.textContent = '⚪ 未設定 (ローカル単独動作)';
      badge.style.background = '#f1f5f9';
      badge.style.color = '#64748b';
    }
  }

  updateP2PStatusDisplay(status, count) {
    const el = this.container.querySelector('#p2pStatusDisplay');
    if (!el) return;

    if (status === 'connected') {
      el.textContent = `🟢 接続中 (他端末: ${count} 台)`;
      el.style.color = '#10b981';
    } else if (status === 'connecting') {
      el.textContent = '🟡 接続準備中...';
      el.style.color = '#f59e0b';
    } else {
      el.textContent = '⚪ 待機中 (単独動作中)';
      el.style.color = '#64748b';
    }
  }

  async renderQrCode() {
    const qrContainer = this.container.querySelector('#qrCodeContainer');
    if (!qrContainer) return;

    const qrResult = await p2p.generateInviteQR();
    if (qrResult && qrResult.qrDataUrl) {
      qrContainer.innerHTML = `<img src="${qrResult.qrDataUrl}" alt="Invite QR" style="width: 100%; height: 100%; border-radius: 6px;" />`;
      this.currentInviteUrl = qrResult.url;
    }
  }

  refreshFormValues() {
    const state = store.get();
    const storeNameEl = this.container.querySelector('#setStoreName');
    const termNameEl = this.container.querySelector('#setTerminalName');
    const soundEl = this.container.querySelector('#setSoundEnabled');
    const printEl = this.container.querySelector('#setAutoPrint');
    const roomIdEl = this.container.querySelector('#setRoomId');

    if (storeNameEl) storeNameEl.value = state.storeName;
    if (termNameEl) termNameEl.value = state.terminalName;
    if (soundEl) soundEl.checked = state.soundEnabled;
    if (printEl) printEl.checked = state.autoPrintReceipt;
    if (roomIdEl) roomIdEl.value = state.roomId || '1-16-pos';
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
      alert('基本設定を保存しました');
    });

    // Firebase Config 貼り付け自動解析
    this.container.querySelector('#fbConfigPasteArea')?.addEventListener('input', (e) => {
      const text = e.target.value.trim();
      if (!text) return;

      try {
        let parsed = null;
        if (text.startsWith('{')) {
          parsed = JSON.parse(text);
        } else {
          // JSオブジェクト形式 (apiKey: "...", databaseURL: "...") の抽出
          const extract = (key) => {
            const m = text.match(new RegExp(`${key}["'\\s]*:[\"'\\s]*([^"',\\s}]+)`));
            return m ? m[1] : '';
          };
          parsed = {
            apiKey: extract('apiKey'),
            authDomain: extract('authDomain'),
            databaseURL: extract('databaseURL'),
            projectId: extract('projectId'),
            storageBucket: extract('storageBucket'),
            messagingSenderId: extract('messagingSenderId'),
            appId: extract('appId')
          };
        }

        if (parsed) {
          if (parsed.databaseURL) this.container.querySelector('#fbDatabaseUrl').value = parsed.databaseURL;
          if (parsed.projectId) this.container.querySelector('#fbProjectId').value = parsed.projectId;
          if (parsed.apiKey) this.container.querySelector('#fbApiKey').value = parsed.apiKey;
          if (parsed.appId) this.container.querySelector('#fbAppId').value = parsed.appId;
        }
      } catch (err) {
        // パース失敗時はそのまま
      }
    });

    // Firebase設定保存＆接続
    this.container.querySelector('#btnSaveFirebaseConfig')?.addEventListener('click', async () => {
      const databaseURL = this.container.querySelector('#fbDatabaseUrl').value.trim();
      const projectId = this.container.querySelector('#fbProjectId').value.trim();
      const apiKey = this.container.querySelector('#fbApiKey').value.trim();
      const appId = this.container.querySelector('#fbAppId').value.trim();

      if (!projectId && !databaseURL) {
        alert('Database URL または Project ID を入力してください');
        return;
      }

      const config = {
        databaseURL: databaseURL || `https://${projectId}-default-rtdb.firebaseio.com`,
        projectId,
        apiKey,
        appId
      };

      firebaseManager.saveConfig(config);
      alert('Firebase設定を保存し、接続を開始しました！');
    });

    // Firebase接続テスト
    this.container.querySelector('#btnTestFirebase')?.addEventListener('click', async () => {
      const databaseURL = this.container.querySelector('#fbDatabaseUrl').value.trim();
      const projectId = this.container.querySelector('#fbProjectId').value.trim();
      const apiKey = this.container.querySelector('#fbApiKey').value.trim();
      const appId = this.container.querySelector('#fbAppId').value.trim();

      const config = {
        databaseURL: databaseURL || `https://${projectId}-default-rtdb.firebaseio.com`,
        projectId,
        apiKey,
        appId
      };

      const res = await firebaseManager.testConnection(config);
      if (res.success) {
        alert('✅ Firebase Realtime Database への接続テストに成功しました！');
      } else {
        alert('❌ 接続テスト失敗: ' + (res.error || '通信エラー。ルールがテストモードになっているか確認してください。'));
      }
    });

    // Firebase設定解除
    this.container.querySelector('#btnClearFirebase')?.addEventListener('click', () => {
      if (confirm('Firebaseの設定を解除しますか？')) {
        firebaseManager.saveConfig(null);
        this.container.querySelector('#fbDatabaseUrl').value = '';
        this.container.querySelector('#fbProjectId').value = '';
        this.container.querySelector('#fbApiKey').value = '';
        this.container.querySelector('#fbAppId').value = '';
        this.container.querySelector('#fbConfigPasteArea').value = '';
        alert('Firebase設定を解除しました');
      }
    });

    // ルームID適用
    this.container.querySelector('#btnApplyRoomId')?.addEventListener('click', () => {
      const roomId = this.container.querySelector('#setRoomId').value.trim() || '1-16-pos';
      store.updateSettings({ roomId });
      p2p.init(roomId);
      if (firebaseManager.isReady()) {
        firebaseManager.setupDatabaseListeners();
      }
      this.renderQrCode();
      alert(`同期ルーム「${roomId}」を再接続しました`);
    });

    // 招待リンクコピー
    this.container.querySelector('#btnCopyInviteLink')?.addEventListener('click', () => {
      if (this.currentInviteUrl) {
        navigator.clipboard.writeText(this.currentInviteUrl).then(() => {
          alert('参加URLをコピーしました！別端末のブラウザで開いてください。');
        });
      }
    });

    // 売上クリア
    this.container.querySelector('#btnResetSalesOnly')?.addEventListener('click', async () => {
      if (confirm('【確認】売上履歴・会計データのみを削除しますか？\n※商品メニューは保持されます。')) {
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

import { store } from './state.js';

/**
 * Googleスプレッドシート（Google Apps Script）用テンプレートコード
 * ユーザーがシートの「拡張機能」→「Apps Script」にコピペして「ウェブアプリ」としてデプロイするだけで動くスクリプト
 */
export const GAS_TEMPLATE_CODE = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("レジ売上履歴") || ss.insertSheet("レジ売上履歴");
    
    // ヘッダーがなければ作成
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "日時",
        "注文番号",
        "端末名",
        "商品内訳",
        "合計金額(円)",
        "預かり金額(円)",
        "お釣り(円)",
        "決済方法",
        "注文ID"
      ]);
      // ヘッダー行の装飾
      var headerRange = sheet.getRange(1, 1, 1, 9);
      headerRange.setBackground("#f97316");
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
    }
    
    // アイテム内訳の文字列化
    var itemsSummary = (data.items || []).map(function(item) {
      return item.name + " x" + item.quantity + " (¥" + (item.price * item.quantity) + ")";
    }).join(", ");

    // 行の追加
    sheet.appendRow([
      data.formattedDate || new Date().toLocaleString("ja-JP"),
      data.orderNumber || "",
      data.terminal || "",
      itemsSummary,
      data.total || 0,
      data.received || 0,
      data.change || 0,
      data.paymentMethod || "現金",
      data.id || ""
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Recorded successfully"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("文化祭レジシステム GAS Webhook is Active!").setMimeType(ContentService.MimeType.TEXT);
}
`;

/**
 * 注文データをGASへ送信
 */
export async function sendOrderToGas(order) {
  const state = store.get();
  const gasUrl = state.gasUrl?.trim();

  if (!gasUrl) {
    return { success: false, reason: 'gas_url_not_configured' };
  }

  const payload = {
    ...order,
    formattedDate: new Date(order.timestamp).toLocaleString('ja-JP')
  };

  try {
    // GASはCORSリダイレクト(302)を返すため mode: 'no-cors' で送信するのがWebアプリの王道プラクティス
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('[GAS] 注文データをスプレッドシートに送信完了:', order.orderNumber);
    return { success: true };
  } catch (err) {
    console.error('[GAS] 送信失敗。未送信キューに保存します:', err);
    // 送信失敗時はキューに保存
    const queue = state.gasQueue || [];
    queue.push(payload);
    store.updateSettings({ gasQueue: queue });
    return { success: false, error: err };
  }
}

/**
 * 未送信キューの再試行
 */
export async function flushGasQueue() {
  const state = store.get();
  const queue = [...(state.gasQueue || [])];
  if (!state.gasUrl || queue.length === 0) return 0;

  let sentCount = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      await fetch(state.gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(item)
      });
      sentCount++;
    } catch (e) {
      remaining.push(item);
    }
  }

  store.updateSettings({ gasQueue: remaining });
  return sentCount;
}

/**
 * テスト送信（設定画面からワンクリックでテスト確認）
 */
export async function testGasConnection(url) {
  if (!url) throw new Error('URLが入力されていません');

  const testPayload = {
    id: 'test_' + Date.now(),
    orderNumber: '#TEST',
    terminal: store.get().terminalName,
    items: [
      { name: '【テスト送信】チョコバナナクレープ', quantity: 1, price: 400 },
      { name: '【テスト送信】アイスラテ', quantity: 2, price: 250 }
    ],
    total: 900,
    received: 1000,
    change: 100,
    paymentMethod: '現金(テスト)',
    timestamp: new Date().toISOString(),
    formattedDate: new Date().toLocaleString('ja-JP')
  };

  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(testPayload)
  });

  return true;
}

// オンライン復帰時の自動再送リスナー
window.addEventListener('online', () => {
  flushGasQueue();
});

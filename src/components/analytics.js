import Chart from 'chart.js/auto';
import { store } from '../state.js';

export class AnalyticsComponent {
  constructor(container) {
    this.container = container;
    this.hourlyChart = null;
    this.categoryChart = null;
    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();

    // 状態変更の監視
    store.subscribe('order:created', () => this.refreshData());
    store.subscribe('order:remote_received', () => this.refreshData());
    store.subscribe('order:status_changed', () => this.refreshData());
    store.subscribe('sales:reset', () => this.refreshData());
  }

  render() {
    this.container.innerHTML = `
      <div class="analytics-container">
        <!-- 主要メトリクス -->
        <div class="stats-cards-grid">
          <div class="stat-metric-card">
            <span class="metric-title">💰 総売上金額</span>
            <span class="metric-value" id="statTotalSales">¥0</span>
          </div>
          <div class="stat-metric-card">
            <span class="metric-title">👥 総注文件数</span>
            <span class="metric-value" id="statTotalOrders">0 件</span>
          </div>
          <div class="stat-metric-card">
            <span class="metric-title">☕ 平均客単価</span>
            <span class="metric-value" id="statAverageCheck">¥0</span>
          </div>
          <div class="stat-metric-card">
            <span class="metric-title">📦 総販売点数</span>
            <span class="metric-value" id="statTotalItemsSold">0 個</span>
          </div>
        </div>

        <!-- グラフエリア -->
        <div class="charts-row-grid">
          <div class="chart-card">
            <div class="chart-header">📈 時間帯別 売上推移</div>
            <div style="position: relative; height: 260px;">
              <canvas id="hourlySalesChart"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">🍰 カテゴリ別 売上シェア</div>
            <div style="position: relative; height: 260px;">
              <canvas id="categorySalesChart"></canvas>
            </div>
          </div>
        </div>

        <!-- 商品別売上ランキング -->
        <div class="chart-card">
          <div class="chart-header">🏆 商品別 売上ランキング</div>
          <div class="ranking-list" id="productsRankingList"></div>
        </div>

        <!-- 注文履歴テーブル -->
        <div class="history-table-container">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="font-size: 1.1rem; font-weight: 800;">📋 会計履歴一覧</h3>
            <button class="btn-secondary" id="btnExportCsv">
              <span>📥 CSVエクスポート</span>
            </button>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>注文番号</th>
                <th>日時</th>
                <th>端末</th>
                <th>商品内訳</th>
                <th>合計金額</th>
                <th>お預かり</th>
                <th>お釣り</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody id="ordersHistoryTableBody"></tbody>
          </table>
        </div>
      </div>
    `;

    this.initCharts();
    this.refreshData();
  }

  initCharts() {
    const hourlyCanvas = this.container.querySelector('#hourlySalesChart');
    const categoryCanvas = this.container.querySelector('#categorySalesChart');

    if (hourlyCanvas) {
      this.hourlyChart = new Chart(hourlyCanvas, {
        type: 'bar',
        data: {
          labels: ['9時', '10時', '11時', '12時', '13時', '14時', '15時', '16時'],
          datasets: [{
            label: '売上金額 (円)',
            data: [0, 0, 0, 0, 0, 0, 0, 0],
            backgroundColor: 'rgba(234, 88, 12, 0.7)',
            borderColor: '#ea580c',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (val) => '¥' + val.toLocaleString() }
            }
          }
        }
      });
    }

    if (categoryCanvas) {
      this.categoryChart = new Chart(categoryCanvas, {
        type: 'doughnut',
        data: {
          labels: ['クレープ', 'ワッフル', 'タピオカ', 'ドリンク'],
          datasets: [{
            data: [1, 1, 1, 1],
            backgroundColor: ['#f59e0b', '#d97706', '#78350f', '#059669'],
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }
  }

  refreshData() {
    const orders = store.get().orders || [];
    const products = store.get().products || [];
    const categories = store.get().categories || [];

    // メトリクス集計
    const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalOrders = orders.length;
    const avgCheck = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;
    
    let totalItemsCount = 0;
    const productStats = {}; // prodId -> { name, emoji, count, amount }
    const categoryStats = {}; // catId -> amount
    const hourlySales = { 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0 };

    orders.forEach((order) => {
      // 時間帯集計
      const hour = new Date(order.timestamp).getHours();
      if (hourlySales[hour] !== undefined) {
        hourlySales[hour] += order.total || 0;
      }

      (order.items || []).forEach((item) => {
        totalItemsCount += item.quantity;

        // 商品別
        if (!productStats[item.id]) {
          productStats[item.id] = {
            name: item.name,
            emoji: item.emoji || '🍽️',
            count: 0,
            amount: 0
          };
        }
        productStats[item.id].count += item.quantity;
        productStats[item.id].amount += item.price * item.quantity;

        // カテゴリ別
        const prod = products.find((p) => p.id === item.id);
        const cat = prod?.category || 'other';
        categoryStats[cat] = (categoryStats[cat] || 0) + item.price * item.quantity;
      });
    });

    // メトリクス表示更新
    this.container.querySelector('#statTotalSales').textContent = `¥${totalSales.toLocaleString()}`;
    this.container.querySelector('#statTotalOrders').textContent = `${totalOrders.toLocaleString()} 件`;
    this.container.querySelector('#statAverageCheck').textContent = `¥${avgCheck.toLocaleString()}`;
    this.container.querySelector('#statTotalItemsSold').textContent = `${totalItemsCount.toLocaleString()} 個`;

    // グラフ更新: 時間帯別
    if (this.hourlyChart) {
      const hoursLabels = ['9時', '10時', '11時', '12時', '13時', '14時', '15時', '16時'];
      const hoursData = [9, 10, 11, 12, 13, 14, 15, 16].map((h) => hourlySales[h] || 0);
      this.hourlyChart.data.labels = hoursLabels;
      this.hourlyChart.data.datasets[0].data = hoursData;
      this.hourlyChart.update();
    }

    // グラフ更新: カテゴリ別
    if (this.categoryChart) {
      const catLabels = [];
      const catData = [];
      const catColors = ['#f59e0b', '#d97706', '#78350f', '#059669', '#3b82f6', '#ec4899'];

      categories.filter((c) => c.id !== 'all').forEach((c) => {
        catLabels.push(c.name);
        catData.push(categoryStats[c.id] || 0);
      });

      if (catData.every((v) => v === 0)) {
        this.categoryChart.data.labels = ['データなし'];
        this.categoryChart.data.datasets[0].data = [1];
        this.categoryChart.data.datasets[0].backgroundColor = ['#e2e8f0'];
      } else {
        this.categoryChart.data.labels = catLabels;
        this.categoryChart.data.datasets[0].data = catData;
        this.categoryChart.data.datasets[0].backgroundColor = catColors.slice(0, catLabels.length);
      }
      this.categoryChart.update();
    }

    // ランキング更新
    const rankingContainer = this.container.querySelector('#productsRankingList');
    const sortedProducts = Object.values(productStats).sort((a, b) => b.amount - a.amount);

    if (sortedProducts.length === 0) {
      rankingContainer.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 1rem;">販売データがまだありません</div>';
    } else {
      rankingContainer.innerHTML = sortedProducts.slice(0, 5).map((p, index) => `
        <div class="ranking-item">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="rank-badge ${index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : ''}">${index + 1}</span>
            <span style="font-size: 1.2rem;">${p.emoji}</span>
            <span style="font-weight: 700;">${p.name}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 1.25rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">${p.count} 個</span>
            <span style="font-weight: 800; color: var(--color-primary); min-width: 80px; text-align: right;">¥${p.amount.toLocaleString()}</span>
          </div>
        </div>
      `).join('');
    }

    // 履歴テーブル更新
    const tbody = this.container.querySelector('#ordersHistoryTableBody');
    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">会計データがありません</td></tr>';
    } else {
      tbody.innerHTML = orders.map((o) => {
        const itemsText = (o.items || []).map((it) => `${it.name}×${it.quantity}`).join(', ');
        const timeStr = new Date(o.timestamp).toLocaleString('ja-JP');
        const statusMap = {
          cooking: '<span style="color: #b45309; font-weight: 700;">🍳 調理中</span>',
          ready: '<span style="color: #059669; font-weight: 700;">🔔 呼出中</span>',
          delivered: '<span style="color: #64748b; font-weight: 600;">✅ 受渡済</span>'
        };

        return `
          <tr>
            <td><strong>${o.orderNumber}</strong></td>
            <td style="font-size: 0.8rem; color: var(--text-muted);">${timeStr}</td>
            <td>${o.terminal || 'レジ'}</td>
            <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${itemsText}</td>
            <td><strong>¥${(o.total || 0).toLocaleString()}</strong></td>
            <td>¥${(o.received || 0).toLocaleString()}</td>
            <td>¥${(o.change || 0).toLocaleString()}</td>
            <td>${statusMap[o.status] || o.status}</td>
          </tr>
        `;
      }).join('');
    }
  }

  setupEventListeners() {
    this.container.querySelector('#btnExportCsv')?.addEventListener('click', () => {
      this.exportCsv();
    });
  }

  exportCsv() {
    const orders = store.get().orders || [];
    if (orders.length === 0) {
      alert('エクスポートする注文履歴がありません');
      return;
    }

    const headers = ['注文番号', '日時', '端末', '合計金額', '預かり金額', 'お釣り', '商品内訳', 'ステータス'];
    const rows = orders.map((o) => {
      const itemsStr = (o.items || []).map((it) => `${it.name}*${it.quantity}`).join(' | ');
      return [
        o.orderNumber,
        `"${new Date(o.timestamp).toLocaleString('ja-JP')}"`,
        `"${o.terminal || ''}"`,
        o.total || 0,
        o.received || 0,
        o.change || 0,
        `"${itemsStr}"`,
        `"${o.status}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `文化祭レジ売上履歴_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

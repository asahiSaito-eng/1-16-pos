import { store } from '../state.js';
import { p2p } from '../p2p.js';
import { firebaseManager } from '../firebase.js';
import { playBeep } from '../sound.js';

export class MenuManagerComponent {
  constructor(container) {
    this.container = container;
    this.editingProductId = null;
    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();

    store.subscribe('products:updated', () => this.renderProductsTable());
    store.subscribe('stock:updated', () => this.renderProductsTable());
  }

  render() {
    this.container.innerHTML = `
      <div class="menu-editor-container">
        <!-- ツールバー -->
        <div class="menu-mgmt-toolbar">
          <div>
            <h2 style="font-size: 1.25rem; font-weight: 800;">🍰 商品・メニュー管理</h2>
            <p style="font-size: 0.85rem; color: var(--text-muted);">商品の追加・価格変更・在庫の補充ができます</p>
          </div>
          <div>
            <button class="btn-primary" id="btnAddNewProduct">
              <span>＋ 新しい商品を追加</span>
            </button>
          </div>
        </div>

        <!-- テーブルカード -->
        <div class="products-mgmt-table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>アイコン</th>
                <th>商品名</th>
                <th>カテゴリ</th>
                <th>価格 (税込)</th>
                <th>現在の在庫</th>
                <th>クイック補充</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="productsTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- 商品追加・編集モーダル -->
      <div class="modal-overlay" id="productFormModal">
        <div class="checkout-modal-card">
          <div class="modal-header">
            <h3 id="productModalTitle">商品の追加</h3>
            <button class="modal-close-btn" id="btnCloseProductModal">&times;</button>
          </div>
          <form id="productEditForm" class="checkout-modal-body">
            <input type="hidden" id="formProductId" />

            <div class="form-group">
              <label for="formProductName">商品名 *</label>
              <input type="text" id="formProductName" class="form-input" required placeholder="例: チョコバナナクレープ" />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
              <div class="form-group">
                <label for="formProductCategory">カテゴリ *</label>
                <select id="formProductCategory" class="form-select" required></select>
              </div>

              <div class="form-group">
                <label for="formProductPrice">価格 (円) *</label>
                <input type="number" id="formProductPrice" class="form-input" min="0" step="10" required placeholder="例: 400" />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
              <div class="form-group">
                <label for="formProductStock">在庫数 (空欄で無制限)</label>
                <input type="number" id="formProductStock" class="form-input" min="0" placeholder="例: 50" />
              </div>

              <div class="form-group">
                <label for="formProductEmoji">絵文字アイコン</label>
                <input type="text" id="formProductEmoji" class="form-input" placeholder="例: 🍫🍌" />
              </div>
            </div>

            <div class="form-group">
              <label for="formProductDesc">説明・トッピング</label>
              <input type="text" id="formProductDesc" class="form-input" placeholder="例: 焼きたてモチモチ生地" />
            </div>

            <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
              <button type="button" class="btn-secondary" style="flex: 1; justify-content: center;" id="btnCancelProductEdit">キャンセル</button>
              <button type="submit" class="btn-primary" style="flex: 2; justify-content: center;">保存する</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.renderProductsTable();
  }

  renderProductsTable() {
    const tbody = this.container.querySelector('#productsTableBody');
    if (!tbody) return;
    const state = store.get();
    const products = state.products || [];
    const categories = state.categories || [];

    tbody.innerHTML = products.map((prod) => {
      const cat = categories.find((c) => c.id === prod.category);
      const isSoldOut = typeof prod.stock === 'number' && prod.stock <= 0;

      return `
        <tr data-id="${prod.id}">
          <td style="font-size: 1.5rem;">${prod.emoji || '🍽️'}</td>
          <td>
            <strong>${prod.name}</strong>
            ${isSoldOut ? '<span class="sold-out-badge" style="position: static; margin-left: 0.5rem; display: inline-block;">売切</span>' : ''}
            <div style="font-size: 0.75rem; color: var(--text-muted);">${prod.description || ''}</div>
          </td>
          <td>${cat ? cat.name : prod.category}</td>
          <td><strong style="color: var(--color-primary);">¥${prod.price.toLocaleString()}</strong></td>
          <td>
            <span style="font-weight: 700; ${isSoldOut ? 'color: var(--color-accent-red);' : ''}">
              ${typeof prod.stock === 'number' ? `${prod.stock} 個` : '無制限'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 0.35rem;">
              <button class="btn-secondary btn-stock-adjust" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" data-id="${prod.id}" data-delta="10">+10</button>
              <button class="btn-secondary btn-stock-adjust" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" data-id="${prod.id}" data-delta="50">+50</button>
              <button class="btn-secondary btn-stock-adjust" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" data-id="${prod.id}" data-delta="-5">−5</button>
            </div>
          </td>
          <td>
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn-secondary btn-edit-prod" style="padding: 0.25rem 0.6rem; font-size: 0.8rem;" data-id="${prod.id}">編集</button>
              <button class="btn-secondary btn-del-prod" style="padding: 0.25rem 0.6rem; font-size: 0.8rem; color: var(--color-accent-red);" data-id="${prod.id}">削除</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // クイック在庫増減
    tbody.querySelectorAll('.btn-stock-adjust').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const delta = parseInt(btn.dataset.delta, 10);
        const prod = products.find((p) => p.id === id);
        if (prod) {
          const currentStock = typeof prod.stock === 'number' ? prod.stock : 0;
          const newStock = Math.max(0, currentStock + delta);
          store.updateStock(id, newStock);
          const updatedProds = store.get().products;
          firebaseManager.syncProducts(updatedProds);
          p2p.broadcastStock(updatedProds);
          playBeep();
        }
      });
    });

    // 編集
    tbody.querySelectorAll('.btn-edit-prod').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openEditModal(btn.dataset.id);
      });
    });

    // 削除
    tbody.querySelectorAll('.btn-del-prod').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const prod = products.find((p) => p.id === id);
        if (confirm(`商品「${prod?.name}」を削除してもよろしいですか？`)) {
          store.deleteProduct(id);
          const updatedProds = store.get().products;
          firebaseManager.syncProducts(updatedProds);
          p2p.broadcastStock(updatedProds);
        }
      });
    });
  }

  setupEventListeners() {
    this.container.querySelector('#btnAddNewProduct')?.addEventListener('click', () => {
      this.openAddModal();
    });

    this.container.querySelector('#btnCloseProductModal')?.addEventListener('click', () => {
      this.closeModal();
    });

    this.container.querySelector('#btnCancelProductEdit')?.addEventListener('click', () => {
      this.closeModal();
    });

    this.container.querySelector('#productEditForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveProductForm();
    });
  }

  populateCategorySelect(selectedCatId) {
    const select = this.container.querySelector('#formProductCategory');
    const categories = store.get().categories.filter((c) => c.id !== 'all');
    select.innerHTML = categories.map((c) => `
      <option value="${c.id}" ${c.id === selectedCatId ? 'selected' : ''}>${c.name}</option>
    `).join('');
  }

  openAddModal() {
    this.editingProductId = null;
    this.container.querySelector('#productModalTitle').textContent = '新しい商品を追加';
    this.container.querySelector('#formProductId').value = '';
    this.container.querySelector('#formProductName').value = '';
    this.container.querySelector('#formProductPrice').value = '';
    this.container.querySelector('#formProductStock').value = '50';
    this.container.querySelector('#formProductEmoji').value = '🍰';
    this.container.querySelector('#formProductDesc').value = '';

    this.populateCategorySelect('crepe');
    this.container.querySelector('#productFormModal').classList.add('active');
  }

  openEditModal(productId) {
    this.editingProductId = productId;
    const prod = store.get().products.find((p) => p.id === productId);
    if (!prod) return;

    this.container.querySelector('#productModalTitle').textContent = '商品の編集';
    this.container.querySelector('#formProductId').value = prod.id;
    this.container.querySelector('#formProductName').value = prod.name;
    this.container.querySelector('#formProductPrice').value = prod.price;
    this.container.querySelector('#formProductStock').value = typeof prod.stock === 'number' ? prod.stock : '';
    this.container.querySelector('#formProductEmoji').value = prod.emoji || '';
    this.container.querySelector('#formProductDesc').value = prod.description || '';

    this.populateCategorySelect(prod.category);
    this.container.querySelector('#productFormModal').classList.add('active');
  }

  closeModal() {
    this.container.querySelector('#productFormModal').classList.remove('active');
  }

  saveProductForm() {
    const id = this.editingProductId || 'prod_' + Date.now();
    const name = this.container.querySelector('#formProductName').value.trim();
    const category = this.container.querySelector('#formProductCategory').value;
    const price = parseInt(this.container.querySelector('#formProductPrice').value, 10);
    const stockRaw = this.container.querySelector('#formProductStock').value;
    const stock = stockRaw === '' ? null : Math.max(0, parseInt(stockRaw, 10));
    const emoji = this.container.querySelector('#formProductEmoji').value.trim() || '🍽️';
    const description = this.container.querySelector('#formProductDesc').value.trim();

    const productData = {
      id,
      name,
      category,
      price,
      stock,
      emoji,
      description
    };

    store.updateProduct(productData);
    const updatedProds = store.get().products;
    firebaseManager.syncProducts(updatedProds);
    p2p.broadcastStock(updatedProds);
    this.closeModal();
  }
}

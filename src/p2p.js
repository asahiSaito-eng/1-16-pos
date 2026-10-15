import Peer from 'peerjs';
import QRCode from 'qrcode';
import { store } from './state.js';
import { playDingDong, playPop } from './sound.js';

class P2PManager {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.peerId = null;
    this.roomId = '1-16-pos';
    this.statusListeners = new Set();
    this.status = 'disconnected'; // disconnected, connecting, connected
  }

  init(customRoomId) {
    if (customRoomId) {
      this.roomId = customRoomId;
    } else {
      this.roomId = store.get().roomId || '1-16-pos';
    }

    if (this.peer) {
      this.peer.destroy();
    }

    this.updateStatus('connecting');

    // ランダムなIDを生成
    const myId = `bunkasai-${this.roomId}-${Math.random().toString(36).substring(2, 8)}`;

    try {
      this.peer = new Peer(myId, {
        debug: 1
      });

      this.peer.on('open', (id) => {
        this.peerId = id;
        console.log('[P2P] Peer initialized with ID:', id);
        this.updateStatus('connected');
        this.autoDiscoverPeers();
      });

      this.peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.warn('[P2P] PeerJS error:', err);
        // エラーでもスタンドアロン運用は継続できる
      });

      this.peer.on('close', () => {
        this.updateStatus('disconnected');
      });
    } catch (e) {
      console.error('[P2P] Failed to initialize peer:', e);
      this.updateStatus('error');
    }
  }

  updateStatus(status) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status, this.getPeerCount()));
  }

  onStatusChange(cb) {
    this.statusListeners.add(cb);
    cb(this.status, this.getPeerCount());
    return () => this.statusListeners.delete(cb);
  }

  getPeerCount() {
    return this.connections.size;
  }

  handleIncomingConnection(conn) {
    conn.on('open', () => {
      console.log('[P2P] Connected to remote peer:', conn.peer);
      this.connections.set(conn.peer, conn);
      this.updateStatus('connected');

      // 新規接続してきた端末に、現在の注文一覧と在庫を共有
      const state = store.get();
      conn.send({
        type: 'INITIAL_SYNC',
        data: {
          orders: state.orders,
          products: state.products
        }
      });
    });

    conn.on('data', (data) => {
      this.handleReceivedData(data, conn);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.updateStatus(this.connections.size > 0 ? 'connected' : 'standby');
    });

    conn.on('error', () => {
      this.connections.delete(conn.peer);
    });
  }

  connectToPeer(targetPeerId) {
    if (!this.peer || this.peer.destroyed || this.connections.has(targetPeerId)) return;

    try {
      const conn = this.peer.connect(targetPeerId, { reliable: true });
      conn.on('open', () => {
        console.log('[P2P] Successfully connected out to:', targetPeerId);
        this.connections.set(targetPeerId, conn);
        this.updateStatus('connected');
      });

      conn.on('data', (data) => {
        this.handleReceivedData(data, conn);
      });

      conn.on('close', () => {
        this.connections.delete(targetPeerId);
        this.updateStatus(this.connections.size > 0 ? 'connected' : 'standby');
      });
    } catch (e) {
      console.warn('[P2P] Connect error to', targetPeerId, e);
    }
  }

  handleReceivedData(payload, fromConn) {
    if (!payload || !payload.type) return;

    switch (payload.type) {
      case 'NEW_ORDER':
        console.log('[P2P] Remote order received:', payload.data);
        store.mergeRemoteOrder(payload.data);
        playDingDong(); // 厨房モニターや他レジへの着信音
        break;

      case 'ORDER_STATUS':
        console.log('[P2P] Remote status update:', payload.orderId, payload.status);
        store.mergeRemoteOrderStatus(payload.orderId, payload.status);
        playPop();
        break;

      case 'STOCK_SYNC':
        if (payload.products) {
          store.setProducts(payload.products);
        }
        break;

      case 'INITIAL_SYNC':
        console.log('[P2P] Initial sync received');
        if (payload.data?.orders) {
          payload.data.orders.forEach((ord) => store.mergeRemoteOrder(ord));
        }
        if (payload.data?.products) {
          store.setProducts(payload.data.products);
        }
        break;
    }
  }

  broadcast(message) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }

  // 注文ブロードキャスト
  broadcastOrder(order) {
    this.broadcast({
      type: 'NEW_ORDER',
      data: order
    });
  }

  // 厨房ステータスブロードキャスト
  broadcastStatus(orderId, status) {
    this.broadcast({
      type: 'ORDER_STATUS',
      orderId,
      status
    });
  }

  // 在庫同期ブロードキャスト
  broadcastStock(products) {
    this.broadcast({
      type: 'STOCK_SYNC',
      products
    });
  }

  // 同一ブラウザの別タブ同期（BroadcastChannel）
  setupBroadcastChannel() {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(`bunkasai_${this.roomId}`);
      channel.onmessage = (event) => {
        this.handleReceivedData(event.data);
      };

      // 内部イベントをBroadcastChannelにも流す
      const originalBroadcast = this.broadcast.bind(this);
      this.broadcast = (msg) => {
        originalBroadcast(msg);
        try {
          channel.postMessage(msg);
        } catch (e) {}
      };
    }
  }

  // 招待用QRコード生成（DataURL）
  async generateInviteQR(elementId) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    if (this.peerId) {
      url.searchParams.set('connect', this.peerId);
    }

    try {
      const qrDataUrl = await QRCode.toDataURL(url.toString(), {
        width: 220,
        margin: 1,
        color: {
          dark: '#1e293b',
          light: '#ffffff'
        }
      });
      return { qrDataUrl, url: url.toString() };
    } catch (err) {
      console.error('QR code generation failed:', err);
      return null;
    }
  }

  autoDiscoverPeers() {
    // URLパラメータにconnectがあれば直接接続
    const params = new URLSearchParams(window.location.search);
    const targetPeer = params.get('connect');
    if (targetPeer && targetPeer !== this.peerId) {
      setTimeout(() => {
        this.connectToPeer(targetPeer);
      }, 500);
    }
  }
}

export const p2p = new P2PManager();

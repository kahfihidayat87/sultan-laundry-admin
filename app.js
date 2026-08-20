// ===== The Sultan Laundry — Dashboard Admin =====

const CONFIG = {
  API_BASE_URL: "https://sultan-laundry-backend.vercel.app",
};

const STAGES = {
  1: "Menunggu Konfirmasi", 2: "Dijemput Kurir", 3: "Tiba di Outlet",
  4: "Verifikasi & Penimbangan", 5: "Proses Cuci", 6: "QC", 7: "Siap Diantar", 8: "Selesai",
};

const fmt = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

const state = {
  screen: "login",
  page: "summary", // summary | orders | customers | payments | master-data
  token: load("sla_token", null),
  user: load("sla_user", null),
  errorMsg: "",
  loading: false,

  summary: null,
  orders: [],
  orderFilter: "all",
  selectedOrderId: null,
  selectedOrder: null,
  verifyInputs: {},

  pendingProofs: [],

  customers: [],
  customerSearch: "",
  selectedCustomerId: null,
  selectedCustomer: null,

  masterData: null,
  paymentSettings: [],
};

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function persist(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// Kompres foto sebelum jadi base64 — backend (Vercel) punya batas keras 4.5MB/request.
function compressImage(file, maxWidth = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
  const base = CONFIG.API_BASE_URL.replace(/\/+$/, ""); // buang trailing slash, cegah "//api/..."
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan.");
  return data;
}

function render() {
  document.getElementById("app").innerHTML = state.screen === "login" ? screenLogin() : screenDashboard();
  bindEvents();
}

// ===================== LOGIN =====================
function screenLogin() {
  return `
  <div class="login-wrap">
    <img src="icons/logo-full.png" alt="The Sultan Laundry" style="display:block;margin:0 auto 20px;width:130px" />
    <p class="eyebrow serif" style="color:var(--teal-bright);font-style:italic">Dashboard Admin</p>
    ${state.errorMsg ? `<div class="notice error">${state.errorMsg}</div>` : ""}
    <label class="field-label">Nomor WA / Email</label>
    <input type="text" id="login-id" placeholder="admin@sultanlaundry.id" />
    <div style="height:12px"></div>
    <label class="field-label">Password</label>
    <input type="password" id="login-pw" placeholder="Password" />
    <div style="height:18px"></div>
    <button class="btn-primary full" data-action="do-login">${state.loading ? "Memproses..." : "Masuk"}</button>
  </div>`;
}

async function doLogin() {
  const identifier = document.getElementById("login-id").value.trim();
  const password = document.getElementById("login-pw").value;
  if (!identifier || !password) { state.errorMsg = "Isi identifier & password."; render(); return; }
  state.loading = true; render();
  try {
    const data = await api("/api/auth/login", { method: "POST", auth: false, body: { identifier, password } });
    if (!["admin", "owner"].includes(data.user.role)) {
      throw new Error("Akun ini bukan Admin/Owner, tidak bisa masuk dashboard.");
    }
    state.token = data.token; state.user = data.user;
    persist("sla_token", data.token); persist("sla_user", data.user);
    await goPage("summary");
  } catch (err) {
    state.errorMsg = err.message;
  } finally {
    state.loading = false; render();
  }
}

function doLogout() {
  localStorage.removeItem("sla_token"); localStorage.removeItem("sla_user");
  state.token = null; state.user = null; state.screen = "login";
  render();
}

// ===================== DASHBOARD SHELL =====================
function screenDashboard() {
  return `
  <div class="layout">
    <div class="sidebar">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:2px">
        <img src="icons/icon-square.png" alt="" style="width:28px;height:28px" />
        <h1 class="serif">The Sultan Laundry</h1>
      </div>
      <p class="role-tag">${state.user?.name || ""} · ${state.user?.role}</p>
      <button class="nav-item ${state.page === "summary" ? "active" : ""}" data-action="page:summary">Ringkasan</button>
      <button class="nav-item ${state.page === "orders" ? "active" : ""}" data-action="page:orders">Order</button>
      <button class="nav-item ${state.page === "customers" ? "active" : ""}" data-action="page:customers">Pelanggan</button>
      <button class="nav-item ${state.page === "payments" ? "active" : ""}" data-action="page:payments">Verifikasi Pembayaran</button>
      <button class="nav-item ${state.page === "master-data" ? "active" : ""}" data-action="page:master-data">Master Data</button>
      <div style="height:24px"></div>
      <button class="nav-item" data-action="do-logout" style="color:var(--red)">Keluar</button>
    </div>
    <div class="content">
      ${state.errorMsg ? `<div class="notice error">${state.errorMsg}</div>` : ""}
      ${state.page === "summary" ? renderSummary() : ""}
      ${state.page === "orders" ? renderOrders() : ""}
      ${state.page === "customers" ? renderCustomers() : ""}
      ${state.page === "payments" ? renderPayments() : ""}
      ${state.page === "master-data" ? renderMasterData() : ""}
    </div>
  </div>
  ${state.selectedOrderId ? renderOrderModal() : ""}
  ${state.selectedCustomerId ? renderCustomerModal() : ""}`;
}

async function goPage(page) {
  state.page = page; state.errorMsg = ""; state.screen = "dashboard";
  if (page === "summary") await loadSummary();
  if (page === "orders") await loadOrders();
  if (page === "customers") await loadCustomers();
  if (page === "payments") await loadPendingProofs();
  if (page === "master-data") await loadMasterData();
  render();
}

// ===================== RINGKASAN =====================
async function loadSummary() {
  try { state.summary = await api("/api/admin/summary"); } catch (err) { state.errorMsg = err.message; }
}

function renderSummary() {
  const s = state.summary;
  if (!s) return `<p class="empty-state">Memuat...</p>`;
  return `
  <h2 class="page-title">Ringkasan Hari Ini</h2>
  <div class="stat-grid">
    <div class="stat-card"><p class="label">Omzet Hari Ini (Lunas)</p><p class="value">${fmt(s.todayRevenue)}</p></div>
    <div class="stat-card"><p class="label">Bukti Bayar Menunggu</p><p class="value">${s.pendingPaymentProofs}</p></div>
    <div class="stat-card"><p class="label">Order Terlambat (&gt;3 hari)</p><p class="value">${s.overdueOrders}</p></div>
    <div class="stat-card"><p class="label">Total Order Aktif</p><p class="value">${Object.entries(s.statusCounts).filter(([k]) => k !== "8").reduce((a, [, v]) => a + v, 0)}</p></div>
  </div>
  <p class="section-title">Order per Tahap</p>
  <div class="status-grid">
    ${Object.entries(s.statusLabels).map(([k, label]) => `
      <div class="status-box"><div class="n">${s.statusCounts[k] || 0}</div><div class="l">${label}</div></div>
    `).join("")}
  </div>`;
}

// ===================== ORDERS =====================
async function loadOrders() {
  try {
    const q = state.orderFilter === "all" ? "" : `?status=${state.orderFilter}`;
    const data = await api(`/api/orders${q}`);
    state.orders = data.orders;
  } catch (err) { state.errorMsg = err.message; }
}

function renderOrders() {
  return `
  <h2 class="page-title">Daftar Order</h2>
  <div class="tabs">
    <button class="tab ${state.orderFilter === "all" ? "active" : ""}" data-action="filter-orders" data-status="all">Semua</button>
    ${Object.entries(STAGES).map(([k, label]) => `
      <button class="tab ${state.orderFilter === k ? "active" : ""}" data-action="filter-orders" data-status="${k}">${label}</button>
    `).join("")}
  </div>
  ${state.orders.length === 0 ? `<p class="empty-state">Tidak ada order.</p>` : `
  <table>
    <thead><tr><th>ID</th><th>Status</th><th>Estimasi</th><th>Final</th><th>Bayar</th><th>Dibuat</th></tr></thead>
    <tbody>
      ${state.orders.map((o) => `
        <tr class="clickable" data-action="open-order" data-id="${o.id}">
          <td>#${o.id}</td>
          <td><span class="pill">${STAGES[o.status]}</span></td>
          <td>${fmt(o.estimated_total_price)}</td>
          <td>${o.final_total_price !== null ? fmt(o.final_total_price) : "—"}</td>
          <td><span class="pill ${o.payment_status}">${o.payment_status === "paid" ? "Lunas" : "Belum"}</span></td>
          <td>${new Date(o.created_at).toLocaleString("id-ID")}</td>
        </tr>`).join("")}
    </tbody>
  </table>`}`;
}

async function openOrder(id) {
  state.selectedOrderId = id;
  try {
    state.selectedOrder = await api(`/api/orders/${id}`);
    state.verifyInputs = {};
    state.selectedOrder.items.forEach((it) => { state.verifyInputs[it.id] = it.qty_verified ?? it.qty_input ?? ""; });
  } catch (err) { state.errorMsg = err.message; }
  render();
}

function closeOrderModal() { state.selectedOrderId = null; state.selectedOrder = null; render(); }

function renderOrderModal() {
  const o = state.selectedOrder;
  if (!o) return `<div class="overlay" data-action="close-modal"><div class="panel"><p>Memuat...</p></div></div>`;
  const order = o.order;
  const canVerify = order.status === 3; // status 4 = sudah pernah diverifikasi, tinggal menunggu konfirmasi selisih
  const needsDeviationConfirm = order.status === 4;
  const nextTransition = { 1: 2, 2: 3, 5: 6, 6: 7, 7: 8 }[order.status];

  return `
  <div class="overlay" data-action="close-modal">
    <div class="panel" data-action="stop-propagation">
      <div class="panel-header">
        <h3>Order #${order.id} — ${STAGES[order.status]}</h3>
        <button class="close-btn" data-action="close-modal">✕</button>
      </div>

      <p class="section-title">Item</p>
      ${o.items.map((it) => `
        <div class="item-row">
          <div>
            <div style="font-size:14px">${it.item_name}</div>
            <div style="font-size:11px;color:var(--text-faint)">${it.item_type === "satuan" ? "Satuan" : "Kiloan"} · ${it.duration_code}${it.perfume ? " · " + it.perfume : ""}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;color:var(--text-faint)">${it.item_type === "satuan" ? "pcs" : "kg"}</span>
            ${canVerify
              ? `<input type="number" step="0.1" min="0" data-verify-id="${it.id}" value="${state.verifyInputs[it.id] ?? ""}" />`
              : `<span>${it.qty_verified ?? it.qty_input ?? "-"}</span>`}
          </div>
        </div>`).join("")}

      ${order.final_total_price !== null ? `
        <p class="section-title">Ringkasan Harga</p>
        <div class="field-inline"><label>Estimasi</label><span>${fmt(order.estimated_total_price)}</span></div>
        <div class="field-inline"><label>Final</label><span style="color:var(--gold-bright)">${fmt(order.final_total_price)}</span></div>
        ${order.price_deviation_pct ? `<div class="field-inline"><label>Selisih</label><span>${order.price_deviation_pct}%</span></div>` : ""}
      ` : ""}

      ${canVerify ? `
        <button class="btn-primary full" style="margin-top:14px" data-action="submit-verify" data-id="${order.id}">
          ${state.loading ? "Memproses..." : "Simpan Verifikasi & Timbang"}
        </button>` : ""}

      ${needsDeviationConfirm ? `
        <div class="notice" style="margin-top:14px">
          Selisih harga <strong>${order.price_deviation_pct}%</strong> dari estimasi — menunggu konfirmasi pelanggan lewat app-nya.
          Kalau pelanggan sudah setuju lewat telepon/WA langsung, Admin bisa lanjutkan manual di sini (wajib isi catatan untuk jejak audit).
        </div>
        <textarea id="deviation-notes-${order.id}" placeholder="Contoh: Dikonfirmasi via WA jam 14:30, pelanggan setuju" rows="2"></textarea>
        <button class="btn-primary full" style="margin-top:10px" data-action="admin-confirm-deviation" data-id="${order.id}">
          ${state.loading ? "Memproses..." : "Konfirmasi & Lanjutkan ke Proses Cuci"}
        </button>` : ""}

      ${nextTransition ? `
        <button class="btn-secondary full" style="margin-top:10px" data-action="transition-status" data-id="${order.id}">
          Pindahkan ke: ${STAGES[nextTransition]}
        </button>` : ""}

      <p class="section-title">Alamat & Jadwal</p>
      <p style="font-size:13px;color:var(--text-dim);margin:0">${order.pickup_address}</p>
      <p style="font-size:13px;color:var(--text-dim);margin:2px 0 0">${order.scheduled_pickup_time}</p>
      ${order.pickup_location_pin ? `
        <a href="${order.pickup_location_pin}" target="_blank" rel="noopener" class="btn-secondary" style="display:inline-flex;margin-top:8px;text-decoration:none;font-size:13px">
          📍 Buka Pin Lokasi di Google Maps
        </a>` : `<p style="font-size:12px;color:var(--text-faint);margin-top:6px">Pelanggan tidak menandai pin lokasi.</p>`}

      <p class="section-title">Histori Status</p>
      ${o.history.map((h) => `
        <div style="font-size:12px;color:var(--text-dim);padding:4px 0;border-bottom:1px solid var(--border)">
          ${STAGES[h.status]} — ${new Date(h.timestamp).toLocaleString("id-ID")} ${h.notes ? `<br/><span style="color:var(--text-faint)">${h.notes}</span>` : ""}
        </div>`).join("")}
    </div>
  </div>`;
}

async function submitVerify(orderId) {
  const items = Object.entries(state.verifyInputs).map(([id, qtyVerified]) => ({ id: Number(id), qtyVerified: Number(qtyVerified) }));
  state.loading = true; render();
  try {
    await api(`/api/orders/${orderId}/verify`, { method: "POST", body: { items } });
    await openOrder(orderId);
    await loadOrders();
  } catch (err) {
    state.errorMsg = err.message;
  } finally {
    state.loading = false; render();
  }
}

async function transitionStatus(orderId) {
  try {
    await api(`/api/orders/${orderId}/status`, { method: "PATCH", body: {} });
    await openOrder(orderId);
    await loadOrders();
  } catch (err) { state.errorMsg = err.message; render(); }
}

async function adminConfirmDeviation(orderId) {
  const notes = document.getElementById(`deviation-notes-${orderId}`)?.value || "";
  if (!notes.trim()) { state.errorMsg = "Catatan wajib diisi (mis. cara & waktu konfirmasi ke pelanggan)."; render(); return; }
  state.loading = true; render();
  try {
    await api(`/api/orders/${orderId}/admin-confirm-deviation`, { method: "POST", body: { notes } });
    await openOrder(orderId);
    await loadOrders();
  } catch (err) {
    state.errorMsg = err.message;
  } finally {
    state.loading = false; render();
  }
}

// ===================== PEMBAYARAN =====================
async function loadPendingProofs() {
  try { const data = await api("/api/payment-proofs/pending"); state.pendingProofs = data.proofs; }
  catch (err) { state.errorMsg = err.message; }
}

function renderPayments() {
  return `
  <h2 class="page-title">Verifikasi Bukti Pembayaran</h2>
  ${state.pendingProofs.length === 0 ? `<p class="empty-state">Tidak ada bukti pembayaran menunggu review.</p>` : `
    ${state.pendingProofs.map((p) => `
      <div class="panel" style="margin-bottom:16px;max-width:none">
        <div class="panel-header">
          <h3>Order #${p.order_id} — ${p.customer_name}</h3>
          <span class="pill">${p.method === "qris" ? "QRIS" : "Transfer Bank"}</span>
        </div>
        <p style="font-size:13px;color:var(--text-dim)">Tagihan: <strong style="color:var(--gold-bright)">${fmt(p.final_total_price)}</strong></p>
        <img class="proof-img" src="${p.image_base64}" alt="Bukti pembayaran" />
        <textarea id="notes-${p.id}" placeholder="Catatan (opsional, wajib jika ditolak)" rows="2"></textarea>
        <div style="display:flex;gap:10px;margin-top:10px">
          <button class="btn-primary" data-action="review-proof" data-id="${p.id}" data-decision="approved">Setujui</button>
          <button class="btn-danger" data-action="review-proof" data-id="${p.id}" data-decision="rejected">Tolak</button>
        </div>
      </div>`).join("")}
  `}`;
}

async function reviewProof(id, decision) {
  const notes = document.getElementById(`notes-${id}`)?.value || "";
  if (decision === "rejected" && !notes) { state.errorMsg = "Catatan wajib diisi saat menolak bukti pembayaran."; render(); return; }
  try {
    await api(`/api/payment-proofs/${id}/review`, { method: "POST", body: { decision, notes } });
    await loadPendingProofs();
    render();
  } catch (err) { state.errorMsg = err.message; render(); }
}

// ===================== PELANGGAN =====================
async function loadCustomers() {
  try {
    const q = state.customerSearch ? `?search=${encodeURIComponent(state.customerSearch)}` : "";
    const data = await api(`/api/admin/customers${q}`);
    state.customers = data.customers;
  } catch (err) { state.errorMsg = err.message; }
}

function renderCustomers() {
  return `
  <h2 class="page-title">Pelanggan</h2>
  <input type="text" id="customer-search" placeholder="Cari nama, nomor WA, atau email..." value="${state.customerSearch}" style="margin-bottom:18px" />
  ${state.customers.length === 0 ? `<p class="empty-state">Tidak ada pelanggan ditemukan.</p>` : `
  <table>
    <thead><tr><th>Nama</th><th>Nomor WA</th><th>Membership</th><th>Deposit</th><th>Poin</th><th>Order</th></tr></thead>
    <tbody>
      ${state.customers.map((c) => `
        <tr class="clickable" data-action="open-customer" data-id="${c.id}">
          <td>${c.name}</td>
          <td>${c.phone || "-"}</td>
          <td><span class="pill">${c.membership_tier || "Reguler"}</span></td>
          <td>${fmt(c.deposit_balance)}</td>
          <td>${c.loyalty_points} pts</td>
          <td>${c.total_orders}</td>
        </tr>`).join("")}
    </tbody>
  </table>`}`;
}

async function openCustomer(id) {
  state.selectedCustomerId = id;
  try { state.selectedCustomer = await api(`/api/admin/customers/${id}`); }
  catch (err) { state.errorMsg = err.message; }
  render();
}

function closeCustomerModal() { state.selectedCustomerId = null; state.selectedCustomer = null; render(); }

function renderCustomerModal() {
  const d = state.selectedCustomer;
  if (!d) return `<div class="overlay" data-action="close-modal-customer"><div class="panel"><p>Memuat...</p></div></div>`;
  const c = d.customer;

  return `
  <div class="overlay" data-action="close-modal-customer">
    <div class="panel" data-action="stop-propagation">
      <div class="panel-header">
        <h3>${c.name}</h3>
        <button class="close-btn" data-action="close-modal-customer">✕</button>
      </div>

      <p style="font-size:13px;color:var(--text-dim);margin:0 0 4px">${c.phone || "-"} ${c.email ? "· " + c.email : ""}</p>
      <p style="font-size:12px;color:var(--text-faint);margin:0 0 20px">Bergabung ${new Date(c.created_at).toLocaleDateString("id-ID")}</p>

      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px">
        <div class="stat-card"><p class="label">Membership</p><p class="value" style="font-size:16px">${c.membership_tier || "Reguler"}</p></div>
        <div class="stat-card"><p class="label">Saldo Deposit</p><p class="value" style="font-size:16px">${fmt(c.deposit_balance)}</p></div>
        <div class="stat-card"><p class="label">Loyalty Point</p><p class="value" style="font-size:16px">${c.loyalty_points} pts</p></div>
      </div>

      <p class="section-title">Ubah Membership</p>
      <div class="field-inline">
        <select id="membership-tier-${c.id}">
          ${["Reguler", "Silver", "Gold", "Platinum", "Sultan Gold"].map((t) => `<option value="${t}" ${c.membership_tier === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <button class="btn-secondary btn-sm" data-action="save-membership" data-id="${c.id}">Simpan</button>
      </div>

      <p class="section-title">Kelola Deposit</p>
      <div class="field-inline">
        <input type="number" min="1" id="deposit-amount-${c.id}" placeholder="Nominal (Rp)" />
        <select id="deposit-type-${c.id}" style="max-width:140px">
          <option value="topup">Tambah (Topup)</option>
          <option value="deduction">Kurangi</option>
        </select>
      </div>
      <button class="btn-primary full" data-action="submit-deposit" data-id="${c.id}">
        ${state.loading ? "Memproses..." : "Simpan Perubahan Deposit"}
      </button>

      <p class="section-title">Histori Deposit</p>
      ${d.depositHistory.length === 0 ? `<p style="font-size:13px;color:var(--text-faint)">Belum ada transaksi.</p>` : d.depositHistory.map((t) => `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:${t.type === "topup" ? "var(--teal-bright)" : "var(--red)"}">${t.type === "topup" ? "+" : "-"} ${fmt(t.amount)}</span>
          <span style="color:var(--text-faint)">${new Date(t.timestamp).toLocaleString("id-ID")}</span>
        </div>`).join("")}

      <p class="section-title">Histori Loyalty Point</p>
      ${d.loyaltyHistory.length === 0 ? `<p style="font-size:13px;color:var(--text-faint)">Belum ada transaksi.</p>` : d.loyaltyHistory.map((t) => `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:${t.type === "earn" ? "var(--teal-bright)" : "var(--red)"}">${t.type === "earn" ? "+" : "-"} ${t.points} pts</span>
          <span style="color:var(--text-faint)">${new Date(t.timestamp).toLocaleString("id-ID")}</span>
        </div>`).join("")}

      <p class="section-title">Order Terakhir</p>
      ${d.recentOrders.length === 0 ? `<p style="font-size:13px;color:var(--text-faint)">Belum pernah order.</p>` : d.recentOrders.map((o) => `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
          <span>#${o.id} — ${STAGES[o.status]}</span>
          <span style="color:var(--text-faint)">${o.final_total_price !== null ? fmt(o.final_total_price) : fmt(o.estimated_total_price)}</span>
        </div>`).join("")}
    </div>
  </div>`;
}

async function saveMembership(id) {
  const membershipTier = document.getElementById(`membership-tier-${id}`).value;
  try {
    await api(`/api/admin/customers/${id}/membership`, { method: "PATCH", body: { membershipTier } });
    await openCustomer(id);
    await loadCustomers();
  } catch (err) { state.errorMsg = err.message; render(); }
}

async function submitDeposit(id) {
  const amount = document.getElementById(`deposit-amount-${id}`).value;
  const type = document.getElementById(`deposit-type-${id}`).value;
  if (!amount || Number(amount) <= 0) { state.errorMsg = "Isi nominal deposit yang valid."; render(); return; }
  state.loading = true; render();
  try {
    await api(`/api/admin/customers/${id}/deposit`, { method: "POST", body: { amount: Number(amount), type } });
    await openCustomer(id);
    await loadCustomers();
  } catch (err) {
    state.errorMsg = err.message;
  } finally {
    state.loading = false; render();
  }
}

// ===================== MASTER DATA =====================
async function loadMasterData() {
  try {
    state.masterData = await api("/api/master-data", { auth: false });
    const settings = await api("/api/payment-settings", { auth: false });
    state.paymentSettings = settings.paymentMethods;
  } catch (err) { state.errorMsg = err.message; }
}

function renderMasterData() {
  const md = state.masterData;
  if (!md) return `<p class="empty-state">Memuat...</p>`;
  const bank = state.paymentSettings.find((m) => m.method === "bank_transfer");
  const qris = state.paymentSettings.find((m) => m.method === "qris");

  return `
  <h2 class="page-title">Master Data & Pembayaran</h2>

  <p class="section-title">Item Satuan</p>
  ${md.items.map((i) => `
    <div class="master-row">
      <span style="font-size:14px">${i.name}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="item-${i.id}" value="${i.base_price}" />
        <button class="btn-secondary btn-sm" data-action="save-item" data-id="${i.id}">Simpan</button>
      </div>
    </div>`).join("")}

  <p class="section-title">Layanan Kiloan (per kg)</p>
  ${md.kiloanServices.map((s) => `
    <div class="master-row">
      <span style="font-size:14px">${s.name}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="kiloan-${s.id}" value="${s.price_per_kg}" />
        <button class="btn-secondary btn-sm" data-action="save-kiloan" data-id="${s.id}">Simpan</button>
      </div>
    </div>`).join("")}

  <p class="section-title">Durasi Pengerjaan — Multiplier Kiloan</p>
  <p style="font-size:12px;color:var(--text-faint);margin:-4px 0 10px">Harga/kg × multiplier ini = harga Kiloan per durasi.</p>
  ${md.durations.map((d) => `
    <div class="master-row">
      <span style="font-size:14px">${d.name} (${d.time_label})</span>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" step="0.1" id="dur-mult-${d.code}" value="${d.multiplier}" style="width:80px" />
        <button class="btn-secondary btn-sm" data-action="save-duration-mult" data-code="${d.code}">Simpan</button>
      </div>
    </div>`).join("")}

  <p class="section-title">Durasi Pengerjaan — Tambahan Satuan (Rp flat)</p>
  <p style="font-size:12px;color:var(--text-faint);margin:-4px 0 10px">Ditambahkan langsung ke harga/pcs Satuan per durasi (bukan dikali).</p>
  ${md.durations.map((d) => `
    <div class="master-row">
      <span style="font-size:14px">${d.name} (${d.time_label})</span>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" step="1000" id="dur-surcharge-${d.code}" value="${d.satuan_surcharge}" style="width:100px" />
        <button class="btn-secondary btn-sm" data-action="save-duration-surcharge" data-code="${d.code}">Simpan</button>
      </div>
    </div>`).join("")}

  <p class="section-title">Rekening Transfer</p>
  <div class="field-inline"><label>Bank</label><input type="text" id="bank-name" value="${bank?.bank_name || ""}" /></div>
  <div class="field-inline"><label>No. Rekening</label><input type="text" id="bank-number" value="${bank?.account_number || ""}" /></div>
  <div class="field-inline"><label>Atas Nama</label><input type="text" id="bank-holder" value="${bank?.account_holder || ""}" /></div>
  <button class="btn-secondary" data-action="save-bank" data-id="${bank?.id || ""}">Simpan Rekening</button>

  <p class="section-title">QRIS</p>
  ${qris?.qris_image_base64 ? `<img class="proof-img" style="max-width:200px" src="${qris.qris_image_base64}" />` : `<p style="font-size:13px;color:var(--text-faint)">Belum ada gambar QRIS.</p>`}
  <input type="file" id="qris-file" accept="image/*" style="margin:10px 0" />
  <br/>
  <button class="btn-secondary" data-action="save-qris" data-id="${qris?.id || ""}">Unggah / Ganti QRIS</button>
  `;
}

async function saveItem(id) {
  const val = document.getElementById(`item-${id}`).value;
  try { await api(`/api/master-data/items/${id}`, { method: "PATCH", body: { base_price: Number(val) } }); await loadMasterData(); render(); }
  catch (err) { state.errorMsg = err.message; render(); }
}
async function saveKiloan(id) {
  const val = document.getElementById(`kiloan-${id}`).value;
  try { await api(`/api/master-data/kiloan/${id}`, { method: "PATCH", body: { price_per_kg: Number(val) } }); await loadMasterData(); render(); }
  catch (err) { state.errorMsg = err.message; render(); }
}
async function saveDurationMult(code) {
  const val = document.getElementById(`dur-mult-${code}`).value;
  try { await api(`/api/master-data/durations/${code}`, { method: "PATCH", body: { multiplier: Number(val) } }); await loadMasterData(); render(); }
  catch (err) { state.errorMsg = err.message; render(); }
}
async function saveDurationSurcharge(code) {
  const val = document.getElementById(`dur-surcharge-${code}`).value;
  try { await api(`/api/master-data/durations/${code}`, { method: "PATCH", body: { satuanSurcharge: Number(val) } }); await loadMasterData(); render(); }
  catch (err) { state.errorMsg = err.message; render(); }
}
async function saveBank(id) {
  const bankName = document.getElementById("bank-name").value;
  const accountNumber = document.getElementById("bank-number").value;
  const accountHolder = document.getElementById("bank-holder").value;
  try { await api(`/api/payment-settings/${id}`, { method: "PATCH", body: { bankName, accountNumber, accountHolder } }); await loadMasterData(); render(); }
  catch (err) { state.errorMsg = err.message; render(); }
}
async function saveQris(id) {
  const file = document.getElementById("qris-file").files[0];
  if (!file) { state.errorMsg = "Pilih gambar QRIS dulu."; render(); return; }
  const base64 = await compressImage(file, 800, 0.85); // QRIS perlu tetap tajam agar bisa di-scan
  try { await api(`/api/payment-settings/${id}`, { method: "PATCH", body: { qrisImageBase64: base64 } }); await loadMasterData(); render(); }
  catch (err) { state.errorMsg = err.message; render(); }
}

// ===================== EVENTS =====================
function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (el.dataset.action === "stop-propagation") { e.stopPropagation(); return; }
      handleAction(e);
    });
  });
  document.querySelectorAll("[data-verify-id]").forEach((el) => {
    el.addEventListener("input", (e) => { state.verifyInputs[el.dataset.verifyId] = e.target.value; });
  });
  const searchInput = document.getElementById("customer-search");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.customerSearch = e.target.value;
      clearTimeout(window._customerSearchTimeout);
      window._customerSearchTimeout = setTimeout(async () => { await loadCustomers(); render(); }, 400);
    });
  }
}

async function handleAction(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;
  state.errorMsg = "";

  if (action === "do-login") return doLogin();
  if (action === "do-logout") return doLogout();
  if (action.startsWith("page:")) return goPage(action.split(":")[1]);
  if (action === "filter-orders") { state.orderFilter = el.dataset.status; await loadOrders(); render(); return; }
  if (action === "open-order") return openOrder(Number(el.dataset.id));
  if (action === "close-modal") return closeOrderModal();
  if (action === "submit-verify") return submitVerify(Number(el.dataset.id));
  if (action === "transition-status") return transitionStatus(Number(el.dataset.id));
  if (action === "admin-confirm-deviation") return adminConfirmDeviation(Number(el.dataset.id));
  if (action === "review-proof") return reviewProof(Number(el.dataset.id), el.dataset.decision);
  if (action === "open-customer") return openCustomer(Number(el.dataset.id));
  if (action === "close-modal-customer") return closeCustomerModal();
  if (action === "save-membership") return saveMembership(Number(el.dataset.id));
  if (action === "submit-deposit") return submitDeposit(Number(el.dataset.id));
  if (action === "save-item") return saveItem(el.dataset.id);
  if (action === "save-kiloan") return saveKiloan(el.dataset.id);
  if (action === "save-duration-mult") return saveDurationMult(el.dataset.code);
  if (action === "save-duration-surcharge") return saveDurationSurcharge(el.dataset.code);
  if (action === "save-bank") return saveBank(el.dataset.id);
  if (action === "save-qris") return saveQris(el.dataset.id);
}

// ===================== INIT =====================
(async function init() {
  if (state.token && state.user) {
    state.screen = "dashboard";
    await goPage("summary");
  } else {
    render();
  }
})();

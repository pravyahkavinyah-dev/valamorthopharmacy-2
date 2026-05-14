/* ============================================================
   PharmaPOS — Application Logic (Part 1: Config, Auth, Navigation)
   ============================================================ */

// --- Configuration ---
const CONFIG = {
  SUPABASE_URL: 'https://ppeoqowojyagmatzxpbt.supabase.co', // Set your Supabase URL
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZW9xb3dvanlhZ21hdHp4cGJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NDUzNjMsImV4cCI6MjA5NDMyMTM2M30.1HvmpNUMnf_QYxAlsVzLs3fxa3Ob3_tU7RAt5-LOOv8', // Set your Supabase anon key
  API_URL: 'https://valamorthopharmacy-2.vercel.app',      // Set your Vercel backend URL
  DEMO_MODE: false   // Toggle demo mode with mock data
};

// --- State ---
const STATE = {
  user: null,
  cart: [],
  currentPage: 'dashboard',
  medicines: [],
  inventory: [],
  sales: [],
  purchases: [],
  shortBook: [],
  billCounter: 1
};

// --- Toast Notifications ---
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// --- Authentication ---
function handleLogin() {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-pass').value;
  const errEl = document.getElementById('auth-error');
  errEl.classList.add('hidden');

  if (!email || !pass) {
    errEl.textContent = 'Please enter email and password';
    errEl.classList.remove('hidden');
    return;
  }

  if (CONFIG.DEMO_MODE) {
    if (email === 'admin@pharmacy.com' && pass === 'admin123') {
      show2FA();
    } else {
      errEl.textContent = 'Invalid credentials. Use demo credentials.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  // Real Supabase auth would go here
  fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.SUPABASE_KEY },
    body: JSON.stringify({ email, password: pass })
  })
  .then(r => r.json())
  .then(data => {
    if (data.access_token) {
      STATE.user = data;
      enterApp();
    } else {
      errEl.textContent = data.error_description || 'Login failed';
      errEl.classList.remove('hidden');
    }
  })
  .catch(() => {
    errEl.textContent = 'Connection error';
    errEl.classList.remove('hidden');
  });
}

function show2FA() {
  document.getElementById('auth-login').classList.add('hidden');
  document.getElementById('auth-2fa').classList.remove('hidden');
  const otpContainer = document.getElementById('otp-inputs');
  otpContainer.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 1;
    inp.setAttribute('inputmode', 'numeric');
    inp.setAttribute('aria-label', `Digit ${i + 1}`);
    inp.addEventListener('input', function() {
      if (this.value && this.nextElementSibling) this.nextElementSibling.focus();
    });
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Backspace' && !this.value && this.previousElementSibling) {
        this.previousElementSibling.focus();
      }
    });
    otpContainer.appendChild(inp);
  }
  otpContainer.children[0].focus();
}

function verify2FA() {
  const inputs = document.querySelectorAll('#otp-inputs input');
  const code = Array.from(inputs).map(i => i.value).join('');
  if (code.length !== 6) {
    showToast('Enter all 6 digits', 'error');
    return;
  }

  if (CONFIG.DEMO_MODE) {
    STATE.user = { email: 'admin@pharmacy.com', role: 'admin' };
    enterApp();
    return;
  }

  // Real 2FA verification via backend
  fetch(`${CONFIG.API_URL}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, token: STATE.user?.access_token })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) enterApp();
    else showToast('Invalid code', 'error');
  })
  .catch(() => showToast('Verification failed', 'error'));
}

function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initApp();
  showToast('Welcome to PharmaPOS!', 'success');
}

// --- API Helper ---
async function apiCall(endpoint, method = 'GET', body = null) {
  if (!STATE.user || !STATE.user.access_token) return { error: 'Unauthorized' };
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${STATE.user.access_token}`
    }
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('API Error:', err);
    return { error: 'Connection failed' };
  }
}

async function loadRealData() {
  try {
    const [meds, inv, sales, purchases, sb] = await Promise.all([
      apiCall('/api/medicines'),
      apiCall('/api/inventory'),
      apiCall('/api/sales'),
      apiCall('/api/purchases'),
      apiCall('/api/shortbook')
    ]);
    
    if (meds.data) STATE.medicines = meds.data;
    if (inv.data) STATE.inventory = inv.data;
    if (sales.data) STATE.sales = sales.data;
    if (purchases.data) STATE.purchases = purchases.data;
    if (sb.data) STATE.shortBook = sb.data;

    refreshDashboard();
    renderMedicineGrid();
  } catch (e) {
    showToast('Failed to load data from server', 'error');
  }
}

function handleLogout() {
  STATE.user = null;
  STATE.cart = [];
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-login').classList.remove('hidden');
  document.getElementById('auth-2fa').classList.add('hidden');
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-pass').value = '';
}

// --- Navigation ---
function navigate(page) {
  STATE.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  document.getElementById('page-title').textContent = page.charAt(0).toUpperCase() + page.slice(1);
  
  // Refresh page data
  if (page === 'dashboard') refreshDashboard();
  if (page === 'sales') refreshSales();
  if (page === 'purchase') refreshPurchases();
  if (page === 'inventory') refreshInventory();
  if (page === 'shortbook') refreshShortBook();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// --- Initialize ---
function initApp() {
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  document.getElementById('sale-date').value = new Date().toISOString().split('T')[0];
  generateBillNumber();
  
  if (CONFIG.DEMO_MODE) {
    loadDemoData();
    refreshDashboard();
    renderMedicineGrid();
  } else {
    loadRealData();
  }
}

function generateBillNumber() {
  const d = new Date();
  const prefix = `PH${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  document.getElementById('sale-billno').value = `${prefix}-${String(STATE.billCounter++).padStart(4,'0')}`;
}

// --- Demo Data ---
function loadDemoData() {
  STATE.medicines = [
    { id: '1', name: 'Paracetamol 500mg', category: 'Analgesic', manufacturer: 'Cipla', units_per_pack: 10, gst_percent: 12, min_stock: 20, max_stock: 500 },
    { id: '2', name: 'Amoxicillin 250mg', category: 'Antibiotic', manufacturer: 'Sun Pharma', units_per_pack: 10, gst_percent: 12, min_stock: 15, max_stock: 300 },
    { id: '3', name: 'Cetirizine 10mg', category: 'Antihistamine', manufacturer: 'Dr Reddy', units_per_pack: 10, gst_percent: 12, min_stock: 20, max_stock: 400 },
    { id: '4', name: 'Omeprazole 20mg', category: 'Antacid', manufacturer: 'Cipla', units_per_pack: 15, gst_percent: 12, min_stock: 10, max_stock: 200 },
    { id: '5', name: 'Azithromycin 500mg', category: 'Antibiotic', manufacturer: 'Zydus', units_per_pack: 3, gst_percent: 12, min_stock: 10, max_stock: 150 },
    { id: '6', name: 'Metformin 500mg', category: 'Antidiabetic', manufacturer: 'USV', units_per_pack: 20, gst_percent: 5, min_stock: 25, max_stock: 600 },
    { id: '7', name: 'Atorvastatin 10mg', category: 'Statin', manufacturer: 'Ranbaxy', units_per_pack: 10, gst_percent: 12, min_stock: 15, max_stock: 300 },
    { id: '8', name: 'Pantoprazole 40mg', category: 'Antacid', manufacturer: 'Alkem', units_per_pack: 15, gst_percent: 12, min_stock: 10, max_stock: 250 },
    { id: '9', name: 'Ibuprofen 400mg', category: 'NSAID', manufacturer: 'Mankind', units_per_pack: 10, gst_percent: 12, min_stock: 20, max_stock: 400 },
    { id: '10', name: 'Dolo 650mg', category: 'Analgesic', manufacturer: 'Micro Labs', units_per_pack: 15, gst_percent: 12, min_stock: 30, max_stock: 500 },
    { id: '11', name: 'Cough Syrup 100ml', category: 'Cough', manufacturer: 'Dabur', units_per_pack: 1, gst_percent: 18, min_stock: 10, max_stock: 100 },
    { id: '12', name: 'ORS Powder', category: 'Rehydration', manufacturer: 'FDC', units_per_pack: 1, gst_percent: 5, min_stock: 25, max_stock: 300 },
  ];

  const batches = ['B2025A', 'B2025B', 'B2025C', 'B2024X'];
  const today = new Date();
  STATE.inventory = STATE.medicines.map((m, i) => ({
    id: `inv-${i}`,
    medicine_id: m.id,
    medicine_name: m.name,
    batch: batches[i % batches.length],
    expiry: new Date(today.getFullYear() + (i % 3 === 0 ? 0 : 1), today.getMonth() + (i % 5), 1).toISOString().split('T')[0],
    mrp: (50 + i * 15 + Math.random() * 30).toFixed(2),
    ptr: (35 + i * 10 + Math.random() * 20).toFixed(2),
    quantity: i % 4 === 0 ? 5 : 30 + Math.floor(Math.random() * 100),
    gst_percent: m.gst_percent
  }));

  STATE.sales = [
    { id: 's1', bill_number: 'PH20260510-0001', bill_date: '2026-05-10', customer_name: 'Rahul Sharma', grand_total: 450, payment_method: 'cash' },
    { id: 's2', bill_number: 'PH20260510-0002', bill_date: '2026-05-10', customer_name: 'Priya Patel', grand_total: 1280, payment_method: 'upi' },
    { id: 's3', bill_number: 'PH20260509-0001', bill_date: '2026-05-09', customer_name: 'Walk-in', grand_total: 320, payment_method: 'cash' },
  ];
}

// ============ DASHBOARD ============
function refreshDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const todaySales = STATE.sales.filter(s => s.bill_date === today);
  document.getElementById('stat-today-sales').textContent = '₹' + todaySales.reduce((a,s) => a + s.grand_total, 0).toLocaleString('en-IN');
  document.getElementById('stat-today-bills').textContent = todaySales.length;
  const lowStock = STATE.inventory.filter(i => i.quantity <= (STATE.medicines.find(m=>m.id===i.medicine_id)?.min_stock||10));
  document.getElementById('stat-low-stock').textContent = lowStock.length;
  const sixMonths = new Date(); sixMonths.setMonth(sixMonths.getMonth()+6);
  const expiring = STATE.inventory.filter(i => new Date(i.expiry) <= sixMonths && i.quantity > 0);
  document.getElementById('stat-expiring').textContent = expiring.length;

  const lsl = document.getElementById('low-stock-list');
  lsl.innerHTML = lowStock.length ? lowStock.map(i => `<div class="alert-item"><span>${i.medicine_name}</span><span class="status-badge status-low">${i.quantity} left</span></div>`).join('') : '<p class="empty-state">All stock levels OK</p>';

  const el = document.getElementById('expiry-list');
  el.innerHTML = expiring.length ? expiring.slice(0,8).map(i => `<div class="alert-item"><span>${i.medicine_name} (${i.batch})</span><span class="status-badge status-critical">${i.expiry}</span></div>`).join('') : '<p class="empty-state">No expiring items</p>';

  const rs = document.getElementById('recent-sales');
  rs.innerHTML = STATE.sales.slice(0,5).map(s => `<div class="alert-item"><span>${s.customer_name} — ${s.bill_number}</span><span style="color:var(--green);font-weight:600">₹${s.grand_total}</span></div>`).join('') || '<p class="empty-state">No sales yet</p>';

  drawChart('daily');
}

function loadChart(period) {
  document.querySelectorAll('.chart-tabs .chip').forEach(c=>c.classList.remove('active'));
  event.target.classList.add('active');
  drawChart(period);
}

function drawChart(period) {
  const canvas = document.getElementById('salesChart');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 40;
  canvas.height = 200;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  let labels, data;
  if (period === 'daily') {
    labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    data = [1200,1800,900,2100,1500,2800,1730];
  } else if (period === 'monthly') {
    labels = ['Jan','Feb','Mar','Apr','May','Jun'];
    data = [32000,28000,35000,41000,38000,45000];
  } else {
    labels = ['2022','2023','2024','2025','2026'];
    data = [320000,410000,380000,520000,290000];
  }

  const max = Math.max(...data) * 1.2;
  const barW = (canvas.width - 60) / labels.length;
  const baseY = canvas.height - 30;

  // Grid lines
  ctx.strokeStyle = '#2a2e3f'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = baseY - (baseY - 10) * (i / 3);
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // Bars with gradient
  data.forEach((v, i) => {
    const h = (v / max) * (baseY - 10);
    const x = 50 + i * barW;
    const grad = ctx.createLinearGradient(x, baseY - h, x, baseY);
    grad.addColorStop(0, '#818cf8'); grad.addColorStop(1, '#6366f1');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, baseY - h, barW - 12, h, [4,4,0,0]);
    ctx.fill();
    // Label
    ctx.fillStyle = '#9ca3af'; ctx.font = '11px Inter'; ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + (barW-12)/2, baseY + 16);
    // Value
    ctx.fillStyle = '#e8eaed'; ctx.font = '10px Inter';
    ctx.fillText(v >= 1000 ? (v/1000).toFixed(1)+'k' : v, x + (barW-12)/2, baseY - h - 6);
  });
}

// ============ MEDICINE SEARCH & GRID ============
function renderMedicineGrid() {
  const grid = document.getElementById('medicine-grid');
  grid.innerHTML = STATE.inventory.filter(i=>i.quantity>0).map(i => 
    `<div class="med-tile" onclick="addToCart('${i.id}')" tabindex="0" role="button" aria-label="Add ${i.medicine_name}">
      <div class="med-name">${i.medicine_name}</div>
      <div class="med-detail">₹${i.mrp} · ${i.batch}</div>
      <div class="med-detail">Stock: ${i.quantity}</div>
    </div>`
  ).join('');
}

function searchMedicine(q) {
  const box = document.getElementById('med-suggestions');
  if (!q) { box.classList.add('hidden'); return; }
  const results = STATE.inventory.filter(i => i.medicine_name.toLowerCase().includes(q.toLowerCase()) && i.quantity > 0);
  if (!results.length) { box.classList.add('hidden'); return; }
  box.innerHTML = results.map(i => `<div class="suggestion-item" onclick="addToCart('${i.id}');document.getElementById('med-search').value='';document.getElementById('med-suggestions').classList.add('hidden')"><span>${i.medicine_name} (${i.batch})</span><span class="med-price">₹${i.mrp}</span></div>`).join('');
  box.classList.remove('hidden');
}

// ============ CART ============
function addToCart(invId) {
  const inv = STATE.inventory.find(i => i.id === invId);
  if (!inv || inv.quantity <= 0) { showToast('Out of stock','error'); return; }
  const existing = STATE.cart.find(c => c.inventory_id === invId);
  if (existing) {
    if (existing.qty >= inv.quantity) { showToast('Max stock reached','error'); return; }
    existing.qty++;
  } else {
    STATE.cart.push({ inventory_id: invId, name: inv.medicine_name, batch: inv.batch, expiry: inv.expiry, mrp: parseFloat(inv.mrp), gst_percent: inv.gst_percent, qty: 1, discount: 0 });
  }
  renderCart();
  showToast(`${inv.medicine_name} added`, 'success');
}

function removeFromCart(idx) { STATE.cart.splice(idx, 1); renderCart(); }

function updateQty(idx, delta) {
  const item = STATE.cart[idx];
  const inv = STATE.inventory.find(i => i.id === item.inventory_id);
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(idx); return; }
  if (item.qty > inv.quantity) { item.qty = inv.quantity; showToast('Max stock reached','error'); }
  renderCart();
}

function updateItemDiscount(idx, val) { STATE.cart[idx].discount = parseFloat(val)||0; renderCart(); }

function renderCart() {
  const el = document.getElementById('cart-items');
  document.getElementById('cart-count').textContent = STATE.cart.length;
  if (!STATE.cart.length) { el.innerHTML = '<p class="empty-state">Cart is empty</p>'; updateCartTotal(); return; }
  el.innerHTML = STATE.cart.map((c,i) => `<div class="cart-item">
    <div><div class="cart-item-name">${c.name}</div><div class="cart-item-detail">${c.batch} · Exp: ${c.expiry} · GST: ${c.gst_percent}%</div>
    <div class="cart-item-detail">Disc: <input type="number" value="${c.discount}" min="0" max="100" style="width:50px" onchange="updateItemDiscount(${i},this.value)">%</div></div>
    <div style="text-align:right"><div class="cart-item-qty"><button onclick="updateQty(${i},-1)">−</button><span>${c.qty}</span><button onclick="updateQty(${i},1)">+</button></div>
    <div class="cart-item-price">₹${calcItemTotal(c).toFixed(2)}</div></div></div>`).join('');
  updateCartTotal();
}

function calcItemTotal(c) {
  const base = c.mrp * c.qty;
  const disc = base * (c.discount / 100);
  const afterDisc = base - disc;
  const gst = afterDisc * (c.gst_percent / 100);
  return afterDisc + gst;
}

function updateCartTotal() {
  let sub=0, disc=0, gst=0;
  STATE.cart.forEach(c => {
    const base = c.mrp * c.qty;
    const d = base * (c.discount / 100);
    const g = (base - d) * (c.gst_percent / 100);
    sub += base; disc += d; gst += g;
  });
  const consultation = parseFloat(document.getElementById('cart-consultation').value) || 0;
  document.getElementById('cart-subtotal').textContent = '₹' + sub.toFixed(2);
  document.getElementById('cart-discount').textContent = '-₹' + disc.toFixed(2);
  document.getElementById('cart-gst').textContent = '₹' + gst.toFixed(2);
  document.getElementById('cart-total').textContent = '₹' + (sub - disc + gst + consultation).toFixed(2);
}

function clearCart() { STATE.cart = []; renderCart(); showToast('Cart cleared','info'); }

async function checkout(method) {
  if (!STATE.cart.length) { showToast('Cart is empty','error'); return; }
  const billNo = document.getElementById('sale-billno').value;
  const consultation = parseFloat(document.getElementById('cart-consultation').value) || 0;
  let sub=0, disc=0, gst=0;
  
  const saleItems = STATE.cart.map(c => {
    const base = c.mrp * c.qty;
    const d = base * (c.discount / 100);
    const g = (base - d) * (c.gst_percent/100);
    sub += base; disc += d; gst += g;
    const inv = STATE.inventory.find(i => i.id === c.inventory_id);
    return {
      inventory_id: c.inventory_id,
      medicine_id: inv ? inv.medicine_id : null,
      medicine_name: c.name,
      batch: c.batch,
      expiry: c.expiry,
      mrp: c.mrp,
      quantity: c.qty,
      discount: c.discount,
      gst_percent: c.gst_percent,
      gst_amount: parseFloat(g.toFixed(2)),
      amount: parseFloat((base - d + g).toFixed(2))
    };
  });

  const salePayload = {
    bill_number: billNo,
    bill_date: document.getElementById('sale-date').value,
    customer_name: document.getElementById('sale-customer').value || 'Walk-in',
    customer_mobile: document.getElementById('sale-mobile').value || null,
    subtotal: parseFloat(sub.toFixed(2)),
    discount_total: parseFloat(disc.toFixed(2)),
    gst_total: parseFloat(gst.toFixed(2)),
    consultation: consultation,
    grand_total: parseFloat((sub-disc+gst+consultation).toFixed(2)),
    payment_method: method,
    items: saleItems
  };

  const res = await apiCall('/api/sales', 'POST', salePayload);
  if (res.success || res.data) {
    const savedSale = res.data || salePayload;
    printInvoice(savedSale, sub, disc, gst, consultation);
    clearCart();
    generateBillNumber();
    document.getElementById('sale-customer').value = '';
    document.getElementById('sale-age').value = '';
    document.getElementById('sale-mobile').value = '';
    document.getElementById('cart-consultation').value = '0';
    await loadRealData(); 
    showToast(`Bill ${billNo} — ₹${salePayload.grand_total} (${method.toUpperCase()})`, 'success');
  } else {
    showToast('Failed to save sale', 'error');
  }
}

function printInvoice(sale, sub, disc, gst, consultation) {
  const el = document.getElementById('invoice-print');
  el.innerHTML = `<h2>PharmaPOS — Invoice</h2><p><strong>Bill:</strong> ${sale.bill_number} | <strong>Date:</strong> ${sale.bill_date} | <strong>Customer:</strong> ${sale.customer_name}</p>
    <table><thead><tr><th>Medicine</th><th>Batch</th><th>MRP</th><th>Qty</th><th>Disc%</th><th>GST%</th><th>Amount</th></tr></thead><tbody>
    ${sale.items.map(c=>`<tr><td>${c.name}</td><td>${c.batch}</td><td>₹${c.mrp}</td><td>${c.qty}</td><td>${c.discount}%</td><td>${c.gst_percent}%</td><td>₹${calcItemTotal(c).toFixed(2)}</td></tr>`).join('')}
    </tbody></table><p>Subtotal: ₹${sub.toFixed(2)} | Discount: -₹${disc.toFixed(2)} | GST: ₹${gst.toFixed(2)} | Consultation: ₹${consultation.toFixed(2)}</p>
    <h3>Grand Total: ₹${sale.grand_total} (${sale.payment_method.toUpperCase()})</h3>`;
  window.print();
}

// ============ SALES HISTORY ============
function refreshSales() {
  const tb = document.getElementById('sales-tbody');
  tb.innerHTML = STATE.sales.map(s => `<tr><td>${s.bill_number}</td><td>${s.bill_date}</td><td>${s.customer_name}</td><td>₹${s.grand_total}</td>
    <td><span class="status-badge ${s.payment_method==='cash'?'status-ok':'status-pending'}">${s.payment_method}</span></td>
    <td><button class="btn btn-sm btn-outline" onclick="deleteSale('${s.id}')">Delete</button></td></tr>`).join('');
}
async function deleteSale(id) { 
  const res = await apiCall(`/api/sales/${id}`, 'DELETE');
  if (res.success) {
    await loadRealData();
    showToast('Sale deleted','info'); 
  } else {
    showToast('Failed to delete sale', 'error');
  }
}

// ============ PURCHASE ============
function refreshPurchases() {
  const tb = document.getElementById('purchase-tbody');
  tb.innerHTML = STATE.purchases.length ? STATE.purchases.map(p => `<tr><td>${p.bill_number}</td><td>${p.bill_date}</td><td>${p.distributor_name}</td><td>${p.items?.length||0}</td><td>₹${p.grand_total}</td>
    <td><button class="btn btn-sm btn-outline" onclick="deletePurchase('${p.id}')">Delete</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No purchases yet</td></tr>';
}
async function deletePurchase(id) { 
  const res = await apiCall(`/api/purchases/${id}`, 'DELETE');
  if (res.success) {
    await loadRealData();
    showToast('Purchase deleted','info');
  } else {
    showToast('Failed to delete purchase', 'error');
  }
}

function openPurchaseModal() {
  openModal('New Purchase', `
    <div class="form-row"><div class="form-group"><label>Distributor Name</label><input type="text" id="pur-dist"></div>
    <div class="form-group"><label>Bill Number</label><input type="text" id="pur-billno"></div>
    <div class="form-group"><label>Bill Date</label><input type="date" id="pur-date" value="${new Date().toISOString().split('T')[0]}"></div></div>
    <h4 style="margin:1rem 0 .5rem;font-size:.9rem">Items</h4>
    <div id="pur-items-list"></div>
    <button class="btn btn-outline btn-sm" onclick="addPurchaseItemRow()" style="margin-top:.5rem">+ Add Item</button>`,
    `<button class="btn btn-primary" onclick="savePurchase()">Save Purchase</button>`);
  addPurchaseItemRow();
}

function addPurchaseItemRow() {
  const el = document.getElementById('pur-items-list');
  const idx = el.children.length;
  const row = document.createElement('div');
  row.className = 'form-row';
  row.style.marginBottom = '.5rem';
  row.innerHTML = `<div class="form-group"><label>Medicine</label><input type="text" class="pi-name" placeholder="Name"></div>
    <div class="form-group"><label>Batch</label><input type="text" class="pi-batch"></div>
    <div class="form-group"><label>Expiry</label><input type="date" class="pi-expiry"></div>
    <div class="form-group"><label>MRP</label><input type="number" class="pi-mrp" step="0.01"></div>
    <div class="form-group"><label>PTR</label><input type="number" class="pi-ptr" step="0.01"></div>
    <div class="form-group"><label>Qty</label><input type="number" class="pi-qty" value="1"></div>
    <div class="form-group"><label>Free</label><input type="number" class="pi-free" value="0"></div>
    <div class="form-group"><label>Disc%</label><input type="number" class="pi-disc" value="0"></div>
    <div class="form-group"><label>GST%</label><input type="number" class="pi-gst" value="12"></div>`;
  el.appendChild(row);
}

async function savePurchase() {
  const dist = document.getElementById('pur-dist').value;
  const billNo = document.getElementById('pur-billno').value;
  const billDate = document.getElementById('pur-date').value;
  if (!dist || !billNo) { showToast('Fill distributor & bill number','error'); return; }
  
  const rows = document.querySelectorAll('#pur-items-list .form-row');
  const items = []; let total = 0;
  
  for (let r of Array.from(rows)) {
    const name = r.querySelector('.pi-name').value;
    const batch = r.querySelector('.pi-batch').value;
    const expiry = r.querySelector('.pi-expiry').value;
    const mrp = parseFloat(r.querySelector('.pi-mrp').value)||0;
    const ptr = parseFloat(r.querySelector('.pi-ptr').value)||0;
    const qty = parseInt(r.querySelector('.pi-qty').value)||0;
    const free = parseInt(r.querySelector('.pi-free').value)||0;
    const disc = parseFloat(r.querySelector('.pi-disc').value)||0;
    const gst = parseFloat(r.querySelector('.pi-gst').value)||0;
    if (!name || !qty) continue;
    
    let med = STATE.medicines.find(m => m.name.toLowerCase() === name.toLowerCase());
    if (!med) { 
      const medRes = await apiCall('/api/medicines', 'POST', { name, category: '', manufacturer: dist, units_per_pack: 1, gst_percent: gst, min_stock: 10, max_stock: 500 });
      if (medRes.data) med = medRes.data[0];
      else continue;
    }

    const base = ptr * qty;
    const discAmt = base * disc / 100;
    const gstAmt = (base - discAmt) * gst / 100;
    const amt = base - discAmt + gstAmt;
    
    items.push({ 
      medicine_id: med.id, medicine_name: name, batch, expiry, mrp, ptr, 
      quantity: qty, free_quantity: free, discount: disc, gst_percent: gst, amount: parseFloat(amt.toFixed(2)) 
    });
    total += amt;
  }

  const payload = {
    bill_number: billNo, bill_date: billDate, distributor_name: dist, grand_total: parseFloat(total.toFixed(2)), items
  };

  const res = await apiCall('/api/purchases', 'POST', payload);
  if (res.success || res.data) {
    closeModal();
    await loadRealData();
    showToast('Purchase saved — stock updated','success');
  } else {
    showToast('Failed to save purchase', 'error');
  }
}

// ============ INVENTORY ============
function refreshInventory() {
  filterInventory();
}

function filterInventory() {
  const q = (document.getElementById('inv-search').value || '').toLowerCase();
  const filter = document.getElementById('inv-filter').value;
  const sixMonths = new Date(); sixMonths.setMonth(sixMonths.getMonth() + 6);
  
  let data = STATE.inventory;
  if (q) data = data.filter(i => i.medicine_name.toLowerCase().includes(q));
  if (filter === 'low') data = data.filter(i => {
    const med = STATE.medicines.find(m => m.id === i.medicine_id);
    return i.quantity <= (med?.min_stock || 10);
  });
  if (filter === 'expiring') data = data.filter(i => new Date(i.expiry) <= sixMonths && i.quantity > 0);

  const tb = document.getElementById('inventory-tbody');
  tb.innerHTML = data.length ? data.map(i => {
    const med = STATE.medicines.find(m => m.id === i.medicine_id);
    const isLow = i.quantity <= (med?.min_stock || 10);
    const isExpiring = new Date(i.expiry) <= sixMonths;
    let status = '<span class="status-badge status-ok">OK</span>';
    if (isLow) status = '<span class="status-badge status-low">Low</span>';
    if (i.quantity === 0) status = '<span class="status-badge status-critical">Out</span>';
    if (isExpiring) status += ' <span class="status-badge status-critical">Exp</span>';
    return `<tr><td>${i.medicine_name}</td><td>${i.batch}</td><td>${i.expiry}</td><td>₹${i.mrp}</td><td>${i.quantity}</td><td>${status}</td>
      <td><button class="btn btn-sm btn-outline" onclick="adjustStockModal('${i.id}')">Adjust</button></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-state">No inventory items</td></tr>';
}

function openInventoryModal(type) {
  if (type === 'add') {
    openModal('Add Opening Stock', `
      <div class="form-row"><div class="form-group"><label>Medicine Name</label><input type="text" id="os-name"></div>
      <div class="form-group"><label>Batch</label><input type="text" id="os-batch"></div>
      <div class="form-group"><label>Expiry</label><input type="date" id="os-expiry"></div></div>
      <div class="form-row"><div class="form-group"><label>MRP</label><input type="number" id="os-mrp" step="0.01"></div>
      <div class="form-group"><label>Quantity</label><input type="number" id="os-qty"></div>
      <div class="form-group"><label>GST%</label><input type="number" id="os-gst" value="12"></div></div>`,
      `<button class="btn btn-primary" onclick="saveOpeningStock()">Save</button>`);
  }
}

async function saveOpeningStock() {
  const name = document.getElementById('os-name').value;
  const batch = document.getElementById('os-batch').value;
  const expiry = document.getElementById('os-expiry').value;
  const mrp = parseFloat(document.getElementById('os-mrp').value)||0;
  const qty = parseInt(document.getElementById('os-qty').value)||0;
  const gst = parseFloat(document.getElementById('os-gst').value)||12;
  if (!name || !batch || !qty) { showToast('Fill all required fields','error'); return; }

  let med = STATE.medicines.find(m => m.name.toLowerCase() === name.toLowerCase());
  if (!med) { 
    const medRes = await apiCall('/api/medicines', 'POST', { name, category: '', manufacturer: '', units_per_pack: 1, gst_percent: gst, min_stock: 10, max_stock: 500 });
    if (medRes.data && medRes.data.length > 0) {
      med = medRes.data[0];
      STATE.medicines.push(med);
    } else {
      showToast('Failed to save medicine', 'error');
      return;
    }
  }
  
  const invRes = await apiCall('/api/inventory', 'POST', { medicine_id: med.id, batch, expiry, mrp, ptr: 0, quantity: qty });
  if (invRes.success || invRes.data) {
    closeModal(); 
    await loadRealData(); 
    showToast('Opening stock added','success');
  } else {
    showToast('Failed to add inventory', 'error');
  }
}

function adjustStockModal(invId) {
  const inv = STATE.inventory.find(i => i.id === invId);
  if (!inv) return;
  openModal('Adjust Stock — ' + inv.medicine_name, `
    <p style="color:var(--text-secondary);margin-bottom:1rem">Current: <strong>${inv.quantity}</strong> | Batch: ${inv.batch}</p>
    <div class="form-row"><div class="form-group"><label>Adjustment Type</label><select id="adj-type"><option value="add">Add</option><option value="remove">Remove</option><option value="damage">Damage</option><option value="expired">Expired</option></select></div>
    <div class="form-group"><label>Quantity</label><input type="number" id="adj-qty" min="1"></div></div>
    <div class="form-group"><label>Reason</label><input type="text" id="adj-reason" placeholder="Optional reason"></div>`,
    `<button class="btn btn-primary" onclick="saveAdjustment('${invId}')">Save</button>`);
}

async function saveAdjustment(invId) {
  const inv = STATE.inventory.find(i => i.id === invId);
  const type = document.getElementById('adj-type').value;
  const qty = parseInt(document.getElementById('adj-qty').value)||0;
  if (!qty) { showToast('Enter quantity','error'); return; }
  
  let newQty = inv.quantity;
  if (type === 'add') newQty += qty;
  else newQty = Math.max(0, newQty - qty);

  const res = await apiCall(`/api/inventory/${invId}`, 'PUT', { quantity: newQty });
  if (res.success || res.data) {
    closeModal(); 
    await loadRealData(); 
    showToast('Stock adjusted','success');
  } else {
    showToast('Failed to adjust stock', 'error');
  }
}

// ============ SHORT BOOK ============
function refreshShortBook() { generateShortBook(); }

function generateShortBook() {
  STATE.shortBook = [];
  STATE.medicines.forEach(m => {
    const totalStock = STATE.inventory.filter(i => i.medicine_id === m.id).reduce((a,i) => a + i.quantity, 0);
    if (totalStock <= m.min_stock) {
      STATE.shortBook.push({ id: 'sb-' + m.id, medicine_id: m.id, medicine_name: m.name, current_stock: totalStock, min_stock: m.min_stock, max_stock: m.max_stock, reorder_qty: m.max_stock - totalStock, status: 'pending' });
    }
  });
  const tb = document.getElementById('shortbook-tbody');
  tb.innerHTML = STATE.shortBook.length ? STATE.shortBook.map(s => `<tr><td>${s.medicine_name}</td><td>${s.current_stock}</td><td>${s.min_stock}</td><td>${s.max_stock}</td><td>${s.reorder_qty}</td>
    <td><span class="status-badge status-${s.status==='pending'?'pending':'ok'}">${s.status}</span></td>
    <td><button class="btn btn-sm btn-primary" onclick="markOrdered('${s.id}')">Mark Ordered</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">All stock levels adequate</td></tr>';
}

async function markOrdered(id) {
  const item = STATE.shortBook.find(s => s.id === id);
  if (item) { 
    const newStatus = item.status === 'pending' ? 'ordered' : 'received';
    const res = await apiCall(`/api/shortbook/${id}`, 'PUT', { status: newStatus });
    if (res.success || res.data) {
      await loadRealData();
      showToast('Status updated','success');
    } else {
      showToast('Failed to update status', 'error');
    }
  }
}

// ============ REPORTS ============
function loadReport(type) {
  document.querySelectorAll('.reports-tabs .chip').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  const el = document.getElementById('report-content');
  
  if (type === 'daily') {
    const today = new Date().toISOString().split('T')[0];
    const todaySales = STATE.sales.filter(s => s.bill_date === today);
    const total = todaySales.reduce((a,s) => a + s.grand_total, 0);
    el.innerHTML = `<h3>Daily Report — ${today}</h3>
      <div class="stats-grid" style="margin:1rem 0">
        <div class="stat-card stat-sales"><div class="stat-info"><span class="stat-label">Total Revenue</span><span class="stat-value">₹${total.toLocaleString('en-IN')}</span></div></div>
        <div class="stat-card stat-orders"><div class="stat-info"><span class="stat-label">Total Bills</span><span class="stat-value">${todaySales.length}</span></div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Bill#</th><th>Customer</th><th>Amount</th><th>Payment</th></tr></thead><tbody>
      ${todaySales.map(s => `<tr><td>${s.bill_number}</td><td>${s.customer_name}</td><td>₹${s.grand_total}</td><td>${s.payment_method}</td></tr>`).join('')}
      </tbody></table></div>`;
  } else if (type === 'monthly') {
    const total = STATE.sales.reduce((a,s) => a + s.grand_total, 0);
    el.innerHTML = `<h3>Monthly Report</h3><div class="stat-card stat-sales" style="margin:1rem 0"><div class="stat-info"><span class="stat-label">Monthly Revenue</span><span class="stat-value">₹${total.toLocaleString('en-IN')}</span></div></div>
      <p class="empty-state">Detailed monthly breakdown available with Supabase integration</p>`;
  } else if (type === 'annual') {
    el.innerHTML = `<h3>Annual Financial Report</h3><p class="empty-state">Annual reports require Supabase database connection for full data</p>`;
  } else if (type === 'sales') {
    el.innerHTML = `<h3>Sales Report</h3><div class="table-wrap"><table><thead><tr><th>Bill#</th><th>Date</th><th>Customer</th><th>Amount</th><th>Payment</th></tr></thead><tbody>
      ${STATE.sales.map(s => `<tr><td>${s.bill_number}</td><td>${s.bill_date}</td><td>${s.customer_name}</td><td>₹${s.grand_total}</td><td>${s.payment_method}</td></tr>`).join('')}
      </tbody></table></div>`;
  } else if (type === 'inventory') {
    el.innerHTML = `<h3>Inventory Report</h3><div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>MRP</th><th>Stock</th></tr></thead><tbody>
      ${STATE.inventory.map(i => `<tr><td>${i.medicine_name}</td><td>${i.batch}</td><td>${i.expiry}</td><td>₹${i.mrp}</td><td>${i.quantity}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
}

// ============ MODAL SYSTEM ============
function openModal(title, bodyHtml, footerHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml || '';
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// Close modal on Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Mobile cart toggle
document.addEventListener('click', e => {
  const cart = document.getElementById('cart-panel');
  if (cart && e.target.closest('.cart-header')) cart.classList.toggle('open');
});


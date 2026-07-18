/**
 * app.js
 * Navigation between tabs, online/offline status, and the Inventory module
 * (add / edit / delete products, dashboard stats). Sales & Customers are
 * wired up as placeholder tabs for the next build step.
 */

const viewTitles = {
  dashboard: "Dashboard",
  inventory: "Inventory",
  sales: "Sales",
  customers: "Customers",
};

// ---------- Navigation ----------
function switchView(viewName) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.nav-btn[data-view="${viewName}"]`).classList.add("active");

  document.getElementById("viewTitle").textContent = viewTitles[viewName];
  document.getElementById("addProductFab").style.display = viewName === "inventory" ? "flex" : "none";

  if (viewName === "dashboard") renderDashboard();
  if (viewName === "inventory") renderInventory();
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// ---------- Online / Offline status ----------
function updateStatusPill() {
  const pill = document.getElementById("statusPill");
  const text = document.getElementById("statusText");
  if (navigator.onLine) {
    pill.classList.remove("offline");
    text.textContent = "Online";
  } else {
    pill.classList.add("offline");
    text.textContent = "Offline";
  }
}
window.addEventListener("online", updateStatusPill);
window.addEventListener("offline", updateStatusPill);

// ---------- Dashboard ----------
async function renderDashboard() {
  const products = await ShopDB.getAll("products");

  const totalStock = products.reduce((sum, p) => sum + Number(p.stock || 0), 0);
  const lowStockItems = products.filter((p) => Number(p.stock) <= Number(p.minStock ?? 5));

  document.getElementById("statTodaySales").textContent = "$0"; // wired up once Sales module exists
  document.getElementById("statTotalStock").textContent = totalStock;
  document.getElementById("statLowStock").textContent = lowStockItems.length;
  document.getElementById("statProductCount").textContent = products.length;

  const listEl = document.getElementById("lowStockList");
  if (lowStockItems.length === 0) {
    listEl.innerHTML = `<div class="empty-state">Nothing low on stock right now.</div>`;
    return;
  }
  listEl.innerHTML = lowStockItems
    .map(
      (p) => `
      <div class="product-row">
        <div>
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-meta">${escapeHtml(p.category || "Uncategorized")}</div>
        </div>
        <span class="stock-badge low">${p.stock} left</span>
      </div>`
    )
    .join("");
}

// ---------- Inventory list ----------
async function renderInventory() {
  const products = await ShopDB.getAll("products");
  const listEl = document.getElementById("inventoryList");

  if (products.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No products yet. Tap + to add your first item.</div>`;
    return;
  }

  const sorted = products.sort((a, b) => a.name.localeCompare(b.name));

  listEl.innerHTML = sorted
    .map((p) => {
      const isLow = Number(p.stock) <= Number(p.minStock ?? 5);
      return `
      <div class="product-row" data-id="${p.id}" role="button" tabindex="0">
        <div>
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-meta">${escapeHtml(p.category || "Uncategorized")}</div>
          <span class="stock-badge ${isLow ? "low" : ""}">${p.stock} in stock</span>
        </div>
        <div class="row-right">
          <div class="product-price">$${Number(p.price).toFixed(2)}</div>
        </div>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll(".product-row").forEach((row) => {
    row.addEventListener("click", () => openProductModal(row.dataset.id));
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- Product modal (add / edit) ----------
const productModal = document.getElementById("productModal");
const productForm = document.getElementById("productForm");
const deleteBtn = document.getElementById("deleteProductBtn");

function openAddModal() {
  productForm.reset();
  document.getElementById("productId").value = "";
  document.getElementById("productModalTitle").textContent = "Add Product";
  deleteBtn.style.display = "none";
  productModal.classList.add("active");
}

async function openProductModal(id) {
  const products = await ShopDB.getAll("products");
  const product = products.find((p) => p.id === id);
  if (!product) return;

  document.getElementById("productId").value = product.id;
  document.getElementById("productName").value = product.name;
  document.getElementById("productCategory").value = product.category || "";
  document.getElementById("productPrice").value = product.price;
  document.getElementById("productCost").value = product.cost ?? "";
  document.getElementById("productStock").value = product.stock;
  document.getElementById("productMinStock").value = product.minStock ?? 5;

  document.getElementById("productModalTitle").textContent = "Edit Product";
  deleteBtn.style.display = "block";
  productModal.classList.add("active");
}

function closeProductModal() {
  productModal.classList.remove("active");
}

document.getElementById("addProductFab").addEventListener("click", openAddModal);
document.getElementById("closeProductModal").addEventListener("click", closeProductModal);
productModal.addEventListener("click", (e) => {
  if (e.target === productModal) closeProductModal();
});

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("productId").value;
  const data = {
    name: document.getElementById("productName").value.trim(),
    category: document.getElementById("productCategory").value.trim(),
    price: parseFloat(document.getElementById("productPrice").value),
    cost: document.getElementById("productCost").value
      ? parseFloat(document.getElementById("productCost").value)
      : 0,
    stock: parseInt(document.getElementById("productStock").value, 10),
    minStock: parseInt(document.getElementById("productMinStock").value || "5", 10),
  };

  if (id) {
    await ShopDB.updateRecord("products", id, data);
  } else {
    await ShopDB.addRecord("products", data);
  }

  closeProductModal();
  renderInventory();
  renderDashboard();
});

deleteBtn.addEventListener("click", async () => {
  const id = document.getElementById("productId").value;
  if (!id) return;
  if (!confirm("Delete this product? This can't be undone.")) return;
  await ShopDB.deleteRecord("products", id);
  closeProductModal();
  renderInventory();
  renderDashboard();
});

// ---------- Service worker (offline support) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

// ---------- Init ----------
updateStatusPill();
renderDashboard();

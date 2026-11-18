const API = "/api";

let products = [];
let cart = JSON.parse(localStorage.getItem("ecocart-cart") || "[]");
let currentUser = null;
let isRegister = false;

const $ = id => document.getElementById(id);

async function request(url, options = {}) {
    const response = await fetch(API + url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong");
    }

    return data;
}

function notify(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");

    setTimeout(() => {
        $("toast").classList.remove("show");
    }, 2500);
}

function saveCart() {
    localStorage.setItem("ecocart-cart", JSON.stringify(cart));
    updateCartCount();
}

function updateCartCount() {
    $("cartCount").textContent =
        cart.reduce((sum, item) => sum + item.quantity, 0);
}

// Load products from database
async function loadProducts() {
    try {
        products = await request("/products");
        displayProducts(products);
    } catch (error) {
        $("productList").innerHTML = "<p>Unable to load products. Please refresh.</p>";
    }
}

// Display products
function displayProducts(list) {
    if (list.length === 0) {
        $("productList").innerHTML = "<p>No products found.</p>";
        return;
    }

    $("productList").innerHTML = list.map(product => `
        <div class="product-card">
            <img src="${product.image}" alt="${product.name}"
            onerror="this.src='https://placehold.co/600x400?text=EcoCart'">

            <div class="product-info">
                <small>${product.category}</small>
                <h3>${product.name}</h3>
                <div class="product-price">₹${product.price}</div>

                <div class="product-buttons">
                    <button class="details-btn"
                    onclick="showDetails(${product.id})">
                        Details
                    </button>

                    <button class="add-btn"
                    onclick="addToCart(${product.id})"
                    ${product.stock < 1 ? "disabled" : ""}>
                        ${product.stock < 1 ? "Sold Out" : "Add +" }
                    </button>
                </div>
            </div>
        </div>
    `).join("");
}

// Search products
$("searchInput").addEventListener("input", filterProducts);
$("categoryFilter").addEventListener("change", filterProducts);

function filterProducts() {
    const search = $("searchInput").value.toLowerCase();
    const category = $("categoryFilter").value;

    const filtered = products.filter(product => {
        const matchesName = product.name.toLowerCase().includes(search);
        const matchesCategory =
            category === "All" || product.category === category;

        return matchesName && matchesCategory;
    });

    displayProducts(filtered);
}

// Product details
function showDetails(id) {
    const product = products.find(item => item.id === id);
    if (!product) return;

    $("productDetails").innerHTML = `
        <img src="${product.image}" alt="${product.name}">
        <small>${product.category}</small>
        <h2>${product.name}</h2>
        <h3 class="product-price">₹${product.price}</h3>
        <p>${product.description}</p>
        <p>Available stock: ${product.stock}</p>
        <button class="shop-btn"
        onclick="addToCart(${product.id}); closeModal('productModal')">
            Add to Cart
        </button>
    `;

    $("productModal").classList.add("show");
}

// Add to cart
function addToCart(id) {
    const product = products.find(item => item.id === id);
    if (!product) return;

    const existing = cart.find(item => item.id === id);
    const quantity = existing ? existing.quantity : 0;

    if (quantity >= product.stock) {
        notify("Maximum available stock reached.");
        return;
    }

    if (existing) {
        existing.quantity++;
    } else {
        cart.push({ id, quantity: 1 });
    }

    saveCart();
    notify(product.name + " added to cart!");
}

// Display cart
function showCart() {
    const container = $("cartItems");

    if (cart.length === 0) {
        container.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
        $("cartTotal").textContent = "Total: ₹0";
        $("cartModal").classList.add("show");
        return;
    }

    let total = 0;

    container.innerHTML = cart.map(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) return "";

        total += product.price * item.quantity;

        return `
            <div class="cart-item">
                <div>
                    <strong>${product.name}</strong>
                    <p>₹${product.price} each</p>
                </div>

                <div class="quantity-controls">
                    <button onclick="changeQuantity(${item.id}, -1)">−</button>
                    <span>${item.quantity}</span>
                    <button onclick="changeQuantity(${item.id}, 1)">+</button>
                    <button onclick="removeItem(${item.id})">✕</button>
                </div>
            </div>
        `;
    }).join("");

    $("cartTotal").textContent = "Total: ₹" + total.toFixed(2);
    $("cartModal").classList.add("show");
}

// Change quantity
function changeQuantity(id, amount) {
    const item = cart.find(p => p.id === id);
    const product = products.find(p => p.id === id);

    if (!item || !product) return;

    const next = item.quantity + amount;

    if (next < 1) {
        removeItem(id);
        return;
    }

    if (next > product.stock) {
        notify("Maximum stock reached.");
        return;
    }

    item.quantity = next;
    saveCart();
    showCart();
}

// Remove product
function removeItem(id) {
    cart = cart.filter(item => item.id !== id);
    saveCart();
    showCart();
}

// Authentication popup
function openAuth() {
    isRegister = false;
    updateAuthForm();
    $("authModal").classList.add("show");
}

function updateAuthForm() {
    $("authTitle").textContent =
        isRegister ? "Create Account" : "Welcome Back!";

    $("authSubtitle").textContent =
        isRegister ? "Join the EcoCart family." : "Login to continue shopping.";

    $("nameInput").classList.toggle("hidden", !isRegister);
    $("nameInput").required = isRegister;

    $("authSwitch").innerHTML = isRegister
        ? 'Already have an account? <a href="#" id="switchAuth">Login</a>'
        : 'New to EcoCart? <a href="#" id="switchAuth">Create an account</a>';

    $("authForm").querySelector("button").textContent =
        isRegister ? "Register" : "Login";

    $("switchAuth").addEventListener("click", event => {
        event.preventDefault();
        isRegister = !isRegister;
        updateAuthForm();
    });
}

// Login and registration
$("authForm").addEventListener("submit", async event => {
    event.preventDefault();

    const email = $("emailInput").value;
    const password = $("passwordInput").value;

    const details = isRegister
        ? {
            name: $("nameInput").value,
            email,
            password
        }
        : { email, password };

    try {
        const result = await request(
            isRegister ? "/register" : "/login",
            {
                method: "POST",
                body: JSON.stringify(details)
            }
        );

        currentUser = result.user;
        updateUserUI();
        closeModal("authModal");
        $("authForm").reset();
        notify(result.message);

    } catch (error) {
        notify(error.message);
    }
});

// Check logged-in user
async function checkUser() {
    try {
        const result = await request("/me");
        currentUser = result.user;
        updateUserUI();
    } catch (error) {
        currentUser = null;
        updateUserUI();
    }
}

function updateUserUI() {
    $("loginButton").classList.toggle("hidden", !!currentUser);
    $("logoutButton").classList.toggle("hidden", !currentUser);

    if (currentUser) {
        $("loginButton").textContent = currentUser.name;
    } else {
        $("loginButton").textContent = "Login";
    }
}

// Logout
$("logoutButton").addEventListener("click", async () => {
    try {
        const result = await request("/logout", {
            method: "POST"
        });

        currentUser = null;
        updateUserUI();
        notify(result.message);
    } catch (error) {
        notify(error.message);
    }
});

// Checkout and order processing
async function checkout() {
    if (cart.length === 0) {
        notify("Please add products to your cart.");
        return;
    }

    if (!currentUser) {
        closeModal("cartModal");
        openAuth();
        notify("Please login to place your order.");
        return;
    }

    try {
        const result = await request("/orders", {
            method: "POST",
            body: JSON.stringify({ items: cart })
        });

        cart = [];
        saveCart();

        await loadProducts();
        showCart();

        notify("Order #" + result.orderId +
            " placed successfully! Total: ₹" +
            result.total.toFixed(2));

    } catch (error) {
        notify(error.message);
    }
}

// Modal controls
function closeModal(id) {
    $(id).classList.remove("show");
}

$("cartButton").addEventListener("click", showCart);
$("loginButton").addEventListener("click", openAuth);
$("checkoutButton").addEventListener("click", checkout);

$("closeProduct").addEventListener("click", () => closeModal("productModal"));
$("closeCart").addEventListener("click", () => closeModal("cartModal"));
$("closeAuth").addEventListener("click", () => closeModal("authModal"));

// Close popup when clicking outside
document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
        if (event.target === modal) {
            modal.classList.remove("show");
        }
    });
});

// Initialize website
async function initialize() {
    updateCartCount();
    await checkUser();
    await loadProducts();
}

initialize();
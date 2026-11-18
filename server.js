const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || "ecocart-development-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use(express.static(path.join(__dirname, "public")));

let db;

const databasePath = path.join(__dirname, "ecocart.db");

function saveDatabase() {
    const data = db.export();
    fs.writeFileSync(databasePath, Buffer.from(data));
}

function getRows(sql, params = []) {
    const result = db.exec(sql, params);
    if (!result.length) return [];

    return result[0].values.map(row => {
        const item = {};
        result[0].columns.forEach((column, index) => {
            item[column] = row[index];
        });
        return item;
    });
}

function getUser(req) {
    if (!req.session.userId) return null;

    return getRows(
        "SELECT id, name, email FROM users WHERE id = ?",
        [req.session.userId]
    )[0] || null;
}

function requireLogin(req, res, next) {
    if (!getUser(req)) {
        return res.status(401).json({
            message: "Please login first."
        });
    }
    next();
}

async function startServer() {
    const SQL = await initSqlJs();

    if (fs.existsSync(databasePath)) {
        const file = fs.readFileSync(databasePath);
        db = new SQL.Database(file);
    } else {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            price REAL NOT NULL,
            description TEXT,
            image TEXT,
            stock INTEGER DEFAULT 100
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            total REAL NOT NULL,
            order_date TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL
        );
    `);

    const existing = getRows(
        "SELECT COUNT(*) AS count FROM products"
    )[0].count;

    if (existing === 0) {
        const products = [
            [1, "Organic Green Apples", "Fruits", 120,
             "Fresh and juicy organic apples.", "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600", 100],

            [2, "Fresh Strawberries", "Fruits", 180,
             "Sweet and fresh strawberries.", "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=600", 100],

            [3, "Organic Broccoli", "Vegetables", 80,
             "Healthy farm-fresh broccoli.", "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=600", 100],

            [4, "Fresh Carrots", "Vegetables", 60,
             "Crunchy and nutritious carrots.", "https://images.unsplash.com/photo-1445282768818-728615cc910a?w=600", 100],

            [5, "Almond Milk", "Dairy Alternatives", 150,
             "Delicious plant-based almond milk.", "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600", 100],

            [6, "Organic Bananas", "Fruits", 50,
             "Naturally sweet ripe bananas.", "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600", 100]
        ];

        products.forEach(product => {
            db.run(
                `INSERT INTO products
                (id, name, category, price, description, image, stock)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                product
            );
        });
    }

    saveDatabase();

    // Get all products
    app.get("/api/products", (req, res) => {
        res.json(getRows("SELECT * FROM products"));
    });

    // Get one product
    app.get("/api/products/:id", (req, res) => {
        const product = getRows(
            "SELECT * FROM products WHERE id = ?",
            [Number(req.params.id)]
        )[0];

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json(product);
    });

    // Register user
    app.post("/api/register", async (req, res) => {
        const { name, email, password } = req.body;

        if (!name || !email || !password || password.length < 6) {
            return res.status(400).json({
                message: "Enter all details. Password must be at least 6 characters."
            });
        }

        try {
            const hash = await bcrypt.hash(password, 10);

            db.run(
                "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
                [name.trim(), email.trim().toLowerCase(), hash]
            );

            saveDatabase();

            const user = getRows(
                "SELECT id, name, email FROM users WHERE email = ?",
                [email.trim().toLowerCase()]
            )[0];

            req.session.userId = user.id;
            res.json({ message: "Registration successful!", user });

        } catch (error) {
            res.status(400).json({
                message: "Email already registered or invalid details."
            });
        }
    });

    // Login user
    app.post("/api/login", (req, res) => {
        const { email, password } = req.body;

        const user = getRows(
            "SELECT * FROM users WHERE email = ?",
            [(email || "").trim().toLowerCase()]
        )[0];

        if (!user || !bcrypt.compareSync(password || "", user.password)) {
            return res.status(401).json({
                message: "Incorrect email or password."
            });
        }

        req.session.userId = user.id;

        res.json({
            message: "Login successful!",
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    });

    // Current logged-in user
    app.get("/api/me", (req, res) => {
        res.json({ user: getUser(req) });
    });

    // Logout
    app.post("/api/logout", (req, res) => {
        req.session.destroy(() => {
            res.json({ message: "Logged out successfully." });
        });
    });

    // Place order
    app.post("/api/orders", requireLogin, (req, res) => {
        const { items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                message: "Your cart is empty."
            });
        }

        try {
            let total = 0;
            const verifiedItems = [];

            for (const item of items) {
                const id = Number(item.id);
                const quantity = Number(item.quantity);

                if (!Number.isInteger(id) ||
                    !Number.isInteger(quantity) ||
                    quantity < 1 || quantity > 100) {
                    throw new Error("Invalid product quantity.");
                }

                const product = getRows(
                    "SELECT * FROM products WHERE id = ?",
                    [id]
                )[0];

                if (!product || product.stock < quantity) {
                    throw new Error("Product unavailable or insufficient stock.");
                }

                total += product.price * quantity;
                verifiedItems.push({ product, quantity });
            }

            db.run(
                "INSERT INTO orders (user_id, total) VALUES (?, ?)",
                [req.session.userId, total]
            );

            const orderId = getRows(
                "SELECT last_insert_rowid() AS id"
            )[0].id;

            verifiedItems.forEach(({ product, quantity }) => {
                db.run(
                    `INSERT INTO order_items
                    (order_id, product_id, quantity, price)
                    VALUES (?, ?, ?, ?)`,
                    [orderId, product.id, quantity, product.price]
                );

                db.run(
                    "UPDATE products SET stock = stock - ? WHERE id = ?",
                    [quantity, product.id]
                );
            });

            saveDatabase();

            res.json({
                message: "Your order has been placed successfully!",
                orderId,
                total
            });

        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    });

    // View logged-in user's orders
    app.get("/api/orders", requireLogin, (req, res) => {
        const orders = getRows(
            "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC",
            [req.session.userId]
        );

        res.json(orders);
    });

    app.listen(PORT, () => {
        console.log(`EcoCart is running at http://localhost:${PORT}`);
    });
}

startServer().catch(error => {
    console.error("Server startup failed:", error);
});
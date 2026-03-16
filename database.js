const Database = require('better-sqlite3');
const path = require('path');

async function setupDb() {
    const dbPath = path.join(__dirname, 'database.sqlite');
    const db = new Database(dbPath);

    // Initial setup with subscription fields
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER UNIQUE,
            username TEXT,
            balance INTEGER DEFAULT 0,
            referred_by INTEGER,
            referral_count INTEGER DEFAULT 0,
            subscription_type TEXT DEFAULT 'Free',
            subscription_expiry DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS redeem_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            type TEXT,
            value TEXT,
            is_used INTEGER DEFAULT 0,
            used_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS custom_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT UNIQUE,
            response TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Compatibility shim for async calls in bot.js
    return {
        get: async (sql, params = []) => db.prepare(sql).get(...params),
        all: async (sql, params = []) => db.prepare(sql).all(...params),
        run: async (sql, params = []) => db.prepare(sql).run(...params),
        exec: async (sql) => db.exec(sql),
        close: async () => db.close()
    };
}

module.exports = { setupDb };

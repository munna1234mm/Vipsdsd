const Database = require('better-sqlite3');
const path = require('path');

async function setupDb() {
    const dbPath = path.join(__dirname, 'database.sqlite');
    const db = new Database(dbPath);

    // Initial setup
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER UNIQUE,
            username TEXT,
            balance INTEGER DEFAULT 0,
            referred_by INTEGER,
            referral_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Compatibility shim for async calls in bot.js
    return {
        get: async (sql, params = []) => db.prepare(sql).get(...params),
        run: async (sql, params = []) => db.prepare(sql).run(...params),
        exec: async (sql) => db.exec(sql),
        close: async () => db.close()
    };
}

module.exports = { setupDb };

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function setupDb() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
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

    return db;
}

module.exports = { setupDb };

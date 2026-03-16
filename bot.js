// Forced rebuild to ensure dependencies are installed correctly.
const { Telegraf, Markup } = require('telegraf');
const { setupDb } = require('./database');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
require('dotenv').config();

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCmme-tDa8lx2SdI1TnMAro63mpmr33WrI",
  authDomain: "vipbot-f501b.firebaseapp.com",
  projectId: "vipbot-f501b",
  storageBucket: "vipbot-f501b.firebasestorage.app",
  messagingSenderId: "792235327406",
  appId: "1:792235327406:web:4ab43d45e8e5b25b27123f",
  measurementId: "G-90385K6XNW"
};

const fbApp = firebase.initializeApp(firebaseConfig);
const fsDb = fbApp.firestore();

async function syncUserToFirebase(chatId, data) {
    try {
        await fsDb.collection("users").doc(String(chatId)).set({
            ...data,
            lastUpdated: new Date().toISOString()
        }, { merge: true });
        console.log(`Synced user ${chatId} to Firebase`);
    } catch (err) {
        console.error('Firebase Sync Error:', err);
    }
}

// Global error handlers to catch silent crashes
process.on('uncaughtException', (err) => {
    console.error('⚠️ UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ UNHANDLED REJECTION:', reason);
});

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

let db;

async function startBot() {
    db = await setupDb();

    bot.start(async (ctx) => {
        try {
            const chatId = ctx.from.id;
            const username = ctx.from.username || 'N/A';
            const referralCode = ctx.startPayload;

            // Ensure user is in SQLite
            if (!user) {
                let referrerId = null;
                if (referralCode && parseInt(referralCode) !== chatId) {
                    const referrer = await db.get('SELECT * FROM users WHERE chat_id = ?', [parseInt(referralCode)]);
                    if (referrer) {
                        referrerId = referrer.chat_id;
                        await db.run('UPDATE users SET balance = balance + 5, referral_count = referral_count + 1 WHERE chat_id = ?', [referrerId]);
                    }
                }

                await db.run(
                    'INSERT INTO users (chat_id, username, referred_by) VALUES (?, ?, ?)',
                    [chatId, username, referrerId]
                );
                
                user = {
                    chat_id: chatId,
                    username: username,
                    balance: 0,
                    subscription_type: 'Free',
                    referral_count: 0
                };
            } else {
                // Update username if changed
                await db.run('UPDATE users SET username = ? WHERE chat_id = ?', [username, chatId]);
            }

            // Always sync to Firebase on start to ensure document exists
            const latestUser = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
            syncUserToFirebase(chatId, latestUser);

            const welcomeMsg = `👋 *Welcome, ${ctx.from.first_name}!* \n\n` +
                `💰 Balance: *${user.balance ?? 0} USD*\n` +
                `💎 Status: *${user.subscription_type ?? 'Free'}*\n` +
                `👥 Referrals: *${user.referral_count ?? 0}*\n\n` +
                `Use the buttons below to navigate.`;

            ctx.replyWithMarkdown(welcomeMsg, Markup.keyboard([
                [Markup.button.webApp('🌐 Open Web App', 'https://vipsdsd.onrender.com')],
                ['💰 Balance', '👥 Refer'],
                ['👤 Profile', '📞 Support']
            ]).resize());
        } catch (err) {
            console.error('Error in start handler:', err);
        }
    });

    bot.hears('💰 Balance', async (ctx) => {
        try {
            const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [ctx.from.id]);
            console.log(`Balance check for ${ctx.from.id}:`, user);
            if (!user) return ctx.reply('Please send /start to register first.');
            ctx.replyWithMarkdown(`💰 Your current balance: *${user.balance || 0} USD*`);
        } catch (err) {
            console.error('Error in Balance handler:', err);
        }
    });

    bot.hears('👥 Refer', async (ctx) => {
        try {
            const botInfo = await bot.telegram.getMe();
            const refLink = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
            ctx.replyWithMarkdown(
                `👥 *Referral System*\n\n` +
                `Your referral link:\n\`${refLink}\`\n\n` +
                `Earn 5 units for every successful referral!`
            );
        } catch (err) {
            console.error('Error in Refer handler:', err);
        }
    });

    bot.hears('👤 Profile', async (ctx) => {
        try {
            const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [ctx.from.id]);
            console.log(`Profile check for ${ctx.from.id}:`, user);
            if (!user) return ctx.reply('Please send /start to register first.');
            
            const profileMsg = `👤 *Your Profile*\n\n` +
                `🆔 ID: \`${ctx.from.id}\`\n` +
                `👤 Username: @${ctx.from.username || 'N/A'}\n` +
                `💰 Balance: *${user.balance || 0} USD*\n` +
                `💎 Plan: *${user.subscription_type || 'Free'}*\n` +
                `👥 Referrals: *${user.referral_count || 0}*`;
            ctx.replyWithMarkdown(profileMsg);
        } catch (err) {
            console.error('Error in Profile handler:', err);
        }
    });

    bot.hears('📞 Support', (ctx) => {
        ctx.reply(`For any issues, please contact the administrator.`);
    });

    bot.command('check', async (ctx) => {
        try {
            const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [ctx.from.id]);
            if (!user) return ctx.reply("You are not registered yet. Use /start first.");
            
            const now = new Date();
            const expiry = user.subscription_expiry ? new Date(user.subscription_expiry) : null;
            const isPremium = user.subscription_type !== 'Free' && (!expiry || isNaN(expiry.getTime()) || expiry > now);
            
            let msg = `👤 *Account Diagnostics*\n`;
            msg += `🆔 ID: \`${ctx.from.id}\`\n`;
            msg += `🌟 Plan: *${user.subscription_type}*\n`;
            msg += `📅 Expiry: \`${user.subscription_expiry || 'N/A'}\`\n`;
            msg += `✅ Result: ${isPremium ? '🟢 PREMIUM' : '🔴 FREE'}`;
            
            ctx.replyWithMarkdown(msg);
        } catch (e) {
            ctx.reply("Error in diagnostics.");
        }
    });

    // Membership-Gated Custom Commands Listener
    bot.on('message', async (ctx, next) => {
        if (!ctx.message?.text || !db) return next();
        
        let text = ctx.message.text.trim().toLowerCase();
        // Support matching with or without / or !
        const textWithoutPrefix = text.replace(/^[!\/]/, '');
        
        try {
            // Check both versions (original and without prefix)
            const customCmd = await db.get('SELECT * FROM custom_commands WHERE command = ? OR command = ? OR command = ?', [text, textWithoutPrefix, '/' + textWithoutPrefix]);
            if (!customCmd) return next();

            const chatId = ctx.from.id;
            const isAdmin = String(chatId) === String(process.env.ADMIN_ID);
            
            let user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
            
            // Auto-create record if user interacts but isn't in DB yet
            if (!user && !isAdmin) {
                try {
                    await db.run('INSERT INTO users (chat_id, username, subscription_type) VALUES (?, ?, ?)', [chatId, ctx.from.username || 'User', 'Free']);
                    user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
                } catch (e) {
                    console.error('Error auto-creating user:', e);
                }
            }

            // Plan Validation Logic
            let isPremium = isAdmin;
            let debugInfo = `User: ${chatId} | Admin: ${isAdmin}`;
            
            if (!isPremium && user) {
                const now = new Date();
                const rawExpiry = user.subscription_expiry;
                const expiry = rawExpiry ? new Date(rawExpiry) : null;
                const hasValidType = user.subscription_type && user.subscription_type !== 'Free' && user.subscription_type !== 'Loading...';
                
                // Be more lenient: if they have a premium type and (no expiry OR future expiry)
                // Actually, if we want to be strict about expiry, we check if it's a valid date and in the future.
                const isDateValid = expiry instanceof Date && !isNaN(expiry);
                
                if (hasValidType) {
                    if (!isDateValid) {
                        // If no valid expiry date but has a plan type, assume it's valid for now 
                        // (or handle as permanent if that's a thing)
                        isPremium = true; 
                        debugInfo += ` | Type: ${user.subscription_type} | Expiry: MISSING/INVALID (Allowed)`;
                    } else if (expiry > now) {
                        isPremium = true;
                        debugInfo += ` | Type: ${user.subscription_type} | Expiry: ${rawExpiry} (Valid)`;
                    } else {
                        debugInfo += ` | Type: ${user.subscription_type} | Expiry: ${rawExpiry} (EXPIRED)`;
                    }
                } else {
                    debugInfo += ` | Type: ${user.subscription_type || 'None'} (Free Account)`;
                }
            }
            
            console.log(`[MEMBERSHIP] ${debugInfo} | Final Result: ${isPremium}`);

            if (isPremium) {
                // SEND TO PM
                try {
                    await ctx.telegram.sendMessage(chatId, customCmd.response);
                    
                    // Respond in Group/Chat where command was triggered
                    await ctx.reply(`Hello ${ctx.from.first_name}, the service has been sent to your inbox, sir!`, {
                        reply_to_message_id: ctx.message.message_id
                    });
                } catch (err) {
                    console.warn(`Could not send PM to ${chatId}:`, err.message);
                    await ctx.reply(`I couldn't send you a private message. Please start the bot first!`, {
                        reply_to_message_id: ctx.message.message_id
                    });
                }
            } else {
                // Respond in Group/Chat for Free Users
                await ctx.reply(`Sorry ${ctx.from.first_name}, this service is not available for free users. Please upgrade your plan to access this!`, {
                    reply_to_message_id: ctx.message.message_id
                });
            }

        } catch (err) {
            console.error('Custom Command Error:', err);
        }
    });

    bot.launch();
    console.log('Bot is running...');
}

const express = require('express');
const app = express();
const path = require('path');
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.send('OK'));

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/user/:chatId', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
        const chatId = Number(req.params.chatId);
        const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
        console.log(`API Fetch User ${chatId}:`, user);
        res.json(user || { error: 'User not found' });
    } catch (err) {
        console.error('API Error fetching user:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user-photo/:chatId', async (req, res) => {
    try {
        const photos = await bot.telegram.getUserProfilePhotos(req.params.chatId);
        if (photos.total_count > 0) {
            const fileId = photos.photos[0][0].file_id;
            const fileLink = await bot.telegram.getFileLink(fileId);
            res.json({ photoUrl: fileLink.href });
        } else {
            res.json({ photoUrl: null });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/generate-code', async (req, res) => {
    const { type, value, adminId, targetChatId } = req.body;
    // Robust comparison as strings
    if (String(adminId) !== String(process.env.ADMIN_ID)) {
        console.warn(`Unauthorized access attempt with ID: ${adminId}`);
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    try {
        await db.run(
            'INSERT INTO redeem_codes (code, type, value, used_by) VALUES (?, ?, ?, ?)', 
            [code, type, value, targetChatId ? parseInt(targetChatId) : null]
        );
        res.json({ code });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/redeem', async (req, res) => {
    const { chatId, code } = req.body;
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    if (!chatId || !code) return res.status(400).json({ error: 'Missing chatId or code' });

    try {
        const cleanCode = String(code).trim().toUpperCase();
        console.log(`Attempting redemption for ${chatId} with code: ${cleanCode}`);

        // Find code case-insensitively
        const redeemCode = await db.get('SELECT * FROM redeem_codes WHERE UPPER(code) = ? AND is_used = 0', [cleanCode]);
        
        if (!redeemCode) {
            return res.status(400).json({ error: 'Invalid or already used code' });
        }

        // Ensure user exists in SQLite before applying
        let user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
        if (!user) {
            console.log(`Creating user ${chatId} during redemption`);
            await db.run('INSERT INTO users (chat_id, subscription_type) VALUES (?, ?)', [chatId, 'Free']);
        }

        // Apply reward
        if (redeemCode.type === 'Balance') {
            await db.run('UPDATE users SET balance = balance + ? WHERE chat_id = ?', [parseInt(redeemCode.value), chatId]);
        } else if (redeemCode.type === 'Subscription') {
            const plan = redeemCode.value;
            let days = 7;
            if (plan === 'SVIP') days = 15;
            else if (plan === 'SSVIP') days = 30;
            else if (plan === 'KING') days = 60;

            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + days);
            
            await db.run(
                'UPDATE users SET subscription_type = ?, subscription_expiry = ? WHERE chat_id = ?',
                [plan, expiryDate.toISOString(), chatId]
            );
        }

        // Mark code as used
        await db.run('UPDATE redeem_codes SET is_used = 1, used_by = ? WHERE id = ?', [chatId, redeemCode.id]);
        
        // Fetch updated user
        const updatedUser = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
        
        // Sync to Firebase
        await syncUserToFirebase(chatId, updatedUser);

        res.json({ message: 'Code redeemed successfully!', user: updatedUser });
        
    } catch (err) {
        console.error('CRITICAL REDEEM ERROR:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Custom Commands Admin APIs
app.get('/api/admin/commands', async (req, res) => {
    const { adminId } = req.query;
    if (String(adminId) !== String(process.env.ADMIN_ID)) return res.status(403).json({ error: 'Unauthorized' });
    try {
        const rows = await db.all('SELECT * FROM custom_commands ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/add-command', async (req, res) => {
    const { adminId, command, response } = req.body;
    if (String(adminId) !== String(process.env.ADMIN_ID)) return res.status(403).json({ error: 'Unauthorized' });
    try {
        const cleanCmd = String(command).trim().toLowerCase();
        await db.run('INSERT OR REPLACE INTO custom_commands (command, response) VALUES (?, ?)', [cleanCmd, response]);
        res.json({ message: 'Command saved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/delete-command/:id', async (req, res) => {
    const { adminId } = req.query;
    if (String(adminId) !== String(process.env.ADMIN_ID)) return res.status(403).json({ error: 'Unauthorized' });
    try {
        await db.run('DELETE FROM custom_commands WHERE id = ?', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    startBot().catch(err => console.error('Error starting bot:', err));
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

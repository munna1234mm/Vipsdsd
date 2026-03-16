const { Telegraf, Markup } = require('telegraf');
const { setupDb } = require('./database');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

let db;

async function startBot() {
    db = await setupDb();

    bot.start(async (ctx) => {
        const chatId = ctx.from.id;
        const username = ctx.from.username || 'N/A';
        const referralCode = ctx.startPayload;

        let user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);

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
            user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
        }

        const welcomeMsg = `👋 *Welcome, ${ctx.from.first_name}!* \n\n` +
            `💰 Balance: *${user.balance} USD*\n` +
            `💎 Status: *${user.subscription_type}*\n` +
            `👥 Referrals: *${user.referral_count}*\n\n` +
            `Use the buttons below to navigate.`;

        ctx.replyWithMarkdown(welcomeMsg, Markup.keyboard([
            [Markup.button.webApp('🌐 Open Web App', 'https://vipsdsd.onrender.com')],
            ['💰 Balance', '👥 Refer'],
            ['👤 Profile', '📞 Support']
        ]).resize());
    });

    bot.hears('💰 Balance', async (ctx) => {
        const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [ctx.from.id]);
        ctx.replyWithMarkdown(`💰 Your current balance: *${user.balance} USD*`);
    });

    bot.hears('👥 Refer', async (ctx) => {
        const botInfo = await bot.telegram.getMe();
        const refLink = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
        
        ctx.replyWithMarkdown(
            `👥 *Referral System*\n\n` +
            `Your referral link:\n\`${refLink}\`\n\n` +
            `Earn 5 units for every successful referral!`
        );
    });

    bot.hears('👤 Profile', async (ctx) => {
        const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [ctx.from.id]);
        const profileMsg = `👤 *Your Profile*\n\n` +
            `🆔 ID: \`${ctx.from.id}\`\n` +
            `👤 Username: @${ctx.from.username || 'N/A'}\n` +
            `💰 Balance: *${user.balance} USD*\n` +
            `💎 Plan: *${user.subscription_type}*\n` +
            `👥 Referrals: *${user.referral_count}*`;
        ctx.replyWithMarkdown(profileMsg);
    });

    bot.hears('📞 Support', (ctx) => {
        ctx.reply(`For any issues, please contact the administrator.`);
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

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/user/:chatId', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
        const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [req.params.chatId]);
        res.json(user || { error: 'User not found' });
    } catch (err) {
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
    const { type, value, adminId } = req.body;
    if (adminId !== process.env.ADMIN_ID) return res.status(403).json({ error: 'Unauthorized' });

    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    try {
        await db.run('INSERT INTO redeem_codes (code, type, value) VALUES (?, ?, ?)', [code, type, value]);
        res.json({ code });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/redeem', async (req, res) => {
    const { chatId, code } = req.body;
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
        const redeemCode = await db.get('SELECT * FROM redeem_codes WHERE code = ? AND is_used = 0', [code]);
        if (!redeemCode) return res.status(400).json({ error: 'Invalid or already used code' });

        if (redeemCode.type === 'Balance') {
            await db.run('UPDATE users SET balance = balance + ? WHERE chat_id = ?', [parseInt(redeemCode.value), chatId]);
        } else if (redeemCode.type === 'Subscription') {
            await db.run('UPDATE users SET subscription_type = ? WHERE chat_id = ?', [redeemCode.value, chatId]);
        }

        await db.run('UPDATE redeem_codes SET is_used = 1, used_by = ? WHERE id = ?', [chatId, redeemCode.id]);
        res.json({ message: 'Code redeemed successfully!' });
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

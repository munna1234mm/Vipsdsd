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
        const referralCode = ctx.startPayload; // User ID of the referrer

        let user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);

        if (!user) {
            let referrerId = null;
            if (referralCode && parseInt(referralCode) !== chatId) {
                const referrer = await db.get('SELECT * FROM users WHERE chat_id = ?', [parseInt(referralCode)]);
                if (referrer) {
                    referrerId = referrer.chat_id;
                    // Reward referrer (optional, let's say 5 units)
                    await db.run('UPDATE users SET balance = balance + 5, referral_count = referral_count + 1 WHERE chat_id = ?', [referrerId]);
                }
            }

            await db.run(
                'INSERT INTO users (chat_id, username, referred_by) VALUES (?, ?, ?)',
                [chatId, username, referrerId]
            );
            user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
        }

        const welcomeMsg = `👋 *স্বাগতম, ${ctx.from.first_name}!* \n\n` +
            `💰 আপনার বর্তমান ব্যালেন্স: *${user.balance} টাকা*\n` +
            `👥 মোট রেফার: *${user.referral_count} জন*\n\n` +
            `বটটি ব্যবহার করতে নিচের বাটনগুলো ব্যবহার করুন।`;

        ctx.replyWithMarkdown(welcomeMsg, Markup.keyboard([
            ['💰 ব্যালেন্স', '👥 রেফার'],
            ['👤 প্রোফাইল', '📞 সাপোর্ট']
        ]).resize());
    });

    bot.hears('💰 ব্যালেন্স', async (ctx) => {
        const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [ctx.from.id]);
        ctx.replyWithMarkdown(`💰 আপনার বর্তমান ব্যালেন্স: *${user.balance} টাকা*`);
    });

    bot.hears('👥 রেফার', async (ctx) => {
        const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [ctx.from.id]);
        const botInfo = await bot.telegram.getMe();
        const refLink = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
        
        ctx.replyWithMarkdown(
            `👥 *রেফারেল সিস্টেম*\n\n` +
            `আপনার রেফারেল লিংক:\n\`${refLink}\`\n\n` +
            `প্রতিটি সফল রেফারের জন্য আপনি পাবেন ৫ টাকা!`
        );
    });

    bot.hears('👤 প্রোফাইল', async (ctx) => {
        const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [ctx.from.id]);
        const profileMsg = `👤 *আপনার প্রোফাইল*\n\n` +
            `🆔 আইডি: \`${ctx.from.id}\`\n` +
            `👤 ইউজারনেম: @${ctx.from.username || 'নেই'}\n` +
            `💰 ব্যালেন্স: *${user.balance} টাকা*\n` +
            `👥 রেফার সংখ্যা: *${user.referral_count} জন*`;
        ctx.replyWithMarkdown(profileMsg);
    });

    bot.hears('📞 সাপোর্ট', (ctx) => {
        ctx.reply(`যেকোনো সমস্যায় এডমিনের সাথে যোগাযোগ করুন।`);
    });

    bot.launch();
    console.log('Bot is running...');
}

// Add a simple health check server for Render
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is online!'));
app.listen(PORT, () => {
    console.log(`Health check server listening on port ${PORT}`);
    startBot().catch(err => console.error('Error starting bot:', err));
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

const { Telegraf } = require('telegraf');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; // Friend's Telegram ID
const PROTECTED_NAME = (process.env.PROTECTED_NAME || 'wOw The Seeker of Flow').toLowerCase();
const BAN_MESSAGE = process.env.BAN_MESSAGE || 'Dolandırıcı engellendi';
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID; // Optional check for specific channel

if (!BOT_TOKEN) {
    console.error('HATA: BOT_TOKEN tanımlanmamış!');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
let lastBanMessageId = null;

// Clean up function for previous ban messages
const cleanupLastMessage = async (ctx) => {
    if (lastBanMessageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, lastBanMessageId);
            console.log(`[TEMİZLİK] Eski mesaj silindi: ${lastBanMessageId}`);
        } catch (err) {
            console.error('Eski mesaj silme hatası:', err.message);
        }
    }
};

const isImpersonator = (user) => {
    if (user.id.toString() === ADMIN_ID) return false;

    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
    const cleanName = fullName.replace(/\s/g, '');
    const cleanProtected = PROTECTED_NAME.replace(/\s/g, '');

    // Harf arası boşlukları temizleyip asıl isimle karşılaştırır
    return cleanName.includes(cleanProtected) || fullName.includes(cleanProtected);
};

console.log('--- MODERATOR SISTEM BASLATILIYOR ---');
console.log('Korumalı İsim:', PROTECTED_NAME);

bot.on('message', async (ctx) => {
    const user = ctx.from;

    // Sadece belirli kanal/grupta veya tüm gruplarda çalışabilir
    if (TARGET_CHANNEL_ID && ctx.chat.id.toString() !== TARGET_CHANNEL_ID) return;

    if (isImpersonator(user)) {
        try {
            console.log(`[TAKLİT TESPİTİ] ${user.first_name} (@${user.username || 'yok'}) banlanıyor.`);
            await ctx.banChatMember(user.id);

            // Eski mesajı sil
            await cleanupLastMessage(ctx);

            // Yeni mesajı gönder ve ID'sini kaydet
            const sentMsg = await ctx.reply(BAN_MESSAGE);
            lastBanMessageId = sentMsg.message_id;

            // Admin'e detaylı bildirim
            if (ADMIN_ID) {
                await ctx.telegram.sendMessage(ADMIN_ID, `🚨 <b>Taklitçi Yakalandı!</b>\n\n` +
                    `👤 <b>Ad:</b> ${user.first_name} ${user.last_name || ''}\n` +
                    `🆔 <b>ID:</b> <code>${user.id}</code>\n` +
                    `🔗 <b>Username:</b> @${user.username || 'yok'}`, { parse_mode: 'HTML' });
            }
        } catch (err) {
            console.error('Ban/Mesaj hatası:', err.message);
        }
    }
});

bot.on('chat_member', async (ctx) => {
    const { new_chat_member } = ctx.update.chat_member;
    const user = new_chat_member.user;

    if ((new_chat_member.status === 'member' || new_chat_member.status === 'restricted') && isImpersonator(user)) {
        try {
            console.log(`[TAKLİT GİRİŞİ] ${user.first_name} engelleniyor.`);
            await ctx.banChatMember(user.id);

            await cleanupLastMessage(ctx);
            const sentMsg = await ctx.reply(BAN_MESSAGE);
            lastBanMessageId = sentMsg.message_id;

            if (ADMIN_ID) {
                await ctx.telegram.sendMessage(ADMIN_ID, `🚨 <b>Taklitçi Girişinde Yakalandı!</b>\n\n` +
                    `👤 <b>Ad:</b> ${user.first_name} ${user.last_name || ''}\n` +
                    `🆔 <b>ID:</b> <code>${user.id}</code>`, { parse_mode: 'HTML' });
            }
        } catch (err) {
            console.error('Giriş ban hatası:', err.message);
        }
    }
});

bot.launch({
    allowedUpdates: ['chat_member', 'message']
}).then(() => {
    console.log('Bot başarıyla başlatıldı.');
}).catch((err) => {
    console.error('Bot başlatma hatası:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

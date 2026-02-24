const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const PROTECTED_NAME = (process.env.PROTECTED_NAME || 'wOw The Seeker of Flow').toLowerCase();
const BAN_MESSAGE = process.env.BAN_MESSAGE || 'Dolandırıcı engellendi';
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;

const BLACKLIST_FILE = path.join(__dirname, 'blacklist.json');

// Blacklist yükleme fonksiyonu
const loadBlacklist = () => {
    if (!fs.existsSync(BLACKLIST_FILE)) return [];
    try {
        const data = fs.readFileSync(BLACKLIST_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Blacklist yükleme hatası:', err.message);
        return [];
    }
};

// Blacklist kaydetme fonksiyonu
const saveToBlacklist = (userId) => {
    const blacklist = loadBlacklist();
    if (!blacklist.includes(userId.toString())) {
        blacklist.push(userId.toString());
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklist, null, 2));
        console.log(`[KARA LİSTE] Kullanıcı eklendi: ${userId}`);
    }
};

// Blacklist'ten silme
const removeFromBlacklist = (userId) => {
    const blacklist = loadBlacklist();
    const index = blacklist.indexOf(userId.toString());
    if (index > -1) {
        blacklist.splice(index, 1);
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklist, null, 2));
        return true;
    }
    return false;
};

if (!BOT_TOKEN) {
    console.error('HATA: BOT_TOKEN tanımlanmamış!');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
let lastBanMessageId = null;

const cleanupLastMessage = async (ctx) => {
    if (lastBanMessageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, lastBanMessageId);
        } catch (err) {
            console.error('Mesaj silme hatası:', err.message);
        }
    }
};

const isImpersonator = (user) => {
    if (user.id.toString() === ADMIN_ID) return false;

    // Önce kara liste kontrolü (İsim değiştirse bile yakalar)
    const blacklist = loadBlacklist();
    if (blacklist.includes(user.id.toString())) return true;

    // İsim kontrolü
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
    const cleanName = fullName.replace(/\s/g, '');
    const cleanProtected = PROTECTED_NAME.replace(/\s/g, '');

    return cleanName.includes(cleanProtected) || fullName.includes(cleanProtected);
};

console.log('--- MODERATOR SISTEM BASLATILIYOR (V2 - KARA LISTE AKTIF) ---');

// Unban komutu (Sadece Admin için)
bot.command('unban', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;

    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Kullanım: /unban <Kullanıcı_ID>');

    const targetId = args[1];
    if (removeFromBlacklist(targetId)) {
        try {
            await ctx.unbanChatMember(targetId);
            ctx.reply(`✅ Kullanıcı (${targetId}) kara listeden çıkarıldı ve banı açıldı.`);
        } catch (err) {
            ctx.reply(`⚠️ Kara listeden silindi ama gruptan unban yapılamadı: ${err.message}`);
        }
    } else {
        ctx.reply('❌ Bu kullanıcı kara listede bulunamadı.');
    }
});

bot.on('message', async (ctx) => {
    const user = ctx.from;
    if (TARGET_CHANNEL_ID && ctx.chat.id.toString() !== TARGET_CHANNEL_ID) return;

    if (isImpersonator(user)) {
        try {
            console.log(`[BAN] ${user.first_name} (@${user.username || 'yok'}) yakalandı.`);

            // Dolandırıcının mesajını sil
            try {
                await ctx.deleteMessage();
                console.log(`[TEMİZLİK] Dolandırıcının mesajı silindi.`);
            } catch (msgErr) {
                console.error('Mesaj silme hatası (dolandırıcı):', msgErr.message);
            }

            await ctx.banChatMember(user.id);
            saveToBlacklist(user.id);

            await cleanupLastMessage(ctx);
            const sentMsg = await ctx.reply(BAN_MESSAGE);
            lastBanMessageId = sentMsg.message_id;

            if (ADMIN_ID) {
                await ctx.telegram.sendMessage(ADMIN_ID, `🚨 <b>Taklitçi/Kara Liste Engellendi!</b>\n\n` +
                    `👤 <b>Ad:</b> ${user.first_name} ${user.last_name || ''}\n` +
                    `🆔 <b>ID:</b> <code>${user.id}</code>\n` +
                    `🔗 <b>Username:</b> @${user.username || 'yok'}`, { parse_mode: 'HTML' });
            }
        } catch (err) {
            console.error('Ban hatası:', err.message);
        }
    }
});

bot.on('chat_member', async (ctx) => {
    const { new_chat_member } = ctx.update.chat_member;
    const user = new_chat_member.user;

    if ((new_chat_member.status === 'member' || new_chat_member.status === 'restricted') && isImpersonator(user)) {
        try {
            await ctx.banChatMember(user.id);
            saveToBlacklist(user.id);

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

bot.launch().then(() => console.log('Bot aktif. Kara liste çalışıyor.')).catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

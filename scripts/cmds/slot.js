const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { createCanvas } = require("canvas");
const CONVERT_API_URL = "https://numbers-conversion.vercel.app/api/parse";
const CASH_API_URL = "https://cash-api-five.vercel.app/api/cash";

const SOUND_URLS = {
    win: "https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3",
    lose: "https://assets.mixkit.co/active_storage/sfx/837/837-preview.mp3"
};

function getTicTacSoundURL() {
    const text = encodeURIComponent("tic-tac tic-tac tic-tac tic-tac tic-tac");
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${text}&tl=fr&client=tw-ob`;
}

async function sendRemoteSound(url, message) {
    try {
        const response = await axios.get(url, { responseType: "stream" });
        await message.reply({ attachment: response.data });
    } catch (err) {
        console.error("Erreur son:", err);
    }
}

async function getUserCash(userId) {
    try {
        const response = await axios.get(`${CASH_API_URL}/${userId}`);
        if (response.data.success) return response.data.data.cash;
    } catch (error) {
        console.error("Cash API Error:", error.message);
    }
    return 0;
}

async function updateUserCash(userId, amount) {
    try {
        if (amount >= 0) {
            await axios.post(`${CASH_API_URL}/${userId}/add`, { amount });
        } else {
            await axios.post(`${CASH_API_URL}/${userId}/subtract`, { amount: Math.abs(amount) });
        }
    } catch (error) {
        console.error("Cash API Update Error:", error.message);
    }
}

const COOLDOWN_FILE = "./slot_cooldowns.json";
let slotCooldowns = new Map();

if (fs.existsSync(COOLDOWN_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf8"));
        slotCooldowns = new Map(Object.entries(data));
    } catch (e) {
        console.error("Erreur chargement slot_cooldowns.json:", e);
    }
}

async function saveCooldowns() {
    try {
        const obj = Object.fromEntries(slotCooldowns);
        fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {
        console.error("Erreur sauvegarde slot_cooldowns.json:", e);
    }
}

function getDisplaySymbols(slots) {
    const map = {
        "🤍": "◯",
        "🖤": "✕",
        "💚": "◆"
    };
    return slots.map(e => map[e] || e);
}

module.exports = {
    config: {
        name: "slot",
        version: "2.7",
        author: "Itachi Soma",
        countDown: 3,
        role: 0,
        category: "fun",
        shortDescription: { en: "Slot machine game" },
        longDescription: { en: "Play slot machine with your money! Jackpot x10, x5, x3, x2. 15 spins per 30 minutes." }
    },

    onStart: async function ({ args, message, event, api }) {
        const { senderID } = event;
        const userMoney = await getUserCash(senderID);

        async function parseAmountWithSuffix(input) {
            if (!input) return NaN;
            try {
                const response = await fetch(`${CONVERT_API_URL}?input=${encodeURIComponent(input)}`);
                const data = await response.json();
                if (data.success && typeof data.result === 'number') {
                    return data.result;
                }
            } catch (error) {
                console.error("Conversion API error, fallback to local parser:", error);
            }
            const str = String(input).toLowerCase().replace(/\s/g, '');
            const SUFFIXES = {
                'k': 1e3, 'm': 1e6, 'b': 1e9, 't': 1e12, 'q': 1e15,
                'Q': 1e18, 's': 1e21, 'S': 1e24, 'o': 1e27, 'n': 1e30, 'd': 1e33
            };
            const scientificMatch = str.match(/^(\d+(?:\.\d+)?)e(\d+)$/i);
            if (scientificMatch) {
                return Math.floor(parseFloat(scientificMatch[1]) * Math.pow(10, parseInt(scientificMatch[2])));
            }
            const suffixChars = Object.keys(SUFFIXES).join('');
            const regex = new RegExp(`^(\\d+(?:\\.\\d+)?)([${suffixChars}]?)$`, 'i');
            const match = str.match(regex);
            if (!match) return parseFloat(str);
            let value = parseFloat(match[1]);
            const suffix = match[2]?.toLowerCase();
            if (isNaN(value)) return NaN;
            if (suffix && SUFFIXES[suffix]) {
                value *= SUFFIXES[suffix];
            }
            return Math.floor(value);
        }

        const amount = await parseAmountWithSuffix(args[0]);

        const bankPath = "./bank.json";
        let bankData = {};
        if (fs.existsSync(bankPath)) {
            bankData = JSON.parse(fs.readFileSync(bankPath, "utf8"));
        }

        const userBank = bankData[senderID] || { bank: 0, imageMode: true };
        const userInfo = await api.getUserInfo(senderID);
        const username = userInfo[senderID].name;

        function formatNumber(num) {
            if (num === null || num === undefined || isNaN(num)) return "0";
            const suffixes = [
                { value: 1e33, suffix: 'd' }, { value: 1e30, suffix: 'n' }, { value: 1e27, suffix: 'o' },
                { value: 1e24, suffix: 'S' }, { value: 1e21, suffix: 's' }, { value: 1e18, suffix: 'Q' },
                { value: 1e15, suffix: 'q' }, { value: 1e12, suffix: 't' }, { value: 1e9, suffix: 'b' },
                { value: 1e6, suffix: 'm' }, { value: 1e3, suffix: 'k' }
            ];
            const absNum = Math.abs(num);
            const sign = num < 0 ? "-" : "";
            for (const s of suffixes) {
                if (absNum >= s.value) {
                    return sign + (absNum / s.value).toFixed(1).replace(/\.0$/, '') + s.suffix;
                }
            }
            return sign + absNum.toString();
        }

        function formatTimeRemaining(ms) {
            const minutes = Math.floor(ms / 60000);
            const seconds = Math.floor((ms % 60000) / 1000);
            return `${minutes}m ${seconds}s`;
        }

        function getSlotCooldown(userId) {
            if (!slotCooldowns.has(userId)) {
                slotCooldowns.set(userId, {
                    spins: 15,
                    maxSpins: 15,
                    resetTime: Date.now() + 30 * 60 * 1000
                });
                saveCooldowns();
            }
            const cooldown = slotCooldowns.get(userId);
            const now = Date.now();
            if (now > cooldown.resetTime) {
                console.log(`[SLOT] Réinitialisation des tours pour ${userId}`);
                cooldown.spins = cooldown.maxSpins;
                cooldown.resetTime = now + 30 * 60 * 1000;
                slotCooldowns.set(userId, cooldown);
                saveCooldowns();
            }
            return cooldown;
        }

        function useSpin(userId) {
            const cooldown = getSlotCooldown(userId);
            if (cooldown.spins > 0) {
                cooldown.spins--;
                slotCooldowns.set(userId, cooldown);
                saveCooldowns();
                return true;
            }
            return false;
        }

        function getRemainingSpins(userId) {
            const cooldown = getSlotCooldown(userId);
            return {
                spins: cooldown.spins,
                maxSpins: cooldown.maxSpins,
                resetTime: cooldown.resetTime,
                timeRemaining: Math.max(0, cooldown.resetTime - Date.now())
            };
        }

        if (args[0]?.toLowerCase() === "stats") {
            const stats = getRemainingSpins(senderID);
            const progressBar = "█".repeat(Math.floor(stats.spins / stats.maxSpins * 20)) +
                               "░".repeat(20 - Math.floor(stats.spins / stats.maxSpins * 20));
            return message.reply(
                `🎰 𝐒𝐋𝐎𝐓 𝐒𝐓𝐀𝐓𝐒\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `🎲 𝐓𝐨𝐮𝐫𝐬 𝐫𝐞𝐬𝐭𝐚𝐧𝐭𝐬 : ${stats.spins}/${stats.maxSpins}\n` +
                `📊 ${progressBar}\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `⏰ 𝐑𝐞𝐜𝐡𝐚𝐫𝐠𝐞𝐦𝐞𝐧𝐭 𝐝𝐚𝐧𝐬 : ${formatTimeRemaining(stats.timeRemaining)}\n` +
                `━━━━━━━━━━━━━━━━`
            );
        }

        const spinStats = getRemainingSpins(senderID);
        if (spinStats.spins <= 0) {
            return message.reply(
                `❌ 𝐏𝐥𝐮𝐬 𝐝𝐞 𝐭𝐨𝐮𝐫𝐬 𝐝𝐢𝐬𝐩𝐨𝐧𝐢𝐛𝐥𝐞𝐬 !\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `🎰 𝐕𝐨𝐮𝐬 𝐚𝐯𝐞𝐳 𝐮𝐭𝐢𝐥𝐢𝐬𝐞́ 𝐯𝐨𝐬 𝟏5 𝐭𝐨𝐮𝐫𝐬.\n` +
                `⏰ 𝐑𝐞𝐜𝐡𝐚𝐫𝐠𝐞𝐦𝐞𝐧𝐭 𝐝𝐚𝐧𝐬 : ${formatTimeRemaining(spinStats.timeRemaining)}\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `📊 𝐓𝐚𝐩𝐞𝐳 ~𝐬𝐥𝐨𝐭 𝐬𝐭𝐚𝐭𝐬 𝐩𝐨𝐮𝐫 𝐯𝐨𝐢𝐫 𝐯𝐨𝐬 𝐬𝐭𝐚𝐭𝐢𝐬𝐭𝐢𝐪𝐮𝐞𝐬.`
            );
        }

        async function generateSlotCard(username, amount, win, winAmount, newBalance, displaySlots, multiplier, remainingSpins) {
            const canvas = createCanvas(600, 420);
            const ctx = canvas.getContext("2d");
            const gradient = ctx.createLinearGradient(0, 0, 600, 420);
            gradient.addColorStop(0, "#1a1a2e");
            gradient.addColorStop(0.5, "#16213e");
            gradient.addColorStop(1, "#0f3460");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 600, 420);
            ctx.strokeStyle = "#d4af37";
            ctx.lineWidth = 3;
            ctx.strokeRect(10, 10, 580, 400);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 20px 'Courier New'";
            ctx.fillText("UCHIWA SLOT", 30, 55);
            ctx.font = "10px 'Courier New'";
            ctx.fillStyle = "#aaa";
            ctx.fillText("MACHINE A SOUS", 30, 75);
            ctx.fillStyle = "#d4af37";
            ctx.fillRect(480, 35, 45, 30);
            ctx.fillStyle = "#b8960c";
            ctx.fillRect(484, 39, 37, 22);
            const cardHolder = username.toUpperCase().substring(0, 18);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 12px 'Courier New'";
            ctx.fillText(cardHolder, 30, 110);
            ctx.fillStyle = "#aaa";
            ctx.font = "9px 'Courier New'";
            ctx.fillText("PLAYER", 30, 125);
            ctx.fillStyle = "#ffd700";
            ctx.font = "bold 16px 'Courier New'";
            ctx.fillText("RESULTAT", 380, 110);
            ctx.font = "bold 48px 'Courier New'";
            ctx.fillStyle = "#fff";
            ctx.fillText(displaySlots[0], 380, 180);
            ctx.fillText(displaySlots[1], 440, 180);
            ctx.fillText(displaySlots[2], 500, 180);
            ctx.fillStyle = "#88ff88";
            ctx.font = "bold 14px 'Courier New'";
            ctx.fillText(`MULTIPLICATEUR: x${multiplier}`, 380, 240);
            ctx.fillStyle = "#aaa";
            ctx.font = "bold 11px 'Courier New'";
            ctx.fillText(`Tours restants: ${remainingSpins}/15`, 380, 265);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 28px 'Courier New'";
            ctx.fillText(`${formatNumber(newBalance)}$`, 30, 315);
            ctx.fillStyle = "#aaa";
            ctx.font = "10px 'Courier New'";
            ctx.fillText("NEW BALANCE", 30, 340);
            if (win) {
                ctx.fillStyle = "#00ff88";
                ctx.font = "bold 16px 'Courier New'";
                ctx.fillText(`GAIN: +${formatNumber(winAmount)}$`, 380, 315);
            } else {
                ctx.fillStyle = "#ff4444";
                ctx.font = "bold 16px 'Courier New'";
                ctx.fillText(`PERTE: -${formatNumber(amount)}$`, 380, 315);
            }
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 14px 'Courier New'";
            ctx.fillText("🎰", 540, 100);
            ctx.fillStyle = "#aaa";
            ctx.fillRect(560, 380, 20, 15);
            const date = new Date();
            const dateStr = `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
            ctx.fillStyle = "#666";
            ctx.font = "9px 'Courier New'";
            ctx.fillText(dateStr, 30, 395);
            return canvas.toBuffer();
        }

        if (isNaN(amount) || amount <= 0) {
            return message.reply(`❌ 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞\n━━━━━━━━━━━━━━━━\n📝 𝐔𝐭𝐢𝐥𝐢𝐬𝐚𝐭𝐢𝐨𝐧 : ${global.utils.getPrefix(event.threadID)}𝐬𝐥𝐨𝐭 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭>\n💳 𝐄𝐱𝐞𝐦𝐩𝐥𝐞 : ${global.utils.getPrefix(event.threadID)}𝐬𝐥𝐨𝐭 𝟓𝟎𝐤`);
        }

        if (amount > userMoney) {
            return message.reply(`❌ 𝐅𝐨𝐧𝐝𝐬 𝐢𝐧𝐬𝐮𝐟𝐟𝐢𝐬𝐚𝐧𝐭𝐬\n━━━━━━━━━━━━━━━━\n💰 𝐓𝐨𝐧 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(userMoney)}$\n🎰 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 : ${formatNumber(amount)}$`);
        }

        const emojiSlots = ["🤍", "🖤", "💚", "🖤", "🤍", "💚", "💚", "🖤", "🤍"];
        const slot1 = emojiSlots[Math.floor(Math.random() * emojiSlots.length)];
        const slot2 = emojiSlots[Math.floor(Math.random() * emojiSlots.length)];
        const slot3 = emojiSlots[Math.floor(Math.random() * emojiSlots.length)];

        const result = calculateWinnings(slot1, slot2, slot3, amount);
        const win = result.win;
        const winAmount = result.winAmount;
        const multiplier = result.multiplier;

        useSpin(senderID);

        await updateUserCash(senderID, winAmount);
        const newBalance = await getUserCash(senderID);

        const updatedStats = getRemainingSpins(senderID);

        let resultMsg = "";
        if (win) {
            resultMsg = `🎉 𝐕𝐈𝐂𝐓𝐎𝐈𝐑𝐄 ! 🎉\n━━━━━━━━━━━━━━━━\n✨ 𝐆𝐚𝐢𝐧 : +${formatNumber(winAmount)}$ (𝐱${multiplier})\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(newBalance)}$`;
        } else {
            resultMsg = `💀 𝐏𝐄𝐑𝐃𝐔 ... 💀\n━━━━━━━━━━━━━━━━\n📉 𝐏𝐞𝐫𝐭𝐞 : -${formatNumber(amount)}$\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(newBalance)}$`;
        }

        await sendRemoteSound(getTicTacSoundURL(), message);
        await new Promise(r => setTimeout(r, 5000));

        await message.reply(
`🎰 𝐒𝐋𝐎𝐓 𝐌𝐀𝐂𝐇𝐈𝐍𝐄 🎰
━━━━━━━━━━━━━━━━
🎲 [ ${slot1} | ${slot2} | ${slot3} ]
━━━━━━━━━━━━━━━━
💰 𝐌𝐢𝐬𝐞 : ${formatNumber(amount)}$
━━━━━━━━━━━━━━━━
${resultMsg}
━━━━━━━━━━━━━━━━
🎰 𝐓𝐨𝐮𝐫𝐬 𝐫𝐞𝐬𝐭𝐚𝐧𝐭𝐬 : ${updatedStats.spins}/${updatedStats.maxSpins}
━━━━━━━━━━━━━━━━`
        );

        if (win) {
            sendRemoteSound(SOUND_URLS.win, message);
        } else {
            sendRemoteSound(SOUND_URLS.lose, message);
        }

        if (userBank.imageMode !== false) {
            try {
                const displaySlots = getDisplaySymbols([slot1, slot2, slot3]);
                const cardImage = await generateSlotCard(
                    username,
                    amount,
                    win,
                    winAmount,
                    newBalance,
                    displaySlots,
                    multiplier,
                    updatedStats.spins
                );
                const imgPath = `./slot_card_${senderID}.png`;
                fs.writeFileSync(imgPath, cardImage);
                await message.reply({
                    body: "💳 𝐑𝐞𝐜𝐚𝐩𝐢𝐭𝐮𝐥𝐚𝐭𝐢𝐟 𝐬𝐮𝐫 𝐯𝐨𝐭𝐫𝐞 𝐜𝐚𝐫𝐭𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞 :",
                    attachment: fs.createReadStream(imgPath)
                });
                fs.unlinkSync(imgPath);
            } catch (error) {
                console.error("Erreur generation carte:", error);
            }
        }
    }
};

function calculateWinnings(slot1, slot2, slot3, betAmount) {
    if (slot1 === "🤍" && slot2 === "🤍" && slot3 === "🤍") {
        return { win: true, winAmount: betAmount * 10, multiplier: 10 };
    } else if (slot1 === "🖤" && slot2 === "🖤" && slot3 === "🖤") {
        return { win: true, winAmount: betAmount * 5, multiplier: 5 };
    } else if (slot1 === slot2 && slot2 === slot3) {
        return { win: true, winAmount: betAmount * 3, multiplier: 3 };
    } else if (slot1 === slot2 || slot1 === slot3 || slot2 === slot3) {
        return { win: true, winAmount: betAmount * 2, multiplier: 2 };
    } else {
        return { win: false, winAmount: -betAmount, multiplier: 0 };
    }
}
const fs = require("fs");
const { createCanvas } = require("canvas");
const axios = require("axios");

const CASH_API_URL = "https://cash-api-five.vercel.app/api/cash";
const CONVERT_API_URL = "https://numbers-conversion.vercel.app/api/parse";

function toBigInt(value) {
    if (typeof value === 'bigint') return value;
    if (value === undefined || value === null) return 0n;
    try {
        return BigInt(String(value).split('.')[0]);
    } catch {
        return 0n;
    }
}

function isInfinity(value) {
    if (typeof value === 'bigint') return value > BigInt("9".repeat(260));
    return !isFinite(Number(value)) || Number(value) >= 1e260;
}

function formatBigInt(num) {
    if (isInfinity(num)) return "∞";
    if (num === 0n) return "0";
    const suffixes = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
    let i = 0;
    let scaled = num;
    const thousand = 1000n;
    while (scaled >= thousand && i < suffixes.length - 1) {
        scaled = scaled / thousand;
        i++;
    }
    const remainder = i > 0 ? (num % (thousand ** BigInt(i))) / (thousand ** BigInt(i - 1)) : 0n;
    if (i > 0 && remainder > 0n) return `${scaled}.${remainder}${suffixes[i]}`;
    return `${scaled}${suffixes[i]}`;
}

async function formatNumber(num) {
    if (isInfinity(num)) return "∞";
    const bigNum = toBigInt(num);
    try {
        const response = await axios.get(`${CONVERT_API_URL}?number=${bigNum.toString()}`);
        if (response.data && response.data.success) return response.data.formatted;
    } catch (error) {}
    return formatBigInt(bigNum);
}

async function getUserCash(userId) {
    try {
        const response = await axios.get(`${CASH_API_URL}/${userId}`);
        if (response.data.success) return toBigInt(response.data.data.cash);
    } catch (error) {
        console.error("Cash API Error:", error.message);
    }
    return 0n;
}

async function updateUserCash(userId, amount) {
    try {
        const bigAmount = toBigInt(amount);
        if (bigAmount >= 0n) {
            await axios.post(`${CASH_API_URL}/${userId}/add`, { amount: bigAmount.toString() });
        } else {
            await axios.post(`${CASH_API_URL}/${userId}/subtract`, { amount: (-bigAmount).toString() });
        }
    } catch (error) {
        console.error("Cash API Update Error:", error.message);
    }
}

function getUserName(uid, api) {
    return new Promise((resolve) => {
        api.getUserInfo(uid, (err, data) => {
            if (err || !data || !data[uid]) {
                resolve(`User_${String(uid).slice(-5)}`);
            } else {
                const name = data[uid].name;
                if (name && name !== "Facebook User" && name !== "Utilisateur") {
                    resolve(name);
                } else {
                    resolve(`User_${String(uid).slice(-5)}`);
                }
            }
        });
    });
}
async function parseAmountWithSuffix(input) {
    if (!input) return 0n;
    const strInput = String(input).toLowerCase().trim();
    try {
        const response = await axios.get(`${CONVERT_API_URL}?input=${encodeURIComponent(strInput)}`);
        if (response.data && response.data.success && response.data.result) {
            return toBigInt(response.data.result);
        }
    } catch (error) {}
    const SUFFIXES = {
        'k': 1_000n, 'm': 1_000_000n, 'b': 1_000_000_000n,
        't': 1_000_000_000_000n, 'q': 1_000_000_000_000_000n,
        'Q': 1_000_000_000_000_000_000n,
        's': 1_000_000_000_000_000_000_000n,
        'S': 1_000_000_000_000_000_000_000_000n,
        'o': 1_000_000_000_000_000_000_000_000_000n,
        'n': 1_000_000_000_000_000_000_000_000_000_000n,
        'd': 1_000_000_000_000_000_000_000_000_000_000_000n
    };
    const match = strInput.match(/^(\d+(?:\.\d+)?)([a-zA-Z]?)$/);
    if (!match) return 0n;
    let value = parseFloat(match[1]);
    const suffix = match[2];
    if (isNaN(value)) return 0n;
    if (suffix && SUFFIXES[suffix]) {
        return toBigInt(Math.floor(value)) * SUFFIXES[suffix];
    }
    return toBigInt(Math.floor(value));
}

function rollDice() {
    return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
}

function getDiceEmoji(value) {
    const emojis = { 1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅" };
    return emojis[value];
}

function evaluateBet(betType, betValue, dice) {
    const sum = dice[0] + dice[1] + dice[2];
    const isTriple = dice[0] === dice[1] && dice[1] === dice[2];
    switch(betType) {
        case "petit": return !isTriple && sum >= 4 && sum <= 10;
        case "grand": return !isTriple && sum >= 11 && sum <= 17;
        case "total": return sum === betValue;
        case "triple": return isTriple && (betValue === "any" || dice[0] === betValue);
        case "double":
            if (!isTriple) {
                const counts = {};
                dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
                return Object.values(counts).some(c => c >= 2) && (betValue === "any" || counts[betValue] >= 2);
            }
            return false;
        case "simple": return dice.includes(betValue);
        case "combo": return dice.includes(betValue[0]) && dice.includes(betValue[1]);
        default: return false;
    }
}

function getPayout(betType, betValue, dice) {
    const sum = dice[0] + dice[1] + dice[2];
    const payouts = {
        petit: 3, grand: 3,
        total: { 4: 60, 5: 30, 6: 18, 7: 12, 8: 8, 9: 7, 10: 6, 11: 6, 12: 7, 13: 8, 14: 12, 15: 18, 16: 30, 17: 60 },
        triple_any: 30, triple_specific: 180,
        double_any: 10, double_specific: 11,
        simple: 3, combo: 7
    };
    if (betType === "total") return payouts.total[sum] || 0;
    if (betType === "triple") return betValue === "any" ? payouts.triple_any : payouts.triple_specific;
    if (betType === "double") return betValue === "any" ? payouts.double_any : payouts.double_specific;
    if (betType === "simple") return payouts.simple;
    if (betType === "combo") return payouts.combo;
    return payouts[betType] || 0;
}

async function generateSicboCard(username, betDisplay, amount, win, winAmount, newBalance, dice, sum, isTriple, payout) {
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
    ctx.font = "bold 18px 'Courier New'";
    ctx.fillText("UCHIWA BANK", 30, 55);
    ctx.font = "9px 'Courier New'";
    ctx.fillStyle = "#aaa";
    ctx.fillText("PREMIUM GAMING CARD", 30, 75);
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 20px 'Courier New'";
    ctx.fillText("SIC BO", 200, 55);
    ctx.fillStyle = "#d4af37";
    ctx.fillRect(480, 35, 45, 30);
    ctx.fillStyle = "#b8960c";
    ctx.fillRect(484, 39, 37, 22);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px 'Courier New'";
    ctx.fillText(username.toUpperCase().substring(0, 18), 30, 110);
    ctx.fillStyle = "#aaa";
    ctx.font = "9px 'Courier New'";
    ctx.fillText("CARDHOLDER", 30, 125);
    const diceEmojis = { 1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅" };
    ctx.font = "48px 'Segoe UI Emoji'";
    ctx.fillStyle = "#fff";
    ctx.fillText(diceEmojis[dice[0]], 80, 200);
    ctx.fillText(diceEmojis[dice[1]], 180, 200);
    ctx.fillText(diceEmojis[dice[2]], 280, 200);
    ctx.font = "bold 16px 'Courier New'";
    ctx.fillStyle = "#d4af37";
    ctx.fillText(`TOTAL: ${sum}`, 80, 250);
    if (isTriple) {
        ctx.fillStyle = "#ff4444";
        ctx.font = "bold 14px 'Courier New'";
        ctx.fillText("TRIPLE !", 80, 280);
    }
    ctx.fillStyle = "#88ff88";
    ctx.font = "12px 'Courier New'";
    ctx.fillText("PARI:", 400, 110);
    ctx.fillStyle = "#fff";
    const shortBetDisplay = betDisplay.length > 20 ? betDisplay.substring(0, 17) + "..." : betDisplay;
    ctx.fillText(shortBetDisplay, 400, 130);
    ctx.fillStyle = "#88ff88";
    ctx.fillText("MISE:", 400, 160);
    ctx.fillStyle = "#fff";
    ctx.fillText(`${await formatNumber(amount)}$`, 400, 180);
    ctx.fillStyle = "#88ff88";
    ctx.fillText("MULTIPLICATEUR:", 400, 210);
    ctx.fillStyle = "#fff";
    ctx.fillText(`x${payout}`, 400, 230);
    if (win) {
        ctx.fillStyle = "#00ff88";
        ctx.font = "bold 14px 'Courier New'";
        ctx.fillText("VICTOIRE !", 400, 270);
        ctx.fillStyle = "#88ff88";
        ctx.fillText(`+${await formatNumber(winAmount)}$`, 400, 295);
    } else {
        ctx.fillStyle = "#ff4444";
        ctx.font = "bold 14px 'Courier New'";
        ctx.fillText("PERDU !", 400, 270);
        ctx.fillStyle = "#ff8888";
        ctx.fillText(`-${await formatNumber(amount)}$`, 400, 295);
    }
    ctx.fillStyle = "#d4af37";
    ctx.font = "bold 24px 'Courier New'";
    ctx.fillText(`${await formatNumber(newBalance)}$`, 30, 370);
    ctx.fillStyle = "#aaa";
    ctx.font = "10px 'Courier New'";
    ctx.fillText("NOUVEAU SOLDE", 30, 395);
    ctx.fillStyle = "#fff";
    ctx.font = "20px 'Courier New'";
    ctx.fillText("📡", 540, 380);
    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
    ctx.fillStyle = "#666";
    ctx.font = "9px 'Courier New'";
    ctx.fillText(dateStr, 500, 395);
    return canvas.toBuffer();
}

module.exports = {
    config: {
        name: "sicbo",
        version: "4.0",
        author: "Itachi Soma (BigInt + API cash)",
        countDown: 3,
        role: 0,
        category: "fun"
    },

    onStart: async function ({ args, message, event, api }) {
        const { senderID } = event;
        const userMoney = await getUserCash(senderID);
        const subCommand = args[0]?.toLowerCase();

        const bankPath = "./bank.json";
        let bankData = {};
        if (fs.existsSync(bankPath)) {
            bankData = JSON.parse(fs.readFileSync(bankPath, "utf8"));
        }
        const userBank = bankData[senderID] || { bank: 0, imageMode: true };
        const username = await getUserName(senderID, api);

        if (!subCommand || subCommand === "help") {
            return message.reply(
`𝐒𝐈𝐂 𝐁𝐎 - 𝐋𝐄 𝐉𝐄𝐔 𝐃𝐄𝐒 𝟑 𝐃𝐄́𝐒
━━━━━━━━━━━━━━━━
⚙️ 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐞𝐬 ⚙️

🎲 𝐬𝐢𝐜𝐛𝐨 𝐛𝐚𝐥𝐚𝐧𝐜𝐞
   → 𝐕𝐨𝐢𝐫 𝐭𝐨𝐧 𝐬𝐨𝐥𝐝𝐞

🎲 𝐬𝐢𝐜𝐛𝐨 𝐩𝐞𝐭𝐢𝐭 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭>
   → 𝐓𝐨𝐭𝐚𝐥 𝟒-𝟏𝟎 (𝐡𝐨𝐫𝐬 𝐭𝐫𝐢𝐩𝐥𝐞) → 𝐆𝐚𝐢𝐧 𝐱𝟑

🎲 𝐬𝐢𝐜𝐛𝐨 𝐠𝐫𝐚𝐧𝐝 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭>
   → 𝐓𝐨𝐭𝐚𝐥 𝟏𝟏-𝟏𝟕 (𝐡𝐨𝐫𝐬 𝐭𝐫𝐢𝐩𝐥𝐞) → 𝐆𝐚𝐢𝐧 𝐱𝟑

🎲 𝐬𝐢𝐜𝐛𝐨 𝐭𝐨𝐭𝐚𝐥 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭> <𝟒-𝟏𝟕>
   → 𝐒𝐨𝐦𝐦𝐞 𝐞𝐱𝐚𝐜𝐭𝐞 → 𝐆𝐚𝐢𝐧 𝐱𝟔 𝐚̀ 𝐱𝟔𝟎

🎲 𝐬𝐢𝐜𝐛𝐨 𝐭𝐫𝐢𝐩𝐥𝐞 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭> [𝟏-𝟔/𝐚𝐧𝐲]
   → 𝟑 𝐝𝐞́𝐬 𝐢𝐝𝐞𝐧𝐭𝐢𝐪𝐮𝐞𝐬 → 𝐆𝐚𝐢𝐧 𝐱𝟑𝟎 𝐨𝐮 𝐱𝟏𝟖𝟎

🎲 𝐬𝐢𝐜𝐛𝐨 𝐝𝐨𝐮𝐛𝐥𝐞 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭> [𝟏-𝟔/𝐚𝐧𝐲]
   → 𝐀𝐮 𝐦𝐨𝐢𝐧𝐬 𝟐 𝐝𝐞́𝐬 𝐢𝐝𝐞𝐧𝐭𝐢𝐪𝐮𝐞𝐬 → 𝐆𝐚𝐢𝐧 𝐱𝟏𝟎 𝐨𝐮 𝐱𝟏𝟏

🎲 𝐬𝐢𝐜𝐛𝐨 𝐬𝐢𝐦𝐩𝐥𝐞 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭> <𝟏-𝟔>
   → 𝐔𝐧 𝐝𝐞́ 𝐦𝐨𝐧𝐭𝐫𝐞 𝐜𝐞 𝐧𝐮𝐦𝐞́𝐫𝐨 → 𝐆𝐚𝐢𝐧 𝐱𝟑

🎲 𝐬𝐢𝐜𝐛𝐨 𝐜𝐨𝐦𝐛𝐨 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭> <𝟏-𝟔> <𝟏-𝟔>
   → 𝐋𝐞𝐬 𝟐 𝐧𝐮𝐦𝐞́𝐫𝐨𝐬 𝐬𝐨𝐫𝐭𝐞𝐧𝐭 → 𝐆𝐚𝐢𝐧 𝐱𝟕

🎲 𝐬𝐢𝐜𝐛𝐨 𝐛𝐨𝐧𝐮𝐬
   → +𝟐𝟎𝟎$ 𝐩𝐚𝐫 𝐣𝐨𝐮𝐫

━━━━━━━━━━━━━━━━
📋 𝐓𝐨𝐧 𝐬𝐨𝐥𝐝𝐞 : ${await formatNumber(userMoney)}$
━━━━━━━━━━━━━━━━`
            );
        }

        if (subCommand === "balance" || subCommand === "solde") {
            return message.reply(`📋 𝐂𝐚𝐩𝐢𝐭𝐚𝐥 𝐚𝐜𝐭𝐮𝐞𝐥: ${await formatNumber(userMoney)}$`);
        }

        if (subCommand === "bonus") {
            let lastBonus = 0;
            const now = Date.now();
            const dayMs = 86400000;
            const userData = await usersData?.get(senderID) || {};
            lastBonus = userData.lastBonus || 0;

            if (now - lastBonus < dayMs) {
                const remaining = Math.ceil((dayMs - (now - lastBonus)) / 3600000);
                return message.reply(`𝐁𝐨𝐧𝐮𝐬 𝐝𝐞𝐣𝐚̀ 𝐫𝐞𝐜𝐮 !\n⏳ 𝐏𝐫𝐨𝐜𝐡𝐚𝐢𝐧 𝐛𝐨𝐧𝐮𝐬 𝐝𝐚𝐧𝐬 ${remaining}𝐡`);
            }

            await updateUserCash(senderID, 200n);
            const newBalance = await getUserCash(senderID);
            if (usersData) await usersData.set(senderID, { lastBonus: now });
            return message.reply(`🎁 𝐁𝐨𝐧𝐮𝐬 𝐪𝐮𝐨𝐭𝐢𝐝𝐢𝐞𝐧 !\n━━━━━━━━━━━━━━━━\n✨ +𝟐𝟎𝟎$\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${await formatNumber(newBalance)}$`);
        }

        const betType = subCommand;
        const amount = await parseAmountWithSuffix(args[1]);

        if (amount <= 0n) {
            return message.reply(`❌ 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞\n\n𝐄𝐱𝐞𝐦𝐩𝐥𝐞𝐬 : 𝟓𝟎𝐤, 𝟏.𝟓𝐌, 𝟐𝐁, 𝟏𝟎𝟎𝐓`);
        }

        if (amount > userMoney) {
            return message.reply(
`❌ 𝐅𝐨𝐧𝐝𝐬 𝐢𝐧𝐬𝐮𝐟𝐟𝐢𝐬𝐚𝐧𝐭𝐬
━━━━━━━━━━━━━━━━
💰 𝐓𝐨𝐧 𝐬𝐨𝐥𝐝𝐞 : ${await formatNumber(userMoney)}$
🎲 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 : ${await formatNumber(amount)}$`
            );
        }

        let betValue = null;
        const validTypes = ["petit", "grand", "total", "triple", "double", "simple", "combo"];

        if (!validTypes.includes(betType)) {
            return message.reply(`❌ 𝐓𝐲𝐩𝐞 𝐝𝐞 𝐩𝐚𝐫𝐢 𝐢𝐧𝐜𝐨𝐧𝐧𝐮\n\n➜ 𝐬𝐢𝐜𝐛𝐨 𝐡𝐞𝐥𝐩`);
        }

        if (betType === "total") {
            betValue = parseInt(args[2]);
            if (isNaN(betValue) || betValue < 4 || betValue > 17) {
                return message.reply(`❌ 𝐓𝐨𝐭𝐚𝐥 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞 → 𝟒-𝟏𝟕`);
            }
        }

        if (betType === "triple" || betType === "double") {
            betValue = args[2] || "any";
            if (betValue !== "any" && (parseInt(betValue) < 1 || parseInt(betValue) > 6)) {
                return message.reply(`❌ 𝐕𝐚𝐥𝐞𝐮𝐫 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞 → 𝟏-𝟔 𝐨𝐮 "𝐚𝐧𝐲"`);
            }
            if (betValue !== "any") betValue = parseInt(betValue);
        }

        if (betType === "simple") {
            betValue = parseInt(args[2]);
            if (isNaN(betValue) || betValue < 1 || betValue > 6) {
                return message.reply(`❌ 𝐕𝐚𝐥𝐞𝐮𝐫 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞 → 𝟏-𝟔`);
            }
        }

        if (betType === "combo") {
            const num1 = parseInt(args[2]);
            const num2 = parseInt(args[3]);
            if (isNaN(num1) || isNaN(num2) || num1 < 1 || num1 > 6 || num2 < 1 || num2 > 6) {
                return message.reply(`❌ 𝐂𝐨𝐦𝐛𝐢𝐧𝐚𝐢𝐬𝐨𝐧 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞`);
            }
            betValue = [num1, num2];
        }

        await updateUserCash(senderID, -amount);

        const dice = rollDice();
        const diceDisplay = dice.map(d => getDiceEmoji(d)).join(" ");
        const sum = dice[0] + dice[1] + dice[2];
        const isTriple = dice[0] === dice[1] && dice[1] === dice[2];

        const randomWin = Math.random() < 0.85;

        let win = false;
        let payout = 0;
        let winAmount = 0n;

        if (randomWin) {
            win = evaluateBet(betType, betValue, dice);
            if (win) {
                payout = getPayout(betType, betValue, dice);
                winAmount = amount * BigInt(payout);
            } else {

                win = false;
                payout = 0;
                winAmount = 0n;
            }
        } else {
            win = false;
        }

        let newBalance;
        if (win) {
            await updateUserCash(senderID, winAmount);
            newBalance = await getUserCash(senderID);
        } else {
            newBalance = await getUserCash(senderID); 
        }

        let betDisplay = "";
        if (betType === "total") betDisplay = `𝐓𝐨𝐭𝐚𝐥 = ${betValue}`;
        else if (betType === "triple") betDisplay = `𝐓𝐫𝐢𝐩𝐥𝐞 ${betValue === "any" ? "𝐪𝐮𝐞𝐥𝐜𝐨𝐧𝐪𝐮𝐞" : `𝐝𝐞 ${betValue}`}`;
        else if (betType === "double") betDisplay = `𝐃𝐨𝐮𝐛𝐥𝐞 ${betValue === "any" ? "𝐪𝐮𝐞𝐥𝐜𝐨𝐧𝐪𝐮𝐞" : `𝐝𝐞 ${betValue}`}`;
        else if (betType === "simple") betDisplay = `𝐍𝐮𝐦𝐞́𝐫𝐨 ${betValue}`;
        else if (betType === "combo") betDisplay = `𝐂𝐨𝐦𝐛𝐢𝐧𝐚𝐢𝐬𝐨𝐧 ${betValue[0]}+${betValue[1]}`;
        else betDisplay = betType === "petit" ? "𝐏𝐞𝐭𝐢𝐭 (𝟒-𝟏𝟎)" : "𝐆𝐫𝐚𝐧𝐝 (𝟏𝟏-𝟏𝟕)";

        let resultMsg = "";
        if (win) {
            resultMsg = `🎉 𝐕𝐈𝐂𝐓𝐎𝐈𝐑𝐄 ! 🎉\n━━━━━━━━━━━━━━━━\n✨ 𝐆𝐚𝐢𝐧 : +${await formatNumber(winAmount)}$ (𝐱${payout})\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${await formatNumber(newBalance)}$`;
        } else {
            resultMsg = `💀 𝐏𝐄𝐑𝐃𝐔 ... 💀\n━━━━━━━━━━━━━━━━\n📉 𝐏𝐞𝐫𝐭𝐞 : -${await formatNumber(amount)}$\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${await formatNumber(newBalance)}$`;
        }

        let tripleInfo = isTriple ? `\n━━━━━━━━━━━━━━━━\n🎲 𝐓𝐑𝐈𝐏𝐋𝐄 ! ${dice[0]} ${dice[0]} ${dice[0]}` : "";

        await message.reply(
`☘️ 𝐒𝐈𝐂 𝐁𝐎 - 𝐑𝐄́𝐒𝐔𝐋𝐓𝐀𝐓 ☘️
━━━━━━━━━━━━━━━━
🎲 𝐋𝐚𝐧𝐜𝐞𝐫 : ${diceDisplay}
📊 𝐓𝐨𝐭𝐚𝐥 : ${sum}${tripleInfo}
━━━━━━━━━━━━━━━━
📋 𝐓𝐨𝐧 𝐩𝐚𝐫𝐢 : ${betDisplay}
💰 𝐌𝐢𝐬𝐞 : ${await formatNumber(amount)}$
📊 𝐂𝐡𝐚𝐧𝐜𝐞𝐬 : 𝟖𝟓% 𝐠𝐚𝐢𝐧 | 𝟏𝟓% 𝐩𝐞𝐫𝐭𝐞
━━━━━━━━━━━━━━━━
${resultMsg}
━━━━━━━━━━━━━━━━`
        );

        if (userBank.imageMode !== false) {
            try {
                const cardImage = await generateSicboCard(username, betDisplay, amount, win, winAmount, newBalance, dice, sum, isTriple, payout);
                const imgPath = `./sicbo_card_${senderID}.png`;
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
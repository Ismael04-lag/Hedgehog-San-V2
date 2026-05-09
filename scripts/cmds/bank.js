const fs = require("fs");
const { createCanvas } = require("canvas");
const path = require("path");
const axios = require("axios");

const API_URL = "https://bank-save-production.up.railway.app/api/bank";
const CONVERT_API_URL = "https://numbers-conversion.vercel.app/api/parse";
const CASH_API_URL = "https://cash-api-five.vercel.app/api/cash";

const pendingTimeouts = new Map();
let pendingTransactions = new Map();

const PENDING_FILE = path.join(__dirname, "pending_transactions.json");
if (fs.existsSync(PENDING_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(PENDING_FILE, "utf8"));
        pendingTransactions = new Map(Object.entries(data));
    } catch (e) {
        console.error("Erreur chargement pending_transactions.json:", e);
    }
}

function savePendingTransactions() {
    try {
        const obj = Object.fromEntries(pendingTransactions);
        fs.writeFileSync(PENDING_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {
        console.error("Erreur sauvegarde pending_transactions.json:", e);
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

module.exports = {
    config: {
        name: "bank",
        description: "Depot ou retrait d'argent de la banque",
        guide: {
            vi: "",
            en: "Bank:\nDeposit - Withdraw - Balance - Interest - Transfer - Richest - Card - Image - Lottery - Parrainage - Gamble\n\nAmount suffixes: k (thousand), m (million), b (billion), t (trillion), q (quadrillion), Q (quintillion), s (sextillion), S (septillion), o (octillion), n (nonillion), d (decillion)"
        },
        category: "game",
        countDown: 1,
        role: 0,
        author: "Itachi Soma"
    },

    onStart: async function ({ args, message, event, api }) {
        const { getPrefix } = global.utils;
        const p = getPrefix(event.threadID);
        const userMoney = await getUserCash(event.senderID);
        const user = String(event.senderID);
        const info = await api.getUserInfo(user);
        const username = info[user]?.name || "Utilisateur";
        let imageMode = true;
        let bankData = null;
        let userCardData = null;

        async function apiCall(endpoint, method = "GET", body = null) {
            try {
                const options = {
                    method: method,
                    headers: { "Content-Type": "application/json" }
                };
                if (body) options.body = JSON.stringify(body);
                const response = await fetch(`${API_URL}${endpoint}`, options);
                return await response.json();
            } catch (error) {
                console.error("API Error:", error);
                return { success: false, error: error.message };
            }
        }

        async function getUserBankData(userId) {
            const result = await apiCall(`/${userId}`);
            if (result.success) return result.data;
            console.error("getUserBankData failed, keeping previous bankData if available");
            return null;
        }

        async function createUserCard(userId) {
            return await apiCall(`/${userId}/card`, "POST");
        }

        async function updateUserBankData(userId, amount, cvv, type) {
            if (type === "deposit") {
                return await apiCall(`/${userId}/deposit`, "POST", { amount, cvv });
            } else if (type === "withdraw") {
                return await apiCall(`/${userId}/withdraw`, "POST", { amount, cvv });
            }
            return null;
        }

        async function getInterest(userId) {
            return await apiCall(`/${userId}/interest`, "POST");
        }

        async function getTopUsers() {
            return await apiCall(`/top`);
        }

        async function playLottery(userId, ticketPrice) {
            return await apiCall(`/${userId}/lottery`, "POST", { ticketPrice });
        }

        async function createParrainCode(userId) {
            return await apiCall(`/${userId}/parrain/create`, "POST");
        }

        async function useParrainCode(userId, code) {
            return await apiCall(`/${userId}/parrain/use`, "POST", { code });
        }

        async function gambleApi(userId, amount, choice) {
            return await apiCall(`/${userId}/gamble`, "POST", { amount, choice });
        }

        async function transferApi(userId, targetId, amount, cvv) {
            return await apiCall(`/${userId}/transfer`, "POST", { targetId, amount, cvv });
        }

        function clearPendingTransaction(userId) {
            if (pendingTimeouts.has(userId)) {
                clearTimeout(pendingTimeouts.get(userId));
                pendingTimeouts.delete(userId);
            }
            pendingTransactions.delete(userId);
            savePendingTransactions();
        }

        bankData = await getUserBankData(user);
        if (!bankData) bankData = { bank: 0, lastInterestClaimed: Date.now(), card: null };
        if (bankData.imageMode !== undefined) imageMode = bankData.imageMode;

        const command = args[0]?.toLowerCase();

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

        function formatNumber(num) {
            if (num === null || num === undefined || isNaN(num)) return "0";
            const SUFFIXES = {
                'k': 1e3, 'm': 1e6, 'b': 1e9, 't': 1e12, 'q': 1e15,
                'Q': 1e18, 's': 1e21, 'S': 1e24, 'o': 1e27, 'n': 1e30, 'd': 1e33
            };
            const absNum = Math.abs(num);
            const sign = num < 0 ? "-" : "";
            const sorted = Object.entries(SUFFIXES).sort((a, b) => b[1] - a[1]);
            for (const [suffix, value] of sorted) {
                if (absNum >= value) {
                    const formatted = (absNum / value).toFixed(1).replace(/\.0$/, '');
                    return sign + formatted + suffix;
                }
            }
            return sign + absNum.toString();
        }

        async function generateBankCard(title, balance, messageText, username, cvv = null, cardData = null) {
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
            ctx.fillStyle = "rgba(255,255,255,0.05)";
            ctx.fillRect(0, 0, 300, 200);
            ctx.fillStyle = "#d4af37";
            ctx.fillRect(440, 40, 50, 35);
            ctx.fillStyle = "#b8960c";
            ctx.fillRect(445, 45, 40, 25);
            ctx.fillStyle = "#a0860a";
            for(let i = 0; i < 3; i++) {
                ctx.fillRect(450 + i*10, 50, 3, 15);
            }
            ctx.fillStyle = "#2c2c2c";
            ctx.fillRect(10, 50, 580, 8);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 20px 'Courier New'";
            ctx.fillText("UCHIWA BANK", 30, 95);
            ctx.font = "10px 'Courier New'";
            ctx.fillStyle = "#aaa";
            ctx.fillText("PREMIUM CARD", 30, 115);
            ctx.fillStyle = "#e0e0e0";
            ctx.font = "22px 'Courier New'";
            let cardNumber = cardData?.cardNumber || "**** **** **** " + Math.floor(Math.random() * 9000 + 1000);
            ctx.fillText(cardNumber, 30, 165);
            if (cardData?.cardExpiry) {
                ctx.fillStyle = "#fff";
                ctx.font = "14px 'Courier New'";
                ctx.fillText(cardData.cardExpiry, 120, 200);
            } else {
                const expiry = new Date();
                expiry.setFullYear(expiry.getFullYear() + 3);
                const expiryStr = `${expiry.getMonth()+1}/${expiry.getFullYear().toString().slice(-2)}`;
                ctx.fillStyle = "#fff";
                ctx.font = "14px 'Courier New'";
                ctx.fillText(expiryStr, 120, 200);
            }
            ctx.font = "12px 'Courier New'";
            ctx.fillStyle = "#ccc";
            ctx.fillText("VALID THRU", 30, 200);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 16px 'Courier New'";
            ctx.fillText(title.toUpperCase(), 380, 210);
            const cardHolder = username.toUpperCase().substring(0, 20);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 14px 'Courier New'";
            ctx.fillText(cardHolder, 30, 250);
            ctx.fillStyle = "#aaa";
            ctx.font = "10px 'Courier New'";
            ctx.fillText("CARDHOLDER", 30, 265);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 28px 'Courier New'";
            ctx.fillText(balance, 30, 315);
            ctx.fillStyle = "#aaa";
            ctx.font = "10px 'Courier New'";
            ctx.fillText("CURRENT BALANCE", 30, 335);
            ctx.fillStyle = "#88ff88";
            ctx.font = "12px 'Courier New'";
            const lines = messageText.split('\n');
            let y = 300;
            for (let i = 0; i < Math.min(lines.length, 3); i++) {
                ctx.fillStyle = i === 0 ? "#88ff88" : "#ccc";
                ctx.fillText(lines[i], 350, y);
                y += 20;
            }
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 14px 'Courier New'";
            if (cvv) {
                ctx.fillText(cvv.toString(), 540, 100);
            } else if (cardData?.cardCvv) {
                ctx.fillText("***", 540, 100);
            } else {
                ctx.fillText("***", 540, 100);
            }
            ctx.fillStyle = "#aaa";
            ctx.fillRect(560, 380, 20, 15);
            const date = new Date();
            const dateStr = `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
            ctx.fillStyle = "#666";
            ctx.font = "9px 'Courier New'";
            ctx.fillText(dateStr, 30, 395);
            return canvas.toBuffer();
        }

        async function generateLotteryCard(username, ticketPrice, win, winAmount, numbers, drawnNumbers, matchCount) {
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
            ctx.fillText("UCHIWA LOTTERY", 30, 55);
            ctx.font = "10px 'Courier New'";
            ctx.fillStyle = "#aaa";
            ctx.fillText("LUCKY DRAW", 30, 75);
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
            ctx.font = "bold 18px 'Courier New'";
            ctx.fillText("NUMEROS TIRES", 380, 110);
            ctx.fillStyle = "#fff";
            ctx.font = "24px 'Courier New'";
            ctx.fillText(numbers.join(" - "), 380, 150);
            ctx.fillStyle = "#ffd700";
            ctx.font = "bold 18px 'Courier New'";
            ctx.fillText("RESULTAT", 380, 200);
            ctx.fillStyle = "#fff";
            ctx.font = "24px 'Courier New'";
            ctx.fillText(drawnNumbers.join(" - "), 380, 240);
            ctx.fillStyle = "#88ff88";
            ctx.font = "bold 14px 'Courier New'";
            ctx.fillText(`NOMBRES CORRESPONDANTS: ${matchCount}`, 380, 290);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 28px 'Courier New'";
            ctx.fillText(`${formatNumber(bankData?.bank || 0)}$`, 30, 315);
            ctx.fillStyle = "#aaa";
            ctx.font = "10px 'Courier New'";
            ctx.fillText("NEW BALANCE", 30, 340);
            if (win) {
                ctx.fillStyle = "#00ff88";
                ctx.font = "bold 16px 'Courier New'";
                ctx.fillText(`GAIN: +${formatNumber(winAmount)}$`, 380, 340);
            } else {
                ctx.fillStyle = "#ff4444";
                ctx.font = "bold 16px 'Courier New'";
                ctx.fillText(`PERTE: -${formatNumber(ticketPrice)}$`, 380, 340);
            }
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 14px 'Courier New'";
            ctx.fillText("🎲", 540, 100);
            ctx.fillStyle = "#aaa";
            ctx.fillRect(560, 380, 20, 15);
            const date = new Date();
            const dateStr = `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
            ctx.fillStyle = "#666";
            ctx.font = "9px 'Courier New'";
            ctx.fillText(dateStr, 30, 395);
            return canvas.toBuffer();
        }

        async function generateParrainCard(username, code, count, gains, type) {
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
            ctx.fillText("UCHIWA PARRAINAGE", 30, 55);
            ctx.font = "10px 'Courier New'";
            ctx.fillStyle = "#aaa";
            ctx.fillText("REFERRAL PROGRAM", 30, 75);
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
            ctx.font = "bold 18px 'Courier New'";
            if (type === "create") {
                ctx.fillText("CODE CREE", 380, 110);
                ctx.fillStyle = "#fff";
                ctx.font = "24px 'Courier New'";
                ctx.fillText(code, 380, 160);
                ctx.fillStyle = "#88ff88";
                ctx.font = "14px 'Courier New'";
                ctx.fillText("Partagez ce code a vos amis !", 380, 210);
            } else if (type === "stats") {
                ctx.fillText("STATISTIQUES", 380, 110);
                ctx.fillStyle = "#fff";
                ctx.font = "16px 'Courier New'";
                ctx.fillText(`Code: ${code}`, 380, 160);
                ctx.fillText(`Parraines: ${count}`, 380, 190);
                ctx.fillText(`Gains: ${formatNumber(gains)}$`, 380, 220);
            } else if (type === "use") {
                ctx.fillText("CODE UTILISE", 380, 110);
                ctx.fillStyle = "#fff";
                ctx.font = "20px 'Courier New'";
                ctx.fillText(code, 380, 160);
                ctx.fillStyle = "#88ff88";
                ctx.font = "14px 'Courier New'";
                ctx.fillText(`Bonus recu: +10000$`, 380, 210);
            }
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 28px 'Courier New'";
            ctx.fillText(`${formatNumber(bankData?.bank || 0)}$`, 30, 315);
            ctx.fillStyle = "#aaa";
            ctx.font = "10px 'Courier New'";
            ctx.fillText("NEW BALANCE", 30, 340);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 14px 'Courier New'";
            ctx.fillText("🤝", 540, 100);
            ctx.fillStyle = "#aaa";
            ctx.fillRect(560, 380, 20, 15);
            const date = new Date();
            const dateStr = `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
            ctx.fillStyle = "#666";
            ctx.font = "9px 'Courier New'";
            ctx.fillText(dateStr, 30, 395);
            return canvas.toBuffer();
        }

        async function generateGambleCard(username, amount, win, winAmount, choice, result) {
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
            ctx.fillText("UCHIWA CASINO", 30, 55);
            ctx.font = "10px 'Courier New'";
            ctx.fillStyle = "#aaa";
            ctx.fillText("PILE OU FACE", 30, 75);
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
            ctx.fillText("JOUEUR", 30, 125);
            ctx.fillStyle = "#ffd700";
            ctx.font = "bold 18px 'Courier New'";
            ctx.fillText("VOTRE CHOIX", 380, 110);
            ctx.fillStyle = "#fff";
            ctx.font = "24px 'Courier New'";
            ctx.fillText(choice === "pile" ? "🪙 PILE" : "🪙 FACE", 380, 150);
            ctx.fillStyle = "#ffd700";
            ctx.font = "bold 18px 'Courier New'";
            ctx.fillText("RESULTAT", 380, 200);
            ctx.fillStyle = "#fff";
            ctx.font = "24px 'Courier New'";
            ctx.fillText(result === "pile" ? "🪙 PILE" : "🪙 FACE", 380, 240);
            ctx.fillStyle = "#88ff88";
            ctx.font = "bold 14px 'Courier New'";
            ctx.fillText(win ? "🎉 VOUS AVEZ GAGNE !" : "💀 VOUS AVEZ PERDU !", 380, 290);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 28px 'Courier New'";
            ctx.fillText(`${formatNumber(bankData?.bank || 0)}$`, 30, 315);
            ctx.fillStyle = "#aaa";
            ctx.font = "10px 'Courier New'";
            ctx.fillText("NEW BALANCE", 30, 340);
            if (win) {
                ctx.fillStyle = "#00ff88";
                ctx.font = "bold 16px 'Courier New'";
                ctx.fillText(`GAIN: +${formatNumber(winAmount)}$`, 380, 340);
            } else {
                ctx.fillStyle = "#ff4444";
                ctx.font = "bold 16px 'Courier New'";
                ctx.fillText(`PERTE: -${formatNumber(amount)}$`, 380, 340);
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

        async function generateTransferCard(username, targetName, amount, newBalance) {
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
            ctx.fillText("UCHIWA BANK", 30, 95);
            ctx.font = "10px 'Courier New'";
            ctx.fillStyle = "#aaa";
            ctx.fillText("TRANSFERT", 30, 115);
            ctx.fillStyle = "#e0e0e0";
            ctx.font = "22px 'Courier New'";
            ctx.fillText("**** **** **** 4532", 30, 165);
            ctx.font = "12px 'Courier New'";
            ctx.fillStyle = "#ccc";
            ctx.fillText("VALID THRU", 30, 200);
            ctx.fillStyle = "#fff";
            ctx.font = "14px 'Courier New'";
            ctx.fillText("12/28", 120, 200);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 16px 'Courier New'";
            ctx.fillText("TRANSFER", 380, 210);
            const cardHolder = username.toUpperCase().substring(0, 20);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 14px 'Courier New'";
            ctx.fillText(cardHolder, 30, 250);
            ctx.fillStyle = "#aaa";
            ctx.font = "10px 'Courier New'";
            ctx.fillText("EXPEDITEUR", 30, 265);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 28px 'Courier New'";
            ctx.fillText(`${formatNumber(newBalance)}$`, 30, 315);
            ctx.fillStyle = "#aaa";
            ctx.font = "10px 'Courier New'";
            ctx.fillText("NOUVEAU SOLDE", 30, 335);
            ctx.fillStyle = "#88ff88";
            ctx.font = "12px 'Courier New'";
            ctx.fillText(`Destinataire: ${targetName}`, 350, 300);
            ctx.fillText(`Montant: -${formatNumber(amount)}$`, 350, 320);
            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 14px 'Courier New'";
            ctx.fillText("***", 540, 100);
            ctx.fillStyle = "#aaa";
            ctx.fillRect(560, 380, 20, 15);
            const date = new Date();
            const dateStr = `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
            ctx.fillStyle = "#666";
            ctx.font = "9px 'Courier New'";
            ctx.fillText(dateStr, 30, 395);
            return canvas.toBuffer();
        }

        if (command === "image") {
            const subCommand = args[1]?.toLowerCase();
            if (subCommand === "on") {
                imageMode = true;
                return message.reply(`🖼️ 𝐌𝐎𝐃𝐄 𝐂𝐀𝐑𝐓𝐄 𝐁𝐀𝐍𝐂𝐀𝐈𝐑𝐄 𝐀𝐂𝐓𝐈𝐕𝐄\n━━━━━━━━━━━━━━━━\n✅ 𝐋𝐞𝐬 𝐜𝐨𝐦𝐦𝐚𝐧𝐝𝐞𝐬 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞𝐬 𝐬'𝐚𝐟𝐟𝐢𝐜𝐡𝐞𝐫𝐨𝐧𝐭 𝐚𝐯𝐞𝐜 𝐝𝐞𝐬 𝐜𝐚𝐫𝐭𝐞𝐬 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞𝐬.`);
            } else if (subCommand === "off") {
                imageMode = false;
                return message.reply(`📝 𝐌𝐎𝐃𝐄 𝐓𝐄𝐗𝐓𝐄 𝐀𝐂𝐓𝐈𝐕𝐄\n━━━━━━━━━━━━━━━━\n✅ 𝐋𝐞𝐬 𝐜𝐨𝐦𝐦𝐚𝐧𝐝𝐞𝐬 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞𝐬 𝐬'𝐚𝐟𝐟𝐢𝐜𝐡𝐞𝐫𝐨𝐧𝐭 𝐝𝐞́𝐬𝐨𝐫𝐦𝐚𝐢𝐬 𝐮𝐧𝐢𝐪𝐮𝐞𝐦𝐞𝐧𝐭 𝐞𝐧 𝐭𝐞𝐱𝐭𝐞.`);
            } else {
                const currentMode = imageMode ? "𝐂𝐀𝐑𝐓𝐄 🏦" : "𝐓𝐄𝐗𝐓𝐄 📝";
                return message.reply(`🖼️ 𝐂𝐎𝐍𝐅𝐈𝐆𝐔𝐑𝐀𝐓𝐈𝐎𝐍 𝐂𝐀𝐑𝐓𝐄\n━━━━━━━━━━━━━━━━\n📌 𝐌𝐨𝐝𝐞 𝐚𝐜𝐭𝐮𝐞𝐥 : ${currentMode}\n━━━━━━━━━━━━━━━━\n📝 ${p}𝐛𝐚𝐧𝐤 𝐢𝐦𝐚𝐠𝐞 𝐨𝐧 → 𝐌𝐨𝐝𝐞 𝐜𝐚𝐫𝐭𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞\n📝 ${p}𝐛𝐚𝐧𝐤 𝐢𝐦𝐚𝐠𝐞 𝐨𝐟𝐟 → 𝐌𝐨𝐝𝐞 𝐭𝐞𝐱𝐭𝐞`);
            }
        }

        if (command === "card") {
            const result = await createUserCard(user);
            if (result.success) {
                userCardData = result.data;
                bankData = await getUserBankData(user);
                if (!bankData) bankData = { bank: 0, lastInterestClaimed: Date.now(), card: null };
                bankData.card = userCardData;
                const currentBalance = bankData.bank || 0;
                const cardMsg = `💳 𝐕𝐎𝐓𝐑𝐄 𝐂𝐀𝐑𝐓𝐄 𝐁𝐀𝐍𝐂𝐀𝐈𝐑𝐄\n━━━━━━━━━━━━━━━━\n🏦 𝐍° 𝐜𝐚𝐫𝐭𝐞 : ${userCardData.cardNumber}\n📅 𝐄𝐱𝐩𝐢𝐫𝐚𝐭𝐢𝐨𝐧 : ${userCardData.cardExpiry}\n🔐 𝐂𝐕𝐕 : ${userCardData.cardCvv}\n━━━━━━━━━━━━━━━━\n💳 𝐔𝐭𝐢𝐥𝐢𝐬𝐞𝐳 𝐜𝐞𝐭𝐭𝐞 𝐜𝐚𝐫𝐭𝐞 𝐩𝐨𝐮𝐫 𝐯𝐨𝐬 𝐭𝐫𝐚𝐧𝐬𝐚𝐜𝐭𝐢𝐨𝐧𝐬 !`;
                if (imageMode !== false) {
                    const img = await generateBankCard("MY CARD", `${formatNumber(currentBalance)}$`, cardMsg, username, userCardData.cardCvv, userCardData);
                    const imgPath = `./bank_card_${user}.png`;
                    fs.writeFileSync(imgPath, img);
                    await message.reply({ body: cardMsg, attachment: fs.createReadStream(imgPath) });
                    fs.unlinkSync(imgPath);
                } else {
                    return message.reply(cardMsg);
                }
            } else {
                return message.reply(`❌ 𝐄𝐫𝐫𝐞𝐮𝐫 : ${result.error || "Impossible de creer la carte"}`);
            }
        }

        if (command === "lottery") {
            const subLottery = args[1]?.toLowerCase();
            const ticketPrice = await parseAmountWithSuffix(args[2]);
            if (!subLottery || subLottery === "help") {
                return message.reply(`🎲 𝐋𝐎𝐓𝐓𝐄𝐑𝐘 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐄𝐒\n━━━━━━━━━━━━━━━━\n📝 ${p}𝐛𝐚𝐧𝐤 𝐥𝐨𝐭𝐭𝐞𝐫𝐲 𝐩𝐥𝐚𝐲 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭> → Acheter un ticket\n📊 ${p}𝐛𝐚𝐧𝐤 𝐥𝐨𝐭𝐭𝐞𝐫𝐲 𝐬𝐭𝐚𝐭𝐬 → Voir vos stats loterie\n🏆 ${p}𝐛𝐚𝐧𝐤 𝐥𝐨𝐭𝐭𝐞𝐫𝐲 𝐣𝐚𝐜𝐤𝐩𝐨𝐭 → Voir le jackpot\n━━━━━━━━━━━━━━━━\n🎁 Gains possibles: x2, x5, x10, x100, JACKPOT`);
            }
            if (subLottery === "play") {
                if (!ticketPrice || isNaN(ticketPrice) || ticketPrice <= 0) {
                    return message.reply(`❌ 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞\n━━━━━━━━━━━━━━━━\n📝 ${p}𝐛𝐚𝐧𝐤 𝐥𝐨𝐭𝐭𝐞𝐫𝐲 𝐩𝐥𝐚𝐲 𝟓𝟎𝐤`);
                }
                if (ticketPrice > userMoney) {
                    return message.reply(`❌ 𝐅𝐨𝐧𝐝𝐬 𝐢𝐧𝐬𝐮𝐟𝐟𝐢𝐬𝐚𝐧𝐭𝐬\n💰 𝐓𝐨𝐧 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(userMoney)}$`);
                }
                const result = await playLottery(user, ticketPrice);
                if (!result.success) {
                    return message.reply(`❌ ${result.error}`);
                }
                await updateUserCash(event.senderID, -ticketPrice);
                bankData = await getUserBankData(user);
                if (!bankData) bankData = { bank: 0, lastInterestClaimed: Date.now(), card: null };
                if (result.win) {
                    const winText = `🎉 𝐕𝐈𝐂𝐓𝐎𝐈𝐑𝐄 𝐀 𝐋𝐀 𝐋𝐎𝐓𝐓𝐄𝐑𝐈𝐄 !\n━━━━━━━━━━━━━━━━\n🔢 𝐕𝐨𝐬 𝐧𝐮𝐦𝐞́𝐫𝐨𝐬 : ${result.userNumbers.join(" - ")}\n🎲 𝐍𝐮𝐦𝐞́𝐫𝐨𝐬 𝐭𝐢𝐫𝐞́𝐬 : ${result.drawnNumbers.join(" - ")}\n✅ 𝐂𝐨𝐫𝐫𝐞𝐬𝐩𝐨𝐧𝐝𝐚𝐧𝐜𝐞𝐬 : ${result.matchCount}/3\n━━━━━━━━━━━━━━━━\n✨ 𝐆𝐚𝐢𝐧 : +${formatNumber(result.winAmount)}$ (x${result.multiplier})\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(result.newBalance)}$`;
                    if (imageMode !== false) {
                        const img = await generateLotteryCard(username, ticketPrice, true, result.winAmount, result.userNumbers, result.drawnNumbers, result.matchCount);
                        const imgPath = `./bank_lottery_${user}.png`;
                        fs.writeFileSync(imgPath, img);
                        await message.reply({ body: winText, attachment: fs.createReadStream(imgPath) });
                        fs.unlinkSync(imgPath);
                    } else {
                        return message.reply(winText);
                    }
                } else {
                    const loseText = `💀 𝐏𝐄𝐑𝐃𝐔 𝐀 𝐋𝐀 𝐋𝐎𝐓𝐓𝐄𝐑𝐈𝐄\n━━━━━━━━━━━━━━━━\n🔢 𝐕𝐨𝐬 𝐧𝐮𝐦𝐞́𝐫𝐨𝐬 : ${result.userNumbers.join(" - ")}\n🎲 𝐍𝐮𝐦𝐞́𝐫𝐨𝐬 𝐭𝐢𝐫𝐞́𝐬 : ${result.drawnNumbers.join(" - ")}\n✅ 𝐂𝐨𝐫𝐫𝐞𝐬𝐩𝐨𝐧𝐝𝐚𝐧𝐜𝐞𝐬 : ${result.matchCount}/3\n━━━━━━━━━━━━━━━━\n📉 𝐏𝐞𝐫𝐭𝐞 : -${formatNumber(ticketPrice)}$\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(bankData.bank)}$`;
                    if (imageMode !== false) {
                        const img = await generateLotteryCard(username, ticketPrice, false, 0, result.userNumbers, result.drawnNumbers, result.matchCount);
                        const imgPath = `./bank_lottery_${user}.png`;
                        fs.writeFileSync(imgPath, img);
                        await message.reply({ body: loseText, attachment: fs.createReadStream(imgPath) });
                        fs.unlinkSync(imgPath);
                    } else {
                        return message.reply(loseText);
                    }
                }
            }
            if (subLottery === "stats") {
                const statsText = `📊 𝐒𝐓𝐀𝐓𝐒 𝐋𝐎𝐓𝐓𝐄𝐑𝐈𝐄\n━━━━━━━━━━━━━━━━\n🎫 𝐓𝐢𝐜𝐤𝐞𝐭𝐬 𝐚𝐜𝐡𝐞𝐭𝐞́𝐬 : ${bankData?.lotteryTicket || 0}\n🏆 𝐕𝐢𝐜𝐭𝐨𝐢𝐫𝐞𝐬 : ${bankData?.lotteryWon || 0}`;
                return message.reply(statsText);
            }
        }

        if (command === "parrainage" || command === "parrain") {
            const subParrain = args[1]?.toLowerCase();
            if (!subParrain || subParrain === "help") {
                return message.reply(`🎁 𝐏𝐀𝐑𝐑𝐀𝐈𝐍𝐀𝐆𝐄\n━━━━━━━━━━━━━━━━\n📝 ${p}𝐛𝐚𝐧𝐤 𝐩𝐚𝐫𝐫𝐚𝐢𝐧𝐚𝐠𝐞 𝐜𝐫𝐞𝐞𝐫 → Creer votre code\n📝 ${p}𝐛𝐚𝐧𝐤 𝐩𝐚𝐫𝐫𝐚𝐢𝐧𝐚𝐠𝐞 𝐮𝐭𝐢𝐥𝐢𝐬𝐞𝐫 <𝐜𝐨𝐝𝐞> → Utiliser un code\n📊 ${p}𝐛𝐚𝐧𝐤 𝐩𝐚𝐫𝐫𝐚𝐢𝐧𝐚𝐠𝐞 𝐬𝐭𝐚𝐭𝐬 → Vos statistiques\n🏆 ${p}𝐛𝐚𝐧𝐤 𝐩𝐚𝐫𝐫𝐚𝐢𝐧𝐚𝐠𝐞 𝐭𝐨𝐩 → Classement\n━━━━━━━━━━━━━━━━\n🎁 Bonus parraine: +10000$ | Bonus parrain: +5000$`);
            }
            if (subParrain === "creer" || subParrain === "generate") {
                const result = await createParrainCode(user);
                if (result.success) {
                    const createText = `🎁 𝐂𝐎𝐃𝐄 𝐂𝐑𝐄𝐄\n━━━━━━━━━━━━━━━━\n🔑 ${result.code}\n━━━━━━━━━━━━━━━━\n📝 Partagez ce code a vos amis !`;
                    if (imageMode !== false) {
                        const img = await generateParrainCard(username, result.code, 0, 0, "create");
                        const imgPath = `./bank_parrain_${user}.png`;
                        fs.writeFileSync(imgPath, img);
                        await message.reply({ body: createText, attachment: fs.createReadStream(imgPath) });
                        fs.unlinkSync(imgPath);
                    } else {
                        return message.reply(createText);
                    }
                } else {
                    return message.reply(`❌ ${result.error || "Erreur"}`);
                }
            }
            if (subParrain === "utiliser" || subParrain === "use") {
                const codeUtilise = args[2];
                if (!codeUtilise) {
                    return message.reply(`❌ 𝐕𝐞𝐮𝐢𝐥𝐥𝐞𝐳 𝐟𝐨𝐮𝐫𝐧𝐢𝐫 𝐮𝐧 𝐜𝐨𝐝𝐞\n📝 ${p}𝐛𝐚𝐧𝐤 𝐩𝐚𝐫𝐫𝐚𝐢𝐧𝐚𝐠𝐞 𝐮𝐭𝐢𝐥𝐢𝐬𝐞𝐫 <𝐜𝐨𝐝𝐞>`);
                }
                const result = await useParrainCode(user, codeUtilise);
                if (result.success) {
                    bankData = await getUserBankData(user);
                    if (!bankData) bankData = { bank: 0, lastInterestClaimed: Date.now(), card: null };
                    const useText = `🎉 𝐏𝐀𝐑𝐑𝐀𝐈𝐍𝐀𝐆𝐄 𝐑𝐄𝐔𝐒𝐒𝐈\n━━━━━━━━━━━━━━━━\n🔑 Code: ${codeUtilise}\n🎁 Bonus: +10000$\n💰 Nouveau solde: ${formatNumber(bankData.bank)}$`;
                    if (imageMode !== false) {
                        const img = await generateParrainCard(username, codeUtilise, 0, 0, "use");
                        const imgPath = `./bank_parrain_use_${user}.png`;
                        fs.writeFileSync(imgPath, img);
                        await message.reply({ body: useText, attachment: fs.createReadStream(imgPath) });
                        fs.unlinkSync(imgPath);
                    } else {
                        return message.reply(useText);
                    }
                } else {
                    return message.reply(`❌ ${result.error}`);
                }
            }
        }

        if (command === "gamble" || command === "bet") {
            const subGamble = args[1]?.toLowerCase();
            if (!subGamble || subGamble === "help") {
                return message.reply(`🎰 𝐆𝐀𝐌𝐁𝐋𝐄 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐄𝐒\n━━━━━━━━━━━━━━━━\n📝 ${p}𝐛𝐚𝐧𝐤 𝐠𝐚𝐦𝐛𝐥𝐞 𝐩𝐥𝐚𝐲 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭> <𝐩𝐢𝐥𝐞/𝐟𝐚𝐜𝐞>\n💳 𝐄𝐱𝐞𝐦𝐩𝐥𝐞 : ${p}𝐛𝐚𝐧𝐤 𝐠𝐚𝐦𝐛𝐥𝐞 𝐩𝐥𝐚𝐲 𝟏𝟎𝟎𝐤 𝐩𝐢𝐥𝐞\n━━━━━━━━━━━━━━━━\n🎲 𝐂𝐡𝐨𝐢𝐬𝐢𝐬𝐬𝐞𝐳 𝐩𝐢𝐥𝐞 𝐨𝐮 𝐟𝐚𝐜𝐞, 𝐠𝐚𝐠𝐧𝐞𝐳 𝐱𝟐 !`);
            }
            if (subGamble === "play") {
                const betAmount = await parseAmountWithSuffix(args[2]);
                const choice = args[3]?.toLowerCase();
                if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
                    return message.reply(`❌ 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞\n━━━━━━━━━━━━━━━━\n📝 ${p}𝐛𝐚𝐧𝐤 𝐠𝐚𝐦𝐛𝐥𝐞 𝐩𝐥𝐚𝐲 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭> <𝐩𝐢𝐥𝐞/𝐟𝐚𝐜𝐞>`);
                }
                if (choice !== "pile" && choice !== "face") {
                    return message.reply(`❌ 𝐂𝐡𝐨𝐢𝐱 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞\n━━━━━━━━━━━━━━━━\n📝 𝐂𝐡𝐨𝐢𝐬𝐢𝐬𝐬𝐞𝐳 : 𝐩𝐢𝐥𝐞 𝐨𝐮 𝐟𝐚𝐜𝐞`);
                }
                const currentBankBalance = bankData.bank || 0;
                if (betAmount > currentBankBalance) {
                    return message.reply(`❌ 𝐒𝐨𝐥𝐝𝐞 𝐢𝐧𝐬𝐮𝐟𝐟𝐢𝐬𝐚𝐧𝐭\n━━━━━━━━━━━━━━━━\n💰 𝐒𝐨𝐥𝐝𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞 : ${formatNumber(currentBankBalance)}$`);
                }
                const gambleResult = await gambleApi(user, betAmount, choice);
                if (gambleResult && gambleResult.success) {
                    bankData = await getUserBankData(user);
                    if (!bankData) bankData = { bank: 0, lastInterestClaimed: Date.now(), card: null };
                    const win = gambleResult.win;
                    const result = gambleResult.result;
                    const winAmount = gambleResult.winAmount;
                    if (win) {
                        const winText = `🎉 𝐕𝐈𝐂𝐓𝐎𝐈𝐑𝐄 𝐀𝐔 𝐆𝐀𝐌𝐁𝐋𝐄 !\n━━━━━━━━━━━━━━━━\n🪙 𝐕𝐨𝐭𝐫𝐞 𝐜𝐡𝐨𝐢𝐱 : ${choice === "pile" ? "PILE" : "FACE"}\n🎲 𝐑𝐞́𝐬𝐮𝐥𝐭𝐚𝐭 : ${result === "pile" ? "PILE" : "FACE"}\n━━━━━━━━━━━━━━━━\n✨ 𝐆𝐚𝐢𝐧 : +${formatNumber(winAmount)}$\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(bankData.bank)}$`;
                        if (imageMode !== false) {
                            const img = await generateGambleCard(username, betAmount, true, winAmount, choice, result);
                            const imgPath = `./bank_gamble_${user}.png`;
                            fs.writeFileSync(imgPath, img);
                            await message.reply({ body: winText, attachment: fs.createReadStream(imgPath) });
                            fs.unlinkSync(imgPath);
                        } else {
                            return message.reply(winText);
                        }
                    } else {
                        const loseText = `💀 𝐏𝐄𝐑𝐃𝐔 𝐀𝐔 𝐆𝐀𝐌𝐁𝐋𝐄\n━━━━━━━━━━━━━━━━\n🪙 𝐕𝐨𝐭𝐫𝐞 𝐜𝐡𝐨𝐢𝐱 : ${choice === "pile" ? "PILE" : "FACE"}\n🎲 𝐑𝐞́𝐬𝐮𝐥𝐭𝐚𝐭 : ${result === "pile" ? "PILE" : "FACE"}\n━━━━━━━━━━━━━━━━\n📉 𝐏𝐞𝐫𝐭𝐞 : -${formatNumber(betAmount)}$\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(bankData.bank)}$`;
                        if (imageMode !== false) {
                            const img = await generateGambleCard(username, betAmount, false, 0, choice, result);
                            const imgPath = `./bank_gamble_${user}.png`;
                            fs.writeFileSync(imgPath, img);
                            await message.reply({ body: loseText, attachment: fs.createReadStream(imgPath) });
                            fs.unlinkSync(imgPath);
                        } else {
                            return message.reply(loseText);
                        }
                    }
                } else {
                    return message.reply(`❌ Erreur lors du gamble: ${gambleResult?.error || "Inconnue"}`);
                }
            }
        }

        if (command === "transfer" || command === "send") {
            let targetUser;
            if (Object.keys(event.mentions).length > 0) {
                targetUser = Object.keys(event.mentions)[0];
            } else {
                targetUser = args[1];
            }
            const transferAmount = await parseAmountWithSuffix(args[2]);
            if (!targetUser) {
                return message.reply(`❌ 𝐃𝐞𝐬𝐭𝐢𝐧𝐚𝐭𝐚𝐢𝐫𝐞 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞\n━━━━━━━━━━━━━━━━\n📝 ${p}𝐛𝐚𝐧𝐤 𝐭𝐫𝐚𝐧𝐬𝐟𝐞𝐫 @𝐦𝐞𝐧𝐭𝐢𝐨𝐧 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭>\n💳 𝐎𝐮 : ${p}𝐛𝐚𝐧𝐤 𝐭𝐫𝐚𝐧𝐬𝐟𝐞𝐫 <𝐈𝐃> <𝐦𝐨𝐧𝐭𝐚𝐧𝐭>`);
            }
            if (!transferAmount || isNaN(transferAmount) || transferAmount <= 0) {
                return message.reply(`❌ 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞\n━━━━━━━━━━━━━━━━\n📝 ${p}𝐛𝐚𝐧𝐤 𝐭𝐫𝐚𝐧𝐬𝐟𝐞𝐫 @𝐦𝐞𝐧𝐭𝐢𝐨𝐧 𝟓𝟎𝐤`);
            }
            if (targetUser === user) {
                return message.reply(`❌ 𝐕𝐨𝐮𝐬 𝐧𝐞 𝐩𝐨𝐮𝐯𝐞𝐳 𝐩𝐚𝐬 𝐯𝐨𝐮𝐬 𝐭𝐫𝐚𝐧𝐬𝐟𝐞́𝐫𝐞𝐫 𝐝𝐞 𝐥'𝐚𝐫𝐠𝐞𝐧𝐭 𝐚̀ 𝐯𝐨𝐮𝐬-𝐦𝐞̂𝐦𝐞.`);
            }
            const currentBankBalance = bankData.bank || 0;
            if (transferAmount > currentBankBalance) {
                return message.reply(`❌ 𝐒𝐨𝐥𝐝𝐞 𝐢𝐧𝐬𝐮𝐟𝐟𝐢𝐬𝐚𝐧𝐭\n━━━━━━━━━━━━━━━━\n💰 𝐒𝐨𝐥𝐝𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞 : ${formatNumber(currentBankBalance)}$\n🎲 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 : ${formatNumber(transferAmount)}$`);
            }
            if (!bankData.card || !bankData.card.cardCreated) {
                return message.reply(`❌ 𝐕𝐨𝐮𝐬 𝐝𝐞𝐯𝐞𝐳 𝐝'𝐚𝐛𝐨𝐫𝐝 𝐜𝐫𝐞́𝐞𝐫 𝐮𝐧𝐞 𝐜𝐚𝐫𝐭𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞\n━━━━━━━━━━━━━━━━\n📝 𝐔𝐭𝐢𝐥𝐢𝐬𝐞𝐳 : ${p}𝐛𝐚𝐧𝐤 𝐜𝐚𝐫𝐝`);
            }
            let targetName;
            try {
                const targetInfo = await api.getUserInfo(targetUser);
                targetName = targetInfo[targetUser]?.name || targetUser;
            } catch(e) {
                targetName = targetUser;
            }
            clearPendingTransaction(user);
            pendingTransactions.set(user, { amount: transferAmount, type: "transfer", targetId: targetUser, targetName: targetName });
            savePendingTransactions();
            const transferTimeout = setTimeout(() => {
                if (pendingTransactions.has(user)) {
                    pendingTransactions.delete(user);
                    savePendingTransactions();
                    message.reply(`⏰ 𝐓𝐫𝐚𝐧𝐬𝐟𝐞𝐫𝐭 𝐞𝐱𝐩𝐢𝐫𝐞́. 𝐕𝐞𝐮𝐢𝐥𝐥𝐞𝐳 𝐫𝐞́𝐞𝐬𝐬𝐚𝐲𝐞𝐫.`);
                }
                pendingTimeouts.delete(user);
            }, 15000);
            pendingTimeouts.set(user, transferTimeout);
            return message.reply(`💸 𝐓𝐫𝐚𝐧𝐬𝐟𝐞𝐫𝐭 𝐝𝐞 ${formatNumber(transferAmount)}$ 𝐯𝐞𝐫𝐬 ${targetName}\n━━━━━━━━━━━━━━━━\n🔐 𝐕𝐞𝐮𝐢𝐥𝐥𝐞𝐳 𝐞𝐧𝐭𝐫𝐞𝐫 𝐯𝐨𝐭𝐫𝐞 𝐂𝐕𝐕 𝐩𝐨𝐮𝐫 𝐜𝐨𝐧𝐟𝐢𝐫𝐦𝐞𝐫 𝐥𝐞 𝐭𝐫𝐚𝐧𝐬𝐟𝐞𝐫𝐭.\n━━━━━━━━━━━━━━━━\n📝 𝐄𝐱𝐞𝐦𝐩𝐥𝐞 : 𝐛𝐚𝐧𝐤 𝟏𝟐𝟑\n⏰ 𝐕𝐨𝐮𝐬 𝐚𝐯𝐞𝐳 𝟏𝟓 𝐬𝐞𝐜𝐨𝐧𝐝𝐞𝐬`);
        }

        const pending = pendingTransactions.get(user);
        if (pending) {
            const userCvv = parseInt(command);
            if (!isNaN(userCvv)) {
                clearPendingTransaction(user);
                const cardCvv = bankData.card?.cardCvv;
                if (userCvv !== cardCvv) {
                    return message.reply(`❌ 𝐂𝐕𝐕 𝐢𝐧𝐜𝐨𝐫𝐫𝐞𝐜𝐭 ! 𝐓𝐫𝐚𝐧𝐬𝐚𝐜𝐭𝐢𝐨𝐧 𝐚𝐧𝐧𝐮𝐥𝐞́𝐞.`);
                }
                const amount = pending.amount || 0;
                const type = pending.type;
                if (type === "deposit") {
                    const currentUserMoney = await getUserCash(event.senderID);
                    if (amount > currentUserMoney) {
                        return message.reply(`❌ 𝐅𝐨𝐧𝐝𝐬 𝐢𝐧𝐬𝐮𝐟𝐟𝐢𝐬𝐚𝐧𝐭𝐬\n━━━━━━━━━━━━━━━━\n💰 𝐓𝐨𝐧 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(currentUserMoney)}$\n🎲 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 : ${formatNumber(amount)}$`);
                    }
                    const depositResult = await updateUserBankData(user, amount, userCvv, "deposit");
                    if (depositResult && depositResult.success) {
                        if (depositResult.data && typeof depositResult.data.bank === 'number') {
                            bankData = { ...bankData, bank: depositResult.data.bank };
                        } else {
                            const fresh = await getUserBankData(user);
                            if (fresh) bankData = fresh;
                        }
                        await updateUserCash(event.senderID, -amount);
                        const depositText = `✅ 𝐃𝐞́𝐩𝐨̂𝐭 𝐝𝐞 ${formatNumber(amount)}$ 𝐞𝐟𝐟𝐞𝐜𝐭𝐮𝐞́ !\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(bankData.bank)}$`;
                        if (imageMode !== false) {
                            const img = await generateBankCard("DEPOSIT", `${formatNumber(bankData.bank)}$`, `+ ${formatNumber(amount)}$`, username);
                            const imgPath = `./bank_deposit_${user}.png`;
                            fs.writeFileSync(imgPath, img);
                            await message.reply({ body: depositText, attachment: fs.createReadStream(imgPath) });
                            fs.unlinkSync(imgPath);
                        } else {
                            return message.reply(depositText);
                        }
                    } else {
                        return message.reply(`❌ Erreur lors du depot: ${depositResult?.error || "Inconnue"}`);
                    }
                } else if (type === "withdraw") {
                    const currentBalance = bankData.bank || 0;
                    if (amount > currentBalance) {
                        return message.reply(`❌ 𝐒𝐨𝐥𝐝𝐞 𝐢𝐧𝐬𝐮𝐟𝐟𝐢𝐬𝐚𝐧𝐭\n━━━━━━━━━━━━━━━━\n💰 𝐒𝐨𝐥𝐝𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞 : ${formatNumber(currentBalance)}$\n🎲 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 : ${formatNumber(amount)}$`);
                    }
                    const withdrawResult = await updateUserBankData(user, amount, userCvv, "withdraw");
                    if (withdrawResult && withdrawResult.success) {
                        if (withdrawResult.data && typeof withdrawResult.data.bank === 'number') {
                            bankData = { ...bankData, bank: withdrawResult.data.bank };
                        } else {
                            const fresh = await getUserBankData(user);
                            if (fresh) bankData = fresh;
                        }
                        await updateUserCash(event.senderID, amount);
                        const withdrawText = `💸 𝐑𝐞𝐭𝐫𝐚𝐢𝐭 𝐝𝐞 ${formatNumber(amount)}$ 𝐞𝐟𝐟𝐞𝐜𝐭𝐮𝐞́ !\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(bankData.bank)}$`;
                        if (imageMode !== false) {
                            const img = await generateBankCard("WITHDRAW", `${formatNumber(bankData.bank)}$`, `- ${formatNumber(amount)}$`, username);
                            const imgPath = `./bank_withdraw_${user}.png`;
                            fs.writeFileSync(imgPath, img);
                            await message.reply({ body: withdrawText, attachment: fs.createReadStream(imgPath) });
                            fs.unlinkSync(imgPath);
                        } else {
                            return message.reply(withdrawText);
                        }
                    } else {
                        return message.reply(`❌ Erreur lors du retrait: ${withdrawResult?.error || "Inconnue"}`);
                    }
                } else if (type === "transfer") {
                    const currentBalance = bankData.bank || 0;
                    if (amount > currentBalance) {
                        return message.reply(`❌ 𝐒𝐨𝐥𝐝𝐞 𝐢𝐧𝐬𝐮𝐟𝐟𝐢𝐬𝐚𝐧𝐭\n━━━━━━━━━━━━━━━━\n💰 𝐒𝐨𝐥𝐝𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞 : ${formatNumber(currentBalance)}$\n🎲 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 : ${formatNumber(amount)}$`);
                    }
                    const transferResult = await transferApi(user, pending.targetId, amount, userCvv);
                    if (transferResult && transferResult.success) {
                        bankData = await getUserBankData(user);
                        if (!bankData) bankData = { bank: 0, lastInterestClaimed: Date.now(), card: null };
                        const transferText = `💸 𝐓𝐫𝐚𝐧𝐬𝐟𝐞𝐫𝐭 𝐝𝐞 ${formatNumber(amount)}$ 𝐯𝐞𝐫𝐬 ${pending.targetName} 𝐫𝐞́𝐮𝐬𝐬𝐢 !\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(bankData.bank)}$`;
                        if (imageMode !== false) {
                            const img = await generateTransferCard(username, pending.targetName, amount, bankData.bank);
                            const imgPath = `./bank_transfer_${user}.png`;
                            fs.writeFileSync(imgPath, img);
                            await message.reply({ body: transferText, attachment: fs.createReadStream(imgPath) });
                            fs.unlinkSync(imgPath);
                        } else {
                            return message.reply(transferText);
                        }
                    } else {
                        return message.reply(`❌ Erreur lors du transfert: ${transferResult?.error || "Inconnue"}`);
                    }
                }
                return;
            }
        }

        switch (command) {
            case "deposit":
                const depositAmount = await parseAmountWithSuffix(args[1]);
                if (!depositAmount || isNaN(depositAmount) || depositAmount <= 0) {
                    return message.reply(`❌ 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞\n━━━━━━━━━━━━━━━━\n📝 𝐔𝐭𝐢𝐥𝐢𝐬𝐚𝐭𝐢𝐨𝐧 : ${p}𝐛𝐚𝐧𝐤 𝐝𝐞𝐩𝐨𝐬𝐢𝐭 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭>\n💳 𝐄𝐱𝐞𝐦𝐩𝐥𝐞 : ${p}𝐛𝐚𝐧𝐤 𝐝𝐞𝐩𝐨𝐬𝐢𝐭 𝟓𝟎𝐤`);
                }
                if (!bankData.card || !bankData.card.cardCreated) {
                    return message.reply(`❌ 𝐕𝐨𝐮𝐬 𝐝𝐞𝐯𝐞𝐳 𝐝'𝐚𝐛𝐨𝐫𝐝 𝐜𝐫𝐞́𝐞𝐫 𝐮𝐧𝐞 𝐜𝐚𝐫𝐭𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞\n━━━━━━━━━━━━━━━━\n📝 𝐔𝐭𝐢𝐥𝐢𝐬𝐞𝐳 : ${p}𝐛𝐚𝐧𝐤 𝐜𝐚𝐫𝐝`);
                }
                clearPendingTransaction(user);
                pendingTransactions.set(user, { amount: depositAmount, type: "deposit" });
                savePendingTransactions();
                const depositTimeout = setTimeout(() => {
                    if (pendingTransactions.has(user)) {
                        pendingTransactions.delete(user);
                        savePendingTransactions();
                        message.reply(`⏰ 𝐓𝐫𝐚𝐧𝐬𝐚𝐜𝐭𝐢𝐨𝐧 𝐞𝐱𝐩𝐢𝐫𝐞́𝐞. 𝐕𝐞𝐮𝐢𝐥𝐥𝐞𝐳 𝐫𝐞́𝐞𝐬𝐬𝐚𝐲𝐞𝐫.`);
                    }
                    pendingTimeouts.delete(user);
                }, 15000);
                pendingTimeouts.set(user, depositTimeout);
                return message.reply(`💳 𝐓𝐫𝐚𝐧𝐬𝐚𝐜𝐭𝐢𝐨𝐧 𝐝𝐞 ${formatNumber(depositAmount)}$\n━━━━━━━━━━━━━━━━\n🔐 𝐕𝐞𝐮𝐢𝐥𝐥𝐞𝐳 𝐞𝐧𝐭𝐫𝐞𝐫 𝐯𝐨𝐭𝐫𝐞 𝐂𝐕𝐕 𝐩𝐨𝐮𝐫 𝐜𝐨𝐧𝐟𝐢𝐫𝐦𝐞𝐫 𝐥𝐞 𝐝𝐞́𝐩𝐨̂𝐭.\n━━━━━━━━━━━━━━━━\n📝 𝐄𝐱𝐞𝐦𝐩𝐥𝐞 : 𝐛𝐚𝐧𝐤 𝟏𝟐𝟑\n⏰ 𝐕𝐨𝐮𝐬 𝐚𝐯𝐞𝐳 𝟏𝟓 𝐬𝐞𝐜𝐨𝐧𝐝𝐞𝐬`);

            case "withdraw":
                const withdrawAmount = await parseAmountWithSuffix(args[1]);
                if (!withdrawAmount || isNaN(withdrawAmount) || withdrawAmount <= 0) {
                    return message.reply(`❌ 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 𝐢𝐧𝐯𝐚𝐥𝐢𝐝𝐞\n━━━━━━━━━━━━━━━━\n📝 𝐔𝐭𝐢𝐥𝐢𝐬𝐚𝐭𝐢𝐨𝐧 : ${p}𝐛𝐚𝐧𝐤 𝐰𝐢𝐭𝐡𝐝𝐫𝐚𝐰 <𝐦𝐨𝐧𝐭𝐚𝐧𝐭>\n💳 𝐄𝐱𝐞𝐦𝐩𝐥𝐞 : ${p}𝐛𝐚𝐧𝐤 𝐰𝐢𝐭𝐡𝐝𝐫𝐚𝐰 𝟓𝟎𝐤`);
                }
                if (!bankData.card || !bankData.card.cardCreated) {
                    return message.reply(`❌ 𝐕𝐨𝐮𝐬 𝐝𝐞𝐯𝐞𝐳 𝐝'𝐚𝐛𝐨𝐫𝐝 𝐜𝐫𝐞́𝐞𝐫 𝐮𝐧𝐞 𝐜𝐚𝐫𝐭𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞\n━━━━━━━━━━━━━━━━\n📝 𝐔𝐭𝐢𝐥𝐢𝐬𝐞𝐳 : ${p}𝐛𝐚𝐧𝐤 𝐜𝐚𝐫𝐝`);
                }
                const currentBalance = bankData.bank || 0;
                if (withdrawAmount > currentBalance) {
                    return message.reply(`❌ 𝐒𝐨𝐥𝐝𝐞 𝐢𝐧𝐬𝐮𝐟𝐟𝐢𝐬𝐚𝐧𝐭\n━━━━━━━━━━━━━━━━\n💰 𝐒𝐨𝐥𝐝𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞 : ${formatNumber(currentBalance)}$\n🎲 𝐌𝐨𝐧𝐭𝐚𝐧𝐭 : ${formatNumber(withdrawAmount)}$`);
                }
                clearPendingTransaction(user);
                pendingTransactions.set(user, { amount: withdrawAmount, type: "withdraw" });
                savePendingTransactions();
                const withdrawTimeout = setTimeout(() => {
                    if (pendingTransactions.has(user)) {
                        pendingTransactions.delete(user);
                        savePendingTransactions();
                        message.reply(`⏰ 𝐓𝐫𝐚𝐧𝐬𝐚𝐜𝐭𝐢𝐨𝐧 𝐞𝐱𝐩𝐢𝐫𝐞́𝐞. 𝐕𝐞𝐮𝐢𝐥𝐥𝐞𝐳 𝐫𝐞́𝐞𝐬𝐬𝐚𝐲𝐞𝐫.`);
                    }
                    pendingTimeouts.delete(user);
                }, 15000);
                pendingTimeouts.set(user, withdrawTimeout);
                return message.reply(`💳 𝐓𝐫𝐚𝐧𝐬𝐚𝐜𝐭𝐢𝐨𝐧 𝐝𝐞 ${formatNumber(withdrawAmount)}$\n━━━━━━━━━━━━━━━━\n🔐 𝐕𝐞𝐮𝐢𝐥𝐥𝐞𝐳 𝐞𝐧𝐭𝐫𝐞𝐫 𝐯𝐨𝐭𝐫𝐞 𝐂𝐕𝐕 𝐩𝐨𝐮𝐫 𝐜𝐨𝐧𝐟𝐢𝐫𝐦𝐞𝐫 𝐥𝐞 𝐫𝐞𝐭𝐫𝐚𝐢𝐭.\n━━━━━━━━━━━━━━━━\n📝 𝐄𝐱𝐞𝐦𝐩𝐥𝐞 : 𝐛𝐚𝐧𝐤 𝟏𝟐𝟑\n⏰ 𝐕𝐨𝐮𝐬 𝐚𝐯𝐞𝐳 𝟏𝟓 𝐬𝐞𝐜𝐨𝐧𝐝𝐞𝐬`);

            case "balance":
            case "show":
                const bankBalance = bankData.bank || 0;
                const balMsg = `💰 𝐒𝐨𝐥𝐝𝐞 𝐝𝐢𝐬𝐩𝐨𝐧𝐢𝐛𝐥𝐞`;
                const balText = `📋 𝐕𝐨𝐭𝐫𝐞 𝐬𝐨𝐥𝐝𝐞 𝐛𝐚𝐧𝐜𝐚𝐢𝐫𝐞 : ${formatNumber(bankBalance)}$`;
                if (imageMode !== false) {
                    const img = await generateBankCard("BALANCE", `${formatNumber(bankBalance)}$`, balMsg, username);
                    const imgPath = `./bank_balance_${user}.png`;
                    fs.writeFileSync(imgPath, img);
                    await message.reply({ body: balText, attachment: fs.createReadStream(imgPath) });
                    fs.unlinkSync(imgPath);
                } else {
                    return message.reply(balText);
                }
                break;

            case "interest":
                if ((bankData.bank || 0) <= 0) {
                    return message.reply(`❌ 𝐕𝐨𝐮𝐬 𝐧'𝐚𝐯𝐞𝐳 𝐚𝐮𝐜𝐮𝐧 𝐚𝐫𝐠𝐞𝐧𝐭 𝐞𝐧 𝐛𝐚𝐧𝐪𝐮𝐞 𝐩𝐨𝐮𝐫 𝐠𝐞𝐧𝐞𝐫𝐞𝐫 𝐝𝐞𝐬 𝐢𝐧𝐭𝐞𝐫𝐞̂𝐭𝐬.`);
                }
                const interestResult = await getInterest(user);
                if (interestResult.success) {
                    const freshBankData = await getUserBankData(user);
                    if (freshBankData) bankData = freshBankData;
                    const interestText = `📈 𝐈𝐧𝐭𝐞́𝐫𝐞̂𝐭𝐬 𝐜𝐫𝐞́𝐝𝐢𝐭𝐞́𝐬 : ${formatNumber(Math.floor(interestResult.interestEarned))}$\n💰 𝐍𝐨𝐮𝐯𝐞𝐚𝐮 𝐬𝐨𝐥𝐝𝐞 : ${formatNumber(Math.floor(bankData.bank))}$`;
                    if (imageMode !== false) {
                        const interestMsg = `+ ${formatNumber(Math.floor(interestResult.interestEarned))}$ (𝐢𝐧𝐭𝐞́𝐫𝐞̂𝐭𝐬)`;
                        const img = await generateBankCard("INTEREST", `${formatNumber(Math.floor(bankData.bank))}$`, interestMsg, username);
                        const imgPath = `./bank_interest_${user}.png`;
                        fs.writeFileSync(imgPath, img);
                        await message.reply({ body: interestText, attachment: fs.createReadStream(imgPath) });
                        fs.unlinkSync(imgPath);
                    } else {
                        return message.reply(interestText);
                    }
                } else {
                    return message.reply(`❌ ${interestResult.error}`);
                }
                break;

            case "top":
            case "richest":
                const topResult = await getTopUsers();
                if (topResult.success && topResult.data.length > 0) {
                    let output = "";
                    for (let i = 0; i < Math.min(topResult.data.length, 25); i++) {
                        const userDataItem = topResult.data[i];
                        let userName = userDataItem.userId;
                        try {
                            const userInfo = await api.getUserInfo(userDataItem.userId);
                            userName = userInfo[userDataItem.userId]?.name || userDataItem.userId;
                        } catch(e) {}
                        output += `[${i + 1}. ${userName}] - ${formatNumber(userDataItem.bank || 0)}$\n`;
                    }
                    return message.reply(`👑 𝐂𝐋𝐀𝐒𝐒𝐄𝐌𝐄𝐍𝐓 𝐃𝐄𝐒 𝐏𝐋𝐔𝐒 𝐑𝐈𝐂𝐇𝐄𝐒 👑\n━━━━━━━━━━━━━━━━\n${output}`);
                } else {
                    return message.reply(`📊 𝐀𝐮𝐜𝐮𝐧 𝐮𝐭𝐢𝐥𝐢𝐬𝐚𝐭𝐞𝐮𝐫 𝐩𝐨𝐮𝐫 𝐥'𝐢𝐧𝐬𝐭𝐚𝐧𝐭`);
                }

            default:
                return message.reply(`==[🏦 𝐔𝐂𝐇𝐈𝐖𝐀 𝐁𝐀𝐍𝐊 🏦]==\n━━━━━━━━━━━━━━━\n📲 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐞𝐬 𝐝𝐢𝐬𝐩𝐨𝐧𝐢𝐛𝐥𝐞𝐬 :\n✰ ${p}𝐛𝐚𝐧𝐤 𝐝𝐞𝐩𝐨𝐬𝐢𝐭 (𝐦𝐨𝐧𝐭𝐚𝐧𝐭)\n✰ ${p}𝐛𝐚𝐧𝐤 𝐰𝐢𝐭𝐡𝐝𝐫𝐚𝐰 (𝐦𝐨𝐧𝐭𝐚𝐧𝐭)\n✰ ${p}𝐛𝐚𝐧𝐤 𝐛𝐚𝐥𝐚𝐧𝐜𝐞\n✰ ${p}𝐛𝐚𝐧𝐤 𝐢𝐧𝐭𝐞𝐫𝐞𝐬𝐭\n✰ ${p}𝐛𝐚𝐧𝐤 𝐭𝐫𝐚𝐧𝐬𝐟𝐞𝐫\n✰ ${p}𝐛𝐚𝐧𝐤 𝐠𝐚𝐦𝐛𝐥𝐞\n✰ ${p}𝐛𝐚𝐧𝐤 𝐭𝐨𝐩\n✰ ${p}𝐛𝐚𝐧𝐤 𝐜𝐚𝐫𝐝\n✰ ${p}𝐛𝐚𝐧𝐤 𝐥𝐨𝐭𝐭𝐞𝐫𝐲\n✰ ${p}𝐛𝐚𝐧𝐤 𝐩𝐚𝐫𝐫𝐚𝐢𝐧𝐚𝐠𝐞\n✰ ${p}𝐛𝐚𝐧𝐤 𝐢𝐦𝐚𝐠𝐞 𝐨𝐧/𝐨𝐟𝐟\n━━━━━━━━━━━━━━━━`);
        }
    }
};
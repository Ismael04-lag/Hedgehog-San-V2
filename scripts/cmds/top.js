const fs = require("fs");
const { createCanvas } = require("canvas");
const axios = require("axios");
const { getUsername } = require("../../utils/getUsername.js");
const { toBold } = require("../../utils/toBold.js");

const CASH_API_URL = "https://cash-api-five.vercel.app/api/cash";
const CONVERT_API_URL = "https://numbers-conversion.vercel.app/api/parse";

function isInfinity(value) {
    if (typeof value === 'bigint') {
        return value > BigInt("9".repeat(260));
    }
    return !isFinite(Number(value)) || Number(value) >= 1e260;
}

function toBigInt(value) {
    if (typeof value === 'bigint') return value;
    if (value === undefined || value === null) return 0n;
    try {
        return BigInt(String(value).split('.')[0]);
    } catch {
        return 0n;
    }
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
    if (i > 0 && remainder > 0n) {
        return `${scaled}.${remainder}${suffixes[i]}`;
    }
    return `${scaled}${suffixes[i]}`;
}

async function formatNumberWithAPI(num) {
    if (isInfinity(num)) return "∞";
    const bigNum = toBigInt(num);
    try {
        const response = await axios.get(`${CONVERT_API_URL}?number=${bigNum.toString()}`);
        if (response.data && response.data.success) return response.data.formatted;
    } catch (error) {
        console.error("Convert API Error:", error.message);
    }
    return formatBigInt(bigNum);
}

async function getAllUsersCash() {
    try {
        const response = await axios.get(`${CASH_API_URL}/top?limit=50`);
        if (response.data && response.data.success && Array.isArray(response.data.data)) {
            return response.data.data;
        }
    } catch (error) {
        console.error("Cash API Error:", error.message);
    }
    return [];
}

async function generateTopImage(users, page, totalPages) {
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
    ctx.font = "bold 22px 'Courier New'";
    ctx.fillText("UCHIWA BANK", 30, 55);
    ctx.font = "11px 'Courier New'";
    ctx.fillStyle = "#aaa";
    ctx.fillText("PREMIUM CLASSEMENT", 30, 75);

    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 20px 'Courier New'";
    ctx.fillText("TOP 50 - LES PLUS RICHES", 150, 55);

    ctx.fillStyle = "#d4af37";
    ctx.fillRect(480, 35, 45, 30);
    ctx.fillStyle = "#b8960c";
    ctx.fillRect(484, 39, 37, 22);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px 'Courier New'";
    ctx.fillText("RANG", 30, 115);
    ctx.fillText("NOM", 100, 115);
    ctx.textAlign = "right";
    ctx.fillText("MONTANT", 560, 115);
    ctx.textAlign = "left";

    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(20, 125, 560, 2);

    let y = 145;
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const rank = (page - 1) * 10 + i + 1;
        const name = user.name || `User_${String(user.userId).slice(-5)}`;
        const cash = user.formattedCash;

        if (rank === 1) ctx.fillStyle = "#ffd700";
        else if (rank === 2) ctx.fillStyle = "#c0c0c0";
        else if (rank === 3) ctx.fillStyle = "#cd7f32";
        else ctx.fillStyle = "#fff";

        ctx.font = "bold 13px 'Courier New'";
        ctx.fillText(`${rank}.`, 30, y);

        const displayName = name.length > 25 ? name.substring(0, 22) + "..." : name;
        ctx.fillText(displayName, 100, y);

        ctx.textAlign = "right";
        ctx.fillText(cash, 560, y);
        ctx.textAlign = "left";

        y += 25;
        if (y > 380) break;
    }

    ctx.fillStyle = "#aaa";
    ctx.font = "10px 'Courier New'";
    ctx.fillText(`Page ${page}/${totalPages}`, 30, 400);

    const date = new Date();
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    ctx.fillStyle = "#666";
    ctx.font = "9px 'Courier New'";
    ctx.fillText(dateStr, 500, 400);

    return canvas.toBuffer();
}

module.exports = {
    config: {
        name: "top",
        version: "6.1",
        author: "Itachi Soma",
        role: 0,
        shortDescription: { en: "Top richest users" },
        longDescription: { en: "Displays the top 50 richest users with real names" },
        category: "group",
        guide: { en: "{pn} [page]" }
    },

    onStart: async function ({ api, args, message, event, usersData }) {
        const allUsers = await getAllUsersCash();

        if (allUsers.length === 0) {
            return message.reply(toBold("❌ Aucune donnée trouvée."));
        }

        let page = args[0] ? parseInt(args[0]) : 1;
        const usersPerPage = 10;
        const totalPages = Math.ceil(Math.min(allUsers.length, 50) / usersPerPage);

        if (page < 1 || page > totalPages) {
            return message.reply(toBold(`❌ Page invalide. Il y a ${totalPages} pages disponibles.`));
        }

        const startIndex = (page - 1) * usersPerPage;
        const endIndex = startIndex + usersPerPage;
        const usersOnPage = allUsers.slice(startIndex, endIndex);

        // ✅ Récupérer tous les membres du thread en une seule requête
        let threadMembersMap = {};
        try {
            const threadInfo = await api.getThreadInfo(event.threadID);
            if (threadInfo && threadInfo.userInfo) {
                for (const member of threadInfo.userInfo) {
                    if (member.id && member.name) {
                        threadMembersMap[member.id] = member.name;
                    }
                }
            }
        } catch (e) {
            console.error("Erreur getThreadInfo:", e.message);
        }

        const enrichedUsers = [];
        for (const user of usersOnPage) {
            try {
                // 1. Chercher dans les membres du thread (le plus fiable)
                let name = threadMembersMap[user.userId];

                // 2. Fallback : getUsername classique
                if (!name || name === user.userId) {
                    name = await getUsername(user.userId, api, usersData);
                }

                const cashAmount = toBigInt(user.cash || 0);
                const formattedCash = await formatNumberWithAPI(cashAmount);
                enrichedUsers.push({
                    ...user,
                    name: toBold(name),
                    formattedCash
                });
            } catch (error) {
                console.error(`Erreur pour ${user.userId}:`, error.message);
                const cashAmount = toBigInt(user.cash || 0);
                enrichedUsers.push({
                    ...user,
                    name: toBold(`User_${String(user.userId).slice(-5)}`),
                    formattedCash: await formatNumberWithAPI(cashAmount)
                });
            }
        }

        // Message texte
        let textMsg = toBold("📝 TOP 50 - LES PLUS RICHES") + `\n━━━━━━━━━━━━━━━━━━\n`;
        enrichedUsers.forEach((user, index) => {
            const rank = startIndex + index + 1;
            const prefix = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "▸";
            textMsg += `${prefix} ${rank}. ${user.name}: ${user.formattedCash}\n`;
        });
        textMsg += `━━━━━━━━━━━━━━━━━━\n${toBold(`📜 Page ${page}/${totalPages}`)}`;

        await message.reply(textMsg);

        // Génération de l'image
        try {
            const img = await generateTopImage(enrichedUsers, page, totalPages);
            const imgPath = `./top_${Date.now()}.png`;
            fs.writeFileSync(imgPath, img);
            await message.reply({
                body: toBold("💳 Carte du classement :"),
                attachment: fs.createReadStream(imgPath)
            });
            fs.unlinkSync(imgPath);
        } catch (error) {
            console.error("Erreur génération image:", error);
        }
    }
};
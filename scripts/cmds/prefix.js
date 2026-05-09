const fs = require("fs-extra");
const { utils } = global;
const Canvas = require("canvas");
const path = require("path");

const BOT_UID = global.botID;
async function createPrefixImage(type, data, usersData) {
  try {
    const width = 1000;
    const height = 600;
    const canvas = Canvas.createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let botAvatar;
    let botName = "Hedgehog GPT";

    try {
      const avatarUrl = await usersData.getAvatarUrl(BOT_UID);
      botAvatar = await Canvas.loadImage(avatarUrl);

      const botInfo = await usersData.get(BOT_UID);
      if (botInfo && botInfo.name) {
        botName = botInfo.name;
      }
    } catch (error) {
      return null;
    }

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0a0a0a');
    gradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const avatarSize = 120;
    const avatarX = 50;
    const avatarY = 50;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.drawImage(botAvatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(botName, avatarX + avatarSize + 20, avatarY + 40);
    ctx.fillText(`UID: ${BOT_UID}`, avatarX + avatarSize + 20, avatarY + 70);

    let title, color, icon, status;
    switch(type) {
      case 'info':
        title = '🦔 SYSTÈME PREFIX 🦔';
        color = '#4cc9f0';
        icon = '⚙️';
        status = 'CONFIGURATION';
        break;
      case 'changed':
        title = data.isGlobal ? '🌍 PREFIX GLOBAL 🌍' : '✅ PREFIX MODIFIÉ ✅';
        color = data.isGlobal ? '#FFD700' : '#4cc9f0';
        icon = data.isGlobal ? '👑' : '💬';
        status = data.isGlobal ? 'GLOBAL CHANGÉ' : 'BOX CHANGÉ';
        break;
      case 'confirmation':
        title = data.isGlobal ? '⚠️ CONFIRMATION GLOBALE ⚠️' : '⚠️ CONFIRMATION ⚠️';
        color = '#e94560';
        icon = '❓';
        status = 'EN ATTENTE';
        break;
      case 'reset':
        title = '🔄 PREFIX RÉINITIALISÉ 🔄';
        color = '#888888';
        icon = '↩️';
        status = 'RÉINITIALISÉ';
        break;
    }

    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, avatarY + avatarSize + 60);

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 150, avatarY + avatarSize + 70);
    ctx.lineTo(width / 2 + 150, avatarY + avatarSize + 70);
    ctx.stroke();

    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';

    let y = avatarY + avatarSize + 120;

    if (data.newPrefix) {
      ctx.fillText(`🎯 Nouveau Prefix: ${data.newPrefix}`, 100, y);
      y += 40;
    }

    if (data.oldPrefix) {
      ctx.fillText(`📊 Ancien Prefix: ${data.oldPrefix}`, 100, y);
      y += 40;
    }

    if (data.globalPrefix) {
      ctx.fillText(`👑 Prefix Global: ${data.globalPrefix}`, 100, y);
      y += 40;
    }

    if (data.boxPrefix !== undefined) {
      const boxText = data.boxPrefix || 'Défaut';
      ctx.fillText(`💬 Prefix Box: ${boxText}`, 100, y);
      y += 40;
    }

    if (data.type) {
      ctx.fillText(`📝 Type: ${data.type}`, 100, y);
      y += 40;
    }

    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = color;
    ctx.fillText(`${icon} ${status}`, 100, y);

    ctx.font = 'italic 20px Arial';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText('Système Hedgehog • Gestion Prefix v2.0', width / 2, height - 30);

    return canvas.toBuffer();
  } catch (error) {
    return null;
  }
}

async function sendImage(api, event, imageBuffer) {
  try {
    if (!imageBuffer) return;

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 12);
    const fileName = `prefix_${timestamp}_${random}.png`;
    const filePath = path.join(__dirname, fileName);

    fs.writeFileSync(filePath, imageBuffer);

    await new Promise((resolve, reject) => {
      api.sendMessage({
        body: "",
        attachment: fs.createReadStream(filePath)
      }, event.threadID, (err, info) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {}

        if (err) return reject(err);
        resolve(info);
      });
    });

  } catch (error) {}
}

module.exports = {
  config: {
    name: "prefix",
    version: "2.0",
    author: "Ntkhang ( patched by L'Uchiha Perdu & Soma Sonic",
    countDown: 5,
    role: 0,
    description: "Gère les prefixes du bot",
    category: "config",
    guide: {
      en: `╭─⌾🌿HEDGEHOG🌿
│🦔|𝐒𝐲𝐬𝐭𝐞𝐦 𝐏𝐫𝐞𝐟𝐢𝐱: !
│🔖|𝐁𝐨𝐱 𝐂𝐡𝐚𝐭 𝐏𝐫𝐞𝐟𝐢𝐱: #
│
│📌 𝐔𝐭𝐢𝐥𝐢𝐬𝐚𝐭𝐢𝐨𝐧:
│• prefix <nouveau> → Change box
│• prefix <nouveau> -g → Change global
│• prefix reset → Réinitialise box
╰──────────⌾`
    }
  },

  langs: {
    en: {
      reset: `≪━─━─━─◈─━─━─━≫
✅ 𝐏𝐑𝐄𝐅𝐈𝐗 𝐑𝐄𝐒𝐄𝐓 ✅

Prefix box réinitialisé à: %1

Utilise maintenant: "%1help"
≪━─━─━─◈─━─━─━≫`,
      onlyAdmin: `≪━─━─━─◈─━─━─━≫
🚫 𝐏𝐄𝐑𝐌𝐈𝐒𝐒𝐈𝐎𝐍 𝐑𝐄𝐅𝐔𝐒É𝐄

Seuls les admins peuvent changer le prefix global.
≪━─━─━─◈─━─━─━≫`,
      confirmGlobal: `≪━─━─━─◈─━─━─━≫
⚠️ 𝐂𝐎𝐍𝐅𝐈𝐑𝐌𝐀𝐓𝐈𝐎𝐍 𝐆𝐋𝐎𝐁𝐀𝐋𝐄

Changer le prefix GLOBAL en "%1" ?

⚠️ Affecte TOUT le bot
✅ Réagis pour confirmer
⏱️ 30 secondes
≪━─━─━─◈─━─━─━≫`,
      confirmThisThread: `≪━─━─━─◈─━─━─━≫
⚠️ 𝐂𝐎𝐍𝐅𝐈𝐑𝐌𝐀𝐓𝐈𝐎𝐍

Changer le prefix BOX en "%1" ?

✅ Réagis pour confirmer
⏱️ 30 secondes
≪━─━─━─◈─━─━─━≫`,
      successGlobal: `≪━─━─━─◈─━─━─━≫
🌍 𝐏𝐑𝐄𝐅𝐈𝐗 𝐆𝐋𝐎𝐁𝐀𝐋 𝐌𝐎𝐃𝐈𝐅𝐈𝐄

Nouveau prefix global: %1

Affecte toutes les conversations.
≪━─━─━─◈─━─━─━≫`,
      successThisThread: `≪━─━─━─◈─━─━─━≫
✅ 𝐏𝐑𝐄𝐅𝐈𝐗 𝐁𝐎𝐗 𝐌𝐎𝐃𝐈𝐅𝐈𝐄

Nouveau prefix box: %1

Utilise maintenant: "%1help"
≪━─━─━─◈─━─━─━≫`,
      myPrefix: `╭─⌾🌿HEDGEHOG🌿
│🦔|𝐒𝐲𝐬𝐭𝐞𝐦 𝐏𝐫𝐞𝐟𝐢𝐱: %1
│🔖|𝐁𝐨𝐱 𝐂𝐡𝐚𝐭 𝐏𝐫𝐞𝐟𝐢𝐱: %2
╰──────────⌾`
    }
  },

  onStart: async function ({ message, role, args, commandName, event, threadsData, getLang, api, usersData }) {
    if (!args[0]) {
      const globalPrefix = global.GoatBot.config.prefix;
      const boxPrefix = await threadsData.get(event.threadID, "data.prefix");

      const infoImage = await createPrefixImage('info', {
        globalPrefix: globalPrefix,
        boxPrefix: boxPrefix
      }, usersData);

      await message.reply(getLang("myPrefix", globalPrefix, boxPrefix || globalPrefix));

      if (infoImage) {
        await sendImage(api, event, infoImage);
      }
      return;
    }

    if (args[0] == 'reset') {
      const oldPrefix = await threadsData.get(event.threadID, "data.prefix") || global.GoatBot.config.prefix;
      await threadsData.set(event.threadID, null, "data.prefix");

      const resetImage = await createPrefixImage('reset', {
        newPrefix: global.GoatBot.config.prefix,
        oldPrefix: oldPrefix,
        type: 'Box Réinitialisé'
      }, usersData);

      await message.reply(getLang("reset", global.GoatBot.config.prefix));

      if (resetImage) {
        await sendImage(api, event, resetImage);
      }
      return;
    }

    let newPrefix;
    let setGlobal = false;

    if (args[0] === "-g" && args[1]) {
      setGlobal = true;
      newPrefix = args[1];
    } else if (args[1] === "-g") {
      setGlobal = true;
      newPrefix = args[0];
    } else {
      newPrefix = args[0];
    }

    if (setGlobal && role < 2) {
      return message.reply(getLang("onlyAdmin"));
    }

    const formSet = {
      commandName,
      author: event.senderID,
      newPrefix,
      setGlobal,
      threadID: event.threadID
    };

    const confirmMessage = setGlobal ? 
      getLang("confirmGlobal", newPrefix) : 
      getLang("confirmThisThread", newPrefix);

    const confirmImage = await createPrefixImage('confirmation', {
      newPrefix: newPrefix,
      isGlobal: setGlobal,
      type: setGlobal ? 'Changement Global' : 'Changement Box'
    }, usersData);

    await message.reply(confirmMessage, async (err, info) => {
      formSet.messageID = info.messageID;
      global.GoatBot.onReaction.set(info.messageID, formSet);

      if (confirmImage) {
        await sendImage(api, event, confirmImage);
      }
    });
  },

  onReaction: async function ({ message, threadsData, event, Reaction, getLang, api, usersData }) {
    const { author, newPrefix, setGlobal, threadID } = Reaction;
    if (event.userID !== author) return;

    const oldPrefix = setGlobal ? 
      global.GoatBot.config.prefix : 
      (await threadsData.get(threadID, "data.prefix")) || global.GoatBot.config.prefix;

    if (setGlobal) {
      global.GoatBot.config.prefix = newPrefix;
      fs.writeFileSync(global.client.dirConfig, JSON.stringify(global.GoatBot.config, null, 2));

      const successImage = await createPrefixImage('changed', {
        newPrefix: newPrefix,
        oldPrefix: oldPrefix,
        isGlobal: true,
        type: 'Changement Global'
      }, usersData);

      await message.reply(getLang("successGlobal", newPrefix));

      if (successImage) {
        await sendImage(api, event, successImage);
      }
    } else {
      await threadsData.set(threadID, newPrefix, "data.prefix");

      const successImage = await createPrefixImage('changed', {
        newPrefix: newPrefix,
        oldPrefix: oldPrefix,
        isGlobal: false,
        type: 'Changement Box'
      }, usersData);

      await message.reply(getLang("successThisThread", newPrefix));

      if (successImage) {
        await sendImage(api, event, successImage);
      }
    }
  },

  onChat: async function ({ event, message, getLang, api, usersData }) {
    if (event.body && event.body.toLowerCase() === "prefix") {
      const globalPrefix = global.GoatBot.config.prefix;
      const boxPrefix = utils.getPrefix(event.threadID);

      const infoImage = await createPrefixImage('info', {
        globalPrefix: globalPrefix,
        boxPrefix: boxPrefix
      }, usersData);

      await message.reply(getLang("myPrefix", globalPrefix, boxPrefix));

      if (infoImage) {
        await sendImage(api, event, infoImage);
      }
    }
  }
};
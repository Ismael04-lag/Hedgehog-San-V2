const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");
const { getPrefix } = global.utils;
const { commands, aliases } = global.GoatBot;

module.exports = {
  config: {
    name: "help",
    version: "1.8",
    author: "ʚʆɞ Ismael Sømå ʚʆɞ",
    countDown: 5,
    role: 0,
    shortDescription: { en: "Liste des commandes et aide" },
    longDescription: { en: "Affiche toutes les commandes ou les détails d'une commande spécifique." },
    category: "info",
    guide: { en: "{pn} [nom de la commande]" },
    priority: 0,
  },

  onStart: async function ({ message, args, event, threadsData, role }) {
    const threadID = event.threadID;
    const threadData = await threadsData.get(threadID);
    const prefix = getPrefix(threadID);

    if (args.length === 0) {
      const categories = {};

      for (const [name, cmd] of commands) {
        if (cmd.config.role > 1 && role < cmd.config.role) continue;
        const category = cmd.config.category || "Uncategorized";
        if (!categories[category]) categories[category] = [];
        categories[category].push(name);
      }

      const sortedCategories = Object.keys(categories).sort((a, b) => {
        if (a === "info") return -1;
        if (b === "info") return 1;
        return a.localeCompare(b);
      });

      let msg = "";
      msg += `┌─────────────•┈┈\n`;
      msg += `│ 🔹 Prefix : ${prefix}\n`;
      msg += `│ 🔸 Total commands : ${commands.size}\n`;
      msg += `└─────────────•┈┈\n\n`;

      for (const cat of sortedCategories) {
        const cmdList = categories[cat].sort();
        msg += `╭──【 ${cat.toUpperCase()} 】───\n`;

        const perLine = 2;
        for (let i = 0; i < cmdList.length; i += perLine) {
          const chunk = cmdList.slice(i, i + perLine);
          const line = chunk.map(c => `⤷ ${c}`).join("   ");
          msg += `│ ${line}\n`;
        }
        msg += `╰─────────────\n`;
      }

      msg += `\n💡 Utilisation: \`${prefix}help <commande>\` pour plus de détails.\n`;
      msg += `━━━━━━━━━━━━━━━━━`;

      return message.reply(msg);
    }

    const input = args[0].toLowerCase();
    const cmd = commands.get(input) || commands.get(aliases.get(input));

    if (!cmd) {
      return message.reply(`❌ Commande \`${input}\` introuvable. Tapez \`${prefix}help\` pour la liste.`);
    }

    const cfg = cmd.config;
    const roleLevel = cfg.role || 0;
    const roleName = roleLevel === 0 ? "Tout le monde" : (roleLevel === 1 ? "Admin groupe" : "Admin bot");

    let response = `📖 ${cfg.name.toUpperCase()}\n`;
    response += `┌─────────────•┈┈\n`;
    response += `│ 📝 Description : ${cfg.longDescription?.en || cfg.shortDescription?.en || "Aucune"}\n`;
    response += `│ 👤 Auteur : ${cfg.author || "Inconnu"}\n`;
    response += `│ 🎚️ Rôle requis : ${roleName} (${roleLevel})\n`;
    response += `│ ⏱️ Cooldown : ${cfg.countDown || 1}s\n`;
    response += `│ 📚 Alias : ${cfg.aliases?.length ? cfg.aliases.join(", ") : "Aucun"}\n`;
    response += `└─────────────•┈┈\n`;
    response += `\n🔧 Utilisation :\n`;
    const guide = cfg.guide?.en || "Pas d'exemple fourni.";
    const usage = guide.replace(/{p}/g, prefix).replace(/{pn}/g, prefix + cfg.name).replace(/{n}/g, cfg.name);
    response += `\`${usage}\``;

    return message.reply(response);
  },
};

function roleTextToString(roleText) {
  switch (roleText) {
    case 0: return "0 (Tous les utilisateurs)";
    case 1: return "1 (Admins du groupe)";
    case 2: return "2 (Admins du bot)";
    default: return "Inconnu";
  }
}
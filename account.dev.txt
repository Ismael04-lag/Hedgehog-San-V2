const fs = require('fs');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');
const FormData = require('form-data');
const Canvas = require('canvas');

module.exports = {
  config: {
    name: "file",
    version: "1.7",
    author: "ʚʆɞ Sømå Sønïč ʚʆɞ  & L'Uchiha Perdu",
    countDown: 5,
    role: 0,
    shortDescription: "Advanced file system avec images",
    longDescription: "Send files, folders, analyze, chunk, search, list, attach",
    category: "owner",
    guide: "{pn} loading"
  },

  onStart: async function({ message, args, api, event }) {
    const permanentCommands = ["loading", "info", "list", "search", "check", "delete"];
    const sub = args[0] ? args[0].toLowerCase() :  " ";
    async function send(text, noDelete = false) {
      const shouldStay = permanentCommands.includes(sub) || noDelete;
      return new Promise((resolve, reject) => {
        api.sendMessage(text, event.threadID, (err, info) => {
          if (err) return reject(err);
          if (!shouldStay) {
            setTimeout(() => {
              api.unsendMessage(info.messageID, (unsendErr) => {
                if (unsendErr) console.error("Erreur unsend:", unsendErr.message);
              });
            }, 6000);
          }
          resolve(info);
        });
      });
    }

    async function sendImage(imageBuffer) {
      try {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 12);
        const fileName = `image_${timestamp}_${random}.png`;
        const filePath = path.join(__dirname, fileName);

        fs.writeFileSync(filePath, imageBuffer);

        await new Promise((resolve, reject) => {
          api.sendMessage({
            body: "",
            attachment: fs.createReadStream(filePath)
          }, event.threadID, (err, info) => {
            if (err) return reject(err);
            resolve(info);
          });
        });

        setTimeout(() => {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (e) {
            console.error("Erreur unlink:", e.message);
          }
        }, 10000);

      } catch (error) {
        console.error("Erreur image:", error.message);
        await send("🖼️ Erreur lors de l'envoi de l'image.");
      }
    }

    const permission = ["61589149033077", "100083846212138"];
    if (!permission.includes(event.senderID)) {
      return send("🚫| Négatif... Seuls ʚʆɞ Ismael Sømå ʚʆɞ & Walter O'Brien peuvent utiliser cette fonction.");
    }

    const border = "≪━─━─━─◈─━─━─━≫";
    if (!args[0]) return send(`${border}\n【 ❌ SYNTAXE 】\nUtilise: file loading pour le guide.\n${border}`);

    const baseDir = __dirname;

    async function createSuccessImage(title, subtitle, data = {}) {
      const width = 1000;
      const height = 500;
      const canvas = Canvas.createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(1, '#16213e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#0f3460';
      ctx.fillRect(0, 0, width, 80);

      ctx.font = 'bold 40px Arial';
      ctx.fillStyle = '#e94560';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 50);

      ctx.font = '25px Arial';
      ctx.fillStyle = '#f1f1f1';
      ctx.fillText(subtitle, width / 2, 100);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(70, 150);
      ctx.lineTo(width - 70, 150);
      ctx.quadraticCurveTo(width - 50, 150, width - 50, 170);
      ctx.lineTo(width - 50, height - 70);
      ctx.quadraticCurveTo(width - 50, height - 50, width - 70, height - 50);
      ctx.lineTo(70, height - 50);
      ctx.quadraticCurveTo(50, height - 50, 50, height - 70);
      ctx.lineTo(50, 170);
      ctx.quadraticCurveTo(50, 150, 70, 150);
      ctx.closePath();
      ctx.fill();

      ctx.font = 'bold 30px Arial';
      ctx.fillStyle = '#e94560';
      ctx.textAlign = 'left';

      let y = 200;
      for (const [key, value] of Object.entries(data)) {
        ctx.font = '22px Arial';
        ctx.fillStyle = '#f1f1f1';
        ctx.fillText(`• ${key}:`, 100, y);

        ctx.font = 'bold 22px Arial';
        ctx.fillStyle = '#4cc9f0';
        ctx.fillText(value, 300, y);
        y += 40;
      }

      ctx.font = '18px Arial';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.fillText('✅ Système File v1.7', width / 2, height - 30);

      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(100, 130);
      ctx.lineTo(width - 100, 130);
      ctx.stroke();

      return canvas.toBuffer();
    }

    if (sub === "loading") {
      const guideImage = await createSuccessImage(
        "📚 GUIDE DU SYSTÈME", 
        "Commandes disponibles",
        {
          "Version": "1.7",
          "Auteurs": "SONIC & Uchiha",
          "Commandes": "9 disponibles"
        }
      );
      const guideText = `${border}\n【 💡 GUIDE FILE 】\n\n📄 file <nom> → Envoie le fichier\n📃 file list → Liste tous .js\n🔍 file search <mot> → Recherche floue\n🧩 file chunk <file> <part> → Par morceaux\n📁 file folder <dossier> → ZIP + envoi\n🧪 file check <file> → Analyse rapide\n📊 file info <file> → Infos fichier\n🌐 file raw <nom> → Lien raw\n❌ file delete <url> → Supprime via API\n\nPour fichiers longs: ZIP auto !\n${border}`;
      await send(guideText, true);
      await sendImage(guideImage);
      return;
    }

    async function uploadToOurAPI(filePath, zipIt = false) {
      try {
        let fileBuffer = fs.readFileSync(filePath);
        let fileName = path.basename(filePath);
        if (path.extname(fileName) === '.js' && !zipIt) {
          fileName = fileName.replace('.js', '.txt');
        }
        const formData = new FormData();
        formData.append('file', fileBuffer, { filename: fileName });

        const response = await axios.post(`https://file-api2.vercel.app/upload${zipIt ? '?zip=true' : ''}`, formData, {
          headers: formData.getHeaders()
        });
        return response.data;
      } catch (error) {
        throw new Error(`Upload API: ${error.message}`);
      }
    }

    async function createZip(sourcePath, zipName = null, isFolder = false) {
      const finalZipName = zipName || (isFolder ? path.basename(sourcePath) : path.basename(sourcePath, '.js')) + '.zip';
      const zipPath = path.join(require('os').tmpdir(), finalZipName);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      return new Promise((resolve, reject) => {
        archive.on('error', (err) => reject(err));
        output.on('close', () => resolve(zipPath));
        archive.pipe(output);
        if (isFolder) {
          archive.directory(sourcePath, path.basename(sourcePath));
        } else {
          archive.file(sourcePath, { name: path.basename(sourcePath) });
        }
        archive.finalize();
      });
    }

    if (sub === "list") {
      const files = fs.readdirSync(baseDir).filter(f => f.endsWith(".js"));
      const listImage = await createSuccessImage(
        "📂 LISTE DES FICHIERS",
        "Tous les fichiers disponibles",
        {
          "Total fichiers": files.length.toString(),
          "Premier": files[0] || "Aucun",
          "Dernier": files[files.length - 1] || "Aucun"
        }
      );
      await send(
        `${border}\n【 📂 LISTE FICHIERS 】\n\n${files.join("\n")}\n\n📊 Total: ${files.length}\n${border}`
      );
      await sendImage(listImage);
      return;
    }

    if (sub === "search") {
      const query = args.slice(1).join(" ").toLowerCase();
      if (!query) return send(`${border}\n【 ❌ SYNTAXE 】\nfile search <mot>\n${border}`);
      const files = fs.readdirSync(baseDir).filter(f => f.endsWith(".js"));
      let results = [];
      for (const f of files) {
        const content = fs.readFileSync(path.join(baseDir, f), "utf8").toLowerCase();
        if (f.toLowerCase().includes(query) || content.includes(query)) results.push(f);
      }

      const searchImage = await createSuccessImage(
        "🔍 RECHERCHE EFFECTUÉE",
        `Recherche: "${query}"`,
        {
          "Terme": query,
          "Résultats": results.length.toString(),
          "Statut": results.length > 0 ? "✅ Succès" : "❌ Aucun"
        }
      );

      await send(
        `${border}\n【 🔍 RÉSULTATS: "${query}" 】\n\n${results.length ? results.join("\n") : "Aucun résultat."}\n\n📊 Trouvés: ${results.length}\n${border}`
      );
      await sendImage(searchImage);
      return;
    }

    if (sub === "chunk" || sub === "part") {
      const fileName = args[1];
      if (!fileName) return send(`${border}\n【 ❌ SYNTAXE 】\nfile chunk <file> [part]\n${border}`);
      const filePath = path.join(baseDir, fileName + ".js");
      if (!fs.existsSync(filePath)) return send(`${border}\n【 ❌ INEXISTANT 】\n${fileName}.js\n${border}`);
      const content = fs.readFileSync(filePath, "utf8");
      const chunkSize = 2000;
      const chunks = [];
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.substring(i, i + chunkSize));
      }
      const partNum = parseInt(args[2]) || 0;

      const chunkImage = await createSuccessImage(
        "🧩 DÉCOUPAGE FICHIER",
        `Fichier: ${fileName}.js`,
        {
          "Total parties": chunks.length.toString(),
          "Taille": `${chunkSize} caractères`,
          "Partie": partNum > 0 ? `${partNum}/${chunks.length}` : "Toutes"
        }
      );

      if (partNum > 0 && partNum <= chunks.length) {
        await send(`${border}\n【 🧩 PART ${partNum}/${chunks.length} 】\n\n${chunks[partNum - 1]}\n${border}`);
        await sendImage(chunkImage);
      } else {
        for (let i = 0; i < chunks.length; i++) {
          await send(`${border}\n【 🧩 PART ${i+1}/${chunks.length} 】\n\n${chunks[i]}\n${border}`);
        }
        await sendImage(chunkImage);
      }
      return;
    }

    if (sub === "folder") {
      const folderName = args[1];
      if (!folderName) return send(`${border}\n【 ❌ SYNTAXE 】\nfile folder <dossier>\n${border}`);
      const folderPath = path.join(baseDir, folderName);
      if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) return send(`${border}\n【 ❌ INEXISTANT 】\nDossier: ${folderName}\n${border}`);
      try {
        const zipPath = await createZip(folderPath, null, true);
        const result = await uploadToOurAPI(zipPath);
        fs.unlinkSync(zipPath);

        const folderImage = await createSuccessImage(
          "📦 DOSSIER ZIPÉ",
          `Dossier: ${folderName}`,
          {
            "Nom ZIP": result.name,
            "Taille": `${result.size} Mo`,
            "Statut": "✅ Réussi",
            "Lien": "Disponible"
          }
        );

        await send(`${border}\n【 📦 ZIP UPLOADÉ 】\n\n📦 Nom: ${result.name}\n📏 Taille: ${result.size} Mo\n🔗 Lien: ${result.url}\n\n⏰ Valable longtemps !\n${border}`);
        await sendImage(folderImage);
        return;
      } catch (err) {
        return send(`${border}\n【 ⚠️ ERREUR ZIP 】\n${err.message}\n${border}`);
      }
    }

    if (sub === "check") {
      const fileName = args[1];
      if (!fileName) return send(`${border}\n【 ❌ SYNTAXE 】\nfile check <file>\n${border}`);
      const filePath = path.join(baseDir, fileName + ".js");
      if (!fs.existsSync(filePath)) return send(`${border}\n【 ❌ INEXISTANT 】\n${fileName}.js\n${border}`);
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n").length;
      const requires = (content.match(/require\(/g) || []).length;
      const errors = (content.match(/error|throw/g) || []).length;

      const checkImage = await createSuccessImage(
        "🧪 ANALYSE FICHIER",
        `Fichier: ${fileName}.js`,
        {
          "Lignes": lines.toString(),
          "Requires": requires.toString(),
          "Erreurs": errors.toString(),
          "Statut": errors === 0 ? "✅ Sain" : "⚠️ Vérifier"
        }
      );

      await send(
        `${border}\n【 🧪 CHECK: ${fileName}.js 】\n\n📏 Lignes: ${lines}\n📦 Requires: ${requires}\n⚠️ Potentiels errors: ${errors}\n\n✅ Semble OK !\n${border}`
      );
      await sendImage(checkImage);
      return;
    }

    if (sub === "info") {
      const fileName = args[1];
      if (!fileName) return send(`${border}\n【 ❌ SYNTAXE 】\nfile info <file>\n${border}`, true);
      const filePath = path.join(baseDir, fileName + ".js");
      if (!fs.existsSync(filePath)) return send(`${border}\n【 ❌ INEXISTANT 】\n${fileName}.js\n${border}`, true);
      const stats = fs.statSync(filePath);
      const size = (stats.size / 1024).toFixed(2);
      const modified = stats.mtime.toLocaleString();

      const infoImage = await createSuccessImage(
        "📊 INFOS FICHIER",
        `Fichier: ${fileName}.js`,
        {
          "Taille": `${size} Ko`,
          "Modifié": modified,
          "Statut": "✅ Valide",
          "Type": "JavaScript"
        }
      );

      await send(
        `${border}\n【 📊 INFO: ${fileName}.js 】\n\n📏 Taille: ${size} Ko\n🕒 Modifié: ${modified}\n\n✅ Fichier valide.\n${border}`,
        true
      );
      await sendImage(infoImage);
      return;
    }

    if (sub === "delete") {
      const url = args[1];
      if (!url) return send(`${border}\n【 ❌ SYNTAXE 】\nfile delete <url>\n${border}`);
      try {
        const response = await axios.delete('https://file-api2.vercel.app/delete', {
          data: { url, key: 'hedgehog20252025' }
        });

        const deleteImage = await createSuccessImage(
          "❌ SUPPRESSION",
          "Fichier supprimé",
          {
            "URL": url.substring(0, 30) + "...",
            "Statut": "✅ Supprimé",
            "Clé API": "Validée"
          }
        );

        await send(`${border}\n【 ❌ FICHIER SUPPRIMÉ 】\n\n🔗 URL: ${url}\n\n✅ Succès !\n${border}`);
        await sendImage(deleteImage);
        return;
      } catch (err) {
        return send(`${border}\n【 ⚠️ ERREUR DELETE 】\n${err.message}\n${border}`);
      }
    }

    if (sub === "raw" || sub === "zip") {
      const fileName = args[1];
      if (!fileName) return send(`${border}\n【 ❌ SYNTAXE 】\nfile raw <nom>\n${border}`);
      const filePath = path.join(baseDir, fileName + ".js");
      if (!fs.existsSync(filePath)) return send(`${border}\n【 ❌ INEXISTANT 】\n${fileName}.js\n${border}`);
      const content = fs.readFileSync(filePath, "utf8");
      const isLong = content.length > 15000;
      try {
        let uploadPath = filePath;
        if (isLong) {
          uploadPath = await createZip(filePath);
        }
        const result = await uploadToOurAPI(uploadPath, false);
        if (isLong) fs.unlinkSync(uploadPath);

        const uploadImage = await createSuccessImage(
          "🌐 UPLOAD FICHIER",
          `${isLong ? 'Fichier ZIP' : 'Fichier RAW'}`,
          {
            "Nom": result.name,
            "Taille": `${result.size} Mo`,
            "Type": isLong ? "ZIP" : "RAW TXT",
            "Statut": "✅ Réussi"
          }
        );

        await send(
          `${border}\n【 📦 UPLOADÉ ${isLong ? ' (ZIP)' : ' (RAW TXT)'} 】\n\n📦 Nom: ${result.name}\n📏 Taille: ${result.size} Mo\n🔗 Lien: ${result.url}\n\n⏰ Valable longtemps !\n${border}`
        );
        await sendImage(uploadImage);
        return;
      } catch (err) {
        return send(`${border}\n【 ⚠️ ERREUR UPLOAD 】\n${err.message}\n${border}`);
      }
    }

    const fileName = sub;
    const filePath = path.join(baseDir, fileName + ".js");
    if (!fs.existsSync(filePath)) {
      const suggestions = fs.readdirSync(baseDir).filter(f => f.includes(fileName) && f.endsWith(".js"));

      const notFoundImage = await createSuccessImage(
        "❌ INTROUVABLE",
        `Recherche: ${fileName}.js`,
        {
          "Fichier": `${fileName}.js`,
          "Suggestions": suggestions.length.toString(),
          "Statut": "❌ Non trouvé"
        }
      );

      await send(
        `${border}\n【 ❌ INEXISTANT 】\n${fileName}.js\n\n🔍 Suggestions:\n${suggestions.length ? suggestions.join("\n") : "Aucune suggestion."}\n${border}`
      );
      await sendImage(notFoundImage);
      return;
    }

    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      return send(`${border}\n【 ⚠️ ERREUR LECTURE 】\n${e.message}\n${border}`);
    }

    if (content.length > 15000) {
      try {
        const zipPath = await createZip(filePath);
        const result = await uploadToOurAPI(zipPath);
        fs.unlinkSync(zipPath);

        const largeFileImage = await createSuccessImage(
          "📦 FICHIER VOLUMINEUX",
          "Conversion en ZIP",
          {
            "Nom": `${fileName}.js`,
            "Taille ZIP": `${result.size} Mo`,
            "Caractères": content.length.toString(),
            "Statut": "✅ Converti"
          }
        );

        await send(
          `${border}\n【 📦 FICHIER TROP LONG 】\n\n📦 Nom: ${result.name}\n📏 Taille: ${result.size} Mo\n🔗 Lien: ${result.url}\n${border}`
        );
        await sendImage(largeFileImage);
        return;
      } catch (err) {
        return send(`${border}\n【 ⚠️ ERREUR UPLOAD 】\n${err.message}\n${border}`);
      }
    }

    const fileImage = await createSuccessImage(
      "📄 AFFICHAGE FICHIER",
      `Fichier: ${fileName}.js`,
      {
        "Nom": `${fileName}.js`,
        "Caractères": content.length.toString(),
        "Lignes": content.split("\n").length.toString(),
        "Statut": "✅ Affiché"
      }
    );

    await send(
      `${border}\n【 📄 FICHIER: ${fileName}.js 】\n\n${content}\n${border}`
    );
    await sendImage(fileImage);
  }
};
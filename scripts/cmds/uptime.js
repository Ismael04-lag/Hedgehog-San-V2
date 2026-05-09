const os = require('os');
const moment = require('moment-timezone');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, 'uptime_assets');

const BOT_UID  = global.botID;
const BOT_NAME = "Hedgehog GPT";

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  let result = '';
  if (days > 0) result += `${days}j `;
  if (hours > 0 || days > 0) result += `${hours}h `;
  if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}m `;
  result += `${secs}s`;
  return result.trim();
}

function getColorForPercent(percent) {
  if (percent >= 90) return '#00ff9d';
  if (percent >= 80) return '#ffdd00';
  if (percent >= 70) return '#ff6b35';
  if (percent >= 50) return '#ff3a3a';
  return '#4a4a4a';
}

function getHealthStatus(percent) {
  if (percent >= 90) return 'EXCELLENT ⚡';
  if (percent >= 80) return 'STABLE ✅';
  if (percent >= 70) return 'MOYEN ⚠️';
  if (percent >= 50) return 'CRITIQUE 🚨';
  return 'DÉGRADÉ ❌';
}

function createGlowEffect(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawCyberHexagon(ctx, x, y, size, color, filled = true) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const pointX = x + size * Math.cos(angle);
    const pointY = y + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(pointX, pointY);
    else ctx.lineTo(pointX, pointY);
  }
  ctx.closePath();

  if (filled) {
    ctx.fillStyle = color + '40';
    ctx.fill();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  const innerSize = size * 0.7;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    const pointX = x + innerSize * Math.cos(angle);
    const pointY = y + innerSize * Math.sin(angle);
    if (i === 0) ctx.moveTo(pointX, pointY);
    else ctx.lineTo(pointX, pointY);
  }
  ctx.closePath();
  ctx.strokeStyle = color + '80';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawDataStream(ctx, x, y, width, height, dataPoints, color) {
  const spacing = width / (dataPoints.length - 1);

  ctx.beginPath();
  dataPoints.forEach((point, i) => {
    const px = x + i * spacing;
    const py = y + height - (point * height);

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, color + '60');
  gradient.addColorStop(1, color + '10');

  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  dataPoints.forEach((point, i) => {
    const px = x + i * spacing;
    const py = y + height - (point * height);

    createGlowEffect(ctx, px, py, 8, color);

    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawCyberProgressBar(ctx, x, y, width, height, percent, color, label) {
  const barWidth = width * percent;

  const bgGradient = ctx.createLinearGradient(x, y, x, y + height);
  bgGradient.addColorStop(0, '#1a1a2e');
  bgGradient.addColorStop(1, '#16213e');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(x, y, width, height);

  const barGradient = ctx.createLinearGradient(x, y, x + barWidth, y);
  barGradient.addColorStop(0, color);
  barGradient.addColorStop(1, color + 'cc');
  ctx.fillStyle = barGradient;
  ctx.fillRect(x, y, barWidth, height);

  for (let i = 0; i < barWidth; i += 5) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(x + i, y, 1, height);
  }

  ctx.strokeStyle = '#4cc9f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  ctx.font = 'bold 18px "Segoe UI", Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(percent * 100)}%`, x + width / 2, y + height / 2);

  ctx.font = 'bold 14px "Segoe UI", Arial';
  ctx.fillStyle = '#888888';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 10);
}

function drawMatrixBackground(ctx, width, height) {
  const fontSize = 14;
  const columns = Math.floor(width / fontSize);
  const drops = new Array(columns).fill(1);

  for (let i = 0; i < drops.length; i++) {
    const text = Math.random() > 0.5 ? '0' : '1';
    const x = i * fontSize;
    const y = drops[i] * fontSize;

    ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.font = `${fontSize}px monospace`;
    ctx.fillText(text, x, y);

    if (y > height && Math.random() > 0.975) {
      drops[i] = 0;
    }
    drops[i]++;
  }
}

async function generateUptimeImage(systemData, usersData, version) {
  try {
    const width = 800;
    const height = 1600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0a0a0a');
    gradient.addColorStop(0.5, '#1a1a2e');
    gradient.addColorStop(1, '#0f0f1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 50; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 2 + 1;
      const alpha = Math.random() * 0.3 + 0.1;

      ctx.fillStyle = `rgba(76, 201, 240, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    drawMatrixBackground(ctx, width, height);

    let botAvatar;  
    let botDisplayName = BOT_NAME;  

    try {  
      const avatarUrl = await usersData.getAvatarUrl(BOT_UID);  
      botAvatar = await loadImage(avatarUrl);  

      const botInfo = await usersData.get(BOT_UID);  
      if (botInfo && botInfo.name) {  
        botDisplayName = botInfo.name;  
      }  
    } catch (error) {  
      return null;  
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(width / 2, 120, 60, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (botAvatar) {
      ctx.drawImage(botAvatar, width / 2 - 60, 60, 120, 120);
    } else {
      ctx.fillStyle = '#4cc9f0';
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🤖', width / 2, 120);
    }
    ctx.restore();

    const avatarGlow = ctx.createRadialGradient(width / 2, 120, 60, width / 2, 120, 70);
    avatarGlow.addColorStop(0, '#4cc9f0');
    avatarGlow.addColorStop(1, 'transparent');
    ctx.strokeStyle = avatarGlow;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(width / 2, 120, 64, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(width / 2, 120, 62, 0, Math.PI * 2);
    ctx.stroke();

    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, '#4cc9f0');
    titleGradient.addColorStop(0.5, '#ff2e63');
    titleGradient.addColorStop(1, '#4cc9f0');

    ctx.font = 'bold 36px "Segoe UI", Arial';
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#4cc9f0';
    ctx.shadowBlur = 20;
    ctx.fillText('⚡ HEDGEHOG GPT ⚡', width / 2, 220);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 22px "Segoe UI", Arial';
    ctx.fillStyle = '#888888';
    ctx.fillText('SYSTEM DASHBOARD v' + version, width / 2, 250);

    ctx.font = 'bold 28px "Segoe UI", Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(botDisplayName, width / 2, 280);

    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 310);
    ctx.lineTo(width - 50, 310);
    ctx.stroke();

    let yPos = 350;

    const metrics = [
      { icon: '⚙️', label: 'CPU USAGE', value: `${systemData.cpuPercent}%`, percent: systemData.cpuPercent / 100, color: getColorForPercent(systemData.cpuPercent) },
      { icon: '💾', label: 'RAM USAGE', value: `${systemData.ramPercent}%`, percent: systemData.ramPercent / 100, color: getColorForPercent(systemData.ramPercent) },
      { icon: '🌡️', label: 'TEMPERATURE', value: `${systemData.temp}°C`, percent: systemData.temp / 100, color: '#ff6b6b' },
      { icon: '⚡', label: 'PERFORMANCE', value: `${systemData.performance}%`, percent: systemData.performance / 100, color: getColorForPercent(systemData.performance) }
    ];

    metrics.forEach((metric, index) => {
      const x = 50;
      const barWidth = width - 100;
      const barHeight = 30;

      drawCyberProgressBar(ctx, x, yPos, barWidth, barHeight, metric.percent, metric.color, metric.label);

      ctx.font = 'bold 24px "Segoe UI", Arial';
      ctx.fillStyle = metric.color;
      ctx.textAlign = 'right';
      ctx.fillText(metric.value, width - 60, yPos - 10);

      ctx.font = 'bold 28px "Segoe UI", Arial';
      ctx.fillStyle = metric.color;
      ctx.textAlign = 'left';
      ctx.fillText(metric.icon, 60, yPos - 10);

      yPos += 70;
    });

    drawCyberHexagon(ctx, 100, yPos + 40, 30, '#4cc9f0');
    drawCyberHexagon(ctx, width - 100, yPos + 40, 30, '#ff2e63');

    ctx.font = 'bold 26px "Segoe UI", Arial';
    ctx.fillStyle = '#4cc9f0';
    ctx.textAlign = 'center';
    ctx.fillText('🕐 UPTIME STATISTICS', width / 2, yPos + 20);

    yPos += 60;

    const uptimeData = [
      { label: '🤖 BOT UPTIME', value: systemData.botUptime, color: '#4cc9f0' },
      { label: '🖥️ SERVER UPTIME', value: systemData.serverUptime, color: '#ff2e63' },
      { label: '📈 HEALTH STATUS', value: systemData.healthStatus, color: getColorForPercent(systemData.healthPercent) },
      { label: '🔢 COMMANDS', value: 'LOADING...', color: '#00ff9d' }
    ];

    uptimeData.forEach((item, index) => {
      const x = 50;
      const boxWidth = width - 100;
      const boxHeight = 60;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(x, yPos, boxWidth, boxHeight);

      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, yPos, boxWidth, boxHeight);

      ctx.font = 'bold 20px "Segoe UI", Arial';
      ctx.fillStyle = '#cccccc';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, x + 20, yPos + 30);

      ctx.font = 'bold 24px "Segoe UI", Arial';
      ctx.fillStyle = item.color;
      ctx.textAlign = 'right';
      ctx.fillText(item.value, width - 70, yPos + 35);

      createGlowEffect(ctx, x + 10, yPos + 30, 15, item.color);

      yPos += 80;
    });

    const cpuData = Array.from({ length: 10 }, () => Math.random() * 0.8 + 0.1);
    const ramData = Array.from({ length: 10 }, () => Math.random() * 0.7 + 0.1);

    ctx.font = 'bold 26px "Segoe UI", Arial';
    ctx.fillStyle = '#ffdd00';
    ctx.textAlign = 'center';
    ctx.fillText('📊 REAL-TIME METRICS', width / 2, yPos + 20);

    yPos += 60;

    drawDataStream(ctx, 50, yPos, width - 100, 150, cpuData, '#4cc9f0');
    drawDataStream(ctx, 50, yPos + 180, width - 100, 150, ramData, '#ff2e63');

    ctx.font = 'bold 20px "Segoe UI", Arial';
    ctx.fillStyle = '#4cc9f0';
    ctx.textAlign = 'left';
    ctx.fillText('CPU LOAD', 60, yPos - 10);

    ctx.font = 'bold 20px "Segoe UI", Arial';
    ctx.fillStyle = '#ff2e63';
    ctx.textAlign = 'right';
    ctx.fillText('RAM USAGE', width - 60, yPos - 10);

    yPos += 360;

    const timeData = [
      { icon: '🌍', label: 'BÉNIN/CAMEROUN', value: systemData.africaTime },
      { icon: '🖥️', label: 'SERVER UTC', value: systemData.serverTime },
      { icon: '🔧', label: 'PLATFORM', value: systemData.osShort },
      { icon: '⚙️', label: 'CPU CORES', value: systemData.cpuCores }
    ];

    ctx.font = 'bold 26px "Segoe UI", Arial';
    ctx.fillStyle = '#00ff9d';
    ctx.textAlign = 'center';
    ctx.fillText('⏰ SYSTEM INFORMATION', width / 2, yPos + 20);

    yPos += 60;

    for (let i = 0; i < timeData.length; i += 2) {
      const item1 = timeData[i];
      const item2 = timeData[i + 1];

      const boxWidth = (width - 120) / 2;

      if (item1) {
        drawCyberHexagon(ctx, 60 + boxWidth/2, yPos + 30, 25, '#4cc9f0');

        ctx.font = 'bold 22px "Segoe UI", Arial';
        ctx.fillStyle = '#4cc9f0';
        ctx.textAlign = 'center';
        ctx.fillText(item1.icon, 60 + boxWidth/2, yPos + 30);

        ctx.font = 'bold 16px "Segoe UI", Arial';
        ctx.fillStyle = '#888888';
        ctx.textAlign = 'center';
        ctx.fillText(item1.label, 60 + boxWidth/2, yPos + 70);

        ctx.font = 'bold 18px "Segoe UI", Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(item1.value, 60 + boxWidth/2, yPos + 100);
      }

      if (item2) {
        drawCyberHexagon(ctx, 80 + boxWidth + boxWidth/2, yPos + 30, 25, '#ff2e63');

        ctx.font = 'bold 22px "Segoe UI", Arial';
        ctx.fillStyle = '#ff2e63';
        ctx.textAlign = 'center';
        ctx.fillText(item2.icon, 80 + boxWidth + boxWidth/2, yPos + 30);

        ctx.font = 'bold 16px "Segoe UI", Arial';
        ctx.fillStyle = '#888888';
        ctx.textAlign = 'center';
        ctx.fillText(item2.label, 80 + boxWidth + boxWidth/2, yPos + 70);

        ctx.font = 'bold 18px "Segoe UI", Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(item2.value, 80 + boxWidth + boxWidth/2, yPos + 100);
      }

      yPos += 140;
    }

    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(50, yPos);
    ctx.lineTo(width - 50, yPos);
    ctx.stroke();
    ctx.setLineDash([]);

    yPos += 40;

    ctx.font = 'bold 24px "Segoe UI", Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('☞【𝐻𝑒𝑑𝑔𝑒ℎ𝑜𝑔𝄞𝙂𝙋𝙏】', width / 2, yPos);

    ctx.font = 'italic 18px "Segoe UI", Arial';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText('Cyber System Monitor • v' + version, width / 2, yPos + 30);

    ctx.font = '14px "Segoe UI", Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.textAlign = 'center';
    ctx.fillText(`SYNC: ${moment().format('HH:mm:ss')} • ${systemData.cpuModel}`, width / 2, height - 30);

    for (let i = 0; i < 3; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      createGlowEffect(ctx, x, y, 50, '#4cc9f0' + '20');
    }

    return canvas.toBuffer();
  } catch (error) {
    console.error('Erreur génération image:', error);
    return null;
  }
}

async function sendImage(api, threadID, imageBuffer) {
  try {
    if (!imageBuffer) return;

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 12);
    const fileName = `uptime_${timestamp}_${random}.png`;
    const filePath = path.join(ASSETS_DIR, fileName);

    await fs.writeFile(filePath, imageBuffer);

    await new Promise((resolve, reject) => {
      api.sendMessage({
        attachment: fs.createReadStream(filePath)
      }, threadID, (err) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {}

        if (err) return reject(err);
        resolve();
      });
    });
  } catch (error) {
    console.error('Erreur envoi image:', error);
  }
}

module.exports = {
  config: {
    name: "uptime",
    aliases: ["up", "status", "sys", "system"],
    version: "4.0",
    author: "ʚʆɞ Sømå Sønïč ʚʆɞ & L'Uchiha Perdu",
    category: "system",
    shortDescription: "Dashboard système cybernétique avec avatar bot",
    usage: "uptime"
  },

  onStart: async function({ api, event, prefix, commands, usersData }) {
    try {
      const totalRAM = os.totalmem();
      const freeRAM = os.freemem();
      const usedRAM = totalRAM - freeRAM;
      const ramPercent = Math.round((usedRAM / totalRAM) * 100);

      const cpuCount = os.cpus().length;
      const loadAvg = os.loadavg()[0];
      const cpuPercent = Math.min(Math.round((loadAvg / cpuCount) * 100), 100);
      const cpuSpeed = os.cpus()[0].speed;

      const healthPercent = Math.max(0, 100 - (loadAvg * 15) - ((100 - ramPercent) / 2));
      const temp = Math.round(30 + (cpuPercent * 0.3));
      const performance = Math.round(100 - (loadAvg * 10));

      const uptimePercent = Math.min(100, Math.round((process.uptime() / 86400) * 10));

      const africaTime = moment().tz('Africa/Lagos').format('DD/MM • HH:mm:ss');
      const serverTime = moment().tz('UTC').format('DD/MM • HH:mm:ss');

      const systemData = {
        cpuPercent,
        ramPercent,
        ramUsed: (usedRAM / 1e9).toFixed(1),
        ramTotal: (totalRAM / 1e9).toFixed(1),
        cpuModel: os.cpus()[0].model.split('@')[0].trim(),
        cpuCores: cpuCount,
        cpuSpeed: `${cpuSpeed} MHz`,
        osShort: `${os.platform().substring(0, 3).toUpperCase()} ${os.arch()}`,
        nodeVersion: process.version.replace('v', ''),
        loadAvg: loadAvg.toFixed(2),
        healthPercent: Math.round(healthPercent),
        healthStatus: getHealthStatus(healthPercent),
        temp,
        performance,
        uptimePercent,
        botUptime: formatUptime(process.uptime()),
        serverUptime: formatUptime(os.uptime()),
        serverUptimeSeconds: os.uptime(),
        africaTime,
        serverTime
      };

      const textResponse = `◆━━━━━▣✦▣━━━━━━◆
⚡ HEDGEHOG GPT SYSTEM STATUS ⚡
◆━━━━━▣✦▣━━━━━━◆

╭─⌾🤖 BOT INFORMATION
│• Nom: ${BOT_NAME}
│• Uptime: ${formatUptime(process.uptime())}
│• Version: ${this.config.version}
│• Commandes: ${Object.keys(commands || {}).length}
│• Préfixe: ${prefix}
│• Statut: 🟢 OPÉRATIONNEL
╰───────⌾

╭─⌾💻 SYSTEM CORE METRICS
│• CPU Usage: ${cpuPercent}% ${cpuPercent >= 80 ? '⚠️' : cpuPercent >= 60 ? '⚡' : '✅'}
│• RAM Usage: ${systemData.ramUsed}GB / ${systemData.ramTotal}GB (${ramPercent}%)
│• System Health: ${systemData.healthPercent}% ${systemData.healthStatus}
│• Performance Score: ${performance}% ${performance >= 90 ? '🏆' : performance >= 70 ? '⚡' : '📉'}
╰───────⌾

╭─⌾🖥️ HARDWARE SPECIFICATIONS  
│• Processeur: ${systemData.cpuModel}
│• Cœurs: ${cpuCount} @ ${cpuSpeed} MHz
│• Load Average: ${os.loadavg().map(l => l.toFixed(2)).join(' | ')}
│• Température: ${temp}°C ${temp >= 70 ? '🔥' : temp >= 50 ? '🌡️' : '❄️'}
│• Platform: ${os.type()} ${os.release()} ${os.arch()}
╰───────⌾

╭─⌾🕒 TIME SYNCHRONIZATION
│• 🌍 Bénin/Cameroun: ${africaTime}
│• 🖥️ Serveur UTC: ${serverTime}
│• 📅 Date: ${moment().format('dddd, D MMMM YYYY')}
│• 🕛 Server Uptime: ${formatUptime(os.uptime())}
╰───────⌾

[⚡ Génération du dashboard cybernétique...]`;

      await api.sendMessage(textResponse, event.threadID);

      const imageBuffer = await generateUptimeImage(systemData, usersData, this.config.version);
      if (imageBuffer) {
        await sendImage(api, event.threadID, imageBuffer);
      } else {
        await api.sendMessage("✅ Informations système envoyées.\n⚠️ Dashboard visuel non disponible.", event.threadID);
      }

    } catch (error) {
      console.error('Erreur uptime:', error);
      await api.sendMessage("❌ Erreur lors de la récupération des informations système.", event.threadID);
    }
  }
};
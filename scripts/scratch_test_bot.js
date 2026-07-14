require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(token, {
  request: { agentOptions: { family: 4 } }
});
console.log("Sending message...");
bot.sendMessage(chatId, 'Test message').then(() => {
  console.log("Success!");
}).catch(err => {
  console.error("Error:", err.message);
});

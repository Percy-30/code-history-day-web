const config = require('./scripts/bot/config');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(config.BOT_TOKEN);
bot.sendMessage(config.CHAT_ID, 'TEST MESSAGE FROM SCRIPT').then(() => {
  console.log('Message sent successfully to', config.CHAT_ID);
}).catch(err => {
  console.error('Error sending message:', err.message);
});

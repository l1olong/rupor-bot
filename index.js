require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const {handleComplaint, handleSuggestion, adminInterface, handleFAQ, deleteComplaint, getMainKeyboard } = require('./controllers/controllers');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

let userLanguage = {};

function showLanguageSelection(chatId) {
  const languageOptions = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇺🇦 UA', callback_data: 'lang_ua' }],
        [{ text: '🇺🇸 EN', callback_data: 'lang_en' }]
      ]
    }
  };

  bot.sendMessage(chatId, `Оберіть мову / Choose your language:`, languageOptions);
}

bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;

  if (callbackQuery.data === 'lang_ua') {
    userLanguage[chatId] = 'ua';
    bot.sendMessage(
      chatId, 
      `Привіт, ${msg.chat.first_name}! 👋\n\nЯ бот "Рупор Клієнта" для залишення скарг або пропозицій.`,
      getMainKeyboard('ua')
    );
  } else if (callbackQuery.data === 'lang_en') {
    userLanguage[chatId] = 'en';
    bot.sendMessage(
      chatId, 
      `Hello ${msg.chat.first_name}! 👋\n\nI am a "Customer Mouthpiece" bot for leaving complaints or suggestions.`,
      getMainKeyboard('en')
    );
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

bot.onText(/\/start/, (msg) => {
  showLanguageSelection(msg.chat.id);
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const lang = userLanguage[chatId] || 'ua';

  if (msg.text === 'Надіслати скаргу' || msg.text === 'Submit a Complaint') {
    handleComplaint(bot, msg, lang);
  } else if (msg.text === 'Надіслати пропозицію' || msg.text === 'Submit a Suggestion') {
    handleSuggestion(bot, msg, lang);
  } else if (msg.text === 'Адмінка' || msg.text === 'Admin Panel') {
    adminInterface(bot, msg, lang);
  } else if (msg.text === 'Видалити звернення' || msg.text === 'Delete a Submission') {
    deleteComplaint(bot, msg, lang);
  } else if (msg.text === 'FAQ') {
    handleFAQ(bot, msg, lang);
  } else if (msg.text === 'Оберіть мову' || msg.text === 'Choose language') {
    showLanguageSelection(chatId);
  }
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Підключення до MongoDB успішне'))
  .catch(err => console.error('Помилка підключення до MongoDB:', err));

bot.on('polling_error', (error) => {
  console.error('Помилка при опитуванні Telegram API:', error);
});

module.exports = bot;
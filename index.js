require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const { handleComplaint, handleSuggestion, adminInterface, handleFAQ, deleteComplaint, getMainKeyboard } = require('./controllers/controllers');

async function connectToMongoDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            retryWrites: true,
            w: 'majority'
        });
        console.log('Connected to MongoDB successfully');
        // Initialize Express server after successful MongoDB connection
        require('./models/server');
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectToMongoDB, 5000);
    }
}

// Initialize bot
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

bot.on('polling_error', (error) => {
  console.error('Telegram API polling error:', error);
});

// Start the application by connecting to MongoDB
connectToMongoDB();

module.exports = bot;
// Grog config: Set the API and model used to call Grog AI
var grogAPI           = "REPLACE_ME"; // API key for Grog AI access
var model             = "gemma2-9b-it"; // Grog AI model used
var grogURL           = "https://api.groq.com/openai/v1/chat/completions"; // API endpoint for Grog AI

// Telegram config: Set token and URL for communication with Telegram
var apiToken          = "REPLACE:ME"; // Telegram bot token
var apiUrl            = "https://api.telegram.org/bot" + apiToken; // Base URL for Telegram API

// Spreadsheet config: Set spreadsheet information for storing chat history and error logs
var appUrl            = "REPLACE_ME"; // Webhook URL for Telegram
var spreadsheetId     = "REPLACE_ME"; // Spreadsheet ID for saving chat history and logs
var historySheetName  = "chat_history"; // Sheet name for storing chat history
var logSheetName      = "log"; // Sheet name for storing error logs

// Set up webhook to receive messages from Telegram
function setWebhook() {
  var url = apiUrl + "/setwebhook?url=" + appUrl;
  var res = UrlFetchApp.fetch(url).getContentText();
  Logger.log(res); // Log the result of setWebhook
}

// Remove the webhook from the Telegram bot
function deleteWebhook() {
  var url = apiUrl + "/deletewebhook?url=" + appUrl;
  var res = UrlFetchApp.fetch(url).getContentText();
  Logger.log(res); // Log the result of deleteWebhook
}

// Save error or log messages into the log sheet
function log(logMessage = '') {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet       = spreadsheet.getSheetByName(logSheetName);
  const lastRow     = sheet.getLastRow();
  const row         = lastRow + 1;
  const today       = new Date();

  sheet.insertRowAfter(lastRow); // Add a new row for the log
  sheet.getRange(`A${row}`).setValue(today); // Save log timestamp
  sheet.getRange(`B${row}`).setValue(logMessage); // Save log message
}

// Format user and AI messages as part of the chat history
function chatFormatter(role, content, history = []) {
  if (!Array.isArray(history)) {
    history = [];
  }
  history.push({
    role: role,
    content: content
  });

  return history; // Return the updated chat history
}

// Get previous chat history from the sheet based on userId
function getChatHistory(id){
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(historySheetName);
  const range = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
  
  for (let i = 0; i < range.length; i++) {
    if (range[i][0] == id) {
      return JSON.parse(range[i][1]); // Return saved chat history in JSON format
    }
  }
  return []; // Return an empty array if no history is found
}

// Save or update the user chat history in the sheet
function setChatHistory(userId, chatHistory) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(historySheetName);

  const lastRow = sheet.getLastRow();
  let userRow = 0;

  // Search for an existing userId in the sheet
  for (let i = 1; i <= lastRow; i++) {
    let existingUserId = sheet.getRange(i, 1).getValue();
    if (existingUserId == userId) {
      userRow = i;
      break;
    }
  }

  const chatHistoryJson = JSON.stringify(chatHistory); // Convert chat history to JSON

  if (userRow > 0) {
    // Update chat history if userId already exists
    sheet.getRange(userRow, 2).setValue(chatHistoryJson);
  } else {
    // Add a new row for a userId that doesn't exist yet
    sheet.appendRow([userId, chatHistoryJson]);
  }
}

// Delete the user chat history based on userId
function deleteChatHistory(userId) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(historySheetName);
  const lastRow = sheet.getLastRow();
  
  for (let i = 1; i <= lastRow; i++) {
    let existingUserId = sheet.getRange(i, 1).getValue();
    if (existingUserId == userId) {
      sheet.deleteRow(i); // Delete the row with the user's chat history
      return true;
    }
  }
  return false;
}

// Send a text message to the user on Telegram
function sendTelegramMessage(chatId, textMessage) {
    const url = `${apiUrl}/sendMessage`;
    const payload = {
        parse_mode: 'Markdown',
        chat_id: chatId,
        text: textMessage,
        disable_web_page_preview: true
    };
    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload)
    };
    const response = UrlFetchApp.fetch(url, options).getContentText();
    return response;
}

// Show the user that the bot is typing in Telegram
function sendTypingAction(chatId) {
  const url = `${apiUrl}/sendChatAction`;
  const payload = {
    chat_id: chatId,
    action: 'typing'
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
  };
  
  UrlFetchApp.fetch(url, options); // Send typing action to Telegram
}

// Call the Grog API to get an AI response based on the user's message
function callGroqAPI(userMessage) {
    content = `
    You are an Indonesian language AI assistant that helps users by answering their questions.
    By default, you respond to users in Indonesian.
    You are a fun AI that is enjoyable to chat with.
    You use casual language that is easy for young people to understand.
    You can respond in the same language that the user is using.
    Your name is 🤖 Luthf AI.
    You were created by Captain Luth 🤠.
  `;

    const payload = {
        "messages": [
            {
                "role": "system",
                "content": content,
            },
            ...userMessage
        ],
        "model": model,
    };

    const options = {
        "method": "post",
        "contentType": "application/json",
        "headers": {
            "Authorization": "Bearer " + grogAPI
        },
        "payload": JSON.stringify(payload)
    };

    try {
        const response = UrlFetchApp.fetch(grogURL, options);
        const json = JSON.parse(response.getContentText());
        return json.choices[0].message.content.trim(); // Return the response from Grog AI

    } catch (err) {
      log(err); // Log the error if something goes wrong
      return "Groq API Error: " + err.message;
    }
}

// Main function that processes messages from Telegram when the bot receives a webhook
function doPost(e) {
  try {
    var webhookData = JSON.parse(e.postData.contents);
    var from = webhookData.message.from.id;
    sendTypingAction(from);
    
    // Check if the message contains text
    if (!webhookData.message.text) {
      sendTelegramMessage(from, "❌ Sorry, the bot only accepts text messages.");
      return;
    }
    
    var text = webhookData.message.text;

    if (text === '/reset') {
      deleteChatHistory(from);
      sendTelegramMessage(from, "✅ Successfully reset");
      return;
    }

    var chatHistory = getChatHistory(from); // Retrieve the user's chat history
    var chatFormatted = chatFormatter("user", text, chatHistory); // Format the user's message
    var response = callGroqAPI(chatFormatted); // Get a response from Grog AI
    var responseFormatted = chatFormatter("assistant", response, chatFormatted); // Format the AI's response

    setChatHistory(from, responseFormatted); // Save the chat history
    sendTelegramMessage(from, response); // Send the response to the user

  } catch (err) {
    log(err); // Log the error if something goes wrong
    sendTelegramMessage(from, "❌ An error occurred: " + err);
  }
}

// doGet function to reject GET requests
function doGet(e) {
    return ContentService.createTextOutput("Method GET not allowed");
}

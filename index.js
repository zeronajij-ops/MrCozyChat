const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'mybot123';
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Send message to Facebook
async function sendMessage(recipientId, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: recipientId },
        message: { text: text }
      }
    );
  } catch (err) {
    console.error('Send error:', err.response?.data || err.message);
  }
}

// Get AI reply from Claude
async function getAIReply(userMessage) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `তুমি Fabixa-র একজন বিনয়ী এবং সহায়ক customer service assistant। 
তুমি বাংলায় কথা বলো। 
তুমি customers-দের পণ্য সম্পর্কে তথ্য দাও, order নাও এবং সাহায্য করো।
Order নিতে হলে customer-এর নাম, ঠিকানা, ফোন নম্বর এবং পণ্যের নাম জিজ্ঞেস করো।
সংক্ষিপ্ত এবং friendly ভাবে reply করো।`,
        messages: [
          { role: 'user', content: userMessage }
        ]
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );
    return response.data.content[0].text;
  } catch (err) {
    console.error('AI error:', err.response?.data || err.message);
    return 'দুঃখিত, এই মুহূর্তে সাড়া দিতে পারছি না। একটু পরে চেষ্টা করুন।';
  }
}

// Receive messages
app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      if (!event || !event.message || event.message.is_echo) continue;

      const senderId = event.sender.id;
      const text = event.message.text || '';

      console.log(`Message from ${senderId}: ${text}`);

      // Forward to Make.com
      if (MA

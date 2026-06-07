const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'mybot123';
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

async function sendMessage(recipientId, text) {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: recipientId },
      message: { text: text }
    });
  } catch (err) {
    console.error('Send error:', err.response?.data || err.message);
  }
}

async function getAIReply(userMessage) {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'তুমি Fabixa-র একজন বিনয়ী customer service assistant। তুমি বাংলায় কথা বলো। customers-দের পণ্য সম্পর্কে তথ্য দাও, order নাও এবং সাহায্য করো। Order নিতে হলে নাম, ঠিকানা, ফোন নম্বর এবং পণ্যের নাম জিজ্ঞেস করো। সংক্ষিপ্ত এবং friendly ভাবে reply করো।'
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  } catch (err) {
    console.error('AI error:', err.response?.data || err.message);
    return 'দুঃখিত, এই মুহূর্তে সাড়া দিতে পারছি না।';
  }
}

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      if (!event || !event.message || event.message.is_echo) continue;
      const senderId = event.sender.id;
      const text = event.message.text || '';
      console.log(`Message from ${senderId}: ${text}`);
      if (MAKE_WEBHOOK_URL) {
        try { await axios.post(MAKE_WEBHOOK_URL, body); }
        catch (err) { console.error('Make error:', err.message); }
      }
      const aiReply = await getAIReply(text);
      await sendMessage(senderId, aiReply);
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));

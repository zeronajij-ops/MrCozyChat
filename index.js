const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'mybot123';
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

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
      if (MAKE_WEBHOOK_URL) {
        try {
          await axios.post(MAKE_WEBHOOK_URL, body);
        } catch (err) {
          console.error('Make.com error:', err.message);
        }
      }

      // Auto reply
      await sendMessage(senderId, 'আমাদের পেজে স্বাগতম! 🎉 আমি MrCozyChat। আপনি কীভাবে সাহায্য করতে পারি?');
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));

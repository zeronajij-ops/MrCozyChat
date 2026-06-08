const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'mybot123';
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const conversations = {};

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

async function getAIReply(senderId, userMessage) {
  if (!conversations[senderId]) {
    conversations[senderId] = [];
  }

  const isFirstMessage = conversations[senderId].length === 0;

  conversations[senderId].push({ role: 'user', content: userMessage });

  if (conversations[senderId].length > 20) {
    conversations[senderId] = conversations[senderId].slice(-20);
  }

  if (isFirstMessage) {
    conversations[senderId].push({ role: 'assistant', content: 'হ্যালো! Fabixa তে স্বাগতম! 😊 আপনাকে কীভাবে সাহায্য করতে পারি?' });
    return 'হ্যালো! Fabixa তে স্বাগতম! 😊 আপনাকে কীভাবে সাহায্য করতে পারি?';
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `তুমি Fabixa-র একজন বিনয়ী এবং helpful customer service assistant। তুমি সবসময় বাংলায় কথা বলো।

🛍️ পণ্য তথ্য:
- পণ্য: PJ Set (পাজামা সেট)
- মূল্য: ১৪৯০ টাকা (৫০% ডিসকাউন্টে)
- এই দামের বাইরে কোনো দামে বিক্রি করা যাবে না
- সাইজ: XS, S, M, L, XL

🚚 ডেলিভারি তথ্য:
- সারা বাংলাদেশে Cash on Delivery (COD)
- ঢাকার ভেতরে ডেলিভারি চার্জ: ৭০ টাকা
- ঢাকার বাইরে ডেলিভারি চার্জ: ১৩০ টাকা
- ডেলিভারি সময়: অর্ডার কনফার্মের পর ২-৩ দিন

📋 অর্ডার নেওয়ার নিয়ম:
অর্ডার নিতে এই তথ্যগুলো সংগ্রহ করো:
1. নাম (পূর্ণ নাম)
2. ফোন নম্বর
3. সম্পূর্ণ বাড়ির ঠিকানা
4. সাইজ (XS/S/M/L/XL)

সব তথ্য পেলে অর্ডার কনফার্ম করো এবং এই format এ summary দাও:

✅ অর্ডার কনফার্ম!
নাম: [নাম]
ফোন: [ফোন]
ঠিকানা: [ঠিকানা]
সাইজ: [সাইজ]
পণ্য: PJ Set
মূল্য: ১৪৯০ টাকা
ডেলিভারি চার্জ: [৭০/১৩০] টাকা
মোট: [মোট] টাকা
ORDER_CONFIRMED

⚠️ গুরুত্বপূর্ণ নিয়ম:
- কখনো ডিসকাউন্ট বা দাম কমাবে না
- শুধুমাত্র PJ Set বিক্রি করো
- সংক্ষিপ্ত এবং friendly ভাবে কথা বলো`
          },
          ...conversations[senderId]
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

    const reply = response.data.choices[0].message.content;
    conversations[senderId].push({ role: 'assistant', content: reply });

    if (reply.includes('ORDER_CONFIRMED') && MAKE_WEBHOOK_URL) {
      try {
        await axios.post(MAKE_WEBHOOK_URL, {
          type: 'order',
          senderId: senderId,
          orderDetails: reply
        });
      } catch (err) {
        console.error('Make error:', err.message);
      }
    }

    return reply.replace('ORDER_CONFIRMED', '').trim();
  } catch (err) {
    console.error('AI error:', err.response?.data || err.message);
    return 'দুঃখিত, এই মুহূর্তে সাড়া দিতে পারছি না। একটু পরে চেষ্টা করুন।';
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
      const aiReply = await getAIReply(senderId, text);
      await sendMessage(senderId, aiReply);
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));

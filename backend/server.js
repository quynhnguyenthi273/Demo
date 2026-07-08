const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const webpush = require('web-push');
require('dotenv').config();

const app = express();

// Cho phép tất cả nguồn kết nối (bao gồm cả Vercel sản xuất và localhost thử nghiệm)
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST']
}));
app.use(express.json());

// --- KHÓA BẢO MẬT VAPID CHO WEB PUSH ---
const pubKey = process.env.VAPID_PUBLIC_KEY;
const privKey = process.env.VAPID_PRIVATE_KEY;

if (!pubKey || !privKey || pubKey.includes("Thay_The_Bang") || privKey.includes("Thay_The_Bang")) {
  console.log("\n⚠️ CẢNH BÁO: Chưa cấu hình VAPID_PUBLIC_KEY và VAPID_PRIVATE_KEY trong .env!");
} else {
  try {
    webpush.setVapidDetails(
      'mailto:app.lichtruc@gmail.com',
      pubKey,
      privKey
    );
    console.log("🔑 Cấu hình khóa Web Push (VAPID) thành công!");
  } catch (err) {
    console.error("🔴 Lỗi cấu hình VAPID:", err.message);
  }
}

// Kết nối với cơ sở dữ liệu MongoDB Atlas
const mongoUri = process.env.MONGO_URI;
if (!mongoUri || mongoUri.includes("abcde")) {
  console.log("⚠️ CẢNH BÁO: Chưa cấu hình MONGO_URI trong .env!");
} else {
  mongoose.connect(mongoUri)
    .then(() => console.log('🟢 Đã kết nối cơ sở dữ liệu thành công!'))
    .catch(err => console.error('🔴 Lỗi kết nối Cơ sở dữ liệu:', err));
}

// --- ĐỊNH NGHĨA SCHEMAS (MÔ HÌNH DỮ LIỆU) ---

const TaskSchema = new mongoose.Schema({
  key: { type: String, unique: true }, 
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', TaskSchema);

// Lưu đăng ký kèm tên thành viên (Ha, Quynh, Thuy)
const SubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, unique: true },
  expirationTime: Number,
  keys: {
    p256dh: String,
    auth: String
  },
  roommate: { type: String, default: 'Chưa rõ' }, 
  createdAt: { type: Date, default: Date.now }
});
const Subscription = mongoose.model('Subscription', SubscriptionSchema);

// --- ĐƯỜNG DẪN TRUY VẤN (API ENDPOINTS) ---

// API Lấy toàn bộ lịch hoàn thành
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find();
    const taskMap = {};
    tasks.forEach(t => {
      taskMap[t.key] = t.completed;
    });
    res.json(taskMap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API Bật/tắt trạng thái hoàn thành ca trực
app.post('/api/tasks/toggle', async (req, res) => {
  const { key, completed } = req.body;
  try {
    const task = await Task.findOneAndUpdate(
      { key },
      { completed, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API Đăng ký nhận thông báo đẩy (Độ tương thích cao)
app.post('/api/subscribe', async (req, res) => {
  try {
    let endpoint = "";
    let keys = null;
    let expirationTime = null;
    let roommate = "Chưa rõ";

    if (req.body && req.body.subscription) {
      endpoint = req.body.subscription.endpoint;
      keys = req.body.subscription.keys;
      expirationTime = req.body.subscription.expirationTime;
      roommate = req.body.roommate || "Chưa rõ";
    } else if (req.body && req.body.endpoint) {
      endpoint = req.body.endpoint;
      keys = req.body.keys;
      expirationTime = req.body.expirationTime;
      roommate = req.body.roommate || "Chưa rõ";
    } else {
      return res.status(400).json({ error: "Định dạng dữ liệu đăng ký không hợp lệ." });
    }

    if (!endpoint || !keys) {
      return res.status(400).json({ error: "Thiếu thông tin kết nối an toàn (Endpoint/Keys)." });
    }

    await Subscription.findOneAndUpdate(
      { endpoint: endpoint },
      { 
        endpoint: endpoint,
        keys: keys,
        expirationTime: expirationTime,
        roommate: roommate,
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, message: 'Đăng ký nhận thông báo thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API Lấy danh sách thành viên tích cực đăng ký thiết bị
app.get('/api/active-subscribers', async (req, res) => {
  try {
    const subs = await Subscription.find({}, 'roommate');
    const list = subs.map(s => s.roommate);
    const uniqueList = [...new Set(list)];
    res.json(uniqueList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API Gửi thông báo đẩy hàng loạt
app.post('/api/send-reminders', async (req, res) => {
  try {
    const subscriptions = await Subscription.find();
    
    const payload = JSON.stringify({
      title: "⏰ Nhắc nhở trực nhật hôm nay",
      body: "Hãy kiểm tra các công việc trực nhật chưa hoàn thành của bạn và làm ngay trước 23H30 nhé bạn yêu!",
      icon: "https://cdn-icons-png.flaticon.com/512/1048/1048953.png"
    });

    const pushPromises = subscriptions.map(sub => 
      webpush.sendNotification(sub, payload).catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          return Subscription.deleteOne({ _id: sub._id });
        }
      })
    );

    await Promise.all(pushPromises);
    res.json({ success: true, message: `Đã gửi nhắc nhở thành công tới ${subscriptions.length} thiết bị!` });
  } catch (error) {
    console.error("Lỗi gửi thông báo:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại cổng ${PORT}`));
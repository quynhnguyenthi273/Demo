const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const webpush = require('web-push');
require('dotenv').config();

const app = express();

// Cho phép Vercel kết nối bảo mật tới Server này
app.use(cors({
  origin: '*', // Cho phép mọi nguồn kết nối an toàn (Hoặc bạn có thể dán link Vercel cụ thể vào đây)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Kiểm tra và khởi tạo thông tin VAPID cho thông báo Web Push chạy ngầm
const pubKey = process.env.VAPID_PUBLIC_KEY;
const privKey = process.env.VAPID_PRIVATE_KEY;

if (!pubKey || !privKey) {
  console.warn('⚠️ CẢNH BÁO: Chưa cấu hình VAPID Keys trong Environment của Render. Tính năng Web Push sẽ bị tạm tắt.');
} else {
  webpush.setVapidDetails(
    'mailto:app.lichtruc@gmail.com',
    pubKey,
    privKey
  );
}

// Kiểm tra MONGO_URI trước khi kết nối để tránh làm sập (crash) Server
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('🔴 LỖI NGHIÊM TRỌNG: Bạn chưa cấu hình biến MONGO_URI trong tab Environment của Render!');
} else {
  mongoose.connect(mongoUri)
    .then(() => console.log('🟢 Đã kết nối cơ sở dữ liệu MongoDB Atlas thành công!'))
    .catch(err => console.error('🔴 Lỗi kết nối Cơ sở dữ liệu:', err));
}

// --- ĐỊNH NGHĨA BẢNG DỮ LIỆU (SCHEMAS) ---
const TaskSchema = new mongoose.Schema({
  key: { type: String, unique: true }, // định dạng: "yyyy-mm-day-taskType" (ví dụ: "2026-7-1-QUET_NHA")
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', TaskSchema);

const SubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, unique: true },
  expirationTime: Number,
  keys: {
    p256dh: String,
    auth: String
  },
  createdAt: { type: Date, default: Date.now }
});
const Subscription = mongoose.model('Subscription', SubscriptionSchema);

// --- ĐỊNH NGHĨA CÁC ĐƯỜNG DẪN API (ROUTES) ---

// 🟢 ROUTE TRANG CHỦ: Sửa lỗi "Cannot GET /" và dùng để kiểm tra xem Server/Database có chạy tốt không
app.get('/', (req, res) => {
  res.json({ 
    status: "active", 
    message: "🟢 Máy chủ Lịch Trực Nhật của 3 Nàng Thơ đang chạy cực tốt!",
    database: mongoose.connection.readyState === 1 ? "Connected (Đã kết nối thành công)" : "Disconnected (Chưa kết nối)",
    timestamp: new Date()
  });
});

// API 1: Lấy toàn bộ trạng thái hoàn thành việc nhà để đồng bộ lên giao diện
app.get('/api/tasks', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Cơ sở dữ liệu chưa sẵn sàng." });
    }
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

// API 2: Khi có ai đó tích chọn Hoàn thành/Hủy hoàn thành trên điện thoại
app.post('/api/tasks/toggle', async (req, res) => {
  const { key, completed } = req.body;
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Cơ sở dữ liệu chưa kết nối." });
    }
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

// API 3: Đăng ký nhận thông báo
app.post('/api/subscribe', async (req, res) => {
  const subInfo = req.body;
  try {
    await Subscription.findOneAndUpdate(
      { endpoint: subInfo.endpoint },
      subInfo,
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, message: 'Đăng ký nhận thông báo thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 4: API Gọi gửi thông báo nhắc nhở
app.post('/api/send-reminders', async (req, res) => {
  if (!pubKey || !privKey) {
    return res.status(400).json({ error: "Chưa cấu hình VAPID keys nên không thể gửi thông báo." });
  }
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
    res.status(500).json({ error: error.message });
  }
});

// Chạy Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại cổng ${PORT}`));
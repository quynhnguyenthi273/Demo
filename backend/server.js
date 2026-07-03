const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const webpush = require('web-push');
require('dotenv').config();

const app = express();

// Cho phép Vercel kết nối bảo mật tới Server này
app.use(cors({
  origin: '*', // Sau này bạn có thể đổi thành link Vercel cụ thể của bạn để bảo mật hơn
  methods: ['GET', 'POST']
}));
app.use(express.json());

// Cấu hình thông tin VAPID cho thông báo Web Push chạy ngầm
webpush.setVapidDetails(
  'mailto:app.lichtruc@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Kết nối với cơ sở dữ liệu MongoDB Atlas thông qua biến môi trường
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Đã kết nối cơ sở dữ liệu thành công!'))
  .catch(err => console.error('🔴 Lỗi kết nối Cơ sở dữ liệu:', err));

// --- ĐỊNH NGHĨA BẢNG DỮ LIỆU (SCHEMAS) ---

// 1. Lưu trạng thái hoàn thành công việc của từng ngày
const TaskSchema = new mongoose.Schema({
  key: { type: String, unique: true }, // định dạng: "yyyy-mm-day-taskType" (ví dụ: "2026-7-1-QUET_NHA")
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', TaskSchema);

// 2. Lưu đăng ký thông báo Web Push của các thiết bị di động (khi đóng app vẫn còn)
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

// API 1: Lấy toàn bộ trạng thái hoàn thành việc nhà để đồng bộ lên giao diện
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

// API 2: Khi có ai đó tích chọn Hoàn thành/Hủy hoàn thành trên điện thoại
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

// API 3: Khi thành viên ấn "Kích hoạt" nhận thông báo trên điện thoại
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

// API 4: API Gọi gửi thông báo nhắc nhở (Sẽ cấu hình gọi tự động lúc 20:00 hàng ngày)
app.post('/api/send-reminders', async (req, res) => {
  try {
    const subscriptions = await Subscription.find();
    
    // Đoạn text gửi thông báo chuẩn theo yêu cầu của bạn
    const payload = JSON.stringify({
      title: "⏰ Nhắc nhở trực nhật hôm nay",
      body: "Hãy kiểm tra các công việc trực nhật chưa hoàn thành của bạn và làm ngay trước 23H30 nhé bạn yêu!",
      icon: "[https://cdn-icons-png.flaticon.com/512/1048/1048953.png](https://cdn-icons-png.flaticon.com/512/1048/1048953.png)"
    });

    const pushPromises = subscriptions.map(sub => 
      webpush.sendNotification(sub, payload).catch(err => {
        // Nếu thiết bị đã chặn hoặc hết hạn thông báo, tự động xóa khỏi DB
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

// Chạy Server ở cổng PORT tự động của dịch vụ đám mây hoặc cổng 5000 ở local
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy cực mượt tại cổng ${PORT}`));
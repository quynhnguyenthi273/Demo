self.addEventListener('install', (event) => {
  // Buộc Service Worker mới kích hoạt ngay lập tức mà không cần chờ đợi đóng tab cũ
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Cho phép Service Worker kiểm soát tất cả các tab đang mở ngay lập tức để áp dụng code mới
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      // Giải mã dữ liệu JSON nhận được từ Server Render
      const data = event.data.json();
      
      const options = {
        body: data.body || 'Hãy hoàn thành công việc trực nhật hôm nay trước 23h30 nhé bạn yêu! 💕',
        icon: data.icon || 'https://cdn-icons-png.flaticon.com/512/1048/1048953.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/1048/1048953.png',
        vibrate: [200, 100, 200], // Rung điện thoại [Rung, Nghỉ, Rung]
        data: { 
          dateOfArrival: Date.now(),
          primaryKey: '1'
        },
        actions: [
          { action: 'open_app', title: 'Mở Lịch Trực 🗓️' }
        ]
      };

      event.waitUntil(
        self.registration.showNotification(data.title || '⏰ Nhắc nhở trực nhật', options)
      );
    } catch (e) {
      console.error('Lỗi giải mã JSON thông báo, chuyển sang hiển thị văn bản thô:', e);
      
      // PHƯƠNG ÁN DỰ PHÒNG: Nếu gặp bất kỳ lỗi nào, vẫn cưỡng bức nổ thông báo thô lên màn hình khóa
      const text = event.data.text();
      event.waitUntil(
        self.registration.showNotification('⏰ Nhắc nhở trực nhật hôm nay', {
          body: text || 'Hãy kiểm tra các công việc trực nhật chưa hoàn thành của bạn ngay nhé!',
          icon: 'https://cdn-icons-png.flaticon.com/512/1048/1048953.png',
          badge: 'https://cdn-icons-png.flaticon.com/512/1048/1048953.png',
          vibrate: [200, 100, 200]
        })
      );
    }
  }
});

// Khi người dùng bấm vào dòng thông báo trên màn hình khóa điện thoại
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Đóng banner thông báo trên màn hình khóa
  
  // Tự động tìm tab ứng dụng đang mở hoặc mở tab mới để đưa người dùng về giao diện
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
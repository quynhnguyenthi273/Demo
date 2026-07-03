// Lắng nghe sự kiện Push từ Server gửi về (Kể cả khi app đã đóng hoàn toàn)
self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body,
        icon: data.icon || '[https://cdn-icons-png.flaticon.com/512/1048/1048953.png](https://cdn-icons-png.flaticon.com/512/1048/1048953.png)',
        badge: '[https://cdn-icons-png.flaticon.com/512/1048/1048953.png](https://cdn-icons-png.flaticon.com/512/1048/1048953.png)',
        vibrate: [100, 50, 100],
        data: { dateOfArrival: Date.now() },
        actions: [
          { action: 'open', title: 'Xem lịch trực nhật 🗓️' }
        ]
      };

      event.waitUntil(
        self.registration.showNotification(data.title, options)
      );
    } catch (e) {
      console.error('Lỗi phân tích cú pháp thông báo:', e);
    }
  }
});

// Khi người dùng bấm vào dòng thông báo trên màn hình khóa điện thoại
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
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

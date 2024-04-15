self.addEventListener('install', function(event) {
    console.log('Service Worker installed');
  });
  
  self.addEventListener('activate', function(event) {
    console.log('Service Worker activated');
  });
  
  self.addEventListener('fetch', function(event) {
    console.log('Fetching:', event.request.url);
    event.respondWith(fetch(event.request));
  });
  
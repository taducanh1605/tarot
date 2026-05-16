// Service Worker for Tarot Card App
// Uses Cache-First strategy for all static assets and images
// App shell is precached on install; images are cached on first request

var CACHE_NAME = 'tarot-v2';

// App shell files to precache on install.
// NOTE: Do NOT include './' (root/directory URL) here – on some hosts it
// returns a redirect (opaque response) that cache.add() cannot store, which
// would cause cache.addAll() to reject and abort the entire install.
var APP_SHELL = [
    './index.html',
    './manifest.json',
    './css/flip.css',
    './css/spread.css',
    './css/gothic.css',
    './css/rider-waite.css',
    './css/darkana.css',
    './css/bootstrap.min.css',
    './js/spread.js'
];

var DECK_NAMES = ['gothic', 'rider-waite', 'darkana'];

var MAJOR_ARCANA = [
    'tarot_00.png', 'tarot_01.png', 'tarot_02.png', 'tarot_03.png',
    'tarot_04.png', 'tarot_05.png', 'tarot_06.png', 'tarot_07.png',
    'tarot_08.png', 'tarot_09.png', 'tarot_10.png', 'tarot_11.png',
    'tarot_12.png', 'tarot_13.png', 'tarot_14.png', 'tarot_15.png',
    'tarot_16.png', 'tarot_17.png', 'tarot_18.png', 'tarot_19.png',
    'tarot_20.png', 'tarot_21.png'
];

var MINOR_SUITS = ['c', 'p', 's', 'w'];

function buildCardList(deckName) {
    var files = [
        './images/' + deckName + '/cardback.png',
        './images/' + deckName + '/background.jpg'
    ];
    for (var i = 0; i < MAJOR_ARCANA.length; i++) {
        files.push('./images/' + deckName + '/' + MAJOR_ARCANA[i]);
    }
    for (var s = 0; s < MINOR_SUITS.length; s++) {
        for (var n = 1; n <= 14; n++) {
            var num = n < 10 ? '0' + n : '' + n;
            files.push('./images/' + deckName + '/tarot_' + MINOR_SUITS[s] + num + '.png');
        }
    }
    return files;
}

var IMAGE_FILES = [];
for (var d = 0; d < DECK_NAMES.length; d++) {
    IMAGE_FILES = IMAGE_FILES.concat(buildCardList(DECK_NAMES[d]));
}
IMAGE_FILES.push('./images/gothic/icon.png');

// Install event: cache app shell files individually (NOT via addAll so one
// missing file cannot abort the entire install), then cache images in batches.
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            // Cache each app-shell file individually so a single failure does
            // not roll back everything.  Critical files (index.html, spread.js,
            // CSS) should always be present; warn on any unexpected miss.
            var shellPromises = APP_SHELL.map(function(url) {
                return cache.add(url).catch(function(err) {
                    console.warn('[SW] Failed to cache app-shell file: ' + url, err);
                });
            });

            return Promise.all(shellPromises).then(function() {
                // Cache images in batches; skip missing files gracefully
                var batches = [];
                var batchSize = 20;
                for (var i = 0; i < IMAGE_FILES.length; i += batchSize) {
                    batches.push(IMAGE_FILES.slice(i, i + batchSize));
                }
                return batches.reduce(function(chain, batch) {
                    return chain.then(function() {
                        return Promise.all(
                            batch.map(function(url) {
                                return cache.add(url).catch(function(err) {
                                    console.warn('[SW] Failed to cache image: ' + url, err);
                                });
                            })
                        );
                    });
                }, Promise.resolve());
            });
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// Activate event: clean up old caches
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(name) {
                    if (name !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache: ' + name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// Fetch event: Cache-First strategy
self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;

    var url = new URL(event.request.url);

    // Only handle http/https – chrome-extension:// etc. cannot be cached
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) return;

    // For navigation requests serve the cached index.html directly.
    // This is the key offline-support path: navigating to the app root
    // while offline must return the cached page, not a network error.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match(new Request('./index.html')).then(function(cached) {
                if (cached) return cached;
                // Not cached yet – fetch from network (first visit)
                return fetch(event.request).catch(function() {
                    return new Response('<h1>Offline</h1><p>Please visit once while online first.</p>',
                        { headers: { 'Content-Type': 'text/html' } });
                });
            })
        );
        return;
    }

    // For all other requests: serve from cache, fall back to network and cache
    event.respondWith(
        caches.match(event.request).then(function(cachedResponse) {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then(function(networkResponse) {
                if (
                    networkResponse &&
                    networkResponse.status === 200 &&
                    networkResponse.type === 'basic'
                ) {
                    var responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(function() {
                return new Response('', { status: 503, statusText: 'Service Unavailable' });
            });
        })
    );
});


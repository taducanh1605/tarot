// Service Worker for Tarot Card App
// Uses Cache-First strategy for all static assets and images
// App shell is precached on install; images are cached on first request

var CACHE_NAME = 'tarot-v1';

// App shell files to precache on install
var APP_SHELL = [
    './',
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

// Precache all card images for all three decks so the app works fully offline
// after the first visit (when the service worker installs and caches these files)

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

// Build all card filenames for a single deck
function buildCardList(deckName) {
    var files = [
        './images/' + deckName + '/cardback.png',
        './images/' + deckName + '/background.jpg'
    ];

    // Major Arcana
    for (var i = 0; i < MAJOR_ARCANA.length; i++) {
        files.push('./images/' + deckName + '/' + MAJOR_ARCANA[i]);
    }

    // Minor Arcana (14 cards per suit)
    for (var s = 0; s < MINOR_SUITS.length; s++) {
        for (var n = 1; n <= 14; n++) {
            var num = n < 10 ? '0' + n : '' + n;
            files.push('./images/' + deckName + '/tarot_' + MINOR_SUITS[s] + num + '.png');
        }
    }

    return files;
}

// Collect all image files across all decks
var IMAGE_FILES = [];
for (var d = 0; d < DECK_NAMES.length; d++) {
    IMAGE_FILES = IMAGE_FILES.concat(buildCardList(DECK_NAMES[d]));
}

// Also include gothic extra images
IMAGE_FILES.push('./images/gothic/icon.png');
IMAGE_FILES.push('./images/gothic/home_air_title.png');

// Install event: precache app shell and all images
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            // Cache app shell immediately (required files)
            return cache.addAll(APP_SHELL).then(function() {
                // Cache images in smaller batches to avoid overwhelming the browser
                // If any image fails to cache (e.g. file not found), skip it gracefully
                var batches = [];
                var batchSize = 20;
                for (var i = 0; i < IMAGE_FILES.length; i += batchSize) {
                    batches.push(IMAGE_FILES.slice(i, i + batchSize));
                }

                // Process batches sequentially
                return batches.reduce(function(chain, batch) {
                    return chain.then(function() {
                        return Promise.all(
                            batch.map(function(url) {
                                return cache.add(url).catch(function(err) {
                                    console.warn('[SW] Failed to cache: ' + url, err);
                                });
                            })
                        );
                    });
                }, Promise.resolve());
            });
        }).then(function() {
            // Force the waiting service worker to become the active service worker
            return self.skipWaiting();
        })
    );
});

// Activate event: clean up old caches from previous versions
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
            // Take control of all open clients immediately
            return self.clients.claim();
        })
    );
});

// Fetch event: Cache-First strategy
// Serve from cache if available; otherwise fetch from network and cache the response
self.addEventListener('fetch', function(event) {
    // Only handle GET requests to the same origin
    if (event.request.method !== 'GET') return;

    // Skip requests to external origins (e.g. analytics)
    var url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(event.request).then(function(cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            }

            // Not in cache: fetch from network and store in cache for next time
            return fetch(event.request).then(function(networkResponse) {
                // Only cache successful responses
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
                // Network failed and not in cache
                // For navigation requests, return the cached index.html as fallback
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                // For other requests, just fail silently
                return new Response('', { status: 503, statusText: 'Service Unavailable' });
            });
        })
    );
});

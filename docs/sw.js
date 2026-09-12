// Service Worker for Tarot Card App
// Uses Network-First so online users receive current files and offline users
// receive the last complete cached version.

var CACHE_NAME = 'tarot-v6';
var INDEX_URL = new URL('./index.html', self.location.href).href;

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

function cacheBatch(cache, urls) {
    return Promise.all(urls.map(function(url) {
        return cache.add(url);
    }));
}

// Install a complete offline version. If any required file cannot be cached,
// installation fails and the previous working cache remains active.
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            var files = APP_SHELL.concat(IMAGE_FILES);
            var batchSize = 20;
            var chain = Promise.resolve();

            for (var i = 0; i < files.length; i += batchSize) {
                (function(batch) {
                    chain = chain.then(function() {
                        return cacheBatch(cache, batch);
                    });
                })(files.slice(i, i + batchSize));
            }

            return chain;
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

function cacheResponse(request, response) {
    if (!response || !response.ok || response.type !== 'basic') {
        return Promise.resolve();
    }

    return caches.open(CACHE_NAME).then(function(cache) {
        return cache.put(request, response.clone());
    });
}

function networkFirst(request, fallbackUrl) {
    return fetch(request).then(function(response) {
        return cacheResponse(request, response).then(function() {
            return response;
        });
    }).catch(function() {
        return caches.match(request, { ignoreSearch: true }).then(function(cached) {
            if (cached) return cached;
            if (fallbackUrl) return caches.match(fallbackUrl, { ignoreSearch: true });
            return null;
        }).then(function(cached) {
            if (cached) return cached;
            return new Response('', { status: 503, statusText: 'Service Unavailable' });
        });
    });
}

// Prefer the network whenever it is available; use the complete precache when
// the request fails because the device is offline.
self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;

    var url = new URL(event.request.url);

    // Only handle http/https – chrome-extension:// etc. cannot be cached
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) return;

    if (event.request.mode === 'navigate') {
        event.respondWith(networkFirst(event.request, INDEX_URL));
        return;
    }

    event.respondWith(networkFirst(event.request));
});


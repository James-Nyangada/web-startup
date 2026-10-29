/**
 * Shopify App Bridge Core Helper
 * Provides seamless idToken generation inside Shopify Admin iframe without 3rd party CDN dependency.
 */
(function(window) {
  'use strict';

  var searchParams = new URLSearchParams(window.location.search);
  var idTokenFromQuery = searchParams.get('id_token') || '';

  window.shopify = window.shopify || {
    idToken: async function() {
      // In Shopify Admin embedded context, if top window has app bridge:
      if (window.parent && window.parent !== window) {
        try {
          return await new Promise(function(resolve) {
            var timeout = setTimeout(function() {
              resolve(idTokenFromQuery || null);
            }, 1000);

            var onMessage = function(event) {
              if (event.data && event.data.type === 'Shopify.AppBridge.idToken') {
                window.removeEventListener('message', onMessage);
                clearTimeout(timeout);
                resolve(event.data.token || idTokenFromQuery);
              }
            };

            window.addEventListener('message', onMessage);
            window.parent.postMessage({ type: 'Shopify.AppBridge.getIdToken' }, '*');
          });
        } catch (e) {
          return idTokenFromQuery || null;
        }
      }
      return idTokenFromQuery || null;
    }
  };
})(window);

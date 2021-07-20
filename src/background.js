//Communicate with iframe
const host = "https://www.stoicwallet.com";
//Open Tab
chrome.browserAction.onClicked.addListener(function () {
    chrome.tabs.create({ url: host });
});

function buf2hex(buffer) {
  return [...new Uint8Array(buffer)]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}
function hex2buf(hex) {
  const view = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    view[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return view.buffer
}
var _listenerIndex = 0, _listener = {}, _frames = {};
function _removeFrame(id) {
  _frames[id].parentNode.removeChild(_frames[id]);
};
function _postToFrame(data, resolve, reject) {
    var thisIndex = _listenerIndex;
    _listener[thisIndex] = [resolve, reject];
    var ii = document.createElement('iframe');
    ii.setAttribute('id', 'connect_iframe');
    document.body.appendChild(ii);
    _frames[thisIndex] = document.getElementById('connect_iframe');
    _frames[thisIndex].addEventListener("load", function() {
      data.listener = thisIndex;
      _frames[thisIndex].contentWindow.postMessage(data, "*");      
    });
    ii.setAttribute('src', host+'/?stoicTunnel');
    _listenerIndex += 1;
};
function StoicConnect(action, payload, principal, apikey, sig){
  return new Promise(function(resolve, reject){
    _postToFrame({
      target :  "STOIC-IFRAME",
      action : action,
      payload : payload,
      principal : principal,
      apikey : apikey,
      sig : sig
    }, resolve, reject);
  });  
}
window.addEventListener("message", function(e){
  if (e && e.data && e.data.target === 'STOIC-EXT') {
    if (typeof e.data.success != 'undefined' && e.data.success){
      _listener[e.data.listener][0](e.data.data);      
    } else {
      _listener[e.data.listener][1](e.data.data);      
    }
    _removeFrame(e.data.listener);
  }
}, false);

function extractHostname(url) {
	var hostname;
	if (url.indexOf("//") > -1) {
		hostname = url.split('/')[2];
	} else {
		hostname = url.split('/')[0];
	}
	hostname = hostname.split(':')[0];
	hostname = hostname.split('?')[0];
	return hostname;
}
var getSender = function(s){
	if (typeof s.url != 'undefined') return extractHostname(s.url);
	else return false;
}

//Communicate with frontend
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse){
  var sender = getSender(sender);
  switch (request.action) {
    case "connect":
      chrome.storage.local.get(["senders"], function(result) {
        var senders = result.senders ?? {};
        var app = senders[sender] ?? false;
        if (app && app.principal) {
          sendResponse({
            success:true, 
            result: {
              principal : app.principal,
              key : app.key,
              type : app.type
            }
          });
        } else {        
          sendResponse({ success : true, result : false });
        }
      });
    break;
    case "disconnect":
      chrome.storage.local.get(["senders"], function(result) {
        var senders = result.senders ?? {};
        delete senders[sender];
        chrome.storage.local.set({"senders": senders}, function() {
          sendResponse({success : true, result : {}});
        });
      });
    break;
    case "generateKey":
      (async () => {
        var keypair = await window.crypto.subtle.generateKey(
          {
            name: "ECDSA",
            namedCurve: "P-384"
          },
          true,
          ["sign", "verify"]
        );
        var pubk = await window.crypto.subtle.exportKey(
          "spki",
          keypair.publicKey
        );
        var secretkey = await window.crypto.subtle.exportKey(
          "jwk",
          keypair.privateKey
        );
        var apikey = buf2hex(pubk);
        var app = {
          principal : "",
          key : "",
          type : "",
          secretkey : secretkey,
          apikey : apikey,
        };
        chrome.storage.local.get(["senders"], function(result) {
          var senders = result.senders ?? {};
          senders[sender] = app;
          chrome.storage.local.set({"senders": senders}, function() {
            sendResponse({success : true, result : apikey});
          });
        });
      })();
    break;
    case "setApplication":
      chrome.storage.local.get(["senders"], function(result) {
        var senders = result.senders ?? {};
        var app = senders[sender] ?? false;
        if (app) {
          app.principal = request.data.principal;
          app.key = request.data.key;
          app.type = request.data.type;
          senders[sender] = app;
          chrome.storage.local.set({"senders": senders}, function() {
            sendResponse({success : true, result : {}});
          });
        } else {
          sendResponse({success : false, error : "No sender stored"});          
        }
      });
    break;
    case "sign":
      chrome.storage.local.get(["senders"], async function(result) {
        var senders = result.senders ?? {};
        var app = senders[sender] ?? false;
        if (app) {
          var privk = await window.crypto.subtle.importKey(
            "jwk",
            app.secretkey,
            {
              name: "ECDSA",
              namedCurve: "P-384"
            },
            true,
            ["sign"]
          );
          var payload = request.data;
          var enc = new TextEncoder();
          var encdata = enc.encode(payload);
          var signed = await window.crypto.subtle.sign(
            {
              name: "ECDSA",
              hash: {name: "SHA-384"},
            },
            privk,
            encdata
          );
          var sig = buf2hex(signed);
          StoicConnect(request.action, payload, app.principal, app.apikey, sig).then(function(r){
            sendResponse({success:true, result:r});
          }).catch(function(r){
            sendResponse({success:false, error:r});
          }); 
        } else {
          sendResponse({success:false, error:"No app"});         
        }
      });
    break;
  }
  return true;
});

const allowedActions = ['connect', 'disconnect', 'generateKey', 'setApplication', 'sign'];
window.addEventListener("message", function(event) {
  if (event.source != window || event.data.direction != "in") return;
  if (allowedActions.indexOf(event.data.type) < 0) return;
  var payload = {};
  if (typeof event.data.data != "undefined") payload = event.data.data;  
  chrome.runtime.sendMessage({action: event.data.type, data : payload}, function(response) {
  	if (response) {
    	window.postMessage({ type : "callback", direction : "out", callbackID : event.data.callbackID, response : response}, "*");
    }
  });
}, false);
console.log("Loaded StoicConnect");
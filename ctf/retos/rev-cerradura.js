// cerradura.js — ¿cuál es la clave que abre la cerradura?
// Si la encontrás, esa misma clave es la flag.
function _0x(s){return s.split('').map(function(c){return c.charCodeAt(0);});}
var _k=[99,123,120,76,101,175,70,65,87,69,84,89,69,75,94,69,75,71,65,84,84,69,70,81,84,69,75,92,87,75,109,20,70,21,65,65,169];
function abrir(clave){
  var b=_0x(clave);
  if(b.length!==_k.length) return false;
  for(var i=0;i<b.length;i++){ if(((b[i]+7)^0x2d)!==_k[i]) return false; }
  return true;
}
// abrir(prompt('clave?')) === true  ->  tenés la flag

// Copyright (c) 2013 Pieroxy <pieroxy@pieroxy.net>
// This work is free. You can redistribute it and/or modify it
// under the terms of the WTFPL, Version 2
// For more information see LICENSE.txt or http://www.wtfpl.net/
//
// For more information, the home page:
// http://pieroxy.net/blog/pages/lz-string/testing.html
//
// LZ-based compression algorithm, version 1.4.4
var LZString = (function() {

// private property
var f = String.fromCharCode;
var keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
var keyStrUriSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
var baseReverseDic = {};

function getBaseValue(alphabet, character) {
  if (!baseReverseDic[alphabet]) {
    baseReverseDic[alphabet] = {};
    for (var i=0 ; i<alphabet.length ; i++) {
      baseReverseDic[alphabet][alphabet.charAt(i)] = i;
    }
  }
  return baseReverseDic[alphabet][character];
}

var LZString = {
  compressToBase64 : function (input) {
    if (input == null) return "";
    var res = LZString._compress(input, 6, function(a){return keyStrBase64.charAt(a);});
    switch (res.length % 4) { // To produce valid Base64
    default: // When could this happen ?
    case 0 : return res;
    case 1 : return res+"===";
    case 2 : return res+"==";
    case 3 : return res+"=";
    }
  },

  decompressFromBase64 : function (input) {
    if (input == null) return "";
    if (input == "") return null;
    return LZString._decompress(input.length, 32, function(index) { return getBaseValue(keyStrBase64, input.charAt(index)); });
  },

  compressToUTF16 : function (input) {
    if (input == null) return "";
    return LZString._compress(input, 15, function(a){return f(a+32);}) + " ";
  },

  decompressFromUTF16: function (compressed) {
    if (compressed == null) return "";
    if (compressed == "") return null;
    return LZString._decompress(compressed.length, 16384, function(index) { return compressed.charCodeAt(index) - 32; });
  },

  //compress into uint8array (UCS-2 big endian format)
  compressToUint8Array: function (uncompressed) {
    var compressed = LZString.compress(uncompressed);
    var buf=new Uint8Array(compressed.length*2); // 2 bytes per character

    for (var i=0, TotalLen=compressed.length; i<TotalLen; i++) {
      var current_value = compressed.charCodeAt(i);
      buf[i*2] = current_value >>> 8;
      buf[i*2+1] = current_value % 256;
    }
    return buf;
  },

  //decompress from uint8array (UCS-2 big endian format)
  decompressFromUint8Array:function (compressed) {
    if (compressed===null || compressed===undefined){
        return LZString.decompress(compressed);
    } else {
        var buf=new Array(compressed.length/2); // 2 bytes per character
        for (var i=0, TotalLen=buf.length; i<TotalLen; i++) {
          buf[i]=compressed[i*2]*256+compressed[i*2+1];
        }

        var result = [];
        buf.forEach(function (c) {
          result.push(f(c));
        });
        return LZString.decompress(result.join(''));

    }

  },


  //compress into a string that is already URI encoded
  compressToEncodedURIComponent: function (input) {
    if (input == null) return "";
    return LZString._compress(input, 6, function(a){return keyStrUriSafe.charAt(a);});
  },

  //decompress from an output of compressToEncodedURIComponent
  decompressFromEncodedURIComponent:function (input) {
    if (input == null) return "";
    if (input == "") return null;
    input = input.replace(/ /g, "+");
    return LZString._decompress(input.length, 32, function(index) { return getBaseValue(keyStrUriSafe, input.charAt(index)); });
  },

  compress: function (uncompressed) {
    return LZString._compress(uncompressed, 16, function(a){return f(a);});
  },
  _compress: function (uncompressed, bitsPerChar, getCharFromInt) {
    if (uncompressed == null) return "";
    var i, value,
        context_dictionary= {},
        context_dictionaryToCreate= {},
        context_c="",
        context_wc="",
        context_w="",
        context_enlargeIn= 2, // Compensate for the first entry which should not count
        context_dictSize= 3,
        context_numBits= 2,
        context_data=[],
        context_data_val=0,
        context_data_position=0,
        ii;

    for (ii = 0; ii < uncompressed.length; ii += 1) {
      context_c = uncompressed.charAt(ii);
      if (!Object.prototype.hasOwnProperty.call(context_dictionary,context_c)) {
        context_dictionary[context_c] = context_dictSize++;
        context_dictionaryToCreate[context_c] = true;
      }

      context_wc = context_w + context_c;
      if (Object.prototype.hasOwnProperty.call(context_dictionary,context_wc)) {
        context_w = context_wc;
      } else {
        if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate,context_w)) {
          if (context_w.charCodeAt(0)<256) {
            for (i=0 ; i<context_numBits ; i++) {
              context_data_val = (context_data_val << 1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
            }
            value = context_w.charCodeAt(0);
            for (i=0 ; i<8 ; i++) {
              context_data_val = (context_data_val << 1) | (value&1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          } else {
            value = 1;
            for (i=0 ; i<context_numBits ; i++) {
              context_data_val = (context_data_val << 1) | value;
              if (context_data_position ==bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = 0;
            }
            value = context_w.charCodeAt(0);
            for (i=0 ; i<16 ; i++) {
              context_data_val = (context_data_val << 1) | (value&1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          }
          context_enlargeIn--;
          if (context_enlargeIn == 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
          delete context_dictionaryToCreate[context_w];
        } else {
          value = context_dictionary[context_w];
          for (i=0 ; i<context_numBits ; i++) {
            context_data_val = (context_data_val << 1) | (value&1);
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }


        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        // Add wc to the dictionary.
        context_dictionary[context_wc] = context_dictSize++;
        context_w = String(context_c);
      }
    }

    // Output the code for w.
    if (context_w !== "") {
      if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate,context_w)) {
        if (context_w.charCodeAt(0)<256) {
          for (i=0 ; i<context_numBits ; i++) {
            context_data_val = (context_data_val << 1);
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
          }
          value = context_w.charCodeAt(0);
          for (i=0 ; i<8 ; i++) {
            context_data_val = (context_data_val << 1) | (value&1);
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        } else {
          value = 1;
          for (i=0 ; i<context_numBits ; i++) {
            context_data_val = (context_data_val << 1) | value;
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = 0;
          }
          value = context_w.charCodeAt(0);
          for (i=0 ; i<16 ; i++) {
            context_data_val = (context_data_val << 1) | (value&1);
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        delete context_dictionaryToCreate[context_w];
      } else {
        value = context_dictionary[context_w];
        for (i=0 ; i<context_numBits ; i++) {
          context_data_val = (context_data_val << 1) | (value&1);
          if (context_data_position == bitsPerChar-1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }


      }
      context_enlargeIn--;
      if (context_enlargeIn == 0) {
        context_enlargeIn = Math.pow(2, context_numBits);
        context_numBits++;
      }
    }

    // Mark the end of the stream
    value = 2;
    for (i=0 ; i<context_numBits ; i++) {
      context_data_val = (context_data_val << 1) | (value&1);
      if (context_data_position == bitsPerChar-1) {
        context_data_position = 0;
        context_data.push(getCharFromInt(context_data_val));
        context_data_val = 0;
      } else {
        context_data_position++;
      }
      value = value >> 1;
    }

    // Flush the last char
    while (true) {
      context_data_val = (context_data_val << 1);
      if (context_data_position == bitsPerChar-1) {
        context_data.push(getCharFromInt(context_data_val));
        break;
      }
      else context_data_position++;
    }
    return context_data.join('');
  },

  decompress: function (compressed) {
    if (compressed == null) return "";
    if (compressed == "") return null;
    return LZString._decompress(compressed.length, 32768, function(index) { return compressed.charCodeAt(index); });
  },

  _decompress: function (length, resetValue, getNextValue) {
    var dictionary = [],
        next,
        enlargeIn = 4,
        dictSize = 4,
        numBits = 3,
        entry = "",
        result = [],
        i,
        w,
        bits, resb, maxpower, power,
        c,
        data = {val:getNextValue(0), position:resetValue, index:1};

    for (i = 0; i < 3; i += 1) {
      dictionary[i] = i;
    }

    bits = 0;
    maxpower = Math.pow(2,2);
    power=1;
    while (power!=maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position == 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb>0 ? 1 : 0) * power;
      power <<= 1;
    }

    switch (next = bits) {
      case 0:
          bits = 0;
          maxpower = Math.pow(2,8);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }
        c = f(bits);
        break;
      case 1:
          bits = 0;
          maxpower = Math.pow(2,16);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }
        c = f(bits);
        break;
      case 2:
        return "";
    }
    dictionary[3] = c;
    w = c;
    result.push(c);
    while (true) {
      if (data.index > length) {
        return "";
      }

      bits = 0;
      maxpower = Math.pow(2,numBits);
      power=1;
      while (power!=maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position == 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb>0 ? 1 : 0) * power;
        power <<= 1;
      }

      switch (c = bits) {
        case 0:
          bits = 0;
          maxpower = Math.pow(2,8);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }

          dictionary[dictSize++] = f(bits);
          c = dictSize-1;
          enlargeIn--;
          break;
        case 1:
          bits = 0;
          maxpower = Math.pow(2,16);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }
          dictionary[dictSize++] = f(bits);
          c = dictSize-1;
          enlargeIn--;
          break;
        case 2:
          return result.join('');
      }

      if (enlargeIn == 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits++;
      }

      if (dictionary[c]) {
        entry = dictionary[c];
      } else {
        if (c === dictSize) {
          entry = w + w.charAt(0);
        } else {
          return null;
        }
      }
      result.push(entry);

      // Add w+entry[0] to the dictionary.
      dictionary[dictSize++] = w + entry.charAt(0);
      enlargeIn--;

      w = entry;

      if (enlargeIn == 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits++;
      }

    }
  }
};
  return LZString;
})();

if (typeof define === 'function' && define.amd) {
  define(function () { return LZString; });
} else if( typeof module !== 'undefined' && module != null ) {
  module.exports = LZString
} else if( typeof angular !== 'undefined' && angular != null ) {
  angular.module('LZString', [])
  .factory('LZString', function () {
    return LZString;
  });
}

///<reference path='./mutation-summary.ts'/>
///<reference path='../lib/lz-string/index.js'/>
var TreeMirror = /** @class */ (function () {
    function TreeMirror(root, delegate) {
        this.root = root;
        this.delegate = delegate;
        this.idMap = {};
    }
    TreeMirror.prototype.initialize = function (rootId, children) {
        this.idMap[rootId] = this.root;
        for (var i = 0; i < children.length; i++)
            this.deserializeNode(children[i], this.root);
    };
    TreeMirror.prototype.applyChanged = function (removed, addedOrMoved, attributes, text) {
        var _this = this;
        // NOTE: Applying the changes can result in an attempting to add a child
        // to a parent which is presently an ancestor of the parent. This can occur
        // based on random ordering of moves. The way we handle this is to first
        // remove all changed nodes from their parents, then apply.
        addedOrMoved.forEach(function (data) {
            var node = _this.deserializeNode(data);
            var parent = _this.deserializeNode(data.parentNode);
            var previous = _this.deserializeNode(data.previousSibling);
            if (node.parentNode)
                node.parentNode.removeChild(node);
        });
        removed.forEach(function (data) {
            var node = _this.deserializeNode(data);
            if (node.parentNode)
                node.parentNode.removeChild(node);
        });
        addedOrMoved.forEach(function (data) {
            var node = _this.deserializeNode(data);
            var parent = _this.deserializeNode(data.parentNode);
            var previous = _this.deserializeNode(data.previousSibling);
            parent.insertBefore(node, previous ? previous.nextSibling : parent.firstChild);
        });
        attributes.forEach(function (data) {
            var node = _this.deserializeNode(data);
            Object.keys(data.attributes).forEach(function (attrName) {
                var newVal = data.attributes[attrName];
                try {
                    if (newVal === null) {
                        node.removeAttribute(attrName);
                    }
                    else {
                        if (!_this.delegate ||
                            !_this.delegate.setAttribute ||
                            !_this.delegate.setAttribute(node, attrName, newVal)) {
                            node.setAttribute(attrName, newVal);
                        }
                    }
                }
                catch (e) {
                }
            });
        });
        text.forEach(function (data) {
            var node = _this.deserializeNode(data);
            node.textContent = data.textContent;
        });
        removed.forEach(function (node) {
            delete _this.idMap[node.id];
        });
    };
    TreeMirror.prototype.deserializeNode = function (nodeData, parent) {
        var _this = this;
        if (nodeData === null)
            return null;
        var node = this.idMap[nodeData.id];
        if (node)
            return node;
        var doc = this.root.ownerDocument;
        if (doc === null)
            doc = this.root;
        switch (nodeData.nodeType) {
            case Node.COMMENT_NODE:
                node = doc.createComment(nodeData.textContent);
                break;
            case Node.TEXT_NODE:
                node = doc.createTextNode(nodeData.textContent);
                break;
            case Node.DOCUMENT_TYPE_NODE:
                node = doc.implementation.createDocumentType(nodeData.name, nodeData.publicId, nodeData.systemId);
                break;
            case Node.ELEMENT_NODE:
                if (this.delegate && this.delegate.createElement)
                    node = this.delegate.createElement(nodeData.tagName);
                if (!node)
                    node = doc.createElement(nodeData.tagName);
                Object.keys(nodeData.attributes).forEach(function (name) {
                    try {
                        if (!_this.delegate ||
                            !_this.delegate.setAttribute ||
                            !_this.delegate.setAttribute(node, name, nodeData.attributes[name])) {
                            node.setAttribute(name, nodeData.attributes[name]);
                        }
                    }
                    catch (e) {
                    }
                });
                break;
        }
        if (!node)
            throw "ouch";
        this.idMap[nodeData.id] = node;
        if (parent)
            parent.appendChild(node);
        if (nodeData.childNodes) {
            for (var i = 0; i < nodeData.childNodes.length; i++)
                this.deserializeNode(nodeData.childNodes[i], node);
        }
        return node;
    };
    return TreeMirror;
}());
var TreeMirrorClient = /** @class */ (function () {
    function TreeMirrorClient(target, mirror, testingQueries) {
        var _this = this;
        this.target = target;
        this.mirror = mirror;
        this.nextId = 1;
        this.knownNodes = new MutationSummary.NodeMap();
        var rootId = this.serializeNode(target).id;
        var children = [];
        for (var child = target.firstChild; child; child = child.nextSibling)
            children.push(this.serializeNode(child, true));
        this.mirror.initialize(rootId, children);
        var self = this;
        var queries = [{ all: true }];
        if (testingQueries)
            queries = queries.concat(testingQueries);
        this.mutationSummary = new MutationSummary({
            rootNode: target,
            callback: function (summaries) {
                _this.applyChanged(summaries);
            },
            queries: queries
        });
    }
    TreeMirrorClient.prototype.disconnect = function () {
        if (this.mutationSummary) {
            this.mutationSummary.disconnect();
            this.mutationSummary = undefined;
        }
    };
    TreeMirrorClient.prototype.rememberNode = function (node) {
        var id = this.nextId++;
        this.knownNodes.set(node, id);
        return id;
    };
    TreeMirrorClient.prototype.forgetNode = function (node) {
        this.knownNodes["delete"](node);
    };
    TreeMirrorClient.prototype.serializeNode = function (node, recursive) {
        if (node === null)
            return null;
        var id = this.knownNodes.get(node);
        if (id !== undefined) {
            return { id: id };
        }
        var data = {
            nodeType: node.nodeType,
            id: this.rememberNode(node)
        };
        switch (data.nodeType) {
            case Node.DOCUMENT_TYPE_NODE:
                var docType = node;
                data.name = docType.name;
                data.publicId = docType.publicId;
                data.systemId = docType.systemId;
                break;
            case Node.COMMENT_NODE:
            case Node.TEXT_NODE:
                data.textContent = node.textContent;
                break;
            case Node.ELEMENT_NODE:
                var elm = node;
                data.tagName = elm.tagName;
                data.attributes = {};
                for (var i = 0; i < elm.attributes.length; i++) {
                    var attr = elm.attributes[i];
                    data.attributes[attr.name] = attr.value;
                }
                if (elm.tagName == "SCRIPT" || elm.tagName == "NOSCRIPT") {
                    break;
                }
                if (recursive && elm.childNodes.length) {
                    data.childNodes = [];
                    for (var child = elm.firstChild; child; child = child.nextSibling)
                        data.childNodes.push(this.serializeNode(child, true));
                }
                break;
        }
        return this.compressNode(data);
    };
    TreeMirrorClient.prototype.serializeAddedAndMoved = function (added, reparented, reordered) {
        var _this = this;
        var all = added.concat(reparented).concat(reordered);
        var parentMap = new MutationSummary.NodeMap();
        all.forEach(function (node) {
            var parent = node.parentNode;
            var children = parentMap.get(parent);
            if (!children) {
                children = new MutationSummary.NodeMap();
                parentMap.set(parent, children);
            }
            children.set(node, true);
        });
        var moved = [];
        parentMap.keys().forEach(function (parent) {
            var children = parentMap.get(parent);
            var keys = children.keys();
            while (keys.length) {
                var node = keys[0];
                while (node.previousSibling && children.has(node.previousSibling))
                    node = node.previousSibling;
                while (node && children.has(node)) {
                    var data = _this.serializeNode(node);
                    data.previousSibling = _this.serializeNode(node.previousSibling);
                    data.parentNode = _this.serializeNode(node.parentNode);
                    moved.push(data);
                    children["delete"](node);
                    node = node.nextSibling;
                }
                var keys = children.keys();
            }
        });
        return moved;
    };
    TreeMirrorClient.prototype.serializeAttributeChanges = function (attributeChanged) {
        var _this = this;
        var map = new MutationSummary.NodeMap();
        Object.keys(attributeChanged).forEach(function (attrName) {
            attributeChanged[attrName].forEach(function (element) {
                var record = map.get(element);
                if (!record) {
                    record = _this.serializeNode(element);
                    record.attributes = {};
                    map.set(element, record);
                }
                record.attributes[attrName] = element.getAttribute(attrName);
            });
        });
        return map.keys().map(function (node) {
            return map.get(node);
        });
    };
    TreeMirrorClient.prototype.compressNode = function (node) {
        if (node["textContent"]) {
            node["textContent"] = LZString.compress(node["textContent"]);
            node.compressed = true;
        }
        return node;
    };
    TreeMirrorClient.prototype.applyChanged = function (summaries) {
        var _this = this;
        var summary = summaries[0];
        var removed = summary.removed.map(function (node) {
            return _this.serializeNode(node);
        });
        var moved = this.serializeAddedAndMoved(summary.added, summary.reparented, summary.reordered);
        var attributes = this.serializeAttributeChanges(summary.attributeChanged);
        var text = summary.characterDataChanged.map(function (node) {
            var data = _this.serializeNode(node);
            data.textContent = node.textContent;
            return data;
        });
        this.mirror.applyChanged(removed, moved, attributes, text);
        summary.removed.forEach(function (node) {
            _this.forgetNode(node);
        });
    };
    return TreeMirrorClient;
}());

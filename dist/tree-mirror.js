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
            if (node) {
                var parent = _this.deserializeNode(data.parentNode);
                var previous = _this.deserializeNode(data.previousSibling);
                if (node.parentNode)
                    node.parentNode.removeChild(node);
            }
        });
        removed.forEach(function (data) {
            var node = _this.deserializeNode(data);
            if (node) {
                if (node.parentNode)
                    node.parentNode.removeChild(node);
            }
        });
        addedOrMoved.forEach(function (data) {
            var node = _this.deserializeNode(data);
            if (node) {
                var parent = _this.deserializeNode(data.parentNode);
                var previous = _this.deserializeNode(data.previousSibling);
                if (parent) {
                    parent.insertBefore(node, previous ? previous.nextSibling : parent.firstChild);
                }
            }
        });
        attributes.forEach(function (data) {
            var node = _this.deserializeNode(data);
            if (node) {
                Object.keys(data.attributes).forEach(function (attrName) {
                    var newVal = LZString.decompressFromUTF16(data.attributes[attrName]);
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
            }
        });
        text.forEach(function (data) {
            var node = _this.deserializeNode(data);
            if (node) {
                node.textContent = data.textContent;
            }
        });
        removed.forEach(function (node) {
            delete _this.idMap[node.id];
        });
    };
    TreeMirror.prototype.decompressNode = function (node) {
        if (!node.c) {
            return node;
        }
        if (node.tC) {
            node.tC = LZString.decompressFromUTF16(node.tC);
        }
        if (node.a) {
            Object.keys(node.a).forEach(function (attributeName) {
                node.a[attributeName] = LZString.decompressFromUTF16(node.a[attributeName]);
            });
        }
        return node;
    };
    TreeMirror.prototype.deserializeNode = function (nodeData, parent) {
        var _this = this;
        if (nodeData === null)
            return null;
        var node = this.idMap[nodeData.i];
        if (node)
            return node;
        nodeData = this.decompressNode(nodeData);
        var doc = this.root.ownerDocument;
        if (doc === null)
            doc = this.root;
        switch (nodeData.nT) {
            case Node.COMMENT_NODE:
                node = doc.createComment(nodeData.tC);
                break;
            case Node.TEXT_NODE:
                node = doc.createTextNode(nodeData.tC);
                break;
            case Node.DOCUMENT_TYPE_NODE:
                node = doc.implementation.createDocumentType(nodeData.n, nodeData.p, nodeData.s);
                break;
            case Node.ELEMENT_NODE:
                if (this.delegate && this.delegate.createElement)
                    node = this.delegate.createElement(nodeData.tN);
                if (!node)
                    node = doc.createElement(nodeData.tN);
                Object.keys(nodeData.a).forEach(function (name) {
                    try {
                        if (!_this.delegate ||
                            !_this.delegate.setAttribute ||
                            !_this.delegate.setAttribute(node, name, nodeData.a[name])) {
                            node.setAttribute(name, nodeData.a[name]);
                        }
                    }
                    catch (e) {
                    }
                });
                break;
        }
        if (!node) {
            return null;
        }
        this.idMap[nodeData.i] = node;
        if (parent)
            parent.appendChild(node);
        if (nodeData.cN) {
            for (var i = 0; i < nodeData.cN.length; i++)
                this.deserializeNode(nodeData.cN[i], node);
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
        for (var child = target.firstChild; child; child = child.nextSibling) {
            var _node = this.serializeNode(child, true);
            if (_node != null) {
                children.push(_node);
            }
        }
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
            return {
                i: id
            };
        }
        var data = {
            nT: node.nodeType,
            i: this.rememberNode(node)
        };
        switch (data.nT) {
            case Node.DOCUMENT_TYPE_NODE:
                var docType = node;
                data.n = docType.name;
                data.p = docType.publicId;
                data.s = docType.systemId;
                break;
            case Node.COMMENT_NODE:
                return null;
            case Node.TEXT_NODE:
                data.tC = node.textContent;
                break;
            case Node.ELEMENT_NODE:
                var elm = node;
                data.tN = elm.tagName;
                data.a = {};
                for (var i = 0; i < elm.attributes.length; i++) {
                    var attr = elm.attributes[i];
                    data.a[attr.name] = attr.value;
                }
                if (elm.tagName == "SCRIPT" || elm.tagName == "NOSCRIPT"
                    || elm.tagName == "CANVAS") {
                    return null;
                }
                if (recursive && elm.childNodes.length) {
                    data.cN = [];
                    for (var child = elm.firstChild; child; child = child.nextSibling) {
                        var _node = this.serializeNode(child, true);
                        if (_node != null) {
                            data.cN.push(_node);
                        }
                    }
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
                    if (data != null) {
                        data.previousSibling = _this.serializeNode(node.previousSibling);
                        data.parentNode = _this.serializeNode(node.parentNode);
                        moved.push(data);
                        children["delete"](node);
                    }
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
                    if (record != null) {
                        record.attributes = {};
                        map.set(element, record);
                    }
                }
                if (record != null) {
                    record.attributes[attrName] = LZString.compressToUTF16(element.getAttribute(attrName));
                }
            });
        });
        return map.keys().map(function (node) {
            return map.get(node);
        });
    };
    TreeMirrorClient.prototype.compressNode = function (node) {
        if (node.tC || node.a) {
            node.c = 1;
        }
        if (node.tC) {
            node.tC = LZString.compressToUTF16(node.tC);
        }
        if (node.a) {
            Object.keys(node.a).forEach(function (attributeName) {
                node.a[attributeName] = LZString.compressToUTF16(node.a[attributeName]);
            });
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
            if (data != null) {
                data.tC = node.textContent;
            }
            return data;
        });
        this.mirror.applyChanged(removed, moved, attributes, text);
        summary.removed.forEach(function (node) {
            _this.forgetNode(node);
        });
    };
    return TreeMirrorClient;
}());
window.TreeMirror = TreeMirror;

///<reference path='./mutation-summary.ts'/>
///<reference path='../lib/lz-string/index.js'/>

// Copyright 2013 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

interface NodeData {
  i:number; //id
  nT?:number; //nodeType
  n?:string; //name
  p?:string; //publicId
  s?:string; //systemId
  tC?:string; //textContent
  tN?:string; //tagName
  a?:StringMap<string>; //attributes
  cN?:NodeData[]; //childNodes
  c:number //compressed
}

interface PositionData extends NodeData {
  previousSibling:NodeData;
  parentNode:NodeData;
}

interface AttributeData extends NodeData {
  attributes:StringMap<string>;
}

interface TextData extends NodeData{
  textContent:string;
}

class TreeMirror {

  private idMap:NumberMap<Node>;

  constructor(public root:Node, public delegate?:any) {
    this.idMap = {};
  }

  initialize(rootId:number, children:NodeData[]) {
    this.idMap[rootId] = this.root;

    for (var i = 0; i < children.length; i++)
      this.deserializeNode(children[i], <Element>this.root);
  }

  applyChanged(removed:NodeData[],
               addedOrMoved:PositionData[],
               attributes:AttributeData[],
               text:TextData[]) {

    // NOTE: Applying the changes can result in an attempting to add a child
    // to a parent which is presently an ancestor of the parent. This can occur
    // based on random ordering of moves. The way we handle this is to first
    // remove all changed nodes from their parents, then apply.
    addedOrMoved.forEach((data:PositionData) => {
      var node = this.deserializeNode(data);

      if (node) {
        var parent = this.deserializeNode(data.parentNode);
        var previous = this.deserializeNode(data.previousSibling);
        if (node.parentNode)
          node.parentNode.removeChild(node);
      }
    });

    removed.forEach((data:NodeData) => {
      var node = this.deserializeNode(data);

      if (node) {
        if (node.parentNode)
          node.parentNode.removeChild(node);
      }
    });

    addedOrMoved.forEach((data:PositionData) => {
      var node = this.deserializeNode(data);

      if (node) {
        var parent = this.deserializeNode(data.parentNode);
        var previous = this.deserializeNode(data.previousSibling);

        if (parent) {
          parent.insertBefore(node,
                            previous ? previous.nextSibling : parent.firstChild);
        }
      }
    });

    attributes.forEach((data:AttributeData) => {
      var node = <Element> this.deserializeNode(data);

      if (node) {
        Object.keys(data.attributes).forEach((attrName) => {
          var newVal = LZString.decompressFromUTF16(data.attributes[attrName]);

          try {
            if (newVal === null) {
              node.removeAttribute(attrName);
            } else {
              if (!this.delegate ||
                !this.delegate.setAttribute ||
                !this.delegate.setAttribute(node, attrName, newVal)) {
                node.setAttribute(attrName, newVal);
              }
            }
          } catch(e) {

          }
        });
      }
    });

    text.forEach((data:TextData) => {
      var node = this.deserializeNode(data);

      if (node) {
        node.textContent = data.textContent;
      }
    });

    removed.forEach((node:NodeData) => {
      delete this.idMap[node.id];
    });
  }

  private decompressNode(node: NodeData): NodeData {
    if (!node.c) {
      return node;
    }

    if (node.tC) {
       node.tC = LZString.decompressFromUTF16(node.tC);
    }

    if (node.a) {
      Object.keys(node.a).forEach((attributeName : string) => {
        node.a[attributeName] = LZString.decompressFromUTF16(node.a[attributeName]);
      });
    }

    return node;
  }


  private deserializeNode(nodeData:NodeData, parent?:Element):Node {
    if (nodeData === null)
      return null;

    var node:Node = this.idMap[nodeData.i];
    if (node)
      return node;

    nodeData = this.decompressNode(nodeData);

    var doc = this.root.ownerDocument;
    if (doc === null)
      doc = <HTMLDocument>this.root;

    switch(nodeData.nT) {
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

        Object.keys(nodeData.a).forEach((name) => {
          try {
            if (!this.delegate ||
              !this.delegate.setAttribute ||
              !this.delegate.setAttribute(node, name, nodeData.a[name])) {
              (<Element>node).setAttribute(name, nodeData.a[name]);
            }
          } catch(e) {

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
        this.deserializeNode(nodeData.cN[i], <Element>node);
    }

    return node;
  }
}

class TreeMirrorClient {
  private nextId:number;

  private mutationSummary:MutationSummary;
  private knownNodes:NodeMap<number>;

  constructor(public target:Node, public mirror:any, testingQueries:Query[]) {
    this.nextId = 1;
    this.knownNodes = new MutationSummary.NodeMap<number>();

    var rootId = this.serializeNode(target).id;
    var children:NodeData[] = [];
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
      callback: (summaries:Summary[]) => {
        this.applyChanged(summaries);
      },
      queries: queries
    });
  }


  disconnect() {
    if (this.mutationSummary) {
      this.mutationSummary.disconnect();
      this.mutationSummary = undefined;
    }
  }

  private rememberNode(node:Node):number {
    var id = this.nextId++;
    this.knownNodes.set(node, id);
    return id;
  }

  private forgetNode(node:Node) {
    this.knownNodes.delete(node);
  }

  private serializeNode(node:Node, recursive?:boolean):NodeData {
    if (node === null)
      return null;

    var id = this.knownNodes.get(node);
    if (id !== undefined) {
      return {
        i: id
      };
    }

    var data:NodeData = {
      nT: node.nodeType,
      i: this.rememberNode(node)
    };

    switch(data.nT) {
      case Node.DOCUMENT_TYPE_NODE:
        var docType = <DocumentType>node;
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
        var elm = <Element>node;
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
  }

  private serializeAddedAndMoved(added:Node[],
                                 reparented:Node[],
                                 reordered:Node[]):PositionData[] {
    var all = added.concat(reparented).concat(reordered);

    var parentMap = new MutationSummary.NodeMap<NodeMap<boolean>>();

    all.forEach((node) => {
      var parent = node.parentNode;
      var children = parentMap.get(parent)
      if (!children) {
        children = new MutationSummary.NodeMap<boolean>();
        parentMap.set(parent, children);
      }

      children.set(node, true);
    });

    var moved:PositionData[] = [];

    parentMap.keys().forEach((parent) => {
      var children = parentMap.get(parent);

      var keys = children.keys();
      while (keys.length) {
        var node = keys[0];
        while (node.previousSibling && children.has(node.previousSibling))
          node = node.previousSibling;

        while (node && children.has(node)) {
          var data = <PositionData>this.serializeNode(node);

          if (data != null) {
            data.previousSibling = this.serializeNode(node.previousSibling);
            data.parentNode = this.serializeNode(node.parentNode);
            moved.push(<PositionData>data);
            children.delete(node);
          }
          node = node.nextSibling;
        }

        var keys = children.keys();
      }
    });

    return moved;
  }

  private serializeAttributeChanges(attributeChanged:StringMap<Element[]>):AttributeData[] {
    var map = new MutationSummary.NodeMap<AttributeData>();

    Object.keys(attributeChanged).forEach((attrName) => {
      attributeChanged[attrName].forEach((element) => {
        var record = map.get(element);
        if (!record) {
          record = <AttributeData>this.serializeNode(element);

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

    return map.keys().map((node:Node) => {
      return map.get(node);
    });
  }

  private compressNode(node: NodeData): NodeData {
    if (node.tC || node.a) {
      node.c = 1;
    }

    if (node.tC) {
       node.tC = LZString.compressToUTF16(node.tC);
    }

    if (node.a) {
      Object.keys(node.a).forEach((attributeName : string) => {
        node.a[attributeName] = LZString.compressToUTF16(node.a[attributeName]);
      });
    }

    return node;
  }

  applyChanged(summaries:Summary[]) {
    var summary:Summary = summaries[0]

    var removed:NodeData[] = summary.removed.map((node:Node) => {
      return this.serializeNode(node);
    });

    var moved:PositionData[] =
        this.serializeAddedAndMoved(summary.added,
                                    summary.reparented,
                                    summary.reordered);

    var attributes:AttributeData[] =
        this.serializeAttributeChanges(summary.attributeChanged);

    var text:TextData[] = summary.characterDataChanged.map((node:Node) => {
      var data = this.serializeNode(node);
      if (data != null) {
        data.tC = node.textContent;
      }
      return <TextData>data;
    });

    this.mirror.applyChanged(removed, moved, attributes, text);

    summary.removed.forEach((node:Node) => {
      this.forgetNode(node);
    });
  }
}

window.TreeMirror = TreeMirror;
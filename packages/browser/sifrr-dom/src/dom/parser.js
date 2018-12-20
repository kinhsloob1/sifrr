const { makeChildrenEqual } = require('./makeequal');
const { updateAttribute } = require('./update');
const Ref = require('./ref');
const SIFRR_NODE = window.document.createElement('sifrr-node'),
  TEXT_NODE = 3,
  COMMENT_NODE = 8,
  ELEMENT_NODE = 1;

function isHtml(el) {
  return (el.dataset && el.dataset.sifrrHtml == 'true') || el.contentEditable == 'true' || el.nodeName == 'TEXTAREA' || el.nodeName == 'STYLE';
}

function createStateMap(el) {
  if (el.nodeType === TEXT_NODE) {
    // text node
    const x = el.nodeValue;
    if (x.indexOf('${') > -1) return {
      html: false,
      text: x
    };
  } else if (el.nodeType === COMMENT_NODE && el.nodeValue.trim()[0] == '$') {
    // comment
    return {
      html: false,
      text: el.nodeValue.trim()
    };
  } else if (el.nodeType === ELEMENT_NODE) {
    const ref = {};
    // Html ?
    if (isHtml(el)) {
      ref.html = true;
      ref.text = el.innerHTML.replace(/<!--(.*)-->/g, '$1');
    }
    // attributes
    const attrs = el.attributes || [], l = attrs.length;
    const attrStateMap = {};
    for(let i = 0; i < l; i++) {
      const attribute = attrs[i];
      if (attribute.value.indexOf('${') > -1) {
        attrStateMap[attribute.name] = attribute.value;
      }
    }
    if (Object.keys(attrStateMap).length > 0) ref.attributes = attrStateMap;

    if (Object.keys(ref).length > 0) return ref;
  }
  return 0;
}

const Parser = {
  collectRefs: (el, stateMap) => Ref.collect(el, stateMap, isHtml),
  createStateMap: function(element) {
    let node;
    if (element.useShadowRoot) node = element.shadowRoot;
    else node = element;

    return Ref.create(node, createStateMap, isHtml);
  },
  updateState: function(element) {
    if (!element._refs) {
      return false;
    }
    // Update nodes
    const l = element._refs.length;
    for (let i = 0; i < l; i++) {

      const ref = element._refs[i];

      // update attributes
      if (ref.data.attributes) {
        for(let key in ref.data.attributes) {
          const val = Parser.evaluateString(ref.data.attributes[key], element);
          updateAttribute(ref.dom, key, val);
        }
      }

      if (ref.data.html === undefined) continue;

      // update element
      const oldHTML = ref.dom.innerHTML;
      const newHTML = Parser.evaluateString(ref.data.text, element);
      if (oldHTML == newHTML) continue;
      if (newHTML === undefined) { ref.dom.textContent = ''; continue; }

      if (ref.data.html) {
        // html node
        let children;
        if (Array.isArray(newHTML)) {
          children = newHTML;
        } else if (newHTML.nodeType) {
          children = [newHTML];
        } else {
          const docFrag = SIFRR_NODE.cloneNode();
          docFrag.innerHTML = newHTML.toString()
            .replace(/&amp;/g, '&')
            .replace(/&nbsp;/g, ' ')
            .replace(/(&lt;)(((?!&gt;).)*)(&gt;)(((?!&lt;).)*)(&lt;)\/(((?!&gt;).)*)(&gt;)/g, '<$2>$5</$8>')
            .replace(/(&lt;)(input|link|img|br|hr|col|keygen)(((?!&gt;).)*)(&gt;)/g, '<$2$3>');
          children = docFrag.childNodes;
        }
        if (children.length < 1) ref.dom.textContent = '';
        else makeChildrenEqual(ref.dom, children);
      } else {
        // text node
        if (ref.dom.nodeValue != newHTML) {
          ref.dom.nodeValue = newHTML;
        }
      }

    }

    if (typeof this.onStateUpdate === 'function') this.onStateUpdate();
  },
  twoWayBind: function(e) {
    const target = e.path ? e.path[0] : e.target;
    if (!target.dataset.sifrrBind) return;
    const value = target.value === undefined ? target.innerHTML : target.value;
    let state = {};
    state[target.dataset.sifrrBind] = value;
    target.getRootNode().host.state = state;
  },
  evaluateString: function(string, element) {
    if (string.indexOf('${') < 0) return string;
    string = string.trim();
    if (string.match(/^\${([^{}$]|{([^{}$])*})*}$/)) return replacer(string);
    return replacer('`' + string + '`');

    function replacer(match) {
      if (match[0] == '$') match = match.slice(2, -1);
      let f;
      if (match.indexOf('return ') >= 0) {
        f = new Function(match).bind(element);
      } else {
        f = new Function('return ' + match).bind(element);
      }
      return f();
    }
  }
};

module.exports = Parser;

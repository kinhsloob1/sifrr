class SFComponent {
  constructor(element, href = null){
    href = typeof href === "string" ? href : '/elements/' + element + '.html';
    if(Array.isArray(element)){
      return element.map(e => new SFComponent(e));
    } else if (typeof element == 'object'){
      return Object.keys(element).map(k => new SFComponent(k, element[k]));
    }
    createComponent(element, href, this);
  }
  static replaceBindData(target){
    let element = target.tagName.toLowerCase();
    let c = SFComponent[element];
    if (!c) return;
    let bind = target.bind;
    this.replaceNode(c.originalNode, target.shadowRoot, {bind: bind});
    if (typeof c.bindDataChangeCallback === "function") {
      c.bindDataChangeCallback(this);
    }
  }
  static replaceNode(originalNode, oldNode, {bind = {}, route = {}} = {}){
    if (!originalNode || !oldNode){
      return;
    }
    let originalChilds = originalNode.childNodes;
    let oldChilds = oldNode.childNodes;
    this.replaceAttribute(originalNode, oldNode, {bind: bind, route: route});
    if(originalNode.innerHTML == oldNode.innerHTML){
      oldNode.original = true;
    }
    if (originalNode.innerHTML.indexOf('${') < 0){
      return;
    }
    let replacing = [], j = 0;
    originalChilds.forEach((v, i) => {
      while(oldChilds[j].skip || (oldChilds[j].dataset && oldChilds[j].dataset.skip)){
        j++;
      }
      if(v.nodeType === 3){
        if (v.isEqualNode(oldChilds[j])){
          oldChilds[j].original = true;
        }
        let val = v.nodeValue;
        if (val.indexOf('${') > -1) {
          replacing[i] = {replaced: [], replacer: []};
          if(oldChilds[j].original){
            replacing[i].replaced.push(oldChilds[j]);
          } else {
            while (oldChilds[j] && !oldChilds[j].original){
              replacing[i].replaced.push(oldChilds[j]);
              j++;
            }
            j--;
          }
          let newV = SFComponent.evaluateString(val, {bind: bind, route: route});
          let body = document.createElement('body');
          body.innerHTML = newV;
          if (replacing[i].replaced.length === 1 && body.childNodes.length === 1){
            const remove = replacing[i].replaced[0];
            const add = body.childNodes[0];
            if (remove.nodeType === 3 && add.nodeType === 3){
              if (remove.nodeValue != add.nodeValue) {
                remove.nodeValue = add.nodeValue;
              }
            } else {
              remove.replaceWith(add);
            }
            replacing.splice(i, 1);
          } else {
            replacing[i].replacer.push(body);
          }
        }
      } else {
        SFComponent.replaceNode(v, oldChilds[j], {bind: bind, route: route});
      }
      j++;
    });
    replacing.forEach((v,i) => {
      let original = v.replaced.splice(0,1)[0];
      if (v.replaced.length > 0){
        v.replaced.forEach((a, i) => {
          if (a && a.nodeType){
            oldNode.removeChild(a);
          }
        });
      }
      original.replaceWith(...v.replacer[0].childNodes);
    });
  }
  static replaceAttribute(originalNode, oldNode, {bind = {}, route = {}} = {}){
    let originalAttributes = originalNode.attributes;
    if (!originalAttributes){
      return;
    }
    for(let i = 0; i < originalAttributes.length; i++){
      let v = originalAttributes[i].value;
      let n = originalAttributes[i].name;
      let newV = SFComponent.evaluateString(v, {bind: bind, route: route});
      let newN = SFComponent.evaluateString(n, {bind: bind, route: route});
      if (n === newN){
        if (newV !== oldNode.getAttribute(n)){
          oldNode.setAttribute(n, newV);
        }
      } else {
        oldNode.removeAttribute(n);
        if (newV !== oldNode.getAttribute(newN)){
          oldNode.setAttribute(newN, newV);
        }
      }
    }
  }
  static evaluateString(string, {bind = {}, route = {}} = {}){
    if (string.indexOf("${") < 0){
      return string;
    }
    return string.replace(/\${([^{}]*({[^}]*})*[^{}]*)*}/g, replacer);
    function replacer(match) {
      let g1 = match.slice(2, -1);
      function executeCode(){
        let f, text;
        if (g1.search('return') >= 0){
          f = new Function('bind', 'route', g1);
        } else {
          f = new Function('bind', 'route', 'return ' + g1);
        }
        try {
          text = tryStringify(f(bind, route));
        } catch (e) {
          console.log(e);
          text = match;
        }
        return text;
      }
      return executeCode();
    }
  }
  static clearbindData(target){
    target.bindValue = {};
    replaceBindData(target);
  }
  static absolute(base, relative) {
    var stack = base.split("/"),
        parts = relative.split("/");
    stack.pop();
    for (let i=0; i<parts.length; i++) {
        if (parts[i] == ".")
            continue;
        if (parts[i] == "..")
            stack.pop();
        else
            stack.push(parts[i]);
    }
    return stack.join("/");
  }
  static getRoutes(url){
    if (url[0] != '/') {
      url = '/' + url;
    }
    let qIndex = url.indexOf("?");
    if (qIndex != -1)
    {
        url = url.substring(0, qIndex);
    }
    return url.split("/");
  }
}

function createComponent(element, href, c){
  if(!element) {
    console.log('Error creating element: No element name.');
    return;
  } else if (window.customElements.get(element)) {
    console.log('Error creating element: Element already defined.');
    return;
  } else if (element.indexOf("-") < 1) {
    console.log('Error creating element: Element name must have one "-".');
    return;
  } else if (SFComponent[element]) {
    console.log('Error creating element: Element declaration in process.');
    return;
  }
  SFComponent[element] = c;
  let link = document.createElement('link');
  const cl = class extends HTMLElement {
    static get observedAttributes() {
      c.observedAttributes = c.observedAttributes || [];
      return c.observedAttributes;
    }
    constructor() {
      super();
      const template = link.import.querySelector('template');
      if (template.getAttribute("relative-url") == "true") {
        var base = link.href;
        let insideHtml = template.innerHTML;
        let href_regex = /href=['"]?((?!http)[a-zA-z.\/\-\_]+)['"]?/g;
        let src_regex = /src=['"]?((?!http)[a-zA-z.\/\-\_]+)['"]?/g;
        let newHtml = insideHtml.replace(href_regex, replacer);
        newHtml = newHtml.replace(src_regex, replacer);
        function replacer(match, g1) {
          return match.replace(g1, SFComponent.absolute(base, g1));
        }
        template.innerHTML = newHtml;
      }
      const shadowRoot = this.attachShadow({mode: 'open'})
        .appendChild(template.content.cloneNode(true));
      let x = document.createElement('body');
      x.appendChild(template.content.cloneNode(true));
      c.originalNode = x;
      if (typeof c.createdCallback === "function") {
        c.createdCallback(this);
      }
    }
    attributeChangedCallback(attrName, oldVal, newVal) {
      if (typeof c.attributeChangedCallback === "function") {
        c.attributeChangedCallback(this, attrName, oldVal, newVal);
      }
    }
    connectedCallback() {
      let defaultBind = c.defaultBind || {};
      let bv = this.bind || {};
      this.bind = Object.assign(defaultBind, bv);
      if (typeof c.connectedCallback === "function") {
        c.connectedCallback(this);
      }
    }
    disconnectedCallback() {
      if (typeof c.disconnectedCallback === "function") {
        c.disconnectedCallback(this);
      }
    }
  }
  link.rel = 'import';
  link.href = href;
  link.setAttribute('async', '');
  link.onload = function(e) {
    try {
      window.customElements.define(element, cl);
    } catch(e) {
      console.log(element, e);
      console.log(customElements.get(element));
    }
  }
  link.onerror = function(e) {
    console.log(e);
  }
  document.head.appendChild(link);
}
function stringify(data){
  return JSON.stringify(data).replace(new RegExp('"', 'g'),'&quot;')
}
function tryParseJSON(jsonString){
    try {
      var o = JSON.parse(jsonString);
      return o;
    }
    catch (e) {
      return jsonString;
    }
}
function tryStringify(json){
  if (typeof json === "string"){
    return json;
  } else {
    return JSON.stringify(json);
  }
}
Object.defineProperty(HTMLElement.prototype, "bind", {
  get(){
    return this.bindValue;
  },
  set(v){
    bv = this.bindValue || {};
    total = Object.assign(bv, v);
    this.bindValue = total;
    SFComponent.replaceBindData(this);
  }
});

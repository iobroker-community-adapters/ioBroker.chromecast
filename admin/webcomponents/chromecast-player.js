import{createRoot as e,useEffect as t,useRef as n,useState as r,jsx as i,jsxs as a}from"../../../lib/esm/react-19.js";var o=`iob-dialog-close`;function s(e){return!!e.form}var c=[`header`,`staticText`,`divider`];function l(e,t){return e==null?``:typeof e==`object`?e[t]||e.en||Object.values(e).find(e=>!!e)||``:String(e)}function u(e){let t={};for(let[n,r]of Object.entries(e.items||{}))r&&!c.includes(r.type)&&(t[n]=r.type);return t}function d(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?e.toString():JSON.stringify(e)}function f(e,t){if(t!=null)switch(e){case`number`:case`slider`:{if(typeof t==`number`)return Number.isFinite(t)?t:void 0;let e=d(t).trim().replace(`,`,`.`);if(!e)return;let n=Number(e);return Number.isFinite(n)?n:void 0}case`checkbox`:return t===!0||t===`true`||t===1||t===`1`;default:return d(t)}}function p(e,t){let n={};for(let[r,i]of Object.entries(e)){let e=f(i,t[r]);e!==void 0&&(n[r]=e)}return n}var m=`"Roboto", "Helvetica", "Arial", sans-serif`,h=Object.freeze({type:`light`,primary:`#3399CC`,primaryContrast:`#FFFFFF`,secondary:`#164477`,secondaryContrast:`#FFFFFF`,background:`#FFFFFF`,paper:`#FFFFFF`,text:`rgba(0, 0, 0, 0.87)`,textSecondary:`rgba(0, 0, 0, 0.6)`,divider:`rgba(0, 0, 0, 0.12)`,error:`#D32F2F`,warning:`#ED6C02`,info:`#0288D1`,success:`#2E7D32`,fontFamily:m,fontSize:14,borderRadius:4}),g=Object.freeze({type:`dark`,primary:`#4DABF5`,primaryContrast:`rgba(0, 0, 0, 0.87)`,secondary:`#436A93`,secondaryContrast:`#FFFFFF`,background:`#121212`,paper:`#121212`,text:`#FFFFFF`,textSecondary:`rgba(255, 255, 255, 0.7)`,divider:`rgba(255, 255, 255, 0.12)`,error:`#F44336`,warning:`#FFA726`,info:`#29B6F6`,success:`#66BB6A`,fontFamily:m,fontSize:14,borderRadius:4}),_=[`primary`,`primaryContrast`,`secondary`,`secondaryContrast`,`background`,`paper`,`text`,`textSecondary`,`divider`,`error`,`warning`,`info`,`success`,`fontFamily`],v=[`fontSize`,`borderRadius`];function y(e){return{...e===`dark`?g:h}}function b(e){if(!e||typeof e!=`object`)return y(typeof e==`string`?e:`light`);let t=e,n=y(typeof t.type==`string`?t.type:`light`);for(let e of _){let r=t[e];typeof r==`string`&&r.trim()&&(n[e]=r.trim())}for(let e of v){let r=t[e],i=typeof r==`string`?parseFloat(r):r;typeof i==`number`&&Number.isFinite(i)&&i>=0&&(n[e]=i)}return n}function x(e,t){return e.type===t.type&&_.every(n=>e[n]===t[n])&&v.every(n=>e[n]===t[n])}function S(e){return`--iob-${e.replace(/[A-Z]/g,e=>`-${e.toLowerCase()}`)}`}function C(e){let t={};for(let n of _)t[S(n)]=e[n];for(let n of v)t[S(n)]=`${e[n]}px`;return t[`color-scheme`]=e.type,t}var w={ok:{en:`OK`,"zh-cn":`确定`},cancel:{en:`Cancel`,de:`Abbrechen`,ru:`Отмена`,pt:`Cancelar`,nl:`Annuleren`,fr:`Annuler`,it:`Annulla`,es:`Cancelar`,pl:`Anuluj`,uk:`Скасувати`,"zh-cn":`取消`},close:{en:`Close`,de:`Schließen`,ru:`Закрыть`,pt:`Fechar`,nl:`Sluiten`,fr:`Fermer`,it:`Chiudi`,es:`Cerrar`,pl:`Zamknij`,uk:`Закрити`,"zh-cn":`关闭`}},T=`
dialog {
    box-sizing: border-box;
    width: 480px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    padding: 0;
    border: 0;
    border-radius: calc(var(--iob-border-radius) * 2);
    background: var(--iob-paper);
    color: var(--iob-text);
    font-family: var(--iob-font-family);
    font-size: var(--iob-font-size);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
/* as the dialogs of MUI: a dark paper gets lighter the higher it lies */
dialog.dark { background-image: linear-gradient(rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.16)); }
dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
dialog:focus { outline: none; }
form { display: flex; flex-direction: column; height: 100%; max-height: inherit; margin: 0; }
header { display: flex; align-items: center; gap: 8px; padding: 12px 8px 12px 16px; font-size: 1.15em; font-weight: 500; }
header span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.body { flex: 1; min-height: 0; padding: 0 16px 16px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
footer { display: flex; justify-content: flex-end; gap: 8px; padding: 0 16px 16px; }
button { font: inherit; padding: 6px 16px; border-radius: var(--iob-border-radius); border: 1px solid var(--iob-primary); background: transparent; color: var(--iob-primary); cursor: pointer; }
button.primary { background: var(--iob-primary); color: var(--iob-primary-contrast); }
button.close { border: 0; padding: 2px 8px; font-size: 1.4em; line-height: 1; color: var(--iob-text-secondary); }
label { display: flex; flex-direction: column; gap: 4px; }
label.check { flex-direction: row; align-items: center; gap: 8px; }
input, select, textarea { font: inherit; accent-color: var(--iob-primary); }
.help { color: var(--iob-text-secondary); font-size: 0.85em; }
h3 { margin: 4px 0 0; font-size: 1em; }
p { margin: 0; }
hr { width: 100%; border: 0; border-top: 1px solid var(--iob-divider); margin: 0; }
[hidden] { display: none !important; }
`;function E(e){if(!e)return null;try{let t=Function(`data`,`return (${e});`);return e=>{try{return!!t(e)}catch{return!1}}}catch{return null}}function D(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?String(e):``}function O(e){let{input:t,setting:n}=e;if(t)return t instanceof HTMLInputElement&&t.type===`checkbox`?t.checked:t instanceof HTMLSelectElement?n.options?.[t.selectedIndex]?.value:t.value}function k(e,t,n,r,i){let a={name:t,setting:n,box:e.createElement(`div`),hidden:E(n.hidden),disabled:E(n.disabled)},o=l(n.label,i);switch(n.type){case`header`:return a.box=e.createElement(`h3`),a.box.textContent=l(n.text,i)||o,a;case`staticText`:return a.box=e.createElement(`p`),a.box.textContent=l(n.text,i)||o,a;case`divider`:return a.box=e.createElement(`hr`),a}let s=e.createElement(`label`);a.box=s;let c=e.createElement(`span`);if(c.textContent=o||t,n.type===`checkbox`){let t=e.createElement(`input`);t.type=`checkbox`,t.checked=r===!0||r===`true`,s.className=`check`,s.append(t,c),a.input=t}else if(n.type===`select`){let t=e.createElement(`select`);for(let r of n.options||[]){let n=e.createElement(`option`);n.textContent=l(r.label,i),t.append(n)}let o=(n.options||[]).findIndex(e=>String(e.value)===D(r));t.selectedIndex=o===-1?0:o,s.append(c,t),a.input=t}else if(n.type===`text`&&(n.minRows||1)>1){let t=e.createElement(`textarea`);t.rows=n.minRows||2,t.value=D(r),s.append(c,t),a.input=t}else{let t=e.createElement(`input`),i=D(r);switch(n.type){case`number`:case`slider`:t.type=n.type===`slider`?`range`:`number`,n.min!==void 0&&(t.min=String(n.min)),n.max!==void 0&&(t.max=String(n.max)),t.step=n.step===void 0?`any`:String(n.step);break;case`password`:t.type=`password`;break;case`color`:t.type=!i||/^#[0-9a-f]{6}$/i.test(i)?`color`:`text`;break;default:t.type=`text`}if(t.value=i,t.type===`range`){let n=e.createElement(`output`);n.textContent=t.value,t.addEventListener(`input`,()=>n.textContent=t.value),c.append(`: `,n)}s.append(c,t),a.input=t}if(n.help){let t=e.createElement(`span`);t.className=`help`,t.textContent=l(n.help,i),s.append(t)}return a}function A(e,t={}){let n=t.lang||`en`,r=document,i=e=>w[e][n]||w[e].en||e,a=r.createElement(`div`);a.setAttribute(`data-iob-dialog`,``);let c=a.attachShadow({mode:`open`}),d=r.createElement(`style`);d.textContent=T;let f=r.createElement(`dialog`),m=b(t.theme);f.className=m.type===`dark`?`dark`:``;for(let[e,t]of Object.entries(C(m)))f.style.setProperty(e,t);e.width&&(f.style.width=`${e.width}px`),e.height&&(f.style.height=`${e.height}px`);let h=r.createElement(`form`),g=r.createElement(`header`),_=r.createElement(`span`);_.textContent=l(e.title,n);let v=r.createElement(`button`);v.type=`button`,v.className=`close`,v.title=i(`close`),v.setAttribute(`aria-label`,i(`close`)),v.textContent=`×`,g.append(_,v);let y=r.createElement(`div`);return y.className=`body`,h.append(g,y),f.append(h),c.append(d,f),new Promise(t=>{let d=!1,m=e=>{d||(d=!0,f.open&&f.close(),a.remove(),t(e))};if(v.addEventListener(`click`,()=>m(null)),f.addEventListener(`close`,()=>m(null)),h.addEventListener(`submit`,e=>e.preventDefault()),s(e)){let t={},a=[];for(let[t,i]of Object.entries(e.form.items||{})){let o=e.data?.[t]??i.default,s=k(r,t,i,o,n);a.push(s),y.append(s.box)}let o=()=>{for(let e of a)e.input&&(t[e.name]=O(e));return t},s=()=>{let e=o();for(let t of a)t.box.hidden=t.hidden?t.hidden(e):!1,t.input&&(t.input.disabled=t.disabled?t.disabled(e):!1)};h.addEventListener(`input`,s),h.addEventListener(`change`,s),s();let c=a.find(e=>e.input&&!e.box.hidden&&!e.input.disabled);c?.input&&(c.input.autofocus=!0);let d=r.createElement(`footer`),f=r.createElement(`button`);f.type=`button`,f.textContent=l(e.cancel,n)||i(`cancel`),f.addEventListener(`click`,()=>m(null));let g=r.createElement(`button`);g.type=`submit`,g.className=`primary`,g.textContent=l(e.ok,n)||i(`ok`),d.append(f,g),h.append(d),h.addEventListener(`submit`,()=>m(p(u(e.form),o())))}else y.append(e.element),f.addEventListener(o,e=>m(e.detail??null));r.body.append(a),f.showModal(),c.activeElement&&c.activeElement!==v||(f.tabIndex=-1,f.focus())})}function j(e){return[...new Set(e.filter(e=>typeof e==`string`&&!!e))]}var M=[`socket`,`dialogs`,`theme`,`editMode`,`settings`,`value`],N=class extends HTMLElement{states={};objects={};#e=null;#t={};#n=b(`light`);#r=!1;#i=null;#a=void 0;#o=null;#s=!1;#c=(e,t)=>{this.#o?.states.includes(e)&&(this.states[e]=t||null,this.#_())};#l=(e,t)=>{this.#o?.objects.includes(e)&&(this.objects[e]=t||null,this.#d())};get socket(){return this.#e}set socket(e){this.#e=e||null,this.#d()}get settings(){return this.#t}set settings(e){this.#t=e||{},this.#d()}get theme(){return this.#n}set theme(e){let t=b(e);x(t,this.#n)||(this.#n=t,this.#u(),this.#_())}get editMode(){return this.#r}set editMode(e){let t=!!e;t!==this.#r&&(this.#r=t,this.#_())}get dialogs(){return this.#i}set dialogs(e){this.#i=e||null}get value(){return this.#a}set value(e){e!==this.#a&&(this.#a=e,this.#_())}connectedCallback(){for(let e of M)if(Object.prototype.hasOwnProperty.call(this,e)){let t=this[e];delete this[e],this[e]=t}this.#u(),this.#d()}disconnectedCallback(){this.#g()}getStateIds(e){return[]}getObjectIds(e){return[]}get systemLang(){return this.#e?.systemLang||`en`}text(e){return l(e,this.systemLang)}setState(e,t){return this.#e&&!this.#r?this.#e.setState(e,t):Promise.resolve()}changeValue(e){return this.#r||this.emit(`iob-change`,e)?!1:(this.value=e,!0)}emit(e,t){return this.dispatchEvent(new CustomEvent(e,{detail:t,bubbles:!0,composed:!0,cancelable:!0}))}async openDialog(e){if(this.#r)return null;let t=this.#i?await this.#i.open(e):await A(e,{lang:this.systemLang,theme:this.#n});return s(e)?t&&typeof t==`object`?p(u(e.form),t):null:t??null}#u(){for(let[e,t]of Object.entries(C(this.#n)))this.style.setProperty(e,t)}#d(){if(!this.isConnected)return;let e=this.#e,t=e?j(this.getStateIds(this.#t)):[],n=e?j(this.getObjectIds(this.#t)):[];this.#o&&this.#o.socket!==e&&this.#g();let r=this.#o?.states||[],i=this.#o?.objects||[],a=r.filter(e=>!t.includes(e)),o=i.filter(e=>!n.includes(e)),s=t.filter(e=>!r.includes(e)),c=n.filter(e=>!i.includes(e));e&&a.length&&e.unsubscribeState(a,this.#c),e&&o.length&&this.#h(e,o);for(let e of a)delete this.states[e];for(let e of[...a,...o])!t.includes(e)&&!n.includes(e)&&delete this.objects[e];this.#o=e&&(t.length||n.length)?{socket:e,states:t,objects:n}:null,e&&s.length&&this.#p(e,s),e&&c.length&&this.#m(e,c),this.#_()}#f(e,t,n){return this.#o?.socket===e&&this.#o[t].includes(n)}#p(e,t){e.subscribeState(t,this.#c).catch(e=>console.warn(`<${this.localName}>: cannot subscribe ${t.join(`, `)}: ${e}`));for(let n of t)e.getState(n).then(t=>{this.#f(e,`states`,n)&&this.states[n]===void 0&&(this.states[n]=t||null,this.#_())}).catch(()=>{}),e.getObject(n).then(t=>{this.#f(e,`states`,n)&&!this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#_())}).catch(()=>{})}#m(e,t){e.subscribeObject(t,this.#l).catch(e=>console.warn(`<${this.localName}>: cannot subscribe the objects ${t.join(`, `)}: ${e}`));for(let n of t)e.getObject(n).then(t=>{this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#d())}).catch(()=>{})}#h(e,t){e.unsubscribeObject(t,this.#l).catch(()=>{})}#g(){if(this.#o){let{socket:e,states:t,objects:n}=this.#o;t.length&&e.unsubscribeState(t,this.#c),n.length&&this.#h(e,n),this.#o=null}this.states={},this.objects={}}#_(){this.#s||(this.#s=!0,queueMicrotask(()=>{this.#s=!1,this.isConnected&&this.render()}))}};function P(e,t){let n=typeof e==`string`?e:e.tag;customElements.get(n)||customElements.define(n,t)}var F={tag:`iob-chromecast-player`,module:`chromecast-player.js`,manifest:`chromecast-player.json`},I=[`status.connected`,`status.playerState`,`status.displayName`,`status.text`,`metadata.title`,`metadata.artist`,`metadata.album`,`metadata.cover`,`player.contentId`,`player.currentTime`,`player.duration`,`player.volume`,`player.mute`],L=[`Backdrop`,`Default Media Receiver`];function R(e){if(typeof e!=`string`)return null;let t=e.trim();return/^chromecast\.\d+\.[^.]/.test(t)?t:null}function z(e,t){return e?(typeof e==`string`?e:e[t]||e.en||``).replace(/_/g,` `):``}function B(e){if(!/^https?:\/\//.test(e))return``;try{let t=new URL(e),n=t.pathname.split(`/`).filter(Boolean).pop();return n?decodeURIComponent(n):t.host}catch{return``}}function V(e){let t=Math.max(0,Math.floor(e)),n=Math.floor(t/3600),r=Math.floor(t%3600/60),i=String(t%60).padStart(2,`0`);return n?`${n}:${String(r).padStart(2,`0`)}:${i}`:`${r}:${i}`}var H={play:`M8 5v14l11-7z`,pause:`M6 19h4V5H6v14zm8-14v14h4V5h-4z`,stop:`M6 6h12v12H6z`,next:`M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z`,previous:`M6 6h2v12H6zm3.5 6l8.5 6V6z`,volume:`M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z`,volumeOff:`M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z`,music:`M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z`,cast:`M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z`};function U({name:e}){return/* @__PURE__ */ i(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:/* @__PURE__ */ i(`path`,{d:H[e]})})}function W({value:e,label:a,disabled:o,onCommit:s}){let[c,l]=r(null),u=n(null),d=n(s),f=n(void 0);t(()=>{d.current=s}),t(()=>{let e=u.current;if(!e)return;let t=()=>{d.current(Number(e.value)),clearTimeout(f.current),f.current=setTimeout(()=>l(null),2e3)};return e.addEventListener(`change`,t),()=>{e.removeEventListener(`change`,t),clearTimeout(f.current)}},[]);let p=Math.min(100,Math.max(0,c??e));return/* @__PURE__ */ i(`input`,{ref:u,type:`range`,min:0,max:100,step:1,value:p,disabled:o,"aria-label":a,title:`${a}: ${p} %`,style:{"--fill":`${p}%`},onClick:e=>e.stopPropagation(),onChange:e=>{clearTimeout(f.current),l(Number(e.currentTarget.value))}})}function G({url:e}){let[t,n]=r(``);return/* @__PURE__ */ i(`div`,{className:`cover`,children:e&&e!==t?/* @__PURE__ */ i(`img`,{src:e,alt:``,draggable:!1,onError:()=>n(e)}):/* @__PURE__ */ i(U,{name:`music`})})}function K({icon:e,label:t,className:n,disabled:r,onClick:a}){return/* @__PURE__ */ i(`button`,{type:`button`,className:n,title:t,"aria-label":t,disabled:r,onClick:e=>{e.stopPropagation(),a()},children:/* @__PURE__ */ i(U,{name:e})})}function q({text:e,editMode:t}){return/* @__PURE__ */ a(`div`,{className:`hint${t?` edit`:``}`,children:[/* @__PURE__ */ i(U,{name:`cast`}),/* @__PURE__ */ i(`span`,{children:e})]})}function J({values:e,showCover:t,showSkip:n,showVolume:r,accent:o,editMode:s,word:c,onCommand:l}){let{connected:u,state:d}=e,f=d===`playing`||d===`buffering`,p=f||d===`paused`,m=u!==!1&&!s,h=c(u===!1?`offline`:d),g=u===!1?`offline`:f?`playing`:``,_=e.duration>0?Math.min(100,e.elapsed/e.duration*100):0;return/* @__PURE__ */ a(`div`,{className:`view player${u===!1?` offline`:``}${s?` edit`:``}`,style:{"--accent":o},children:[/* @__PURE__ */ a(`div`,{className:`head`,children:[t?/* @__PURE__ */ i(G,{url:p?e.cover:``}):null,/* @__PURE__ */ a(`div`,{className:`text`,children:[/* @__PURE__ */ a(`div`,{className:`name secondary`,children:[/* @__PURE__ */ i(`span`,{className:`dot ${g}`,title:h}),/* @__PURE__ */ a(`span`,{className:`ellipsis`,children:[e.name,` · `,h]})]}),/* @__PURE__ */ i(`div`,{className:`title${e.title?``:` muted`}`,title:e.title||c(`nothing`),children:e.title||c(`nothing`)}),e.subtitle?/* @__PURE__ */ i(`div`,{className:`sub secondary ellipsis`,title:e.subtitle,children:e.subtitle}):null]})]}),p&&e.duration>0?/* @__PURE__ */ a(`div`,{className:`seek secondary`,title:c(`position`),children:[/* @__PURE__ */ i(`span`,{children:V(e.elapsed)}),/* @__PURE__ */ i(`div`,{className:`bar`,children:/* @__PURE__ */ i(`div`,{style:{width:`${_}%`}})}),/* @__PURE__ */ i(`span`,{children:V(e.duration)})]}):null,/* @__PURE__ */ a(`div`,{className:`controls`,children:[/* @__PURE__ */ a(`div`,{className:`transport`,children:[n?/* @__PURE__ */ i(K,{icon:`previous`,label:c(`prev`),className:`skip small`,disabled:!m||!p,onClick:()=>l(`player.prev`,!0)}):null,f?/* @__PURE__ */ i(K,{icon:`pause`,label:c(`pause`),className:`main`,disabled:!m,onClick:()=>l(`player.pause`,!0)}):/* @__PURE__ */ i(K,{icon:`play`,label:c(`play`),className:`main`,disabled:!m,onClick:()=>l(d===`paused`?`player.play`:`status.playing`,!0)}),/* @__PURE__ */ i(K,{icon:`stop`,label:c(`stop`),disabled:!m||!p,onClick:()=>l(`player.stop`,!0)}),n?/* @__PURE__ */ i(K,{icon:`next`,label:c(`next`),className:`skip small`,disabled:!m||!p,onClick:()=>l(`player.next`,!0)}):null]}),r?/* @__PURE__ */ a(`div`,{className:`volume`,children:[/* @__PURE__ */ i(K,{icon:e.muted?`volumeOff`:`volume`,label:c(e.muted?`unmute`:`mute`),className:`small`,disabled:!m,onClick:()=>l(`player.mute`,!e.muted)}),/* @__PURE__ */ i(W,{value:e.volume,label:c(`volume`),disabled:!m,onCommit:e=>l(`player.volume`,e)})]}):null]})]})}var Y=`
:host {
    display: block;
    width: 100%;
    height: 100%;
}
* {
    box-sizing: border-box;
}
.mount {
    width: 100%;
    height: 100%;
    /* the size of the box does not depend on what is in it - the parts follow it, see the container queries */
    container-type: size;
}
.view {
    --hover: color-mix(in srgb, currentColor 10%, transparent);
    --track: color-mix(in srgb, currentColor 22%, transparent);
    --pad: clamp(4px, 3cqmin, 12px);
    --gap: clamp(4px, 2.5cqmin, 10px);
    --icon: clamp(18px, 8cqmin, 26px);
    width: 100%;
    height: 100%;
    padding: var(--pad);
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    overflow: hidden;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}
.edit {
    pointer-events: none;
}
.secondary {
    color: var(--iob-text-secondary);
}
.ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ---- buttons and slider ---- */
button {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    margin: 0;
    padding: calc(var(--icon) * 0.2);
    border-radius: 50%;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
}
button:hover:not(:disabled) {
    background: var(--hover);
}
button:disabled {
    cursor: default;
    opacity: 0.4;
}
button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
}
button svg {
    width: var(--icon);
    height: var(--icon);
    fill: currentColor;
    display: block;
}
button.small svg {
    width: calc(var(--icon) * 0.8);
    height: calc(var(--icon) * 0.8);
}
button.main {
    color: var(--accent);
    box-shadow: inset 0 0 0 2px var(--accent);
}
button.main svg {
    width: calc(var(--icon) * 1.25);
    height: calc(var(--icon) * 1.25);
}
input[type='range'] {
    --fill: 0%;
    /* a form control does not inherit the color; the thumb and the track are drawn in it */
    color: inherit;
    flex: 1;
    min-width: 0;
    height: 18px;
    margin: 0;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
}
input[type='range']:disabled {
    cursor: default;
    opacity: 0.4;
}
input[type='range']:focus-visible {
    outline: none;
}
input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--track) var(--fill));
}
input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -4px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
}
input[type='range']:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 4px var(--track);
}
input[type='range']::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: var(--track);
}
input[type='range']::-moz-range-progress {
    height: 4px;
    border-radius: 2px;
    background: var(--accent);
}
input[type='range']::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
}

/* ---- the player ---- */
.head {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    gap: calc(var(--gap) * 1.5);
}
.cover {
    height: 100%;
    max-height: 180px;
    max-width: 100%;
    aspect-ratio: 1;
    flex: none;
    border-radius: calc(var(--iob-border-radius) * 2);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--hover);
}
.cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
.cover svg {
    width: 45%;
    height: 45%;
    fill: currentColor;
    opacity: 0.35;
}
.text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8em;
}
.dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--iob-text-secondary);
}
.dot.playing {
    background: var(--iob-success);
}
.dot.offline {
    background: var(--iob-error);
}
.title {
    font-weight: 600;
    font-size: clamp(13px, 6cqmin, 18px);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
}
.title.muted {
    color: var(--iob-text-secondary);
    font-weight: 400;
}
.sub {
    font-size: 0.85em;
}
.seek {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75em;
    font-variant-numeric: tabular-nums;
}
.bar {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--track);
    overflow: hidden;
}
.bar > div {
    height: 100%;
    background: var(--accent);
}
.controls {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--gap);
}
.transport {
    display: flex;
    align-items: center;
    gap: calc(var(--gap) / 2);
}
.volume {
    flex: 1 1 120px;
    max-width: 240px;
    display: flex;
    align-items: center;
    gap: 2px;
}
.offline .cover,
.offline .seek,
.offline .controls {
    opacity: 0.5;
}

/* a narrow box: previous / next go first */
@container (max-width: 279px) {
    .skip {
        display: none;
    }
}

/* a strip: one row - cover, what plays, the transport */
@container (max-height: 129px) {
    .view {
        flex-direction: row;
        align-items: center;
    }
    .head {
        height: 100%;
    }
    .seek,
    .volume {
        display: none;
    }
    .controls {
        flex-wrap: nowrap;
    }
}
@container (max-height: 69px) {
    .name,
    .sub {
        display: none;
    }
    .title {
        -webkit-line-clamp: 1;
    }
}

/* tall and narrow: the cover above, the text below it */
@container (min-height: 300px) and (orientation: portrait) {
    .head {
        flex-direction: column;
        justify-content: center;
    }
    .cover {
        max-height: none;
        flex: 1 1 0;
        min-height: 0;
        height: auto;
    }
    .text {
        flex: none;
        width: 100%;
        text-align: center;
    }
    .name {
        justify-content: center;
    }
    .controls {
        justify-content: center;
    }
}

/* ---- no device ---- */
.hint {
    width: 100%;
    height: 100%;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    color: var(--iob-text-secondary);
    font-size: clamp(11px, 5cqmin, 15px);
}
.hint svg {
    width: clamp(18px, 10cqmin, 30px);
    height: clamp(18px, 10cqmin, 30px);
    fill: currentColor;
}
`,X={en:{play:`Play`,pause:`Pause`,stop:`Stop`,prev:`Previous`,next:`Next`,volume:`Volume`,mute:`Mute`,unmute:`Unmute`,nothing:`Nothing is playing`,noDevice:`Choose a Cast device in the settings`,notFound:`Cast device not found`,offline:`Not connected`,playing:`Playing`,paused:`Paused`,buffering:`Loading`,idle:`Idle`,position:`Position`},de:{play:`Abspielen`,pause:`Pause`,stop:`Stopp`,prev:`Zurück`,next:`Weiter`,volume:`Lautstärke`,mute:`Stumm`,unmute:`Ton an`,nothing:`Es wird nichts abgespielt`,noDevice:`Cast-Gerät in den Einstellungen wählen`,notFound:`Cast-Gerät nicht gefunden`,offline:`Nicht verbunden`,playing:`Spielt`,paused:`Pausiert`,buffering:`Lädt`,idle:`Bereit`,position:`Position`},ru:{play:`Воспроизвести`,pause:`Пауза`,stop:`Стоп`,prev:`Назад`,next:`Вперёд`,volume:`Громкость`,mute:`Без звука`,unmute:`Включить звук`,nothing:`Ничего не воспроизводится`,noDevice:`Выберите Cast-устройство в настройках`,notFound:`Cast-устройство не найдено`,offline:`Нет соединения`,playing:`Воспроизводится`,paused:`На паузе`,buffering:`Загрузка`,idle:`Ожидание`,position:`Позиция`},pt:{play:`Reproduzir`,pause:`Pausa`,stop:`Parar`,prev:`Anterior`,next:`Seguinte`,volume:`Volume`,mute:`Silenciar`,unmute:`Ativar som`,nothing:`Nada em reprodução`,noDevice:`Escolha um dispositivo Cast nas configurações`,notFound:`Dispositivo Cast não encontrado`,offline:`Não ligado`,playing:`A reproduzir`,paused:`Em pausa`,buffering:`A carregar`,idle:`Inativo`,position:`Posição`},nl:{play:`Afspelen`,pause:`Pauze`,stop:`Stoppen`,prev:`Vorige`,next:`Volgende`,volume:`Volume`,mute:`Dempen`,unmute:`Dempen opheffen`,nothing:`Er wordt niets afgespeeld`,noDevice:`Kies een Cast-apparaat in de instellingen`,notFound:`Cast-apparaat niet gevonden`,offline:`Niet verbonden`,playing:`Speelt`,paused:`Gepauzeerd`,buffering:`Laden`,idle:`Inactief`,position:`Positie`},fr:{play:`Lecture`,pause:`Pause`,stop:`Arrêt`,prev:`Précédent`,next:`Suivant`,volume:`Volume`,mute:`Couper le son`,unmute:`Rétablir le son`,nothing:`Aucune lecture en cours`,noDevice:`Choisissez un appareil Cast dans les paramètres`,notFound:`Appareil Cast introuvable`,offline:`Non connecté`,playing:`En lecture`,paused:`En pause`,buffering:`Chargement`,idle:`Inactif`,position:`Position`},it:{play:`Riproduci`,pause:`Pausa`,stop:`Stop`,prev:`Precedente`,next:`Successivo`,volume:`Volume`,mute:`Disattiva audio`,unmute:`Riattiva audio`,nothing:`Nessuna riproduzione`,noDevice:`Scegli un dispositivo Cast nelle impostazioni`,notFound:`Dispositivo Cast non trovato`,offline:`Non connesso`,playing:`In riproduzione`,paused:`In pausa`,buffering:`Caricamento`,idle:`Inattivo`,position:`Posizione`},es:{play:`Reproducir`,pause:`Pausa`,stop:`Detener`,prev:`Anterior`,next:`Siguiente`,volume:`Volumen`,mute:`Silenciar`,unmute:`Activar sonido`,nothing:`No se está reproduciendo nada`,noDevice:`Elija un dispositivo Cast en la configuración`,notFound:`Dispositivo Cast no encontrado`,offline:`No conectado`,playing:`Reproduciendo`,paused:`En pausa`,buffering:`Cargando`,idle:`Inactivo`,position:`Posición`},pl:{play:`Odtwórz`,pause:`Pauza`,stop:`Stop`,prev:`Poprzedni`,next:`Następny`,volume:`Głośność`,mute:`Wycisz`,unmute:`Włącz dźwięk`,nothing:`Nic nie jest odtwarzane`,noDevice:`Wybierz urządzenie Cast w ustawieniach`,notFound:`Nie znaleziono urządzenia Cast`,offline:`Brak połączenia`,playing:`Odtwarzanie`,paused:`Wstrzymano`,buffering:`Ładowanie`,idle:`Bezczynny`,position:`Pozycja`},uk:{play:`Відтворити`,pause:`Пауза`,stop:`Стоп`,prev:`Назад`,next:`Далі`,volume:`Гучність`,mute:`Вимкнути звук`,unmute:`Увімкнути звук`,nothing:`Нічого не відтворюється`,noDevice:`Виберіть Cast-пристрій у налаштуваннях`,notFound:`Cast-пристрій не знайдено`,offline:`Немає з’єднання`,playing:`Відтворюється`,paused:`На паузі`,buffering:`Завантаження`,idle:`Очікування`,position:`Позиція`},"zh-cn":{play:`播放`,pause:`暂停`,stop:`停止`,prev:`上一个`,next:`下一个`,volume:`音量`,mute:`静音`,unmute:`取消静音`,nothing:`没有正在播放的内容`,noDevice:`请在设置中选择 Cast 设备`,notFound:`未找到 Cast 设备`,offline:`未连接`,playing:`正在播放`,paused:`已暂停`,buffering:`正在加载`,idle:`空闲`,position:`位置`}};function Z(e){let t=X[e]||{},n=X.en||{};return e=>t[e]||n[e]||e}var Q=class extends N{#e;#t=null;#n;#r=null;constructor(){super();let e=this.attachShadow({mode:`open`}),t=document.createElement(`style`);t.textContent=Y,this.#e=document.createElement(`div`),this.#e.className=`mount`,e.append(t,this.#e)}disconnectedCallback(){super.disconnectedCallback(),this.#a(!1),queueMicrotask(()=>{!this.isConnected&&this.#t&&(this.#t.unmount(),this.#t=null)})}getStateIds(e){let t=R(e.device);return t?I.map(e=>`${t}.${e}`):[]}getObjectIds(e){let t=R(e.device);return t?[t]:[]}render(){this.isConnected&&(this.#t||=e(this.#e),this.#t.render(this.#l()))}get#i(){let e=this.systemLang;return this.#r?.lang!==e&&(this.#r={lang:e,word:Z(e)}),this.#r.word}#a(e){e&&!this.#n?this.#n=setInterval(()=>this.render(),1e3):!e&&this.#n&&(clearInterval(this.#n),this.#n=void 0)}#o(e,t){return this.states[`${e}.${t}`]}#s(e,t){let n=this.#o(e,t)?.val;return n==null?``:String(n)}#c(e,t){let n=this.#o(e,`status.connected`)?.val,r=n==null?null:!!n,i=this.#s(e,`status.playerState`),a=i===`playing`||i===`paused`||i===`buffering`?i:`idle`,o=a!==`idle`,s=this.#s(e,`status.displayName`),c=!s||L.includes(s),l=``,u=``;o?(l=this.#s(e,`metadata.title`)||B(this.#s(e,`player.contentId`))||this.#s(e,`status.text`)||s,u=[this.#s(e,`metadata.artist`),this.#s(e,`metadata.album`)].filter(Boolean).join(` · `)||(c||s===l?``:s)):!c&&r!==!1&&(l=s,u=this.#s(e,`status.text`));let d=Number(this.#o(e,`player.duration`)?.val)||0,f=this.#o(e,`player.currentTime`),p=Number(f?.val)||0;if(a===`playing`&&f){let t=Math.max(f.ts||0,this.#o(e,`status.playerState`)?.ts||0);p+=Math.max(0,(Date.now()-t)/1e3)}d>0&&(p=Math.min(p,d));let m=this.objects[e];return{name:typeof t.title==`string`&&t.title.trim()||z(m?.common?.name,this.systemLang)||e.split(`.`).slice(2).join(`.`),connected:r,state:a,title:l,subtitle:u,cover:this.#s(e,`metadata.cover`),elapsed:p,duration:d,volume:Number(this.#o(e,`player.volume`)?.val)||0,muted:!!this.#o(e,`player.mute`)?.val}}#l(){let e=this.settings,t=R(e.device);if(!t||this.objects[t]===null)return this.#a(!1),/* @__PURE__ */ i(q,{text:this.#i(t?`notFound`:`noDevice`),editMode:this.editMode});let n=this.#c(t,e);this.#a(n.state===`playing`&&n.duration>0&&!this.editMode);let r=typeof e.accent==`string`&&e.accent.trim();return/* @__PURE__ */ i(J,{values:n,showCover:e.showCover!==!1,showSkip:e.showSkip!==!1,showVolume:e.showVolume!==!1,accent:r||`var(--iob-primary)`,editMode:this.editMode,word:this.#i,onCommand:(e,n)=>void this.setState(`${t}.${e}`,n)})}};P(F.tag,Q);
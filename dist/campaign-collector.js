!function(t,e){"object"==typeof exports&&"object"==typeof module?module.exports=e():"function"==typeof define&&define.amd?define([],e):"object"==typeof exports?exports.CampaignCollector=e():t.CampaignCollector=e()}(this,(()=>(()=>{"use strict";var t={d:(e,i)=>{for(var s in i)t.o(i,s)&&!t.o(e,s)&&Object.defineProperty(e,s,{enumerable:!0,get:i[s]})},o:(t,e)=>Object.prototype.hasOwnProperty.call(t,e)},e={};function i(t,e,i){return(e=function(t){var e=function(t,e){if("object"!=typeof t||!t)return t;var i=t[Symbol.toPrimitive];if(void 0!==i){var s=i.call(t,e||"default");if("object"!=typeof s)return s;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===e?String:Number)(t)}(t,"string");return"symbol"==typeof e?e:e+""}(e))in t?Object.defineProperty(t,e,{value:i,enumerable:!0,configurable:!0,writable:!0}):t[e]=i,t}function s(t,e,i){o(t,e),e.set(t,i)}function o(t,e){if(e.has(t))throw new TypeError("Cannot initialize the same private elements twice on an object")}function n(t,e,i){return t.set(l(t,e),i),i}function a(t,e){return t.get(l(t,e))}function l(t,e,i){if("function"==typeof t?t===e:t.has(e))return arguments.length<3?e:i;throw new TypeError("Private element is not present on this object")}t.d(e,{default:()=>w});var r=new WeakMap,c=new WeakMap,h=new WeakMap,u=new WeakMap,f=new WeakMap,p=new WeakMap,d=new WeakMap,m=new WeakMap,g=new WeakSet;class w{static create(){let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:null;const e=new w(arguments.length>0&&void 0!==arguments[0]?arguments[0]:{});return t&&!window.hasOwnProperty(t)&&(window[t]=e),["collect","fillFormFields"].reduce(((t,i)=>(t[i]=e[i].bind(e),t)),{})}constructor(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};var e,w;o(e=this,w=g),w.add(e),s(this,r,"CampaignCollector"),s(this,c,null),s(this,h,{cookieDomain:null,decorateHostnames:[],enableSpaSupport:!1,fieldMap:{$json:"campaign_json",last:{utm:null,$ns:null},first:{utm:null,$ns:null},cookies:{},globals:{}},fieldTargetMethod:["name"],fieldDataAttribute:"data-campaign-collector",filters:{},jars:{google:"^_ga|_gcl_",linkedin:"li_fat_id",meta:"^_fb(?:c|p)",microsoft:"^_uet",x:"_twclid"},namespace:"lvl",parseRules:{organic:{google:"^www.(google).[a-z]{2,3}(?:.[a-z]{2})?$",bing:"^www.(bing).com$",duckduckgo:"^(duckduckgo).com$",yahoo:"^(?:www|m)?.?(yahoo).(?:com|cn)$",ecosia:"^www.(ecosia).org$",ask:"^www.(ask).com$",aol:"^(?:search.)?(aol).com$",baidu:"^www.(baidu).com$",xfinity:"^my|search.(xfinity).com",yandex:"^(?:www.)?(yandex).com|ru$",lycos:"^(?:www|search)?.?(lycos).[a-z]{2,3}(?:.[a-z]{2})?$"},social:{facebook:"^www.(facebook).com$",instagram:"^l.(instagram).com$",linkedin:"^www.(linkedin).com$",x:"^t.co|x.com$"}},reportAnomalies:!1,sessionTimeout:null,storageMethod:"cookie",storeAsBase64:!0}),s(this,u,{first:{expires:[2,"years"]},last:{expires:[30,"minutes"]}}),s(this,f,{utm:["source","medium","campaign","term","content","id","source_platform","marketing_tactic","creative_format"],$ns:["via","src","cid","gid","aid","pid","fid","art","ext","loi","lop","pos","tgt","net","device","matchtype","placement"]}),s(this,p,{utm:["source","medium","campaign"],$ns:["via","cid","gid","aid"]}),s(this,d,null),s(this,m,null),i(this,"params",null),console.time(a(r,this)),this.url=new URL(window.location.href),n(c,this,l(g,this,$).call(this,a(h,this),t)),l(g,this,C).call(this),l(g,this,A).call(this),l(g,this,W).call(this),l(g,this,D).call(this),l(g,this,P).call(this,["utm",a(c,this).namespace]),Array.isArray(a(c,this).sessionTimeout)&&(a(u,this).last.expires=a(c,this).sessionTimeout),n(m,this,l(g,this,T).call(this)),l(g,this,N).call(this),l(g,this,v).call(this),window.dataLayer&&window.dataLayer.push({event:"lvl.campaign-collector:ready",campaign:this.collect({applyFilters:!0,jarCookies:!0,without:["globals"]})}),console.timeEnd(a(r,this))}fillFormFields(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};t.hasOwnProperty("targetMethod")&&(t.targetMethod=Array.isArray(t.targetMethod)?t.targetMethod:[t.targetMethod]);const e={targetMethod:t.targetMethod||a(c,this).fieldTargetMethod,scope:t.scope||document},i=a(c,this).fieldMap,s=this.collect({without:["params"]});["first","last"].forEach((t=>{i[t]&&(i[t]=l(g,this,y).call(this,i[t])),s[t]&&(s[t]=l(g,this,y).call(this,s[t]))}));for(const[t,n]of Object.entries(i))if("$json"!==t)for(const[i,a]of Object.entries(n)){var o;const n=e.scope.querySelectorAll(l(g,this,b).call(this,e.targetMethod,a));if(null==n||!n.length)continue;const r=null!==(o=s[t][i])&&void 0!==o?o:"-";Array.from(n).forEach((t=>{t.value=r,t.setAttribute("value",r),t.dispatchEvent(new Event("input",{bubbles:!0}))}))}}get activeSession(){const t=a(m,this).last;if(!t)return null;const e=Math.ceil(Date.now()/1e3);return t.$exp<e&&(a(m,this).last=null,l(g,this,N).call(this)),a(m,this).last}collect(){let{jarCookies:t=!1,applyFilters:e=!1,without:i=[]}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};const s={};return i.includes("params")||(s.params=this.params),i.includes("first")||(s.first=a(m,this).first),i.includes("last")||(s.last=a(m,this).last),i.includes("globals")||(s.globals=l(g,this,M).call(this,{applyFilters:e})),i.includes("cookies")||(s.cookies=l(g,this,j).call(this,{applyFilters:e,inJars:t})),s}}function y(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:"";return Object.keys(t).reduce(((i,s)=>{const o=e.length?"".concat(e,"_"):"";return"object"!=typeof t[s]||null===t[s]||Array.isArray(t[s])?i["".concat(o).concat(s)]=t[s]:Object.assign(i,l(g,this,y).call(this,t[s],"".concat(o).concat(s))),i}),{})}function b(){let t=arguments.length>1?arguments[1]:void 0;return(arguments.length>0&&void 0!==arguments[0]?arguments[0]:[]).map((e=>{const i={class:"input."+t,parentClass:"."+t+" input",dataAttribute:"input["+a(c,this).fieldDataAttribute+'="'+t+'"]',name:'input[name="'+t+'"]'};return i[e]||i.name})).join(",")}function v(){const t=t=>{if(!t.target.matches('[type="submit"]'))return;const e=t.target.closest("form");let i;this.fillFormFields(e),e.querySelectorAll(l(g,this,b).call(this,a(c,this).fieldTargetMethod,a(c,this).fieldMap.$json)).forEach((t=>{var e;i=null!==(e=i)&&void 0!==e?e:JSON.stringify(this.collect({without:["params"]})),t.value=i}))};if(a(c,this).enableSpaSupport){l(g,this,_).call(this);const t=t=>{l(g,this,W).call(this,!0),l(g,this,N).call(this)};window.addEventListener("popstate",t),window.onpopstate=history.onpushstate=t}document.addEventListener("mousedown",(e=>{t(e),l(g,this,I).call(this)})),document.addEventListener("touchstart",t)}function k(t){const e=this.params[t];if(!Object.keys(e).length)return;const i=a(p,this)[t];for(const t of i)if(!e.hasOwnProperty(t))return!1;return!0}function j(){let{applyFilters:t=!1,inJars:e=!1}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},i={};if(!a(c,this).fieldMap.cookies)return i;for(const[n,h]of Object.entries(a(c,this).fieldMap.cookies)){let h=l(g,this,O).call(this,n);if(h){if(t&&"function"==typeof a(c,this).filters[n])try{h=a(c,this).filters[n](h)}catch(t){console.error("".concat(a(r,this),'.js: Error applying filter to cookie "').concat(n,'"'),t.message)}if(e){let t=!0;for(const e in a(c,this).jars){var s;if(new RegExp(a(c,this).jars[e]).test(n)){null!==(s=i[e])&&void 0!==s||(i[e]={}),i[e][n]=h,t=!1;break}}var o;if(t)null!==(o=i._stray)&&void 0!==o||(i._stray={}),i._stray[n]=h}else i[n]=h}}return i}function M(){let{applyFilters:t=!1}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},e={};for(const[i,s]of Object.entries(a(c,this).fieldMap.globals))try{let s=l(g,this,E).call(this,i);if(!s)continue;t&&"function"==typeof a(c,this).filters[i]&&(s=a(c,this).filters[i](s)),e[i]=s}catch(t){console.error("".concat(a(r,this),'.js: Error resolving global "').concat(i,'"'),t.message)}return e}function $(t,e){for(const i in e)e.hasOwnProperty(i)&&(Array.isArray(e[i])?t[i]=e[i].slice():"object"==typeof e[i]&&null!==e[i]?(t[i]||(t[i]={}),l(g,this,$).call(this,t[i],e[i])):t[i]=e[i]);return t}function O(t){const e=document.cookie.match(new RegExp("(^| )"+t+"=([^;]+)"));return e?e[2].trim():null}function x(){let{value:t=0,units:e="minutes"}=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};const i={minutes:60,hours:3600,days:86400,weeks:604800,months:2592e3,years:31536e3}[e.toLowerCase()];return i?parseInt(t)*i:0}function _(){console.warn("".concat(a(r,this),".js: config.enableSpaSupport = true monkeypatches the the history.pushState() method."));let t=history.pushState;history.pushState=function(e){return"function"==typeof history.onpushstate&&history.onpushstate({state:e}),t.apply(history,arguments)}}function S(){let t={};if(!a(d,this)||a(d,this).hostname.indexOf(a(c,this).cookieDomain)>-1)return t;t={source:a(d,this).hostname,medium:"referral"};for(const[e,i]of Object.entries(a(c,this).parseRules)){for(const[s,o]of Object.entries(i))if(a(d,this).hostname.match(o)){t.source=s,t.medium=e;break}if(Object.keys(i).indexOf(t.medium)>-1)break}return t}function A(){if(a(c,this).cookieDomain)return;const t=this.url.hostname;if("localhost"===t)return"";const e=t.split(".").reverse();let i=[e[1],e[0]].join(".");e.length>2&&e[1].length<=3&&(i=[e[2],i].join(".")),a(c,this).cookieDomain=i}function E(t){return t.split(".").reduce(((t,e)=>t?t[e]:null),window)}function F(t){if(!t)return"";let e=String(t).trim();e=e.slice(0,255),e=e.replace(/[^a-zA-Z0-9_\-%.@+~$!:=;/|\[\]\(\) ]/g,"");return[/--|;/g,/\/\*|\*\//g].forEach((t=>{e=e.replace(t,"")})),e}function C(){const t=a(c,this).fieldMap;for(const[e,i]of Object.entries(t))if(["first","last"].includes(e))for(const[t,s]of Object.entries(i)){let i={};a(f,this)[t].forEach((s=>{let o="$ns"===t?a(c,this).namespace:t;i[s]="".concat(o,"_").concat(s),"first"==e&&(i[s]+="_1st")}));let o=l(g,this,$).call(this,i,s);"$ns"===t?(a(c,this).fieldMap[e][a(c,this).namespace]=o,delete a(c,this).fieldMap[e][t]):a(c,this).fieldMap[e][t]=o}}function D(){let t=a(f,this).$ns,e=a(p,this).$ns;a(f,this)[a(c,this).namespace]=t,a(p,this)[a(c,this).namespace]=e,delete a(f,this).$ns,delete a(p,this).$ns}function P(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[];const e=this.url.searchParams;let i={};t=t.length>0?t:[a(c,this).namespace];for(const e of t)i[e]={};const s="stray";if(i[s]={},e){for(const[o,n]of e.entries()){let e=!1;for(const s of t)if(o.startsWith(s+"_")){const t=o.slice(s.length+1);a(f,this)[s].includes(t)&&(i[s][t]=l(g,this,F).call(this,n),e=!0);break}e||(i[s][o]=l(g,this,F).call(this,n))}this.params=i}else this.params=i}function W(){let t;t=arguments.length>0&&void 0!==arguments[0]&&arguments[0]?null:document.referrer?new URL(document.referrer):null,n(d,this,t)}function T(){let t={};const e=Math.ceil(Date.now()/1e3);for(const[s,o]of Object.entries(a(u,this))){var i;t[s]=l(g,this,z).call(this,s),"cookie"!==a(c,this).storageMethod&&(null===(i=t[s])||void 0===i?void 0:i.$exp)<e&&(l(g,this,R).call(this,s),t[s]=null)}return t}function L(t){return"_".concat(a(c,this).namespace,"_cc_").concat(t)}function z(t){const e=l(g,this,L).call(this,t);let i="cookie"===a(c,this).storageMethod?l(g,this,O).call(this,e):localStorage.getItem(e);return i?(i.startsWith("64:")&&(i=atob(i.split(":")[1])),i.$ref?l(g,this,z).call(this,i.$ref):(i=JSON.parse(i),"null"===i&&(i=null),i)):null}function R(t){const e=l(g,this,L).call(this,t);"cookie"===a(c,this).storageMethod?document.cookie="".concat(e,"=; max-age=0; path=/; domain=").concat(a(c,this).cookieDomain):localStorage.removeItem(e)}function J(t,e){const i=Math.ceil(Date.now()/1e3);e.$set||(e.$set=i);const[s,o]=a(u,this)[t].expires,n=l(g,this,x).call(this,{value:s,units:o});e.$exp=n+i,e=JSON.stringify(e),a(c,this).storeAsBase64&&(e="64:".concat(btoa(e)));const r=l(g,this,L).call(this,t);"cookie"===a(c,this).storageMethod?document.cookie="".concat(r,"=").concat(e,"; max-age=").concat(n,"; path=/; domain=").concat(a(c,this).cookieDomain,"; secure"):localStorage.setItem(r,e)}function I(){let t=l(g,this,z).call(this,"last");t&&l(g,this,J).call(this,"last",t)}function N(){var t;const e=a(c,this).namespace;let i={utm:{source:"(direct)",medium:"(none)"}};i[e]={};const s=l(g,this,k).call(this,"utm"),o=l(g,this,k).call(this,e);s&&Object.assign(i.utm,this.params.utm),o&&Object.assign(i[e],this.params[e]),s||o||Object.assign(i.utm,l(g,this,S).call(this)),null!==(t=a(m,this))&&void 0!==t&&t.first?(console.log("first touchpoint exists"),i=a(m,this).last&&"(direct)"===i.utm.source?a(m,this).last:i):(a(m,this).first=i,l(g,this,J).call(this,"first",i),i={$ref:"first"}),a(m,this).last=i,l(g,this,J).call(this,"last",i)}return e=e.default})()));
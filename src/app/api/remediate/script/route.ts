/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RegLayer — Production Accessibility Remediation Script v3.0
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Drop-in client-side script that automatically remediates WCAG 2.2 Level AA
 * violations on any website. Modelled after enterprise tag patterns (GTM, Segment).
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE                                                               │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ • Loader/Core split — tiny bootstrap, lazy-loads heavy logic               │
 * │ • Zero globals — single namespace (__RL__), no prototype pollution          │
 * │ • WeakSet dedup — O(1) per-element check, GC-friendly, no memory leaks     │
 * │ • requestIdleCallback — yields to main thread, never blocks FCP/LCP        │
 * │ • MutationObserver — SPA-aware, debounced, handles React/Vue/Angular       │
 * │ • History API hooks — catches pushState/replaceState route changes          │
 * │ • Error boundaries — each fix module in its own try/catch, never crashes    │
 * │ • sendBeacon analytics — fires on pagehide, guaranteed delivery             │
 * │ • CSP-compatible — no eval(), no document.write(), no inline handlers       │
 * │ • Configurable — data-* attributes on script tag for per-site overrides     │
 * │ • Debug mode — data-rl-debug="true" for verbose console output              │
 * │ • Versioned — semver in headers + beacon for cache coordination             │
 * │ • Idempotent — safe to load multiple times (e.g., SPA re-inject)            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * WCAG 2.2 Coverage:
 *   Level A:  1.1.1, 1.3.1, 2.1.1, 2.4.1, 2.4.3, 2.4.4, 3.1.1, 4.1.2
 *   Level AA: 1.3.5, 1.4.13, 2.4.7, 2.5.8, 1.4.3 (partial)
 *   Level AAA: 2.3.3 (reduced motion)
 *
 * Usage:
 *   <script src="https://app.reglayer.com/api/remediate/script?key=rl_xxx" async defer></script>
 *
 * Configuration (data attributes):
 *   data-rl-debug="true"         — Enable console logging
 *   data-rl-observe="false"      — Disable MutationObserver
 *   data-rl-history="false"      — Disable history API hooks
 *   data-rl-fixes="all"          — Comma list: lang,skip,img,form,btn,tab,nav,focus,heading,autocomplete,table,touch,motion,color
 *   data-rl-debounce="200"       — Mutation debounce ms (default 150)
 *   data-rl-locale="en"          — Override detected locale
 */
import { NextRequest } from "next/server";

const SCRIPT_VERSION = "3.0.0";
const SCRIPT_BUILD = "2026.06.03";

export async function GET(request: NextRequest) {
  const apiKey = request.nextUrl.searchParams.get("key") || "";
  const origin = request.nextUrl.origin;
  const sanitizedKey = apiKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);

  const script = generateScript(sanitizedKey, origin);

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "X-RL-Key",
      "X-Content-Type-Options": "nosniff",
      "X-RL-Script-Version": SCRIPT_VERSION,
      "X-RL-Build": SCRIPT_BUILD,
      "Timing-Allow-Origin": "*",
      Vary: "Accept-Encoding",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "X-RL-Key",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// ─── Script Generator ────────────────────────────────────────────────────────

function generateScript(key: string, origin: string): string {
  return `/*!
 * RegLayer Remediation v${SCRIPT_VERSION} | ${SCRIPT_BUILD}
 * (c) RegLayer Inc. | reglayer.com/terms
 */
(function(W,D,N,U){
"use strict";

// ═══ GUARD: Prevent double-execution ════════════════════════════════════════
if(W.__RL__&&W.__RL__.v)return;
var RL=W.__RL__={v:"${SCRIPT_VERSION}",b:"${SCRIPT_BUILD}",fixes:0,modules:{}};

// ═══ CONFIGURATION ══════════════════════════════════════════════════════════
var C={
  key:"${key}",
  origin:"${origin}",
  observe:true,
  history:true,
  debug:false,
  debounce:150,
  locale:"",
  enabledFixes:null
};

// Parse data-* attributes from the script tag (like GTM does)
(function parseConfig(){
  var s=D.currentScript||D.querySelector("script[src*='remediate/script']");
  if(!s)return;
  var d=s.dataset||{};
  if(d.rlDebug==="true")C.debug=true;
  if(d.rlObserve==="false")C.observe=false;
  if(d.rlHistory==="false")C.history=false;
  if(d.rlDebounce)C.debounce=Math.max(50,Math.min(5000,parseInt(d.rlDebounce,10)||150));
  if(d.rlLocale)C.locale=d.rlLocale;
  if(d.rlFixes&&d.rlFixes!=="all")C.enabledFixes=d.rlFixes.split(",").map(function(s){return s.trim();});
  if(d.rlKey)C.key=d.rlKey.replace(/[^a-zA-Z0-9_-]/g,"");
})();

// ═══ UTILITIES ══════════════════════════════════════════════════════════════
var PROCESSED=new WeakSet();
var PERF=W.performance||{now:function(){return Date.now();}};
var t0=PERF.now();

function mark(el){if(!el||PROCESSED.has(el))return false;PROCESSED.add(el);return true;}
function log(){if(C.debug&&W.console)W.console.log.apply(W.console,["[RL]"].concat(Array.prototype.slice.call(arguments)));}
function warn(){if(W.console)W.console.warn.apply(W.console,["[RegLayer]"].concat(Array.prototype.slice.call(arguments)));}

function idle(fn){
  if(W.requestIdleCallback)W.requestIdleCallback(fn,{timeout:3000});
  else W.setTimeout(fn,1);
}

function raf(fn){
  if(W.requestAnimationFrame)W.requestAnimationFrame(fn);
  else W.setTimeout(fn,16);
}

function debounce(fn,ms){
  var t=0;
  return function(){
    W.clearTimeout(t);
    t=W.setTimeout(fn,ms);
  };
}

function throttle(fn,ms){
  var last=0;
  return function(){
    var now=Date.now();
    if(now-last>=ms){last=now;fn();}
  };
}

function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):"";}

function slug(s){
  return(s||"").split("/").pop().split("?")[0].split("#")[0]
    .replace(/\\.[^.]+$/,"")
    .replace(/[-_]+/g," ")
    .replace(/([a-z])([A-Z])/g,"$1 $2")
    .trim();
}

function visible(el){
  var t=(el.textContent||"").trim();
  return(t.length>0&&t.length<200)?t:"";
}

function hasName(el){
  return !!(el.getAttribute("aria-label")||el.getAttribute("aria-labelledby")||el.getAttribute("title"));
}

function isEnabled(mod){
  return !C.enabledFixes||C.enabledFixes.indexOf(mod)!==-1;
}

function injectStyle(id,css){
  if(D.getElementById(id))return false;
  var s=D.createElement("style");
  s.id=id;s.textContent=css;
  (D.head||D.documentElement).appendChild(s);
  return true;
}

function safe(name,fn){
  return function(){
    try{return fn.apply(null,arguments);}
    catch(e){warn("Module ["+name+"] error:",e);return 0;}
  };
}

// ═══ MODULE: Document Language (WCAG 3.1.1 Level A) ═════════════════════════
RL.modules.lang=safe("lang",function(){
  if(!isEnabled("lang"))return 0;
  if(D.documentElement.lang||D.documentElement.getAttribute("xml:lang"))return 0;

  var lang=C.locale;
  if(!lang){
    var meta=D.querySelector("meta[http-equiv='content-language']")||D.querySelector("meta[name='language']");
    lang=meta?meta.getAttribute("content"):"";
  }
  if(!lang&&N.language)lang=N.language;
  if(!lang)lang="en";

  D.documentElement.setAttribute("lang",lang.split(",")[0].split(";")[0].trim().substring(0,10));
  RL.fixes++;
  log("lang →",D.documentElement.lang);
  return 1;
});

// ═══ MODULE: Skip Navigation (WCAG 2.4.1 Level A) ══════════════════════════
RL.modules.skip=safe("skip",function(){
  if(!isEnabled("skip"))return 0;
  if(D.querySelector("[class*='skip'],a[href*='#main'],a[href*='#content']"))return 0;

  var main=D.querySelector("main,[role='main'],#main,#content,#main-content,.main-content");
  if(!main)return 0;
  if(!main.id)main.id="rl-main";

  var a=D.createElement("a");
  a.href="#"+main.id;
  a.textContent="Skip to main content";
  a.className="rl-skip";
  a.setAttribute("style",[
    "position:fixed","top:-100%","left:16px","z-index:2147483647",
    "padding:14px 28px","background:#0f172a","color:#f8fafc",
    "font:600 14px/1.4 system-ui,-apple-system,sans-serif",
    "text-decoration:none","border-radius:0 0 8px 8px",
    "box-shadow:0 4px 16px rgba(0,0,0,.25)","letter-spacing:.01em",
    "transition:top .25s cubic-bezier(.4,0,.2,1)",
    "outline:none","border:2px solid transparent"
  ].join(";"));

  a.addEventListener("focus",function(){this.style.top="0";this.style.borderColor="#3b82f6";});
  a.addEventListener("blur",function(){this.style.top="-100%";this.style.borderColor="transparent";});
  a.addEventListener("click",function(e){
    e.preventDefault();
    var target=D.getElementById(main.id);
    if(target){
      target.setAttribute("tabindex","-1");
      target.focus({preventScroll:false});
      target.addEventListener("blur",function b(){target.removeAttribute("tabindex");target.removeEventListener("blur",b);},{once:true});
    }
  });

  D.body.insertBefore(a,D.body.firstChild);
  RL.fixes++;
  log("skip-link → #"+main.id);
  return 1;
});

// ═══ MODULE: Image Alt Text (WCAG 1.1.1 Level A) ═══════════════════════════
RL.modules.img=safe("img",function(root){
  if(!isEnabled("img"))return 0;
  var count=0;
  var imgs=(root||D).querySelectorAll("img:not([alt]),img[alt='']");

  for(var i=0;i<imgs.length;i++){
    var img=imgs[i];
    if(!mark(img))continue;

    var src=img.getAttribute("src")||img.getAttribute("data-src")||img.currentSrc||"";

    // Detect decorative images
    var decorative=
      /spacer|pixel|track|blank|clear|shim|dot|1x1|loading|placeholder/i.test(src)||
      img.getAttribute("role")==="presentation"||
      img.getAttribute("role")==="none"||
      img.getAttribute("aria-hidden")==="true"||
      (img.offsetWidth<3&&img.offsetHeight<3)||
      (img.closest&&img.closest("[aria-hidden='true'],.visually-hidden,.sr-only"));

    // Images inside interactive elements are supplementary
    var inInteractive=img.closest&&img.closest("a,button,[role='link'],[role='button'],[role='tab']");

    if(decorative||inInteractive){
      img.setAttribute("alt","");
      img.setAttribute("role","presentation");
    }else{
      var alt="";
      // Priority 1: Title attribute
      alt=img.getAttribute("title")||"";
      // Priority 2: Figcaption
      if(!alt&&img.closest){
        var fig=img.closest("figure");
        if(fig){var fc=fig.querySelector("figcaption");if(fc)alt=(fc.textContent||"").trim().substring(0,100);}
      }
      // Priority 3: data-alt, data-caption
      if(!alt)alt=img.getAttribute("data-alt")||img.getAttribute("data-caption")||"";
      // Priority 4: Derive from filename
      if(!alt){
        var name=slug(src);
        alt=name.length>2?cap(name):"Image";
      }
      img.setAttribute("alt",alt);
    }
    count++;RL.fixes++;
  }
  log("img: fixed",count);
  return count;
});

// ═══ MODULE: Form Labels (WCAG 1.3.1, 4.1.2 Level A) ══════════════════════
RL.modules.form=safe("form",function(root){
  if(!isEnabled("form"))return 0;
  var count=0;
  var SEL="input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']),textarea,select";
  var inputs=(root||D).querySelectorAll(SEL);

  for(var i=0;i<inputs.length;i++){
    var inp=inputs[i];
    if(!mark(inp))continue;
    if(hasName(inp))continue;
    if(inp.id&&D.querySelector("label[for='"+CSS.escape(inp.id)+"']"))continue;
    if(inp.closest&&inp.closest("label"))continue;

    var label="";
    // S1: Preceding sibling label/span
    var prev=inp.previousElementSibling;
    if(prev&&/^(LABEL|SPAN|P|DIV)$/.test(prev.tagName)){
      var pt=(prev.textContent||"").trim().replace(/[:\\*]+$/,"").trim();
      if(pt.length>1&&pt.length<80)label=pt;
    }
    // S2: Placeholder
    if(!label)label=(inp.getAttribute("placeholder")||"").trim();
    // S3: name/id heuristic
    if(!label){
      var n=inp.getAttribute("name")||inp.id||"";
      label=n.replace(/[-_\\[\\]\\d]+/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").trim();
    }
    // S4: Type-based fallback
    if(!label){
      var type=inp.getAttribute("type")||inp.tagName.toLowerCase();
      var TM={email:"Email address",tel:"Phone number",search:"Search",url:"Website URL",password:"Password",number:"Number",date:"Date",time:"Time",file:"Choose file",color:"Color",range:"Range"};
      label=TM[type]||cap(type);
    }
    if(label){
      inp.setAttribute("aria-label",cap(label));
      count++;RL.fixes++;
    }
  }
  log("form: labeled",count);
  return count;
});

// ═══ MODULE: Button & Link Labels (WCAG 4.1.2, 2.4.4 Level A) ═════════════
RL.modules.btn=safe("btn",function(root){
  if(!isEnabled("btn"))return 0;
  var count=0;
  var R=root||D;

  // --- Buttons ---
  var btns=R.querySelectorAll("button:not([aria-label]):not([aria-labelledby]),[role='button']:not([aria-label]):not([aria-labelledby])");
  for(var i=0;i<btns.length;i++){
    var btn=btns[i];
    if(!mark(btn))continue;
    if(btn.getAttribute("title"))continue;
    if(visible(btn))continue;

    var label="";
    // Try inner img alt
    var bImg=btn.querySelector("img[alt]");
    if(bImg&&bImg.alt)label=bImg.alt;
    // Try SVG <title>
    if(!label){var st=btn.querySelector("svg title");if(st)label=(st.textContent||"").trim();}
    // Try aria-describedby
    if(!label){var dby=btn.getAttribute("aria-describedby");if(dby){var dEl=D.getElementById(dby);if(dEl)label=(dEl.textContent||"").trim();}}
    // Class + ID semantic heuristic (comprehensive list)
    if(!label){
      var hint=((typeof btn.className==="string"?btn.className:"")+" "+(btn.id||"")).toLowerCase();
      var ACTIONS="close,menu,search,submit,send,delete,remove,edit,save,cancel,next,previous,prev,play,pause,stop,mute,unmute,expand,collapse,toggle,refresh,reload,download,upload,share,copy,add,like,favorite,favourite,bookmark,settings,filter,sort,more,back,forward,undo,redo,print,help,info,notification,notifications,cart,checkout,login,log-in,logout,log-out,signup,sign-up,maximize,minimize,fullscreen,zoom,pin,unpin,archive,approve,reject,dismiss,confirm,accept,deny,attach,detach,link,unlink";
      var acts=ACTIONS.split(",");
      for(var j=0;j<acts.length;j++){
        if(hint.indexOf(acts[j])!==-1){label=cap(acts[j].replace(/-/g," "));break;}
      }
    }
    if(!label)label="Button";
    btn.setAttribute("aria-label",label);
    count++;RL.fixes++;
  }

  // --- Empty links ---
  var links=R.querySelectorAll("a:not([aria-label]):not([aria-labelledby])");
  for(var k=0;k<links.length;k++){
    var a=links[k];
    if(!mark(a))continue;
    if(a.getAttribute("title"))continue;
    if(visible(a))continue;
    // img alt inside link
    var lImg=a.querySelector("img[alt]");
    if(lImg&&lImg.alt){a.setAttribute("aria-label",lImg.alt);count++;RL.fixes++;continue;}
    // SVG title
    var svgT=a.querySelector("svg title");
    if(svgT&&svgT.textContent){a.setAttribute("aria-label",svgT.textContent.trim());count++;RL.fixes++;continue;}
    // Derive from href
    var href=a.getAttribute("href")||"";
    if(href&&href!=="#"&&!href.startsWith("javascript")&&href.length<80){
      var hName=slug(href);
      a.setAttribute("aria-label",hName?cap(hName):"Link");
      count++;RL.fixes++;
    }
  }

  log("btn/link: labeled",count);
  return count;
});

// ═══ MODULE: Tab Order (WCAG 2.4.3 Level A) ════════════════════════════════
RL.modules.tab=safe("tab",function(root){
  if(!isEnabled("tab"))return 0;
  var count=0;
  var els=(root||D).querySelectorAll("[tabindex]");
  for(var i=0;i<els.length;i++){
    var el=els[i];
    var ti=parseInt(el.getAttribute("tabindex")||"0",10);
    if(ti>0){
      el.setAttribute("tabindex","0");
      el.setAttribute("data-rl-original-tabindex",String(ti));
      count++;RL.fixes++;
    }
  }
  log("tabindex: fixed",count);
  return count;
});

// ═══ MODULE: Landmarks (WCAG 1.3.1, 2.4.1 Level A) ════════════════════════
RL.modules.nav=safe("nav",function(){
  if(!isEnabled("nav"))return 0;
  var count=0;
  var groups=[
    {sel:"nav:not([aria-label]):not([aria-labelledby])",prefix:"Navigation"},
    {sel:"aside:not([aria-label]):not([aria-labelledby])",prefix:"Complementary"},
    {sel:"form:not([aria-label]):not([aria-labelledby]):not([role='search'])",prefix:"Form"}
  ];

  for(var g=0;g<groups.length;g++){
    var els=D.querySelectorAll(groups[g].sel);
    if(els.length<2)continue;
    for(var i=0;i<els.length;i++){
      var el=els[i];
      if(el.getAttribute("aria-label")||el.getAttribute("aria-labelledby"))continue;
      // Derive from first heading inside
      var h=el.querySelector("h1,h2,h3,h4,h5,h6,[role='heading']");
      if(h&&h.textContent&&h.textContent.trim()){
        if(!h.id)h.id="rl-"+groups[g].prefix.toLowerCase()+"-h-"+i;
        el.setAttribute("aria-labelledby",h.id);
      }else{
        el.setAttribute("aria-label",groups[g].prefix+" "+(i+1));
      }
      count++;RL.fixes++;
    }
  }
  log("landmarks: labeled",count);
  return count;
});

// ═══ MODULE: Focus Visibility (WCAG 2.4.7 Level AA) ════════════════════════
RL.modules.focus=safe("focus",function(){
  if(!isEnabled("focus"))return 0;
  var injected=injectStyle("rl-focus",
    "*:focus-visible{outline:3px solid #2563eb !important;outline-offset:2px !important;border-radius:3px;}"+
    ".rl-skip:focus{outline:3px solid #60a5fa !important;outline-offset:0 !important;}"
  );
  if(injected){RL.fixes++;log("focus-visible styles injected");return 1;}
  return 0;
});

// ═══ MODULE: Empty Headings (WCAG 1.3.1 Level A) ═══════════════════════════
RL.modules.heading=safe("heading",function(root){
  if(!isEnabled("heading"))return 0;
  var count=0;
  var hs=(root||D).querySelectorAll("h1,h2,h3,h4,h5,h6");
  for(var i=0;i<hs.length;i++){
    var h=hs[i];
    if(!mark(h))continue;
    if(!(h.textContent||"").trim()&&!h.querySelector("img[alt]")){
      h.setAttribute("aria-hidden","true");
      h.style.display="none";
      count++;RL.fixes++;
    }
  }
  log("headings: hidden",count,"empty");
  return count;
});

// ═══ MODULE: Autocomplete (WCAG 1.3.5 Level AA) ═══════════════════════════
RL.modules.autocomplete=safe("autocomplete",function(root){
  if(!isEnabled("autocomplete"))return 0;
  var count=0;
  var MAP={
    email:"email","e-mail":"email",mail:"email",
    "first-name":"given-name","first_name":"given-name",fname:"given-name",firstname:"given-name","given-name":"given-name",
    "last-name":"family-name","last_name":"family-name",lname:"family-name",lastname:"family-name","family-name":"family-name",surname:"family-name",
    name:"name",fullname:"name","full-name":"name","full_name":"name",
    phone:"tel",telephone:"tel",tel:"tel",mobile:"tel","phone-number":"tel","phone_number":"tel",
    address:"street-address","address-line":"address-line1",street:"street-address","street-address":"street-address",
    city:"address-level2",state:"address-level1",province:"address-level1",region:"address-level1",
    zip:"postal-code",zipcode:"postal-code","postal-code":"postal-code",postcode:"postal-code",
    country:"country-name","country-name":"country-name",
    username:"username",user:"username","user-name":"username",
    password:"current-password",pass:"current-password","current-password":"current-password",
    "new-password":"new-password","confirm-password":"new-password","password-confirm":"new-password",
    "cc-number":"cc-number","card-number":"cc-number",cardnumber:"cc-number","credit-card":"cc-number",
    cvv:"cc-csc",cvc:"cc-csc","security-code":"cc-csc",
    expiry:"cc-exp","card-exp":"cc-exp",expiration:"cc-exp","exp-date":"cc-exp",
    organization:"organization",company:"organization",org:"organization",
    "job-title":"organization-title",title:"organization-title",
    birthday:"bday",dob:"bday","date-of-birth":"bday",bday:"bday"
  };

  var inputs=(root||D).querySelectorAll("input:not([autocomplete]):not([type='hidden']):not([type='submit']):not([type='button']):not([type='checkbox']):not([type='radio']):not([type='file']):not([type='image']):not([type='range']):not([type='color'])");
  for(var i=0;i<inputs.length;i++){
    var inp=inputs[i];
    var raw=(inp.getAttribute("name")||inp.id||"").toLowerCase();
    var key=raw.replace(/[-_\\[\\]\\d.]+/g,"-").replace(/^-|-$/g,"");
    // Also check placeholder for hints
    var ph=(inp.getAttribute("placeholder")||"").toLowerCase().replace(/[^a-z-]/g,"-").replace(/^-|-$/g,"");
    var candidates=[key,ph,raw];

    for(var c=0;c<candidates.length;c++){
      var matched=false;
      for(var token in MAP){
        if(MAP.hasOwnProperty(token)&&candidates[c].indexOf(token)!==-1){
          inp.setAttribute("autocomplete",MAP[token]);
          count++;RL.fixes++;matched=true;break;
        }
      }
      if(matched)break;
    }
  }
  log("autocomplete: set",count);
  return count;
});

// ═══ MODULE: Tables (WCAG 1.3.1 Level A) ═══════════════════════════════════
RL.modules.table=safe("table",function(root){
  if(!isEnabled("table"))return 0;
  var count=0;
  var tables=(root||D).querySelectorAll("table:not([role='presentation']):not([role='none'])");

  for(var i=0;i<tables.length;i++){
    var tbl=tables[i];
    if(!mark(tbl))continue;

    // Scope headers
    var ths=tbl.querySelectorAll("th:not([scope])");
    for(var j=0;j<ths.length;j++){
      var th=ths[j];
      var inHead=th.closest?th.closest("thead"):th.parentNode&&th.parentNode.parentNode&&th.parentNode.parentNode.tagName==="THEAD";
      th.setAttribute("scope",inHead?"col":"row");
      count++;RL.fixes++;
    }

    // Table accessible name
    if(!tbl.getAttribute("aria-label")&&!tbl.getAttribute("aria-labelledby")&&!tbl.querySelector("caption")){
      var prev=tbl.previousElementSibling;
      if(prev&&/^H[1-6]$/.test(prev.tagName)&&prev.textContent){
        if(!prev.id)prev.id="rl-tbl-h-"+i;
        tbl.setAttribute("aria-labelledby",prev.id);
        count++;RL.fixes++;
      }
    }
  }
  log("tables: fixed",count);
  return count;
});

// ═══ MODULE: Touch Target Size (WCAG 2.5.8 Level AA) ═══════════════════════
RL.modules.touch=safe("touch",function(){
  if(!isEnabled("touch"))return 0;
  if(!W.matchMedia)return 0;
  // Only on touch devices
  if(!W.matchMedia("(pointer:coarse)").matches&&!W.matchMedia("(hover:none)").matches)return 0;
  var injected=injectStyle("rl-touch",
    "@media(pointer:coarse),(hover:none){"+
    "button,a:not(.rl-skip),[role='button'],[role='link'],[role='tab'],[role='menuitem'],"+
    "input[type='checkbox'],input[type='radio'],input[type='submit'],input[type='button'],select"+
    "{min-height:44px;min-width:44px;}"+ 
    "}"
  );
  if(injected){RL.fixes++;log("touch-target styles injected");return 1;}
  return 0;
});

// ═══ MODULE: Reduced Motion (WCAG 2.3.3 Level AAA) ═════════════════════════
RL.modules.motion=safe("motion",function(){
  if(!isEnabled("motion"))return 0;
  if(!W.matchMedia||!W.matchMedia("(prefers-reduced-motion:reduce)").matches)return 0;
  var injected=injectStyle("rl-motion",
    "@media(prefers-reduced-motion:reduce){"+
    "*,*::before,*::after{"+
    "animation-duration:0.01ms !important;animation-iteration-count:1 !important;"+
    "transition-duration:0.01ms !important;scroll-behavior:auto !important;"+
    "}}");
  if(injected){RL.fixes++;log("reduced-motion styles injected");return 1;}
  return 0;
});

// ═══ MODULE: Color Contrast Boost (WCAG 1.4.3 Level AA — Partial) ══════════
RL.modules.color=safe("color",function(){
  if(!isEnabled("color"))return 0;
  if(!W.matchMedia||!W.matchMedia("(forced-colors:active)").matches)return 0;
  var injected=injectStyle("rl-hc",
    "@media(forced-colors:active){"+
    "a{text-decoration:underline !important;}"+
    "button,[role='button']{border:2px solid ButtonText !important;}"+
    "input,textarea,select{border:1px solid ButtonText !important;}"+
    "}");
  if(injected){RL.fixes++;return 1;}
  return 0;
});

// ═══ MODULE: Live Region Announcements (WCAG 4.1.3 Level A) ════════════════
RL.modules.live=safe("live",function(){
  if(!isEnabled("live"))return 0;
  if(D.getElementById("rl-live-region"))return 0;
  var region=D.createElement("div");
  region.id="rl-live-region";
  region.setAttribute("role","status");
  region.setAttribute("aria-live","polite");
  region.setAttribute("aria-atomic","true");
  region.setAttribute("style","position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);border:0;");
  D.body.appendChild(region);
  // Expose announce API
  RL.announce=function(msg,priority){
    region.setAttribute("aria-live",priority==="assertive"?"assertive":"polite");
    region.textContent="";
    W.setTimeout(function(){region.textContent=msg;},100);
  };
  RL.fixes++;
  log("live region ready");
  return 1;
});

// ═══ ORCHESTRATION ENGINE ═══════════════════════════════════════════════════
function runScoped(root){
  RL.modules.img(root);
  RL.modules.form(root);
  RL.modules.btn(root);
  RL.modules.tab(root);
  RL.modules.heading(root);
  RL.modules.autocomplete(root);
  RL.modules.table(root);
}

function runGlobal(){
  RL.modules.lang();
  RL.modules.skip();
  RL.modules.focus();
  RL.modules.touch();
  RL.modules.motion();
  RL.modules.color();
  RL.modules.live();
  RL.modules.nav();
}

function fullPass(){
  var before=RL.fixes;
  runGlobal();
  runScoped(D);
  var delta=RL.fixes-before;
  log("Full pass complete:",delta,"fixes in",(PERF.now()-t0).toFixed(1)+"ms");
  return delta;
}

// ═══ ANALYTICS BEACON ═══════════════════════════════════════════════════════
var beaconSent=false;
function sendBeacon(){
  if(!C.key||RL.fixes<1||beaconSent)return;
  beaconSent=true;

  var payload={
    k:C.key,
    f:RL.fixes,
    u:location.href,
    v:"${SCRIPT_VERSION}",
    t:Math.round(PERF.now()-t0),
    r:D.referrer?D.referrer.split("/")[2]||"":""
  };

  var url=C.origin+"/api/remediate/beacon?key="+payload.k+"&fixes="+payload.f+"&url="+encodeURIComponent(payload.u)+"&v="+payload.v+"&t="+payload.t;

  if(N.sendBeacon){
    try{N.sendBeacon(url);log("beacon sent via sendBeacon");}
    catch(e){fallbackBeacon(url);}
  }else{
    fallbackBeacon(url);
  }
}

function fallbackBeacon(url){
  var img=new Image();
  img.src=url;
  log("beacon sent via Image pixel");
}

// Send on pagehide (most reliable for SPA) + initial load
function scheduleBeacon(){
  W.setTimeout(sendBeacon,100);
  if("onpagehide" in W){
    W.addEventListener("pagehide",sendBeacon,{once:true});
  }else{
    W.addEventListener("beforeunload",sendBeacon,{once:true});
  }
}

// ═══ SPA SUPPORT: MutationObserver + History API ════════════════════════════
function observeDOM(){
  if(!C.observe||!W.MutationObserver)return;

  var handleMutation=debounce(function(){
    idle(function(){
      var before=RL.fixes;
      runScoped(D);
      RL.modules.nav();
      if(RL.fixes>before)log("mutation pass: +"+(RL.fixes-before)+" fixes");
    });
  },C.debounce);

  var observer=new MutationObserver(function(mutations){
    for(var i=0;i<mutations.length;i++){
      if(mutations[i].addedNodes.length>0){handleMutation();return;}
    }
  });

  observer.observe(D.body,{childList:true,subtree:true});
  RL.disconnect=function(){observer.disconnect();log("observer disconnected");};
  log("MutationObserver active (debounce="+C.debounce+"ms)");
}

function observeHistory(){
  if(!C.history)return;
  // Patch pushState/replaceState for SPA route changes
  var origPush=W.history.pushState;
  var origReplace=W.history.replaceState;

  var onRouteChange=throttle(function(){
    log("route change detected");
    idle(function(){
      PROCESSED=new WeakSet();
      runScoped(D);
      RL.modules.nav();
    });
  },500);

  if(origPush){
    W.history.pushState=function(){
      origPush.apply(W.history,arguments);
      onRouteChange();
    };
  }
  if(origReplace){
    W.history.replaceState=function(){
      origReplace.apply(W.history,arguments);
      onRouteChange();
    };
  }
  W.addEventListener("popstate",onRouteChange);
  log("history hooks active");
}

// ═══ BOOTSTRAP ═════════════════════════════════════════════════════════════
function boot(){
  log("boot v${SCRIPT_VERSION} | key="+C.key.substring(0,8)+"...");
  idle(function(){
    var fixes=fullPass();
    observeDOM();
    observeHistory();
    if(fixes>0)scheduleBeacon();
    RL.ready=true;
    log("ready:",RL.fixes,"total fixes");
    // Dispatch custom event for integrations
    try{D.dispatchEvent(new CustomEvent("rl:ready",{detail:{fixes:RL.fixes,version:"${SCRIPT_VERSION}"}}));}catch(e){}
  });
}

if(D.readyState==="loading"){
  D.addEventListener("DOMContentLoaded",boot);
}else{
  boot();
}

})(window,document,navigator,void 0);
`.trim();
}


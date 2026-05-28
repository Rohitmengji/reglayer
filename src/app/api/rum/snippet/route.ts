/**
 * RegLayer — RUM Snippet API
 *
 * WHY: Sites need a lightweight script to collect accessibility RUM data.
 * WHAT: GET serves the RUM JavaScript snippet for embedding in sites.
 * HOW: Returns minified JS that monitors focus traps, keyboard nav, and ARIA errors.
 */
import { NextRequest } from "next/server";

/**
 * GET /api/rum/snippet?key=<site-key>
 *
 * Returns a lightweight JavaScript snippet (~3KB) that sites embed
 * to detect real-time accessibility barriers in production.
 *
 * Usage:
 *   <script src="https://reglayer.com/api/rum/snippet?key=site_xxx" async></script>
 *
 * Detects:
 * - Focus traps (user stuck in a focus loop)
 * - Keyboard navigation failures (Tab doesn't move focus)
 * - Missing form labels (interaction with unlabeled inputs)
 * - Low contrast interactions (clicks on low-contrast elements)
 * - Missing alt text interactions (images without alt)
 * - ARIA errors (invalid roles, broken references)
 * - Small touch targets (< 44px on mobile)
 * - Animations without reduced motion respect
 */
export async function GET(request: NextRequest) {
  const siteKey = request.nextUrl.searchParams.get("key") || "";
  const origin = request.nextUrl.origin;

  const script = `
(function(){
  "use strict";
  var RL_KEY="${siteKey.replace(/[^a-zA-Z0-9_-]/g, "")}";
  var RL_ENDPOINT="${origin}/api/rum/events";
  var RL_SESSION=Math.random().toString(36).slice(2)+Date.now().toString(36);
  var queue=[];
  var FLUSH_INTERVAL=10000;
  var MAX_BATCH=50;

  function emit(type,selector,details){
    queue.push({
      type:type,
      selector:selector||"unknown",
      page:location.href,
      timestamp:Date.now(),
      sessionId:RL_SESSION,
      viewport:{width:window.innerWidth,height:window.innerHeight},
      details:details||{}
    });
    if(queue.length>=MAX_BATCH)flush();
  }

  function flush(){
    if(!queue.length)return;
    var batch=queue.splice(0,MAX_BATCH);
    var payload=JSON.stringify({siteKey:RL_KEY,events:batch,userAgent:navigator.userAgent});
    if(navigator.sendBeacon){
      navigator.sendBeacon(RL_ENDPOINT,new Blob([payload],{type:"application/json"}));
    }else{
      var xhr=new XMLHttpRequest();
      xhr.open("POST",RL_ENDPOINT);
      xhr.setRequestHeader("Content-Type","application/json");
      xhr.send(payload);
    }
  }

  // --- FOCUS TRAP DETECTION ---
  var focusHistory=[];
  var TRAP_THRESHOLD=6;
  document.addEventListener("focusin",function(e){
    var sel=cssSelector(e.target);
    focusHistory.push(sel);
    if(focusHistory.length>TRAP_THRESHOLD){
      focusHistory=focusHistory.slice(-TRAP_THRESHOLD);
      var unique=new Set(focusHistory);
      if(unique.size<=2){
        emit("focus-trap",sel,{cycle:Array.from(unique)});
        focusHistory=[];
      }
    }
  });

  // --- KEYBOARD NAV FAILURE ---
  var lastFocus=null;
  document.addEventListener("keydown",function(e){
    if(e.key==="Tab"){
      lastFocus=document.activeElement;
      setTimeout(function(){
        if(document.activeElement===lastFocus&&document.activeElement!==document.body){
          emit("keyboard-nav-failure",cssSelector(lastFocus),{key:"Tab"});
        }
      },100);
    }
  });

  // --- MISSING LABEL DETECTION ---
  document.addEventListener("click",function(e){
    var t=e.target;
    if(t.tagName==="INPUT"||t.tagName==="SELECT"||t.tagName==="TEXTAREA"){
      var hasLabel=t.labels&&t.labels.length>0;
      var hasAria=t.getAttribute("aria-label")||t.getAttribute("aria-labelledby");
      if(!hasLabel&&!hasAria){
        emit("missing-label",cssSelector(t),{tagName:t.tagName,type:t.type||""});
      }
    }
  });

  // --- MISSING ALT TEXT INTERACTION ---
  document.addEventListener("click",function(e){
    var t=e.target;
    if(t.tagName==="IMG"&&!t.alt){
      emit("missing-alt-interaction",cssSelector(t),{src:(t.src||"").slice(0,200)});
    }
  });

  // --- SMALL TOUCH TARGETS (mobile) ---
  if("ontouchstart" in window||navigator.maxTouchPoints>0){
    document.addEventListener("click",function(e){
      var t=e.target;
      if(t.tagName==="A"||t.tagName==="BUTTON"||t.getAttribute("role")==="button"){
        var rect=t.getBoundingClientRect();
        if(rect.width<44||rect.height<44){
          emit("touch-target-small",cssSelector(t),{width:Math.round(rect.width),height:Math.round(rect.height)});
        }
      }
    });
  }

  // --- ARIA ERRORS (periodic scan) ---
  function checkAriaErrors(){
    var els=document.querySelectorAll("[aria-labelledby],[aria-describedby],[aria-controls],[aria-owns]");
    for(var i=0;i<els.length;i++){
      var el=els[i];
      var attrs=["aria-labelledby","aria-describedby","aria-controls","aria-owns"];
      for(var j=0;j<attrs.length;j++){
        var val=el.getAttribute(attrs[j]);
        if(val){
          var ids=val.split(/\\s+/);
          for(var k=0;k<ids.length;k++){
            if(ids[k]&&!document.getElementById(ids[k])){
              emit("aria-error",cssSelector(el),{attr:attrs[j],missingId:ids[k]});
            }
          }
        }
      }
    }
  }
  setTimeout(checkAriaErrors,3000);

  // --- ANIMATION WITHOUT REDUCED MOTION ---
  if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    var observer=new MutationObserver(function(mutations){
      for(var i=0;i<mutations.length;i++){
        var m=mutations[i];
        if(m.type==="attributes"&&m.attributeName==="style"){
          var style=window.getComputedStyle(m.target);
          var anim=style.animationName||style.transitionProperty;
          if(anim&&anim!=="none"){
            emit("animation-no-reduce",cssSelector(m.target),{animation:anim});
          }
        }
      }
    });
    observer.observe(document.body,{attributes:true,subtree:true,attributeFilter:["style","class"]});
  }

  // --- LOW CONTRAST INTERACTION ---
  document.addEventListener("click",function(e){
    var t=e.target;
    if(!t||!t.textContent||!t.textContent.trim())return;
    try{
      var style=window.getComputedStyle(t);
      var fg=style.color;
      var bg=style.backgroundColor;
      if(fg&&bg){
        var ratio=contrastRatio(parseColor(fg),parseColor(bg));
        if(ratio<4.5&&ratio>0){
          emit("low-contrast-interaction",cssSelector(t),{ratio:Math.round(ratio*10)/10,fg:fg,bg:bg});
        }
      }
    }catch(ex){}
  });

  // --- SCREEN READER ISSUE (empty buttons/links) ---
  document.addEventListener("click",function(e){
    var t=e.target;
    if((t.tagName==="BUTTON"||t.tagName==="A")&&!accessibleName(t)){
      emit("screen-reader-issue",cssSelector(t),{tagName:t.tagName,issue:"empty-accessible-name"});
    }
  });

  // --- HELPERS ---
  function cssSelector(el){
    if(!el||!el.tagName)return"unknown";
    if(el.id)return"#"+el.id;
    var path=el.tagName.toLowerCase();
    if(el.className&&typeof el.className==="string")path+="."+el.className.trim().split(/\\s+/).slice(0,2).join(".");
    return path.slice(0,200);
  }

  function accessibleName(el){
    return(el.getAttribute("aria-label")||el.getAttribute("aria-labelledby")||el.textContent||"").trim();
  }

  function parseColor(c){
    var m=c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    return m?[+m[1],+m[2],+m[3]]:[0,0,0];
  }

  function luminance(rgb){
    var a=rgb.map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
  }

  function contrastRatio(fg,bg){
    var l1=luminance(fg)+0.05;
    var l2=luminance(bg)+0.05;
    return l1>l2?l1/l2:l2/l1;
  }

  // Periodic flush
  setInterval(flush,FLUSH_INTERVAL);
  window.addEventListener("beforeunload",flush);
  window.addEventListener("visibilitychange",function(){if(document.hidden)flush();});
})();
`;

  return new Response(script.trim(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

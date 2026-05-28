import { NextRequest } from "next/server";

/**
 * GET /api/remediate/script?key=<api-key>
 *
 * Returns a lightweight JavaScript snippet (<2KB) that sites
 * can embed to get real-time accessibility fixes without
 * changing their source code.
 *
 * Usage:
 *   <script src="https://reglayer.com/api/remediate/script?key=rl_xxx" async></script>
 *
 * The script:
 * 1. Runs after DOM is ready
 * 2. Applies client-side accessibility fixes
 * 3. Reports fix count back to RegLayer for analytics
 */
export async function GET(request: NextRequest) {
  const apiKey = request.nextUrl.searchParams.get("key") || "";
  const origin = request.nextUrl.origin;

  const script = `
(function(){
  "use strict";
  var RL_KEY="${apiKey.replace(/[^a-zA-Z0-9_-]/g, "")}";
  var RL_ORIGIN="${origin}";

  function ready(fn){
    if(document.readyState!=="loading")fn();
    else document.addEventListener("DOMContentLoaded",fn);
  }

  function applyFixes(){
    var fixes=0;

    // 1. Lang attribute
    if(!document.documentElement.lang){
      document.documentElement.lang="en";
      fixes++;
    }

    // 2. Skip link
    if(!document.querySelector("a[href='#main'],a[href='#content'],.skip-link,.skip-nav")){
      var main=document.querySelector("main,#main,#content,[role='main']");
      if(main){
        if(!main.id)main.id="main-content";
        var skip=document.createElement("a");
        skip.href="#"+main.id;
        skip.textContent="Skip to main content";
        skip.className="reglayer-skip";
        skip.setAttribute("style","position:absolute;top:-40px;left:0;background:#000;color:#fff;padding:8px 16px;z-index:100000;font-size:14px;text-decoration:none;transition:top .2s;border-radius:0 0 4px 0;");
        skip.onfocus=function(){this.style.top="0"};
        skip.onblur=function(){this.style.top="-40px"};
        document.body.insertBefore(skip,document.body.firstChild);
        fixes++;
      }
    }

    // 3. Images without alt
    var imgs=document.querySelectorAll("img:not([alt]),img[alt='']");
    for(var i=0;i<imgs.length;i++){
      var img=imgs[i];
      var src=img.src||"";
      var inLink=img.closest&&img.closest("a,button");
      if(inLink||/spacer|pixel|track/i.test(src)){
        img.alt="";img.setAttribute("role","presentation");
      }else{
        var t=img.title||"";
        if(!t){
          var fn=src.split("/").pop()||"";
          fn=fn.split("?")[0].replace(/\\.[^.]+$/,"").replace(/[-_]/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").trim();
          t=fn.length>2?fn.charAt(0).toUpperCase()+fn.slice(1):"Image";
        }
        img.alt=t;
      }
      fixes++;
    }

    // 4. Form inputs without labels
    var inputs=document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']),textarea,select");
    for(var j=0;j<inputs.length;j++){
      var inp=inputs[j];
      if(inp.getAttribute("aria-label")||inp.getAttribute("aria-labelledby"))continue;
      if(inp.id&&document.querySelector("label[for='"+inp.id+"']"))continue;
      if(inp.closest&&inp.closest("label"))continue;
      var lbl=inp.placeholder||inp.name||inp.type||"Input";
      lbl=lbl.replace(/[-_\\[\\]]/g," ").trim();
      if(lbl)inp.setAttribute("aria-label",lbl.charAt(0).toUpperCase()+lbl.slice(1));
      fixes++;
    }

    // 5. Buttons without labels
    var btns=document.querySelectorAll("button,[role='button']");
    for(var k=0;k<btns.length;k++){
      var btn=btns[k];
      if(btn.textContent&&btn.textContent.trim())continue;
      if(btn.getAttribute("aria-label")||btn.title)continue;
      var bImg=btn.querySelector("img[alt]");
      if(bImg&&bImg.alt){btn.setAttribute("aria-label",bImg.alt);fixes++;continue;}
      var svgT=btn.querySelector("svg title");
      if(svgT&&svgT.textContent){btn.setAttribute("aria-label",svgT.textContent.trim());fixes++;continue;}
      var cls=btn.className||"";
      var m=cls.match(/(close|menu|search|submit|send|delete|edit|save|cancel|next|prev|play|pause)/i);
      if(m){btn.setAttribute("aria-label",m[1].charAt(0).toUpperCase()+m[1].slice(1));fixes++;}
      else{btn.setAttribute("aria-label","Button");fixes++;}
    }

    // 6. Fix positive tabindex
    var tabs=document.querySelectorAll("[tabindex]");
    for(var l=0;l<tabs.length;l++){
      var ti=parseInt(tabs[l].getAttribute("tabindex"),10);
      if(ti>0){tabs[l].setAttribute("tabindex","0");fixes++;}
    }

    // 7. Multiple navs without labels
    var navs=document.querySelectorAll("nav:not([aria-label]):not([aria-labelledby])");
    if(navs.length>1){
      for(var n=0;n<navs.length;n++){
        navs[n].setAttribute("aria-label","Navigation "+(n+1));
        fixes++;
      }
    }

    // Report fixes
    if(fixes>0&&RL_KEY){
      var beacon=new Image();
      beacon.src=RL_ORIGIN+"/api/remediate/beacon?key="+RL_KEY+"&fixes="+fixes+"&url="+encodeURIComponent(location.href);
    }

    return fixes;
  }

  ready(applyFixes);
})();
`.trim();

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600", // 1 hour cache
      "Access-Control-Allow-Origin": "*",
    },
  });
}

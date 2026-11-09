/* ============================================================
   SexyRose MVP — views-public.js
   Vistas públicas: inicio, swipe, perfil, shorts, stars, login, registro.
   Acciones con prefijo `pub`. Un solo IIFE; cuelga de window.HH.
   ============================================================ */
(function () {
  "use strict";
  const esc = HH.esc;
  // Estado efímero del módulo (lo persistente va en HH.ui / HH.db)
  const S = {
    queue: [],
    busy: false,
    shortsTab: "foryou",
    profileTab: "all",
    profileSlug: null,
    liked: new Set(),
  };

  /* ---------- CSS puntual (una sola vez) ---------- */
  const CSS = `
.chip.sm{padding:4px 9px;font-size:12px}.chip.sm svg{width:13px;height:13px}
.pub-badges{position:absolute;left:8px;top:8px;display:flex;gap:4px;flex-wrap:wrap;z-index:1}
.pub-ico{width:42px;height:42px;border-radius:12px;background:var(--berry-tint);color:var(--berry);display:grid;place-items:center;flex:none}.pub-ico svg{width:21px;height:21px}
.pub-ir{display:inline-flex;align-items:center;gap:6px;min-width:0}.pub-ir svg{width:16px;height:16px;flex:none;color:var(--berry)}.pub-ir.ok svg{color:var(--ok)}.pub-ir.fg svg{color:currentColor}
.demo-accounts button svg{width:18px;height:18px;color:var(--muted);flex:none}
.pub-hscroll{display:flex;gap:12px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:4px 16px 8px;scroll-snap-type:x mandatory}
.tiers{display:grid;gap:22px}
.tier{display:grid;gap:10px}
.tier-h{display:flex;align-items:center;gap:10px}.tier-h .badge{font-size:13px;padding:4px 12px}.tier-h .badge svg{width:13px;height:13px}
.tier-grid{display:grid;gap:10px;grid-template-columns:repeat(3,minmax(0,1fr))}
.tier-grid.lg{grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:720px){.tier-grid.lg{grid-template-columns:repeat(4,minmax(0,1fr))}.tier-grid.md{grid-template-columns:repeat(5,minmax(0,1fr))}.tier-grid.sm{grid-template-columns:repeat(6,minmax(0,1fr))}}
.tier-grid .pcard .media{aspect-ratio:4/5}
.tier-grid .pcard .body{padding:8px 10px 10px;gap:3px}
.tier-grid .pcard .name{font-size:14px}.tier-grid.lg .pcard .name{font-size:16px}
.tier-grid .pcard .meta{font-size:12px}
/* Viaje en la tarjeta: línea compacta (sin pastilla) que baja a 2 líneas como máximo; el texto completo queda en el title */
.pcard .body{grid-template-columns:minmax(0,1fr)}
.pcard-trip{display:grid;gap:1px;min-width:0;font-size:12px;font-weight:700;line-height:1.3}.pcard-trip .t1{display:flex;gap:4px;align-items:center;min-width:0}.pcard-trip .t1 svg{width:13px;height:13px;flex:none}.pcard-trip .t1>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pcard-trip .t2{font-weight:600;opacity:.9;overflow-wrap:anywhere}.pcard-trip.info{color:var(--info)}.pcard-trip.warn{color:var(--warn)}
.tier-grid.sm .pcard .media .ph .initial,.tier-grid.md .pcard .media .ph .initial{font-size:34px}
.tier-grid.sm .pcard .pub-badges .badge{font-size:10px;padding:2px 6px}
.pub-placebar{display:flex;align-items:center;gap:10px;padding-top:12px;flex-wrap:wrap}
.place-pill{display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:9px 14px;border-radius:999px;border:0;background:var(--berry);color:var(--berry-ink);font:inherit;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 6px 16px color-mix(in srgb,var(--berry) 30%,transparent)}
.place-pill svg{width:16px;height:16px;flex:none}.place-pill.block{width:100%;justify-content:flex-start}.place-pill.block svg:last-child{margin-left:auto}
.pp{display:grid;gap:10px}
.pp-top{display:flex;gap:8px;align-items:center;position:sticky;top:0}
.pp-back{width:40px;height:40px;flex:none;border-radius:50%;border:1px solid var(--line-2);background:var(--surface-2);color:var(--fg);display:grid;place-items:center;cursor:pointer}.pp-back svg{width:18px;height:18px}
.pp-search{border-radius:999px;background:var(--surface-2)}
.pp-list{display:grid;max-height:min(60vh,520px);overflow-y:auto}
.pp-row{display:flex;align-items:center;gap:4px}
.pp-row.dim .pp-name{opacity:.55}
.pp-name{flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:12px 6px;border:0;background:none;color:var(--fg);font:inherit;font-size:15px;text-align:left;cursor:pointer;border-radius:10px}
.pp-name:hover{background:var(--surface-2)}
.pp-check{width:22px;height:22px;flex:none;border-radius:50%;background:var(--berry);color:var(--berry-ink);display:grid;place-items:center}.pp-check svg{width:14px;height:14px}.pp-check.off{background:none}
.pp-go{width:40px;height:40px;flex:none;border:0;background:none;color:var(--fg-2);display:grid;place-items:center;cursor:pointer;border-radius:10px}.pp-go:hover{background:var(--surface-2)}.pp-go svg{width:18px;height:18px}
.pp-sep{height:1px;background:var(--line);margin:4px 0}
.pp-path{margin:-8px 0 6px 40px}
.km-sel{position:relative;display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:38px;border-radius:999px;background:var(--surface);border:1px solid var(--line-2);color:var(--fg);font-weight:700;font-size:14px;cursor:pointer}
.km-sel select{appearance:none;-webkit-appearance:none;background:none;border:0;color:inherit;font:inherit;padding:0 2px;cursor:pointer;outline:none}
.km-sel select option{background:var(--surface);color:var(--fg)}
.km-sel svg{width:15px;height:15px;color:var(--berry);flex:none}.km-sel svg:last-child{color:var(--muted);pointer-events:none}
.km-sel.off{opacity:.7}
.msg-split{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.msg-split .btn{width:100%;padding-inline:10px}
.btn.tg{background:#2AABEE;color:#fff;box-shadow:0 6px 16px rgba(42,171,238,.3)}.btn.tg:hover{background:#1f97d6}
.pub-stars-sec{padding-block:14px 18px}
@media(min-width:900px){.pub-stars-sec{padding-block:22px 26px}}
.pub-stars-sec h2{font-size:clamp(18px,4.6vw,24px)}
.pub-stars-row{scroll-padding-inline:16px}
.pub-stars-row>*{flex:0 0 36%!important}
.pub-stars-row .pcard .media{aspect-ratio:4/5!important}
@media(min-width:720px){.pub-stars-row .pcard .media{aspect-ratio:1!important}}
.pub-stars-row .pcard .body{padding:8px 10px 10px;gap:3px}
.pub-stars-row .pcard .name{font-size:14px}
.pub-stars-row .pcard .meta{font-size:12px}
.pub-stars-row .media .ph .initial{font-size:34px}
@media(min-width:720px){.pub-stars-row{display:flex!important;overflow-x:auto!important;margin:0 -16px!important;padding:4px 16px 8px!important}.pub-stars-row>*{flex:0 0 200px!important}}
@media(min-width:1100px){.pub-stars-row{margin:0!important;padding:4px 0 8px!important}.pub-stars-row>*{flex:0 0 calc((100% - 60px)/6)!important}}
.pub-hscroll::-webkit-scrollbar{display:none}.pub-hscroll>*{flex:0 0 70%;scroll-snap-align:start}
@media(min-width:720px){.pub-hscroll{display:grid;grid-template-columns:repeat(3,1fr);margin:0;padding:0;overflow:visible}.pub-hscroll>*{flex:auto}.pub-hscroll .pcard .media{aspect-ratio:1}}
.pub-faq{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);padding:0 16px}
.pub-faq summary{cursor:pointer;padding:14px 0;font-weight:700;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px}
.pub-faq summary::-webkit-details-marker{display:none}.pub-faq summary svg{width:18px;height:18px;flex:none;color:var(--berry);transition:transform .2s}
.pub-faq[open] summary svg{transform:rotate(180deg)}.pub-faq p{padding:0 0 14px;color:var(--fg-2);font-size:14px}
.pub-footer{border-top:1px solid var(--line);padding:26px 0 8px;font-size:13px;color:var(--muted)}.pub-footer a{color:var(--fg-2);font-weight:600}
.pub-swipe{display:grid;gap:14px}
@media(min-width:900px){.pub-swipe{grid-template-columns:460px 1fr;gap:40px;align-items:start}.pub-swipe-main{grid-column:1;grid-row:1}.pub-swipe-side{grid-column:2;grid-row:1;position:sticky;top:84px}}
.pub-swipe .swipe-stage{height:clamp(240px,calc(100dvh - 415px),640px)}
@media(min-width:900px){.pub-swipe .swipe-stage{height:clamp(480px,calc(100dvh - 230px),680px);max-width:460px}.pub-swipe-side .chips.scroll{flex-wrap:wrap;overflow:visible}}
.pub-swipe .swipe-actions{margin-top:24px}
@media(max-width:899px){.pub-swipe{display:flex;flex-direction:column;height:calc(100dvh - var(--header-h) - var(--bottomnav-h) - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - var(--sr-demo-h,0px) - 32px);min-height:430px}.pub-swipe-side{flex:none}.pub-swipe-main{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}.pub-swipe .swipe-stage{flex:1 1 auto;width:100%;height:auto;min-height:200px;max-height:640px}.pub-swipe .swipe-actions{flex:none;margin-top:28px}}
@media(max-width:899px) and (max-height:700px){.pub-swipe .swipe-actions{margin-top:22px}.pub-swipe .swipe-actions .btn.round{--sr-act:54px}}
/* Mobile estilo Tinder (v57): una fila compacta arriba, tarjeta vertical que ocupa el resto y botones flotando sobre la foto */
@media(max-width:899px){
.pub-swipe-wrap{padding-block:10px!important}
.pub-swipe{height:calc(100dvh - var(--header-h) - var(--bottomnav-h) - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - var(--sr-demo-h,0px) - 20px);min-height:360px;gap:10px}
.pub-swipe-side{gap:8px!important}
.sw-top{gap:8px}.sw-ib{width:46px;height:46px;border-radius:999px;position:relative}.sw-ib svg{width:20px;height:20px}
.sw-ib.on{border-color:var(--berry);color:var(--berry)}.sw-dot{position:absolute;top:8px;right:9px;width:8px;height:8px;border-radius:50%;background:var(--berry)}
.sw-chips{display:none!important}.sw-chips.open{display:flex!important}
.pub-swipe-main{position:relative}
.pub-swipe .swipe-stage{max-height:none;margin-bottom:10px}
.pub-swipe .swipe-actions{position:absolute;left:0;right:0;bottom:24px;margin:0!important;z-index:5;pointer-events:none}
.pub-swipe .swipe-actions .btn.round{pointer-events:auto}
.pub-swipe .swipe-actions .btn.round.nope,.pub-swipe .swipe-actions .btn.round.info{background:rgba(21,19,26,.72);border-color:rgba(255,255,255,.18);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.pub-swipe .swipe-card .info{padding-bottom:96px}
.pub-swipe .swipe-card.back1{transform:scale(.97) translateY(7px)}.pub-swipe .swipe-card.back2{transform:scale(.94) translateY(14px)}
}
.swipe-card{transition:transform .25s ease,opacity .25s ease}
.swipe-card.dragging{transition:none;cursor:grabbing}
.swipe-card.top{z-index:3;cursor:grab;animation:pubPromote .25s ease}
.swipe-card.back1{z-index:2;transform:scale(.96) translateY(20px)}
.swipe-card.back2{z-index:1;transform:scale(.92) translateY(38px)}
@keyframes pubPromote{from{transform:scale(.96) translateY(20px)}to{transform:none}}
.swipe-card .info .chip{background:rgba(255,255,255,.18);border-color:transparent;color:#fff}
.swipe-card .info .meta{display:flex;gap:6px;align-items:center;font-size:14px;opacity:.92}.swipe-card .info .meta svg{width:15px;height:15px}
.swipe-card .info .head{font-size:14px;opacity:.95}
.shorts-page{position:relative;max-width:480px;margin:0 auto}
.pub-feed{height:calc(100dvh - var(--header-h) - var(--bottomnav-h));overflow-y:auto;scroll-snap-type:y mandatory;scrollbar-width:none;display:grid;grid-auto-rows:100%;gap:0;overscroll-behavior:contain;max-width:none}
.pub-feed::-webkit-scrollbar{display:none}
@media(min-width:900px){.pub-feed{height:calc(100dvh - var(--header-h) - 24px);gap:14px;padding-top:12px}.pub-feed .short{border-radius:22px}}
.pub-feed .short{scroll-snap-align:start;height:100%;max-height:none;aspect-ratio:auto;width:100%;border-radius:0;box-shadow:none}
.shorts-tabs{position:absolute;top:10px;left:0;right:0;z-index:5;display:flex;justify-content:center;gap:18px;pointer-events:none}
@media(min-width:900px){.shorts-tabs{top:22px}}
.shorts-tabs button{pointer-events:auto;background:none;border:0;color:rgba(255,255,255,.7);font:inherit;font-weight:700;font-size:15px;padding:4px 2px;text-shadow:0 1px 6px rgba(0,0,0,.5);cursor:pointer;border-bottom:2px solid transparent}
.shorts-tabs button[aria-selected="true"]{color:#fff;border-color:var(--berry)}
.short .overlay{padding:60px 78px 20px 16px;background:linear-gradient(to top,rgba(0,0,0,.75),rgba(0,0,0,0));gap:6px}
.short .overlay .who{display:inline-flex;align-items:center;gap:6px;color:#fff;font-size:16px}
.short .overlay .who svg{width:16px;height:16px}
.short .overlay .cap{opacity:.95}.short .overlay .meta{display:flex;align-items:center;gap:4px;opacity:.8}.short .overlay .meta svg{width:13px;height:13px}
.short .side{right:8px;bottom:24px;gap:10px;z-index:3}
.short .side button{background:transparent;backdrop-filter:none;width:48px;height:44px;filter:drop-shadow(0 1px 4px rgba(0,0,0,.5))}
.short .side button svg{width:30px;height:30px}
.short .side .lbl{margin-top:-10px;text-shadow:0 1px 4px rgba(0,0,0,.6)}
.short .side .av{position:relative;height:58px;margin-bottom:6px}.short .side .av .avatar{border:2px solid #fff}
.short .side .av .plus{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:20px;height:20px;border-radius:50%;background:var(--berry);color:#fff;display:grid;place-items:center}
.short .side .av .plus svg{width:13px;height:13px}
.short .side button.pop svg{animation:pubPop .35s ease}@keyframes pubPop{50%{transform:scale(1.35)}}
.short .media .dur{display:none}
.short-lock{position:absolute;inset:0;z-index:2;display:grid;place-content:center;justify-items:center;gap:10px;color:#fff;background:rgba(10,8,12,.55);backdrop-filter:blur(14px)}
.short-lock .ico{width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.15);display:grid;place-items:center}.short-lock .ico svg{width:26px;height:26px}
.shorts-hint{position:absolute;inset:0;z-index:6;display:grid;place-content:center;justify-items:center;gap:12px;background:rgba(0,0,0,.45);color:#fff;border:0;font:inherit;font-weight:700;font-size:16px;cursor:pointer}
.shorts-hint .hand{width:64px;height:64px;border-radius:50%;background:var(--berry);display:grid;place-items:center;transform:rotate(90deg);animation:pubHint 1.4s ease-in-out infinite}
.shorts-hint .hand svg{width:30px;height:30px;color:#fff}
@keyframes pubHint{0%,100%{translate:0 14px}50%{translate:0 -14px}}
.share-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 6px}
.share-it{display:grid;justify-items:center;gap:6px;background:none;border:0;color:var(--fg-2);font:inherit;font-size:12px;text-align:center;cursor:pointer;text-decoration:none}
.share-it .ic{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;color:#fff}.share-it .ic svg{width:24px;height:24px}
.share-it .ic.soft{background:var(--berry-tint);color:var(--berry)}
.report-list{display:grid;gap:2px}
.report-opt{display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--line);cursor:pointer;font-size:14px}
.report-opt input{accent-color:var(--berry);width:18px;height:18px}
.pub-prog{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.25);z-index:2}.pub-prog i{display:block;height:100%;width:0;background:#fff}
.short.playing .pub-prog i{animation:pubProg var(--dur,20s) linear infinite}.short.paused .pub-prog i{animation-play-state:paused}
@keyframes pubProg{from{width:0}to{width:100%}}
.pub-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:50%;border:0;background:rgba(255,255,255,.9);color:var(--berry);display:grid;place-items:center;box-shadow:var(--shadow);z-index:2;transition:opacity .2s}
.pub-play svg{width:26px;height:26px}.short.playing:not(.paused) .pub-play{opacity:0}.short.playing:not(.paused):hover .pub-play,.short.playing:not(.paused) .pub-play:focus-visible{opacity:.9}
.short .side button.liked{color:var(--berry)}.short .side button.liked svg{fill:currentColor}
.short .overlay .who{display:flex;gap:10px;align-items:center;font-weight:700;line-height:1.25}.short .overlay .who .small{font-weight:500;opacity:.85}
.pf2{max-width:860px;display:grid;gap:16px}
.pf-crumbs{display:flex;flex-wrap:nowrap;align-items:center;gap:6px;font-size:13px;color:var(--muted);overflow-x:auto;white-space:nowrap;scrollbar-width:none}.pf-crumbs::-webkit-scrollbar{display:none}.pf-crumbs svg{width:13px;height:13px;flex:none}.pf-crumbs a{color:var(--fg-2)}.pf-crumbs [aria-current]{color:var(--fg);font-weight:700}
.pf-card{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"thumb head" "contact contact";gap:14px 16px;align-items:center;padding:4px 0}
@media(min-width:720px){.pf-card{grid-template-areas:"thumb head" "thumb contact";gap:10px 28px;align-items:start}}
.pf-thumb{grid-area:thumb}.pf-head{grid-area:head}.pf-contact{grid-area:contact;align-self:start}
.pf-thumb{position:relative;width:104px;height:104px;padding:4px;border:0;border-radius:50%;cursor:pointer;background:var(--line-2);display:grid;place-items:center;align-self:start}
.pf-thumb::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--bg)}
.pf-thumb .media{position:relative;z-index:1;width:100%;height:100%;aspect-ratio:1;border-radius:50%;overflow:hidden;border:3px solid var(--bg)}.pf-thumb .media img{object-fit:cover}
.pf-thumb.has-st{background:conic-gradient(from 200deg,var(--berry),var(--pink),var(--gold),var(--berry))}.pf-thumb.has-st.seen{background:var(--line-2)}
@media(min-width:720px){.pf-thumb{width:168px;height:168px;padding:5px}}
.pf-head{display:flex;flex-direction:column;gap:5px;min-width:0}
.pf-head h1{font-size:clamp(22px,5.4vw,32px);line-height:1.1;margin:0;overflow-wrap:anywhere;text-transform:uppercase;letter-spacing:.01em}
.pf-age{font-size:15px;color:var(--fg-2);font-weight:600}
.pf-loc{display:flex;gap:5px;align-items:flex-start;font-size:14px;color:var(--muted)}.pf-loc svg{width:15px;height:15px;flex:none;margin-top:2px;color:var(--berry)}
.pf-rate{display:flex;align-items:baseline;gap:4px 6px;flex-wrap:wrap;font-size:13px;color:var(--muted)}.pf-rate strong{color:var(--ok);font-size:16px}.pf-rv{white-space:nowrap;color:var(--fg-2)}
.pf-contact{display:grid;gap:12px}
.pf-acts{display:flex;gap:6px;justify-content:flex-start}
.pf-act{display:flex;flex-direction:column;align-items:center;gap:5px;padding:0;border:0;background:none;color:var(--fg-2);cursor:pointer;min-width:64px;font:inherit}
.pf-act .pf-ab{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:var(--surface-2,var(--surface));border:1px solid var(--line-2);color:var(--fg);transition:transform .15s}.pf-act .pf-ab svg{width:22px;height:22px}
.pf-act .pf-al{font-size:12px;font-weight:600;line-height:1.15;text-align:center;max-width:76px}
.pf-act:hover .pf-ab{transform:scale(1.06)}.pf-act:disabled{opacity:.45;cursor:not-allowed}.pf-act:disabled .pf-ab{transform:none}
.pf-act.wa .pf-ab{background:#25D366;border-color:transparent;color:#fff;box-shadow:0 6px 16px rgba(37,211,102,.28)}
.pf-act.pf-fav.on{color:var(--berry)}.pf-act.pf-fav.on .pf-ab{color:var(--berry);border-color:var(--berry)}.pf-act.pf-fav.on svg{fill:currentColor}
.pf-c3{display:flex;flex-wrap:wrap;gap:6px 14px}
.pf-lnk{display:inline-flex;align-items:center;gap:5px;padding:0;border:0;background:none;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;text-decoration:none}.pf-lnk svg{width:14px;height:14px}.pf-lnk:hover{color:var(--fg)}
@media(max-width:380px){.pf-act{min-width:0;flex:1}.pf-act .pf-ab{width:48px;height:48px}}
.pf-tabs{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;padding:4px;border-radius:99px;background:var(--surface);border:1px solid var(--line)}
.pf-tabs button{border:0;background:none;color:var(--fg-2);font:inherit;font-weight:700;font-size:15px;padding:10px 6px;border-radius:99px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.pf-tabs button.on{background:var(--bg);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line-2)}
@media(max-width:380px){.pf-tabs button{font-size:14px}}@media(min-width:720px){.pf-tabs{max-width:640px}}
.pf-panel[hidden]{display:none!important}
.pf-ic{display:inline-grid;place-items:center;margin-left:8px;vertical-align:middle}.pf-ic svg{width:.62em;height:.62em}.pf-ic.star{color:var(--gold)}.pf-ic.star svg{fill:currentColor}.pf-ic.ok{color:var(--info)}.pf-trip{color:var(--info)}.pf-trip svg{color:var(--info)}
.pf-about{display:grid;gap:8px}.pf-about h2{font-size:22px;margin:4px 0 0}.pf-about dl{margin:0;display:grid;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);overflow:hidden}.pf-about dl>div{display:grid;grid-template-columns:130px 1fr;gap:12px;padding:11px 14px;border-top:1px solid var(--line)}.pf-about dl>div:first-child{border-top:0}.pf-about dt{color:var(--muted);font-size:14px}.pf-about dd{margin:0;font-weight:600;font-size:15px}
@media(min-width:720px){.pf-about dl{grid-template-columns:1fr 1fr}.pf-about dl>div:nth-child(2){border-top:0}.pf-about dl>div:nth-child(even){border-left:1px solid var(--line)}.pf-about dl>div:last-child:nth-child(odd){grid-column:1/-1}}
@media(max-width:420px){.pf-about dl>div{grid-template-columns:104px 1fr}}
.pf-tag{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:99px;border:1px solid color-mix(in srgb,var(--berry) 55%,transparent);background:var(--berry-tint);color:var(--berry);font-weight:700;font-size:14px}.pf-tag svg{width:15px;height:15px}
.pf-facts{display:flex;flex-wrap:wrap;gap:8px}
.pf-fact{display:inline-flex;align-items:baseline;gap:6px;padding:7px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);font-size:14px}.pf-fact .k{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.pf-fact .v{font-weight:700}
.pf-sub{display:grid;gap:8px}.pf-h{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
.pf-desc{display:grid;gap:8px}.pf-desc h2,.pf-gal h2,.pf-h2{font-size:22px;margin:4px 0 0}
.pf-bio{margin:0;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.pf-bio.open{display:block}
.pf-more{justify-self:start;padding:0;border:0;background:none;color:var(--info);font-weight:700;cursor:pointer;font-size:15px}
.pf-meta{font-size:13px;color:var(--muted);margin:0}
.pf-gal{display:grid;gap:12px}
.pf-gtabs{display:inline-flex;gap:4px;padding:4px;border-radius:99px;background:var(--surface);border:1px solid var(--line);justify-self:start;max-width:100%;overflow-x:auto}
.pf-gtabs button{border:0;background:none;color:var(--fg-2);font-weight:700;font-size:14px;padding:8px 16px;border-radius:99px;cursor:pointer;white-space:nowrap}.pf-gtabs button.on{background:var(--berry);color:var(--berry-ink)}
.pf-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
@media(min-width:720px){.pf-grid{grid-template-columns:repeat(5,1fr);gap:8px}.pf-contact{max-width:460px}}
.pf-tile{padding:0;border:0;background:none;cursor:pointer;border-radius:12px;overflow:hidden;position:relative}.pf-tile .media{border-radius:12px;position:relative}
.pf-all{aspect-ratio:1;display:grid;place-content:center;gap:2px;border:1px dashed var(--line-2);background:var(--surface);color:var(--fg)}
.pf-lb .media{max-height:70vh;aspect-ratio:auto;min-height:300px;border-radius:14px}.pf-lb img{object-fit:contain}
.pub-profile{display:grid;gap:20px}
@media(min-width:900px){.pub-profile{grid-template-columns:400px 1fr;gap:40px;align-items:start}.pub-profile-left{position:sticky;top:84px}}
.pub-thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}
.pub-thumbs button{padding:0;border:2px solid transparent;border-radius:var(--radius-sm);background:none;overflow:hidden;cursor:pointer}
.pub-thumbs button[aria-current="true"]{border-color:var(--berry)}.pub-thumbs .media{aspect-ratio:1;border-radius:9px}
.lk-page{max-width:520px;padding-block:28px 40px;display:grid;gap:18px}.lk-head{display:grid;justify-items:center;gap:6px;text-align:center}.lk-head h2{margin-top:6px}.lk-list{display:grid;gap:10px}
.lk-btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:12px 16px;border-radius:16px;border:1px solid var(--line-2);background:var(--surface);color:var(--fg);font:inherit;font-weight:700;text-decoration:none;cursor:pointer;text-align:center}.lk-btn svg{width:18px;height:18px}.lk-btn.main{background:var(--berry-tint);border-color:var(--berry);color:var(--fg)}.lk-btn:hover{border-color:var(--berry)}.lk-legal{text-align:center;max-width:44ch;margin:0 auto}
.pub-thumbs.scroll{display:flex;overflow-x:auto;scrollbar-width:thin;padding-bottom:4px}.pub-thumbs.scroll button{flex:0 0 calc((100% - 24px)/4.4)}
.pub-thumbs .media{position:relative}.pub-more{flex:0 0 calc((100% - 24px)/4.4);aspect-ratio:1;display:grid;place-content:center;gap:2px;border-radius:9px!important;border:1px dashed var(--line-2)!important;background:var(--surface)!important;color:var(--fg)}.pub-all{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px}.pub-all button{padding:0;border:0;background:none;cursor:pointer;border-radius:10px;overflow:hidden}.pub-all .pub-vbadge{bottom:4px;left:4px}.pub-all .media{position:relative}.pub-vbadge{position:absolute;left:6px;bottom:6px;display:inline-flex;align-items:center;gap:2px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:700;padding:2px 6px;border-radius:99px}.pub-vbadge svg{width:11px;height:11px}
.pub-item{cursor:pointer;display:grid;gap:4px;min-width:0;padding:0;border:0;background:none;text-align:left;color:inherit;font:inherit}
.pub-item .media{aspect-ratio:4/5;width:100%}
.pub-bought{color:var(--ok,#2ecc71);font-weight:700;display:inline-flex;align-items:center;gap:3px}.pub-bought svg{width:12px;height:12px}
.pub-pack-thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.pub-pack-thumbs .media{aspect-ratio:1;border-radius:6px}
.pub-stars-big{display:grid;gap:16px}@media(min-width:720px){.pub-stars-big{grid-template-columns:repeat(3,1fr)}}
.radio-card:has(input:focus-visible){outline:3px solid var(--pink);outline-offset:2px}
.pub-check{display:flex;gap:10px;align-items:flex-start;font-size:14px;cursor:pointer}.pub-check input{width:18px;height:18px;flex:none;margin-top:2px;accent-color:var(--berry)}
.pub-steps{display:flex;gap:6px;justify-content:center}.pub-steps span{width:22px;height:5px;border-radius:5px;background:var(--line-2)}.pub-steps span.on{background:var(--berry)}
.pub-reg-ico{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;background:var(--berry-tint);color:var(--berry)}.pub-reg-ico svg.ico{width:28px;height:28px}.pub-reg-ico.ok{background:var(--ok-tint);color:var(--ok)}
.pub-choice{display:flex;align-items:center;gap:12px;text-align:left;padding:18px;border-radius:20px;border:1px solid var(--line);background:var(--surface-2);color:var(--fg);cursor:pointer;width:100%}.pub-choice:hover{border-color:var(--berry);background:var(--berry-tint)}.pub-choice .grow{display:grid;gap:3px}.pub-choice strong{font-size:17px}.pub-choice>svg.ico{width:20px;height:20px;color:var(--muted)}
.pub-gchip:has(input:checked){background:var(--berry);color:var(--berry-ink);border-color:var(--berry)}
.pub-phone{display:grid;grid-template-columns:116px minmax(0,1fr);gap:8px}
.pub-genders{display:flex;justify-content:center;gap:clamp(18px,6vw,44px);padding-block:18px 6px}
.pub-gbub{display:grid;justify-items:center;gap:8px;background:none;border:0;color:var(--fg);cursor:pointer;font:inherit}
.pub-gbub .ic{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:2px solid var(--line-2);color:var(--pink);transition:transform .15s,border-color .15s,background .15s;box-shadow:var(--shadow-sm)}
.pub-gbub .ic svg.ico{width:34px;height:34px}
.pub-gbub .lb{font-size:13px;font-weight:800;letter-spacing:.02em}
.pub-gbub:hover .ic{transform:translateY(-2px);border-color:var(--pink)}
.pub-gbub.on .ic{background:linear-gradient(135deg,var(--berry),var(--pink));border-color:transparent;color:#fff}
.pub-gbub.on .lb{color:var(--berry)}
@media(min-width:900px){.pub-gbub .ic{width:88px;height:88px}}
.pub-cats{border:1px solid var(--line);border-radius:18px;background:var(--surface);overflow:hidden}
.pub-cats summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;cursor:pointer;font-size:16px}
.pub-cats summary::-webkit-details-marker{display:none}
.pub-cats summary>svg.ico{transition:transform .2s;color:var(--muted)}
.pub-cats[open] summary>svg.ico{transform:rotate(180deg)}
.pub-cats summary .pub-ir{gap:10px}.pub-cats summary .pub-ir svg.ico{color:var(--berry)}
.pub-cats .chips{padding:0 16px 16px}
.pub-swipe-cta{font-size:17px;padding-block:16px;max-width:520px;margin-inline:auto}
.pub-place{position:relative}.pub-place-res{display:grid;gap:4px}
.pub-place-opt{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--fg);text-align:left;cursor:pointer;font:inherit}.pub-place-opt:hover{border-color:var(--berry)}
.pub-place-opt .grow{display:grid;gap:1px;min-width:0}.pub-place-opt>svg.ico{color:var(--berry)}
.pub-place-manual summary{cursor:pointer;color:var(--berry);font-weight:700;padding:6px 0}
/* v2: hero con imagen */
.pub-hero-media{aspect-ratio:4/3;border-radius:28px;box-shadow:var(--shadow);width:100%}
@media(min-width:900px){.pub-hero-media{aspect-ratio:4/5;max-width:440px;margin-left:auto}}
/* v2: grilla de perfiles (inicio) */
.pub-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ok);flex:none;box-shadow:0 0 0 2px var(--surface)}
.pub-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 10px;align-items:start}
@media(min-width:720px){.pub-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}}
@media(min-width:1100px){.pub-grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:16px}}
.pub-gcell{display:grid;gap:7px;color:inherit;min-width:0;border-radius:18px;align-content:start;grid-auto-rows:max-content}
.pub-gcell .media{border-radius:18px;transition:transform .15s ease,box-shadow .15s ease}
.pub-gcell:hover .media{transform:translateY(-2px);box-shadow:var(--shadow)}
.pub-gcell .media .ph .initial{font-size:clamp(26px,7vw,52px)}.pub-gcell .media .ph .silhouette{bottom:-20%}
.pub-gname{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;padding:0 2px;min-width:0}
@media(min-width:720px){.pub-gname{font-size:14px}}
.pub-gstar{position:absolute;left:8px;top:8px;width:24px;height:24px;border-radius:50%;background:var(--surface);color:var(--gold,#E0A030);display:grid;place-items:center;box-shadow:var(--shadow-sm);z-index:1}.pub-gstar svg{width:14px;height:14px;fill:currentColor}
.pub-city-btn{display:inline-flex;align-items:center;gap:6px}.pub-city-btn svg{width:15px;height:15px}
/* v2: Cerca de mí */
.pub-near-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pub-near-head h1{font-size:26px;margin-right:auto}
.pub-near-head .select{width:100%;padding-block:9px}.pub-near-head .field{flex:1 1 160px}
@media(max-width:719px){.pub-near-head h1{flex:1 0 100%}}
@media(min-width:720px){.pub-near-head .field{flex:0 0 auto;min-width:200px}}
.pub-near{position:relative;border-radius:28px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;padding:22px 10px 30px}
.pub-near::before{content:"";position:absolute;inset:0;pointer-events:none;background:
  repeating-radial-gradient(circle at 50% 56px, transparent 0 72px, color-mix(in srgb, var(--berry) 9%, transparent) 72px 74px),
  radial-gradient(circle at 50% 56px, color-mix(in srgb, var(--surface) 70%, transparent), transparent 60%)}
.pub-near-items,.pub-near-more{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 8px;justify-items:center}
.pub-near-items>:nth-child(3n+1),.pub-near-items>:nth-child(3n){transform:translateY(34px)}
.pub-near-items{padding-bottom:34px}
.pub-near-more{margin-top:14px}
.pub-bub{display:grid;justify-items:center;gap:6px;color:inherit;text-align:center;width:max-content;max-width:100%;--bs:92px;border-radius:14px}
.pub-bub-av{position:relative;width:var(--bs);height:var(--bs)}
.pub-bub .avatar{width:var(--bs)!important;height:var(--bs)!important;font-size:calc(var(--bs)*.36)!important;border:3px solid var(--surface);box-shadow:var(--shadow);transition:transform .15s ease}
.pub-bub:hover .avatar{transform:scale(1.04)}
.pub-bub-pin{position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);width:24px;height:24px;border-radius:50%;background:var(--berry);color:#fff;display:grid;place-items:center;border:2px solid var(--surface);box-shadow:var(--shadow-sm)}.pub-bub-pin svg{width:13px;height:13px}
.pub-bub-name{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:700;line-height:1.2;max-width:120px;min-width:0}
.pub-bub-name .ellipsis{display:block}
.pub-bub-name .ver{color:var(--info);display:inline-flex;flex:none}.pub-bub-name .ver svg{width:14px;height:14px}
.pub-bub.city{--bs:104px}
.pub-bub.city .pub-bub-av{border-radius:50%;background:var(--surface);box-shadow:0 0 0 10px color-mix(in srgb, var(--berry) 8%, transparent),var(--shadow);display:grid;place-content:center;justify-items:center;gap:4px;padding:8px;color:var(--berry);font-weight:800;font-size:12px;line-height:1.15;text-align:center}
.pub-bub.city .pub-bub-av svg{width:22px;height:22px}
.pub-bub.city .pub-bub-av span{color:var(--fg);font-size:12px}
@media(min-width:900px){
  .pub-near{height:780px;padding:0}
  .pub-near::before{background:repeating-radial-gradient(ellipse 38% 40% at 50% 50%, transparent 0 24%, color-mix(in srgb, var(--berry) 9%, transparent) 24% 25%),radial-gradient(ellipse 30% 30% at 50% 50%, color-mix(in srgb, var(--surface) 75%, transparent), transparent 100%)}
  .pub-near-items{display:block;position:absolute;inset:0;padding:0}
  .pub-near-items>:nth-child(3n+1),.pub-near-items>:nth-child(3n){transform:none}
  .pub-near-items .pub-bub{position:absolute;left:calc(50% + var(--x,0%));top:calc(50% + var(--y,0px));transform:translate(-50%,-50%);--bs:110px}
  .pub-near-items .pub-bub.city{--bs:132px}
  .pub-near-items .pub-bub.city .pub-bub-av{font-size:14px}.pub-near-items .pub-bub.city .pub-bub-av span{font-size:14px}
  .pub-bub-name{font-size:14px}
  .pub-near-more{grid-template-columns:repeat(6,minmax(0,1fr));position:absolute;left:24px;right:24px;bottom:18px;margin:0}
  .pub-near.has-more{height:940px}
}
.pub-near-list .list-item{padding:10px 12px;color:inherit}.pub-near-list .dist{font-weight:800;color:var(--berry);white-space:nowrap;font-size:13px}
.pub-filt-count{min-width:18px;height:18px;border-radius:999px;background:var(--berry);color:#fff;font-size:11px;font-weight:800;display:inline-grid;place-items:center;padding:0 5px}
`;
  if (!document.getElementById("hh-pub-css")) {
    const st = document.createElement("style");
    st.id = "hh-pub-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- Helpers ---------- */
  const clientId = () => HH.viewerId();
  const swipedRight = (workerId) => {
    const cid = clientId();
    return HH.db.swipes.some(
      (s) => s.clientId === cid && s.workerId === workerId && s.dir === "right",
    );
  };
  const priorityBadge = () =>
    `<span class="badge level-A">${HH.icon("bolt")} Prioridad</span>`;
  const nameAge = (p) => esc(p.displayName) + (p.age ? ", " + p.age : "");
  const typeLabel = (t) =>
    t === "video" ? "Video" : t === "short" ? "Short" : "Foto";
  const profileLink = (slug) => (HH.absUrl ? HH.absUrl("#perfil." + slug) : location.href.split("#")[0] + "#perfil." + slug);
  const PAUSE_SVG =
    '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  const parseDur = (d) => {
    const m = /^(\d+):(\d{1,2})$/.exec(d || "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  };

  function copyText(text, selId) {
    const fallback = () => {
      try {
        let node = selId ? document.getElementById(selId) : null;
        let temp = null;
        if (!node) {
          temp = document.createElement("textarea");
          temp.value = text;
          temp.setAttribute("readonly", "");
          temp.style.cssText = "position:fixed;left:-9999px;top:0";
          document.body.appendChild(temp);
          temp.select();
          node = null;
        }
        if (node) {
          const r = document.createRange();
          r.selectNodeContents(node);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        }
        const done = document.execCommand && document.execCommand("copy");
        if (temp) temp.remove();
        HH.toast(done ? "Copiado" : "Seleccioná el texto y copialo", {
          type: done ? "ok" : "warn",
        });
      } catch (e) {
        HH.toast("No se pudo copiar", { type: "warn" });
      }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => HH.toast("Copiado", { type: "ok" }))
          .catch(fallback);
        return;
      }
    } catch (e) {
      /* sin clipboard */
    }
    fallback();
  }

  // Viaje en la tarjeta: misma frase que el aviso del perfil, en una línea compacta
  const tripLine = (p) => {
    const a = HH.activeTrip(p); const u = !a && HH.upcomingTrip(p); if (!a && !u) return "";
    const full = a ? "De visita hasta el " + HH.fmtDay(a.to) : "En " + u.city + " desde el " + HH.fmtDay(u.from);
    // Dos renglones cortos: qué (de visita / ciudad de destino) y cuándo; así entra en las tarjetas angostas del celular
    const l1 = a ? "De visita" : `<span data-noi18n>${esc(u.city)}</span>`;
    const l2 = a ? "hasta el " + HH.fmtDay(a.to) : "desde el " + HH.fmtDay(u.from);
    return `<div class="pcard-trip ${a ? "info" : "warn"}" title="${esc(full)}"><span class="t1">${HH.icon(a ? "globe" : "calendar")}<span>${l1}</span></span><span class="t2">${l2}</span></div>`;
  };
  // Card de perfil para listados (también la usan las páginas de ciudad, ver seo.js)
  HH.pcard = (p, opts) => pcard(p, opts);
  function pcard(p, opts = {}) {
    const lvl = HH.levelOf(p.userId);
    const badges = [
      HH.isStar(p.userId) ? HH.starBadge() : "",
    ]
      .filter(Boolean)
      .join("");
    return `<a class="pcard" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}" data-imp="${p.userId}" aria-label="Ver perfil de ${esc(p.displayName)}">
      ${HH.photo(p, 0, { children: badges ? `<div class="pub-badges">${badges}</div>` : "" })}
      <div class="body">
        <div class="name"><span class="ellipsis">${nameAge(p)}</span>${p.verified === "verified" ? HH.icon("verified") : ""}</div>
        <div class="meta">${HH.icon("pin")}<span class="ellipsis">${esc(p.city)}${opts.country && p.country ? ", " + esc(p.country) : ""}</span></div>${tripLine(p)}
        ${opts.activities ? `<div class="pill-row">${HH.activityChips((p.activities || []).slice(0, 3), "sm")}</div>` : ""}
      </div></a>`;
  }

  /* ---------- v2: ciudad elegida, hero configurable, grilla y "Cerca de mí" ---------- */
  const ALL = "";
  // HH.ui.city: undefined → ciudad por defecto de ajustes; '' → todas las ciudades
  const cityCurrent = () => HH.currentPlace();
  const setCity = (c) => {
    HH.ui.city = c || ALL;
    HH.save();
  };
  const cityList = () =>
    [
      ...new Set(
        HH.publishedProfiles()
          .map((p) => p.city)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
  const cityLabel = (c) => (c ? c : "Todas las ubicaciones");
  // Perfiles de la ciudad elegida primero (en orden de ranking) y luego el resto
  const orderByCity = (list, city) =>
    city
      ? list
          .filter((p) => HH.inCity(p, city))
          .concat(list.filter((p) => !HH.inCity(p, city)))
      : list;
  const citySelectHtml = (id, city, action) =>
    `<select class="select" id="${id}" data-change="${action}" aria-label="Ubicación"><option value=""${!city ? " selected" : ""}>Todas las ubicaciones</option>${HH.placeSelectOptions(city)}</select>`;
  // Título del hero: "*texto*" → itálica rosa. Sin asteriscos se renderiza plano.
  const heroTitle = (t) => esc(t || "").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const isDataUrl = (s) => HH.isImgSrc(s);
  // Galería pública del perfil: todas las fotos (hasta 15) + videos (hasta 5)
  // Galería pública del perfil: fotos y videos hasta el límite del plan. En la fila se muestran los primeros; el resto en "Ver todo".
  const GAL_ROW = 12;
  const galPhotos = (p) =>
    (p.photos || [])
      .filter(Boolean)
      .slice(0, HH.galleryLimits(p.userId).photos);
  const galVideos = (p) =>
    HH.profileVideos(p).slice(0, HH.galleryLimits(p.userId).videos);
  const thumbPhoto = (p, i) =>
    `<button type="button" data-action="pubGalleryPick" data-idx="${i}" aria-label="Ver foto ${i + 1}" aria-current="${i === 0 ? "true" : "false"}">${HH.photo(p, i)}</button>`;
  const thumbVideo = (v, i) =>
    `<button type="button" data-action="pubGalleryPick" data-vid="${esc(v.id)}" aria-label="Ver video ${i + 1}" aria-current="false"><div class="media">${HH.videoMedia(v)}<span class="pub-vbadge">${HH.icon("play")}${v.seconds ? ` ${v.seconds}s` : ""}</span></div></button>`;
  function galleryThumbs(p) {
    const photos = galPhotos(p);
    const n = Math.max(photos.length, 1);
    const vids = galVideos(p);
    const ph = Array.from({ length: Math.min(n, GAL_ROW) }, (_, i) =>
      thumbPhoto(p, i),
    ).join("");
    const vv = vids
      .slice(0, Math.max(2, GAL_ROW - Math.min(n, GAL_ROW)))
      .map(thumbVideo)
      .join("");
    const total = n + vids.length;
    const shown =
      Math.min(n, GAL_ROW) +
      Math.min(vids.length, Math.max(2, GAL_ROW - Math.min(n, GAL_ROW)));
    const more =
      total > shown
        ? `<button type="button" class="pub-more" data-action="pubGalleryAll" aria-label="Ver todas las fotos y videos"><strong>+${total - shown}</strong><span class="tiny">Ver todo</span></button>`
        : "";
    return `<div class="pub-thumbs${total > 4 ? " scroll" : ""}" role="group" aria-label="Fotos y videos del perfil">${ph}${vv}${more}</div>`;
  }
  // Celda de la grilla tipo app de citas (inicio)
  function gcell(p) {
    return `<a class="pub-gcell" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}" aria-label="Ver perfil de ${esc(p.displayName)}">
      ${HH.photo(p, 0, { cls: "square", children: HH.isStar(p.userId) ? `<span class="pub-gstar" title="Star">${HH.icon("star")}</span>` : "" })}
      <span class="pub-gname"><span class="ellipsis">${nameAge(p)}</span>${p.online ? '<span class="pub-dot" title="En línea"></span>' : ""}</span>${HH.activeTrip(p) ? `<span class="pub-gkm" style="color:var(--info)">De visita hasta el ${HH.fmtDay(HH.activeTrip(p).to)}</span>` : HH.upcomingTrip(p) ? `<span class="pub-gkm" style="color:var(--warn)">En ${esc(HH.upcomingTrip(p).city)} desde el ${HH.fmtDay(HH.upcomingTrip(p).from)}</span>` : HH.geo() ? `<span class="pub-gkm">${HH.fmtKm(HH.distanceKm(p))}</span>` : ""}</a>`;
  }
  // Grilla del inicio separada por plan (Star, Diamante, Platino, Oro, Plata, Bronce), con tarjetas como las de Stars
  const TIERS = [["S", "lg", 4], ["A", "lg", 4], ["B", "md", 6], ["C", "sm", 6], ["D", "sm", 6], ["E", "sm", 6]];
  function tierSections(all, starIds) {
    S.tierShown = S.tierShown || {};
    return `<div class="tiers">${TIERS.map(([lv, size, page]) => {
      const list = all.filter((p) => HH.levelOf(p.userId) === lv && !(lv === "S" && starIds.has(p.userId))); if (!list.length) return "";
      const shown = S.tierShown[lv] || page;
      return `<section class="tier tier-${lv}" aria-label="${esc(HH.planName(lv))}">
        <div class="tier-h"><span class="badge level-${lv}">${lv === "S" ? HH.icon("star") + " " : ""}${esc(HH.planName(lv))}</span><span class="tiny muted">${list.length} ${HH.plural(list.length, "perfil", "perfiles")}</span></div>
        <div class="tier-grid ${size}" id="tierGrid_${lv}">${list.slice(0, shown).map((p) => pcard(p)).join("")}</div>
        ${list.length > shown ? `<div class="row" style="justify-content:center"><button type="button" class="btn ghost sm" data-action="pubGridMore" data-tier="${lv}">Ver más ${esc(HH.planName(lv))} <span class="small muted num">${shown} de ${list.length}</span></button></div>` : ""}
      </section>`;
    }).join("")}</div>`;
  }
  const GRID_PAGE = 12;
  const homeCat = () =>
    HH.ui.homeCat && HH.ACTIVITIES.some((a) => a.id === HH.ui.homeCat)
      ? HH.ui.homeCat
      : "";
  function gridProfiles() {
    const cat = homeCat();
    const base = HH.rankedProfiles().filter(
      (p) => !cat || (p.activities || []).includes(cat),
    );
    return HH.geo() ? HH.byDistance(base) : orderByCity(base, cityCurrent());
  }
  /* ---------- Selector de ubicación por niveles (país → provincia/estado → zona → ciudad) ---------- */
  const placeLabel = (name) => name || "Todas las ubicaciones";
  const PP = { cur: "", node: null, q: "", then: "" };
  const placeCount = (name) => HH.publishedProfiles().filter(HH.genderOk).filter((p) => HH.inCity(p, name)).length;
  const activeKids = (id) => (HH.db.locations || []).filter((l) => l.parentId === id && HH.isActiveLoc(l)).sort((a, b) => (a.level === "city") - (b.level === "city") || a.name.localeCompare(b.name));
  HH.placePill = (current, then, opts = {}) => `<button type="button" class="place-pill${opts.block ? " block" : ""}" data-action="placePick" data-then="${then}" data-cur="${esc(current || "")}">${HH.icon("pin")}<span class="ellipsis">${esc(placeLabel(current))}</span>${HH.icon("chevronDown")}</button>`;
  function placeBody() {
    const node = PP.node ? (HH.db.locations || []).find((l) => l.id === PP.node) : null;
    const row = (loc, sel) => { const n = placeCount(loc.name); const kids = activeKids(loc.id).length;
      return `<div class="pp-row${n ? "" : " dim"}"><button type="button" class="pp-name" data-action="placeChoose" data-v="${esc(loc.name)}">${sel ? `<span class="pp-check">${HH.icon("check")}</span>` : '<span class="pp-check off"></span>'}<span class="grow ellipsis">${esc(loc.name)}</span><span class="num muted">${n}</span></button>${kids ? `<button type="button" class="pp-go" data-action="placeDrill" data-id="${loc.id}" aria-label="Ver dentro de ${esc(loc.name)}">${HH.icon("chevronRight")}</button>` : '<span class="pp-go"></span>'}</div>`; };
    let list;
    if (PP.q.trim().length >= 2) {
      const qn = PP.q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const hits = (HH.db.locations || []).filter((l) => HH.isActiveLoc(l) && l.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(qn)).slice(0, 30);
      list = hits.length ? hits.map((l) => row(l, l.name === PP.cur).replace('class="grow ellipsis">', `class="grow ellipsis">`) + `<div class="tiny muted pp-path">${esc(HH.locLabel(l, { country: true }))}</div>`).join("") : `<div class="small muted" style="padding:14px 4px">No encontramos esa ubicación.</div>`;
    } else if (node) {
      list = row(node, node.name === PP.cur) + `<div class="pp-sep"></div>` + activeKids(node.id).map((l) => row(l, l.name === PP.cur)).join("");
    } else {
      list = `<div class="pp-row"><button type="button" class="pp-name" data-action="placeChoose" data-v="">${!PP.cur ? `<span class="pp-check">${HH.icon("check")}</span>` : '<span class="pp-check off"></span>'}<span class="grow">Todas las ubicaciones</span><span class="num muted">${placeCount("")}</span></button><span class="pp-go"></span></div><div class="pp-sep"></div>` + activeKids(null).map((l) => row(l, l.name === PP.cur)).join("");
    }
    return `<div class="pp">
      <div class="pp-top">${node || PP.q ? `<button type="button" class="pp-back" data-action="placeBack" aria-label="Volver">${HH.icon("chevronLeft")}</button>` : ""}<input class="input pp-search" id="ppSearch" type="search" placeholder="Buscar ciudad, provincia o país" value="${esc(PP.q)}" data-input="placeSearch" aria-label="Buscar ubicación"></div>
      <div class="pp-list" id="ppList">${list}</div></div>`;
  }
  function placeRender(keepFocus) { const box = document.querySelector("#modalBox .modal-body"); if (box) box.innerHTML = placeBody(); if (keepFocus) { const i = document.getElementById("ppSearch"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } }
  HH.openPlacePicker = function (current, then) {
    PP.cur = current || ""; PP.q = ""; PP.then = then;
    const loc = PP.cur && HH.locByName(PP.cur);
    const path = loc ? HH.locPath(loc) : [];
    PP.node = path.length > 1 ? path[path.length - 2].id : path.length === 1 ? path[0].id : null;
    if (loc && activeKids(loc.id).length) PP.node = loc.id;
    HH.modal({ title: "Ubicación", body: placeBody(), actions: [] });
  };
  Object.assign(HH.actions, {
    placePick(el) { HH.openPlacePicker(el.dataset.cur || "", el.dataset.then); },
    placeDrill(el) { PP.node = el.dataset.id; PP.q = ""; placeRender(); },
    placeBack() { if (PP.q) { PP.q = ""; } else { const n = (HH.db.locations || []).find((l) => l.id === PP.node); PP.node = n && n.parentId ? n.parentId : null; } placeRender(); },
    placeSearch(el) { PP.q = el.value; const box = document.getElementById("ppList"); if (box) { const tmp = document.createElement("div"); tmp.innerHTML = placeBody(); box.innerHTML = tmp.querySelector("#ppList").innerHTML; } },
    placeChoose(el) { HH.closeModal(); const fn = HH.actions[PP.then]; if (fn) fn({ value: el.dataset.v || "", dataset: {} }); },
    pubHomePlace(el) { setCity(el.value); S.gridShown = GRID_PAGE; S.tierShown = {}; HH.refresh(); },
  });
  function openCityModal() {
    const city = cityCurrent();
    HH.modal({
      title: "Elegí tu ciudad",
      body: `<div class="stack"><p class="small muted">Mostramos primero las acompañantes de la ciudad que elijas. Podés cambiarla cuando quieras.</p><div class="field"><label for="pubCitySel">Ciudad</label>${citySelectHtml("pubCitySel", city, "")}</div></div>`,
      actions: [
        { label: "Cancelar", cls: "ghost", action: "closeModal" },
        {
          label: "Aplicar",
          onClick: () => {
            const sel = document.getElementById("pubCitySel");
            setCity(sel ? sel.value : ALL);
            S.gridShown = GRID_PAGE; S.tierShown = {};
            HH.closeModal();
            HH.refresh();
          },
        },
      ],
    });
  }
  // Distancia simulada, determinista por índice ("a 1,2 km")
  const fakeDist = (i) =>
    "a " +
    (0.4 + ((i * 7) % 23) * 0.35).toLocaleString(HH.loc(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) +
    " km";
  function nearFilters() {
    if (!S.near) S.near = { acts: [], ageMin: 0, ageMax: 0 };
    return S.near;
  }
  const nearFilterCount = () => {
    const f = nearFilters();
    return f.acts.length + (f.ageMin ? 1 : 0) + (f.ageMax ? 1 : 0);
  };
  function applyNearFilters(list) {
    const f = nearFilters();
    return list.filter(
      (p) =>
        (!f.acts.length ||
          f.acts.some((a) => (p.activities || []).includes(a))) &&
        (!f.ageMin || (p.age || 0) >= f.ageMin) &&
        (!f.ageMax || (p.age || 0) <= f.ageMax),
    );
  }
  // Posiciones deterministas en anillos (desktop): 6 en el primero, 10 en el segundo; el resto en grilla debajo
  const RING = [
    { n: 6, rx: 20, ry: 165, off: -90 },
    { n: 10, rx: 38, ry: 312, off: -72 },
  ];
  function ringPos(i) {
    let k = i;
    for (const r of RING) {
      if (k < r.n) {
        const a = ((r.off + (k * 360) / r.n) * Math.PI) / 180;
        return `--x:${(r.rx * Math.cos(a)).toFixed(2)}%;--y:${(r.ry * Math.sin(a)).toFixed(0)}px`;
      }
      k -= r.n;
    }
    return null;
  }
  function bubble(p, i) {
    const pos = ringPos(i);
    return `<a class="pub-bub" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}"${pos ? ` style="${pos}"` : ""} aria-label="Ver perfil de ${esc(p.displayName)}">
      <span class="pub-bub-av">${HH.avatar(p, 96)}${HH.isStar(p.userId) ? `<span class="pub-bub-pin" title="Star">${HH.icon("pin")}</span>` : ""}</span>
      <span class="pub-bub-name">${p.verified === "verified" ? `<span class="ver" title="Verificada">${HH.icon("verified")}</span>` : ""}<span class="ellipsis">${esc(p.displayName)}</span>${p.online ? '<span class="pub-dot" title="En línea"></span>' : ""}</span></a>`;
  }
  // Radio de búsqueda en "Cerca de mí" (km): de 5 a 100, arranca en 15. Requiere la ubicación del visitante.
  const NEAR_KM = [5, 10, 15, 25, 50, 100];
  const nearKm = () => (NEAR_KM.includes(Number(HH.ui.nearKm)) ? Number(HH.ui.nearKm) : 15);
  const kmLabel = (k) => "Hasta " + k + " km";
  const kmSelect = () => `<label class="km-sel${HH.geo() ? "" : " off"}" title="${HH.geo() ? "Distancia máxima" : "Compartí tu ubicación para filtrar por distancia"}">${HH.icon("pin")}<select data-change="pubNearKm" aria-label="Distancia máxima">${NEAR_KM.map((k) => `<option value="${k}"${k === nearKm() ? " selected" : ""}>${kmLabel(k)}</option>`).join("")}</select>${HH.icon("chevronDown")}</label>`;
  function nearBody() {
    const city = cityCurrent();
    const km = nearKm();
    if (HH.geo()) {
      const all = HH.rankedProfiles().filter((p) => HH.inCity(p, city));
      const inRadius = applyNearFilters(all.filter((p) => { const d = HH.distanceKm(p); return !km || (d !== null && d <= km); }));
      if (!inRadius.length) {
        const next = NEAR_KM.find((k) => k > km);
        const nearest = HH.byDistance(applyNearFilters(all))[0];
        return `<div class="empty">${HH.icon("pin")}<h4>No hay acompañantes a menos de ${km} km</h4><p class="small">${nearest ? "La más cercana está a " + HH.fmtKm(HH.distanceKm(nearest)) + "." : "Probá con otra ubicación o quitando filtros."}</p>${next ? `<button type="button" class="btn secondary sm" data-action="pubNearKm" data-v="${next}">Ampliar a ${next} km</button>` : ""}</div>`;
      }
    }
    const ranked = HH.geo() && km ? HH.rankedProfiles().filter((p) => { const d = HH.distanceKm(p); return d !== null && d <= km; }) : HH.rankedProfiles();
    const inCity = city ? ranked.filter((p) => HH.inCity(p, city)) : ranked;
    const fallback = city && !inCity.length;
    // Si la ciudad tiene pocos perfiles, completamos el mapa con los de otras ciudades (van después)
    const MIN_MAP = 6;
    const others = city ? ranked.filter((p) => !HH.inCity(p, city)) : [];
    const base = fallback
      ? others
      : !(HH.geo() && km) && inCity.length < MIN_MAP
        ? inCity.concat(others.slice(0, Math.max(0, 12 - inCity.length)))
        : inCity;
    const list = HH.byDistance(applyNearFilters(base));
    const nCity = applyNearFilters(inCity).length;
    const cap = RING.reduce((a, r) => a + r.n, 0);
    const ring = list.slice(0, cap),
      extra = list.slice(cap);
    const cityBub = `<div class="pub-bub city" aria-hidden="true"><span class="pub-bub-av">${HH.icon("pin")}<span>${HH.geo() ? "Vos" + (HH.geo().city ? '<br><small style="font-weight:600;opacity:.8">' + esc(HH.geo().city) + "</small>" : "") : esc(cityLabel(city))}</span></span></div>`;
    // En móvil es una grilla de 3 columnas con la ciudad en la celda central de la primera fila.
    const items = ring.length
      ? [
          bubble(ring[0], 0),
          cityBub,
          ...ring.slice(1).map((p, i) => bubble(p, i + 1)),
        ]
      : [cityBub];
    const n = list.length;
    return `
      ${fallback ? `<div class="notice">${HH.icon("info")}<span>Todavía no hay acompañantes publicadas en ${esc(city)}. Te mostramos las de otras ciudades.</span></div>` : ""}
      ${
        !list.length
          ? `<div class="empty">${HH.icon("search")}<h4>No hay perfiles con esos filtros</h4><p class="small">Probá quitando alguna actividad o ampliando el rango de edad.</p><button type="button" class="btn secondary sm" data-action="pubNearClear">Quitar filtros</button></div>`
          : `
      ${fallback ? `<h3 style="font-size:18px">En otras ciudades</h3>` : ""}
      <div class="pub-near${extra.length ? " has-more" : ""}" aria-label="Acompañantes cerca">
        <div class="pub-near-items">${items.join("")}</div>
        ${extra.length ? `<div class="pub-near-more">${extra.map((p, i) => bubble(p, cap + i)).join("")}</div>` : ""}
      </div>
      <div class="row between"><h3 style="font-size:18px">${HH.geo() && km && !fallback ? n + " " + HH.plural(n, "acompañante") + " a menos de " + km + " km" : fallback ? n + " " + HH.plural(n, "acompañante") + " en otras ciudades" : city ? nCity + " " + HH.plural(nCity, "acompañante") + " en " + esc(city) + (n > nCity ? " y " + (n - nCity) + " en otras ciudades" : "") : n + " " + HH.plural(n, "acompañante") + " en todas las ciudades"}</h3><span class="small muted">${HH.geo() ? "Distancia desde tu ubicación" : "Distancias aproximadas"}</span></div>
      <div class="list pub-near-list">${list
        .map(
          (
            p,
            i,
          ) => `<a class="list-item" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}">
        ${HH.avatar(p, 40)}
        <div class="grow"><div class="title pub-ir fg" style="gap:5px">${nameAge(p)}${p.verified === "verified" ? `<span style="color:var(--info);display:inline-flex">${HH.icon("verified")}</span>` : ""}${p.online ? '<span class="pub-dot"></span>' : ""}</div>
          <div class="sub ellipsis">${esc(p.city)}${p.country ? ", " + esc(p.country) : ""} · ${
            (p.activities || [])
              .slice(0, 3)
              .map((id) => esc(HH.activity(id).label))
              .join(", ") || "Sin actividades"
          }</div></div>
        <span class="dist">${HH.geo() ? HH.fmtKm(HH.distanceKm(p)) : !city || p.city === city ? fakeDist(i) : esc(HH.upcomingTrip(p) && HH.upcomingTrip(p).city === city ? "llega el " + HH.fmtDay(HH.upcomingTrip(p).from) : p.city)}</span>${HH.icon("chevronRight")}</a>`,
        )
        .join("")}</div>`
      }`;
  }
  function openNearFilters() {
    const f = nearFilters();
    const ages = (sel, label) =>
      `<select class="select" id="${sel}" data-change="pubNearAge" data-k="${sel === "pubAgeMin" ? "ageMin" : "ageMax"}" aria-label="${label}"><option value="0">${label}</option>${Array.from(
        { length: 43 },
        (_, i) => 18 + i,
      )
        .map(
          (a) =>
            `<option value="${a}"${(sel === "pubAgeMin" ? f.ageMin : f.ageMax) === a ? " selected" : ""}>${a}</option>`,
        )
        .join("")}</select>`;
    HH.modal({
      title: "Filtros",
      body: `<div class="stack">
        <div><div class="label" style="margin-bottom:8px">Tipo de salida</div><div class="chips" id="pubNearActs" role="group" aria-label="Tipo de salida">${HH.ACTIVITIES.map((a) => `<button type="button" class="chip" data-action="pubNearAct" data-id="${a.id}" aria-pressed="${f.acts.includes(a.id)}">${HH.icon(a.icon)} ${a.label}</button>`).join("")}</div></div>
        <div><div class="label" style="margin-bottom:8px">Edad</div><div class="grid-2" style="gap:10px">${ages("pubAgeMin", "Sin mínimo")}${ages("pubAgeMax", "Sin máximo")}</div></div>
        <p class="small muted">Los resultados se actualizan al instante, detrás de esta ventana.</p>
      </div>`,
      actions: [
        { label: "Quitar filtros", cls: "ghost", action: "pubNearClear" },
        { label: "Listo", action: "closeModal" },
      ],
    });
  }
  function nearRerender() {
    const body = document.getElementById("pubNearBody");
    if (body) body.innerHTML = nearBody();
    const c = document.getElementById("pubNearFiltCount");
    if (c) {
      const n = nearFilterCount();
      c.textContent = n;
      c.style.display = n ? "" : "none";
    }
  }

  // Hoja modal de WhatsApp (swipe a la derecha / perfil)
  function waSheet(p, opts = {}) {
    const msg =
      "Hola " +
      p.displayName +
      ", te vi en SexyRose y me gustaría proponerte una salida.";
    const href = HH.whatsappLink(p.whatsapp, msg);
    const hasPhone = String(p.whatsapp || "").replace(/\D/g, "").length >= 8;
    // Con el match ya abre WhatsApp: en lugar de mostrar el número, se ofrece el chat en vivo
    const chatBtn = HH.chatEnabledFor(p.userId)
      ? `<button type="button" class="btn secondary lg block" data-action="pubWaChat" data-id="${p.userId}"${HH.chatAvailable(p) || HH.chatSessionOf(HH.viewerId(), p.userId) ? "" : " disabled"}>${HH.icon("chat")} ${HH.chatSessionOf(HH.viewerId(), p.userId) ? "Abrir chat en vivo" : HH.chatAvailable(p) ? "Chat en vivo · desde " + HH.money(HH.chatFrom(p)) : "Chat en vivo · no disponible ahora"}</button>`
      : "";
    const tgHref = HH.telegramLink(p.telegram);
    const bookOk = HH.canTakeBookings(p);
    const bookBtn = `<button type="button" class="btn lg block" data-action="pubWaBook" data-id="${p.userId}"${bookOk ? "" : ' disabled title="Todavía no toma reservas por la agenda"'}>${HH.icon("calendar")} Coordinar encuentro${bookOk ? "" : '<span class="small" style="font-weight:600;opacity:.8"> · sin agenda</span>'}</button>`;
    const body = `<div class="stack">
      <div class="row nowrap" style="gap:12px">${HH.avatar(p, 48)}<div class="grow"><div style="font-weight:700">${nameAge(p)}</div><div class="small muted">${esc(p.city)}${p.country ? ", " + esc(p.country) : ""}</div></div></div>
      <div class="msg-split">
        ${hasPhone ? `<a class="btn wa lg" id="pubWaLink" target="_blank" rel="noopener" href="${href}" data-track="wa" data-track-id="${p.userId}">${HH.icon("whatsapp")} WhatsApp</a>` : `<button type="button" class="btn wa lg" disabled title="No cargó su WhatsApp">${HH.icon("whatsapp")} WhatsApp</button>`}
        ${tgHref ? `<a class="btn tg lg" id="pubTgLink" target="_blank" rel="noopener" href="${tgHref}" data-track="tg" data-track-id="${p.userId}">${HH.icon("send")} Telegram</a>` : `<button type="button" class="btn tg lg" disabled title="No cargó su Telegram">${HH.icon("send")} Telegram</button>`}
      </div>
      ${bookBtn}
      ${chatBtn}
      <p class="small muted">WhatsApp se abre con un mensaje de presentación que podés editar antes de enviar. Coordiná el plan, el lugar público y la tarifa por ahí, o reservá el encuentro en su agenda.</p>
    </div>`;
    const actions = opts.fromProfile
      ? [{ label: "Cerrar", cls: "ghost", action: "closeModal" }]
      : [
          {
            label: "Ver perfil",
            cls: "secondary",
            onClick: () => {
              HH.closeModal();
              HH.go("#perfil." + p.slug);
            },
          },
          { label: "Seguir deslizando", cls: "ghost", action: "closeModal" },
        ];
    HH.modal({ title: "Contactá con " + p.displayName, body, actions });
  }

  // Grilla de planes (inicio)
  function plansHtml() {
    const me = HH.me();
    const go = me && me.role === "worker" ? "#panel.suscripcion" : "#registro";
    const li = (txt, ok) =>
      `<li class="${ok ? "" : "no"}">${HH.icon(ok ? "check" : "x")}<span>${txt}</span></li>`;
    return `<div class="plans plans-6">${HH.PLAN_ORDER.map((k) => {
      const L = HH.LEVELS[k];
      return `<div class="plan${k === "B" ? " featured" : ""}">
        ${k === "B" ? `<span class="badge ribbon" style="background:var(--berry);color:var(--berry-ink)">Más elegido</span>` : k === "S" ? `<span class="badge ribbon gold">${HH.icon("crown")} 10 por estado/provincia</span>` : ""}
        <div class="row between nowrap"><strong>${L.label}</strong>${HH.levelBadge(k, true)}</div>
        <div class="price">${HH.money(L.price_usd)} <small>/ mes</small></div>
        <p class="small muted">${esc(L.desc)}</p>
        <ul>
          ${li(`Galería de ${L.photos} fotos y ${L.videos} videos`, true)}
          ${li(L.stories_per_day === null ? "Historias ilimitadas" : L.stories_per_day + " " + HH.plural(L.stories_per_day, "historia", "historias") + " por día", true)}
          ${HH.highlightLimitText ? li(HH.highlightLimitText(L.highlights), true) : ""}
          ${li("Venta de fotos y videos", L.premium_content)}
          ${li("Packs, pedidos a medida y agenda", L.packs)}
          ${li("Chat en vivo por sesiones", L.chat)}
          ${li("Viajes", L.trips)}
        </ul>
        <button type="button" class="btn ${k === "B" ? "" : "secondary"} block" data-go="${go}">${k === "S" ? "Quiero ser Star" : "Elegir " + L.label}</button>
      </div>`;
    }).join("")}</div>`;
  }

  /* ============================================================
     1. INICIO
     ============================================================ */
  HH.route("inicio", () => {
    const me = HH.me();
    const worker = me && me.role === "worker";
    const ranked = HH.rankedProfiles();
    const vCountry = cityCurrent();
    // Con provincia/estado conocido se muestran las Stars que están ahí (de origen o de viaje); si no hay ninguna, la sección se oculta. Sin ubicación, todas.
    const stars = HH.starsInPlace(vCountry).map((x) => HH.profileOf(x.workerId)).filter(Boolean).filter(HH.genderOk);
    const cities = new Set(
      HH.publishedProfiles()
        .map((p) => p.city)
        .filter(Boolean),
    );
    const faq = [
      [
        "¿Es seguro?",
        "Las salidas son siempre en lugares públicos: cafés, museos, parques, eventos. Los perfiles de acompañantes pasan por verificación de identidad y cualquier conducta inapropiada se puede reportar desde el perfil. El WhatsApp se comparte solo después de que vos mostrás interés.",
      ],
      [
        "¿Qué incluye una salida?",
        "Compañía y buena conversación para la actividad que propongas: un café, una muestra, una caminata, un recital, una cena de trabajo. El plan, la duración y la tarifa los acordás directamente con la acompañante por WhatsApp.",
      ],
      [
        "¿Cómo se cobra el contenido?",
        "Las fotos, videos y shorts marcados como premium se compran dentro de SexyRose, en dólares. También podés comprar packs o pedir contenido a medida: la acompañante cotiza, pagás en la plataforma y te lo entrega acá mismo.",
      ],
      [
        "¿Qué no está permitido?",
        "Ningún tipo de contenido o propuesta sexual, ni dentro ni fuera de la plataforma. Tampoco insistir después de un no, pedir datos personales que no fueron ofrecidos ni proponer encuentros en lugares privados. Quien lo hace queda fuera.",
      ],
      [
        "¿Cómo funciona la verificación?",
        "Cada acompañante envía su documento, una selfie y un video corto que revisa el equipo de SexyRose: confirmamos que es mayor de edad y que es la persona de las fotos. Cuando se aprueba, el perfil muestra el sello Verificada. Los perfiles nuevos pueden publicarse mientras la verificación está en curso.",
      ],
      [
        "¿Puedo cancelar?",
        "Las salidas se cancelan con quien las acordaste, por WhatsApp y con tiempo. Las suscripciones de acompañantes se cancelan desde el panel y siguen activas hasta el fin del período pago. Las compras de contenido no tienen devolución una vez desbloqueadas.",
      ],
    ];
    const hero = Object.assign(
      {},
      HH.DEFAULT_SETTINGS.hero,
      HH.settings().hero || {},
    );
    const city = cityCurrent();
    const gridAll = gridProfiles();
    if (!S.gridShown) S.gridShown = GRID_PAGE; S.tierShown = {};
    const gridFirst = gridAll.slice(0, S.gridShown);
    const gSel = HH.genderLabel();
    return `
    <section class="hero">
      <span class="blob" style="width:420px;height:420px;left:-140px;top:-120px;background:var(--pink)"></span>
      <span class="blob" style="width:380px;height:380px;right:-120px;bottom:-140px;background:var(--berry-tint)"></span>
      <div class="container hero-grid">
        <div class="stack" style="gap:12px">
          ${hero.eyebrow ? `<span class="eyebrow">${esc(hero.eyebrow)}</span>` : ""}
          <h1>${heroTitle(HH.seoH1 ? HH.seoH1(hero.title) : hero.title)}</h1>
          ${hero.subtitle ? `<p class="lead">${esc(hero.subtitle)}</p>` : ""}
          <div class="row">
            <button type="button" class="btn" data-go="#swipe">${HH.icon("heart")} ${esc(hero.ctaPrimary || "Explorar perfiles")}</button>
            <button type="button" class="btn secondary" data-go="${worker ? "#panel" : "#cerca"}">${worker ? HH.icon("dashboard") + " Ir a mi panel" : HH.icon("pin") + " " + esc(hero.ctaSecondary || "Cerca de mí")}</button>
          </div>
          <div class="row small muted hero-trust" style="gap:6px 16px">
            <span class="pub-ir">${HH.icon("shield")} Mirás y contactás sin registrarte</span>
            <span class="pub-ir">${HH.icon("verified")} Perfiles verificados</span>
            <span class="pub-ir">${HH.icon("card")} Pagos online</span>
            <span class="pub-ir">${HH.icon("globe")} ${cities.size} ciudades</span>
          </div>
        </div>
        ${
          isDataUrl(hero.image)
            ? `<div class="media pub-hero-media"><img src="${hero.image}" alt=""></div>`
            : `
        <div class="hero-cards">
          ${ranked
            .slice(0, 3)
            .map((p) => pcard(p))
            .join("")}
          <span class="float" style="left:-6px;top:47%">${HH.icon("whatsapp")} Swipe a la derecha → WhatsApp</span>
          <span class="float" style="right:-6px;bottom:12%">${HH.icon("card")} Pagos online</span>
        </div>`
        }
      </div>
    </section>

    <div class="container pub-placebar">${HH.placePill(city, "pubHomePlace")}<span class="small muted">${city ? "Mostrando " + esc(city) : "Mostrando todas las ubicaciones"}</span></div>
    ${(() => {
      const list = HH.storyOrder();
      if (!list.length) return "";
      const inCity = list;
      return `
    <section class="section" style="padding-block:18px 4px">
      <div class="container stack" style="gap:10px">
        <div class="row between"><div><span class="eyebrow">Historias</span><h2 style="font-size:22px">${city && inCity.length ? "Acompañantes en " + esc(city) : "Lo que pasó hoy"}</h2></div><span class="small muted">Duran 24 h</span></div>
        <div class="stories-row" aria-label="Historias">${list.map((p) => `<div class="st">${HH.storyRing(p, 72, { go: "#perfil." + p.slug })}<span class="n">${esc(p.displayName)}</span></div>`).join("")}</div>
      </div>
    </section>`;
    })()}
    ${
      stars.length
        ? `
    <section class="pub-stars-sec">
      <div class="container stack" style="gap:10px">
        <div class="row between nowrap" style="gap:8px">
          <div style="min-width:0"><span class="eyebrow">Stars del mes</span><h2 class="ellipsis">${vCountry ? "Destacadas en " + esc(vCountry) : "Destacadas de SexyRose"}</h2></div>
          <button type="button" class="btn ghost sm" data-go="#stars" style="flex:none">Qué es Stars ${HH.icon("chevronRight")}</button>
        </div>
        <div class="pub-hscroll pub-stars-row">${stars.map((p) => pcard(p)).join("")}</div>
      </div>
    </section>
    `
        : ""
    }

    <div class="container" style="padding-top:10px">${HH.locationBar()}</div>
    <div class="container" style="padding-top:14px">
      <details class="pub-cats"${homeCat() ? " open" : ""}>
        <summary><span class="pub-ir">${HH.icon("grid")} <strong>Categorías</strong>${homeCat() ? `<span class="badge">${esc(HH.activity(homeCat()).label)}</span>` : `<span class="small muted">${HH.ACTIVITIES.length}</span>`}</span>${HH.icon("chevronDown")}</summary>
        <div class="chips">${HH.ACTIVITIES.map((a) => `<button type="button" class="chip${homeCat() === a.id ? " active" : ""}" data-action="pubGoActivity" data-id="${a.id}" aria-pressed="${homeCat() === a.id}">${HH.icon(a.icon)} ${a.label}</button>`).join("")}${homeCat() ? `<button type="button" class="chip" data-action="pubGoActivity" data-id="">${HH.icon("x")} Quitar</button>` : ""}</div>
      </details>
    </div>
    <section class="section">
      <div class="container stack-lg">
        <div class="row between">
          <div><span class="eyebrow">${gSel ? gSel + " · " : ""}${homeCat() ? esc(HH.activity(homeCat()).label) + " · " : ""}Perfiles cerca tuyo</span><h2>${city ? "Acompañantes en " + esc(city) : "Acompañantes en todas las ciudades"}</h2><p class="small muted" style="margin-top:4px">${city ? "Primero las de " + esc(city) + ", después el resto." : "Ordenadas por ranking: Stars y plan A primero."}</p></div>
        </div>
        <button type="button" class="btn lg block pub-swipe-cta" data-action="pubSwipeMode">${HH.icon("heart")} Modo swipe${homeCat() ? `<span class="small" style="opacity:.85;font-weight:600"> · ${esc(HH.activity(homeCat()).label)}</span>` : ""}</button>
        ${
          gridAll.length
            ? tierSections(gridAll, new Set(stars.map((p) => p.userId)))
            : `${homeCat() ? `<div class="empty">${HH.icon("search")}<h4>No hay perfiles para ${esc(HH.activity(homeCat()).label)} todavía</h4><button type="button" class="btn secondary sm" data-action="pubGoActivity" data-id="">Ver todas las categorías</button></div>` : `<div class="empty">${HH.icon("users")}<h4>Todavía no hay perfiles publicados</h4><button type="button" class="btn sm" data-go="#registro">Publicá el tuyo</button></div>`}`
        }
      </div>
    </section>


    <section class="section">
      <div class="container narrow stack-lg">
        <div class="center"><span class="eyebrow">Preguntas frecuentes</span><h2>Lo que todos preguntan antes de empezar</h2></div>
        <div class="stack" style="gap:10px">${faq.map(([q, a]) => `<details class="pub-faq"><summary>${q}${HH.icon("chevronDown")}</summary><p>${a}</p></details>`).join("")}</div>
      </div>
    </section>

    ${HH.seoHomeBlock ? HH.seoHomeBlock() : ""}
    ${HH.pubFooter()}`;
  });
  HH.pubFooter = () => `
    <footer class="pub-footer">
      <div class="container stack" style="gap:10px">
        <div class="row between">
          <span class="brand" style="font-size:18px"><span class="mark" style="width:24px;height:24px;border-radius:8px">${HH.icon("heart")}</span>SexyRose</span>
          <nav class="row" style="gap:16px" aria-label="Legal"><a href="#inicio" data-go="#inicio">Términos</a><a href="#inicio" data-go="#inicio">Privacidad</a><a href="#inicio" data-go="#inicio">Ayuda</a>${HH.langSelect ? HH.langSelect() : ""}</nav>
        </div>
        <p>Sitio de publicidad y contenido.</p>
      </div>
    </footer>`;

  /* ============================================================
     2. SWIPE
     ============================================================ */
  function swipeFilters() {
    if (!HH.ui.swipeFilters || typeof HH.ui.swipeFilters !== "object")
      HH.ui.swipeFilters = {};
    return HH.ui.swipeFilters;
  }
  function buildQueue() {
    const f = swipeFilters();
    // Regla de negocio: un swipe a la derecha ya habilitó el WhatsApp, ese perfil no vuelve a la pila.
    // Los deslizados a la izquierda vuelven al reingresar (directorio, no app de citas).
    return HH.rankedProfiles().filter(
      (p) =>
        HH.inCity(p, f.city) &&
        (!f.activity || (p.activities || []).includes(f.activity)) &&
        !swipedRight(p.userId),
    );
  }
  function swipeCardHtml(p, pos) {
    const cls = pos === 0 ? "top" : pos === 1 ? "back1" : "back2";
    const lvl = HH.levelOf(p.userId);
    const badges = [
      HH.isStar(p.userId) ? HH.starBadge() : "",
      lvl === "A" ? priorityBadge() : "",
    ]
      .filter(Boolean)
      .join("");
    return `<article class="swipe-card ${cls}" data-id="${p.userId}" data-slug="${p.slug}" data-imp="${p.userId}" aria-label="${esc(p.displayName)}">
      ${HH.photo(p, 0, { fit: true })}
      <div class="stamp like" aria-hidden="true">Me gusta</div><div class="stamp nope" aria-hidden="true">Paso</div>
      <div class="info">
        ${badges ? `<div class="row" style="gap:6px">${badges}</div>` : ""}
        <h3>${nameAge(p)}${p.verified === "verified" ? HH.icon("verified") : ""}</h3>
        <div class="meta">${HH.icon("pin")} ${esc(p.city)}${p.country ? ", " + esc(p.country) : ""}</div>
        ${p.headline ? `<div class="head" data-noi18n>${esc(HH.pText(p, "headline"))}</div>` : ""}
        <div class="chips">${HH.activityChips((p.activities || []).slice(0, 3), "sm")}</div>
      </div></article>`;
  }
  function swipeEmptyHtml() {
    const f = swipeFilters();
    const hasFilters = !!(f.city || f.activity);
    return `<div class="empty" style="height:100%;align-content:center">${HH.icon("search")}<h4>Viste todos los perfiles${hasFilters ? " con estos filtros" : ""}</h4><p class="small">${hasFilters ? "Probá quitando la ciudad o la actividad." : "Podés volver a empezar y verlos de nuevo."}</p>
      <div class="row" style="justify-content:center">${hasFilters ? `<button type="button" class="btn secondary sm" data-action="pubSwipeClearFilters">Quitar filtros</button>` : ""}<button type="button" class="btn sm" data-action="pubSwipeRestart">${HH.icon("refresh")} Volver a empezar</button></div></div>`;
  }
  function renderStack() {
    const stage = document.getElementById("pubStage");
    if (!stage) return;
    const count = document.getElementById("pubSwipeCount");
    const actions = document.getElementById("pubSwipeActions");
    if (count)
      count.textContent =
        S.queue.length +
        " " +
        HH.plural(S.queue.length, "perfil por ver", "perfiles por ver");
    if (!S.queue.length) {
      stage.innerHTML = swipeEmptyHtml();
      if (actions) actions.style.visibility = "hidden";
      return;
    }
    if (actions) actions.style.visibility = "";
    stage.innerHTML = S.queue
      .slice(0, 3)
      .map((p, i) => swipeCardHtml(p, i))
      .reverse()
      .join("");
    const top = stage.querySelector(".swipe-card.top");
    attachDrag(top);
    HH.view(S.queue[0].userId);
  }
  function attachDrag(card) {
    if (!card) return;
    const like = card.querySelector(".stamp.like"),
      nope = card.querySelector(".stamp.nope");
    let sx = 0,
      sy = 0,
      dx = 0,
      dy = 0,
      active = false;
    card.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      if (S.busy) return;
      active = true;
      sx = e.clientX;
      sy = e.clientY;
      dx = dy = 0;
      try {
        card.setPointerCapture(e.pointerId);
      } catch (err) {
        /* sin captura */
      }
      card.classList.add("dragging");
    });
    card.addEventListener("pointermove", (e) => {
      if (!active) return;
      dx = e.clientX - sx;
      dy = e.clientY - sy;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.06}deg)`;
      like.style.opacity = HH.clamp(dx / 100, 0, 1);
      nope.style.opacity = HH.clamp(-dx / 100, 0, 1);
    });
    const end = () => {
      if (!active) return;
      active = false;
      card.classList.remove("dragging");
      if (dx > 100) fling("right", card, dy);
      else if (dx < -100) fling("left", card, dy);
      else {
        card.style.transform = "";
        like.style.opacity = 0;
        nope.style.opacity = 0;
      }
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }
  function fling(dir, card, dy) {
    if (S.busy || !card) return;
    S.busy = true;
    const p = S.queue.shift();
    if (!p) {
      S.busy = false;
      return;
    }
    const sign = dir === "right" ? 1 : -1;
    const like = card.querySelector(".stamp.like"),
      nope = card.querySelector(".stamp.nope");
    if (like) like.style.opacity = dir === "right" ? 1 : 0;
    if (nope) nope.style.opacity = dir === "left" ? 1 : 0;
    card.classList.remove("dragging");
    card.classList.add("leaving");
    card.style.transform = `translate(${sign * (window.innerWidth + 240)}px, ${dy || 0}px) rotate(${sign * 22}deg)`;
    card.style.opacity = "0";
    HH.swipe(HH.viewerId(), p.userId, dir);
    setTimeout(() => {
      card.remove();
      S.busy = false;
      renderStack();
      if (dir === "right") waSheet(p);
    }, 360);
  }
  function swipeTop(dir) {
    const card = document.querySelector("#pubStage .swipe-card.top");
    if (card) fling(dir, card, 0);
  }
  function topProfile() {
    const card = document.querySelector("#pubStage .swipe-card.top");
    if (card) HH.go("#perfil." + card.dataset.slug);
  }

  HH.route("swipe", () => {
    const f = swipeFilters();
    const cities = [
      ...new Set(
        HH.publishedProfiles()
          .map((p) => p.city)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
    S.queue = buildQueue();
    HH.afterRender = renderStack;
    return `<div class="container section pub-swipe-wrap" style="padding-block:16px">
      <div class="pub-swipe">
        <div class="pub-swipe-side stack" style="gap:10px">
          <div class="row between nowrap sw-top">
            <div class="grow" style="min-width:0">${HH.placePill(f.city || "", "pubSwipeCity", { block: true })}</div>
            <span class="small muted num hide-mobile" id="pubSwipeCount" style="white-space:nowrap;flex:none"></span>
            <button type="button" class="icon-btn sw-ib hide-desktop" data-action="pubGridMode" aria-label="Modo grilla" title="Modo grilla">${HH.icon("grid")}</button>
            <button type="button" class="icon-btn sw-ib hide-desktop${f.activity ? " on" : ""}" id="pubSwipeFiltBtn" data-action="pubSwipeFilters" aria-expanded="${!!S.swipeFiltOpen}" aria-controls="pubSwipeChips" aria-label="Filtros" title="Filtros">${HH.icon("filter")}${f.activity ? '<span class="sw-dot" aria-hidden="true"></span>' : ""}</button>
          </div>
          <button type="button" class="btn lg block pub-swipe-cta hide-mobile" data-action="pubGridMode">${HH.icon("grid")} Modo grilla</button>
          <div class="chips scroll sw-chips${S.swipeFiltOpen ? " open" : ""}" id="pubSwipeChips" role="group" aria-label="Tipo de salida">
            <button type="button" class="chip" data-action="pubSwipeActivity" data-id="" aria-pressed="${!f.activity}">Todas</button>
            ${HH.ACTIVITIES.map((a) => `<button type="button" class="chip" data-action="pubSwipeActivity" data-id="${a.id}" aria-pressed="${f.activity === a.id}">${HH.icon(a.icon)} ${a.label}</button>`).join("")}
          </div>
          <div class="hide-mobile">
            <div class="card soft stack" style="gap:8px;margin-top:8px">
              <div class="card-title">Cómo deslizar</div>
              <p class="small muted">Arrastrá la card o usá el teclado. A la derecha se abre el WhatsApp de la acompañante; a la izquierda pasás a la siguiente.</p>
              <div class="row small" style="gap:6px 14px"><span><span class="kbd">←</span> <span class="kbd">X</span> Paso</span><span><span class="kbd">→</span> <span class="kbd">Enter</span> Me gusta</span><span><span class="kbd">I</span> Ver perfil</span></div>
              <div class="notice" style="margin-top:4px">${HH.icon("shield")}<span>Salidas en lugares públicos y con reglas claras.</span></div>
            </div>
          </div>
        </div>
        <div class="pub-swipe-main">
          <div class="swipe-stage" id="pubStage"></div>
          <div class="swipe-actions" id="pubSwipeActions">
            <button type="button" class="btn round nope" data-action="pubSwipeLeft" aria-label="Paso, siguiente perfil" title="Paso (X)">${HH.icon("x")}</button>
            <button type="button" class="btn round info" data-action="pubSwipeInfo" aria-label="Ver perfil" title="Ver perfil (I)">${HH.icon("info")}</button>
            <button type="button" class="btn round like" data-action="pubSwipeRight" aria-label="Me gusta, abrir WhatsApp" title="Me gusta (Enter)">${HH.icon("heart")}</button>
          </div>
        </div>
      </div>
    </div>`;
  });

  /* ============================================================
     2b. CERCA DE MÍ
     ============================================================ */
  HH.route("cerca", () => {
    const city = cityCurrent();
    const n = nearFilterCount();
    return `<div class="container section stack-lg" style="padding-block:18px">
      <div class="pub-near-head">
        <h1>Cerca de mí</h1>
        <div class="row" style="gap:8px">${HH.placePill(city, "pubNearCity")}${kmSelect()}</div>
        <button type="button" class="btn secondary sm pub-city-btn" data-action="pubNearFilters" aria-label="Filtros">${HH.icon("filter")} Filtros <span class="pub-filt-count" id="pubNearFiltCount"${n ? "" : ' style="display:none"'}>${n}</span></button>
      </div>
      ${HH.locationBar()}
      <div class="stack-lg" id="pubNearBody">${nearBody()}</div>
      <div class="notice">${HH.icon("shield")}<span>Las distancias son orientativas: las acompañantes figuran con precisión de barrio y tu ubicación nunca sale de este dispositivo.</span></div>
    </div>`;
  });

  /* ============================================================
     3. PERFIL PÚBLICO
     ============================================================ */
  function contentBody(p, tab) {
    const viewer = HH.viewerId();
    // Contenido exclusivo = solo lo pago (premium) y los packs; lo gratis no se muestra acá
    const items = HH.contentOf(p.userId).filter((c) => c.isPremium);
    const packs = HH.packsOf(p.userId);
    const list = tab === "all" ? items : items.filter((c) => c.type === tab);
    const itemHtml = (c) => {
      const locked = !HH.canView(c, viewer);
      const bought = !locked && viewer !== c.workerId;
      return `<div class="pub-item" role="button" tabindex="0" data-action="pubOpenItem" data-id="${c.id}" aria-label="${locked ? "Desbloquear " + esc(c.title) + " por " + HH.money(c.priceUsd) : "Ver " + esc(c.title)}">
        ${HH.contentThumb(c, { cls: "pub-grid", premiumTag: true })}
        <div class="tiny ellipsis" style="font-weight:600"><span data-noi18n>${esc(c.title)}</span></div>
        <div class="tiny muted">${locked ? typeLabel(c.type) + (Number(c.accessDays) ? " · " + HH.accessShort(c.accessDays).toLowerCase() : "") : bought ? `<span class="pub-bought">${HH.icon("check")} Comprado</span>` : typeLabel(c.type) + " · " + HH.fmtDate(c.createdAt)}</div></div>`;
    };
    const packHtml = (pk) => {
      const its = pk.itemIds
        .map((id) => items.find((c) => c.id === id))
        .filter(Boolean);
      const bought = HH.hasPurchased(viewer, "pack", pk.id);
      return `<div class="card stack" style="gap:10px">
        <div><div class="card-title"><span data-noi18n>${esc(pk.title)}</span></div><div class="small muted"><span data-noi18n>${esc(pk.description)}</span></div></div>
        <div class="pub-pack-thumbs">${its
          .slice(0, 4)
          .map((c) =>
            HH.contentThumb(c, { noTag: true, cls: "square", lockIcon: true }),
          )
          .join("")}</div>
        <div class="row between"><div><strong class="num" style="font-size:18px">${HH.money(pk.priceUsd)}</strong> <span class="small muted">· ${its.length} ${HH.plural(its.length, "ítem", "ítems")}${Number(pk.accessDays) ? " · " + HH.accessShort(pk.accessDays).toLowerCase() : ""}</span></div>
        ${bought ? `<span class="badge ok">${HH.icon("check")} Comprado</span>` : `<button type="button" class="btn sm" data-action="pubBuyPack" data-id="${pk.id}">${HH.icon("pack")} Comprar pack</button>`}</div></div>`;
    };
    let out = "";
    if (tab !== "pack") {
      out += list.length
        ? `<div class="media-grid">${list.map(itemHtml).join("")}</div>`
        : `<div class="empty">${HH.icon("image")}<h4>Todavía no hay ${tab === "all" ? "contenido" : tab === "photo" ? "fotos" : tab === "video" ? "videos" : "shorts"}</h4><p class="small">Podés pedirle contenido a medida.</p></div>`;
    }
    if (tab === "pack" || (tab === "all" && packs.length)) {
      out += `<div class="stack" style="gap:10px${tab === "all" ? ";margin-top:18px" : ""}">${tab === "all" ? "<h4>Packs</h4>" : ""}${packs.length ? `<div class="grid-2">${packs.map(packHtml).join("")}</div>` : `<div class="empty">${HH.icon("pack")}<h4>No hay packs por ahora</h4></div>`}</div>`;
    }
    return out;
  }
  // Todo el contacto vive en la tarjeta principal del perfil
  function contactHtml(p) {
    const me = HH.viewer();
    const liked = swipedRight(p.userId);
    const chatOk = !!HH.chatSessionOf(me.id, p.userId);
    const chatOn = HH.chatAvailable(p);
    const chatEnabled = HH.chatEnabledFor(p.userId);
    const book = HH.canTakeBookings(p);
    // Contacto minimalista: fila de botones redondos con su nombre debajo + acciones secundarias chicas
    const act = (cls, action, icon, label, extra = "") => `<button type="button" class="pf-act ${cls}" data-action="${action}" data-id="${p.userId}"${extra}><span class="pf-ab">${HH.icon(icon)}</span><span class="pf-al">${label}</span></button>`;
    return `
      <div class="pf-acts">
        ${act("wa", liked ? "pubOpenWa" : "pubInterest", "whatsapp", "WhatsApp")}
        ${chatEnabled ? act("chat", "pubChat", "chat", "Chat", ` title="${chatOk ? "Abrir chat en vivo" : chatOn ? "Chat en vivo · desde " + HH.money(HH.chatFrom(p)) : "Chat · no disponible ahora"}"${chatOn || chatOk ? "" : " disabled"}`) : ""}
        ${book ? act("book", "pubBook", "calendar", "Reservar") : ""}
        ${act("pf-fav" + (liked ? " on" : ""), "pubInterest", "heart", "Me interesa", ` aria-pressed="${liked}"`)}
      </div>
      <div class="pf-c3">
        ${HH.planFeat(p.userId, "requests") ? `<button type="button" class="pf-lnk" data-action="pubRequest" data-id="${p.userId}">${HH.icon("gift")} Pedir a medida</button>` : ""}
        ${(p.links || []).some((l) => l && l.url) ? `<a class="pf-lnk" href="#links.${p.slug}" data-go="#links.${p.slug}">${HH.icon("external")} Links</a>` : ""}
        <button type="button" class="pf-lnk" data-action="pubShare" data-slug="${p.slug}">${HH.icon("share")} Compartir</button>
        <button type="button" class="pf-lnk" data-action="pubReport" data-slug="${p.slug}">${HH.icon("flag")} Reportar</button>
      </div>`;
  }

  // Página de links (tipo "link en bio"): botones de SexyRose + hasta 4 links propios
  const linkHost = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  };
  HH.route("links.:slug", ({ slug }) => {
    const p = HH.profileBySlug(slug);
    const ok = p && HH.publishedProfiles().includes(p);
    if (!ok)
      return `<div class="container section"><div class="empty">${HH.icon("search")}<h4>Esta página no está disponible</h4><a class="btn" href="#inicio" data-go="#inicio">Ir al inicio</a></div></div>`;
    const links = (p.links || []).filter((l) => l && l.url);
    const hh = [
      `<a class="lk-btn main" href="#perfil.${esc(p.slug)}" data-go="#perfil.${esc(p.slug)}">${HH.icon("user")}<span>Mi perfil en SexyRose</span></a>`,
      HH.canTakeBookings(p)
        ? `<button type="button" class="lk-btn main" data-action="pubBook" data-id="${esc(p.userId)}">${HH.icon("calendar")}<span>Reservar una salida</span></button>`
        : "",
      HH.contentOf(p.userId).length
        ? `<a class="lk-btn main" href="#perfil.${esc(p.slug)}" data-go="#perfil.${esc(p.slug)}">${HH.icon("image")}<span>Mis fotos y videos</span></a>`
        : "",
      HH.chatAvailable(p)
        ? `<button type="button" class="lk-btn main" data-action="pubChat" data-id="${esc(p.userId)}">${HH.icon("chat")}<span>Chat en vivo · desde ${HH.money(HH.chatFrom(p))}</span></button>`
        : "",
    ].join("");
    return `<div class="container lk-page">
      <div class="lk-head">${HH.avatar(p, 96)}<h2>${esc(p.displayName)}</h2>${p.headline ? `<p class="small muted" data-noi18n>${esc(HH.pText(p, "headline"))}</p>` : ""}${p.city ? `<div class="tiny muted">${HH.icon("pin")} ${esc(p.city)}</div>` : ""}</div>
      <div class="lk-list">${hh}</div>
      ${links.length ? `<div class="lk-list">${links.map((l) => `<a class="lk-btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow ugc"><span>${esc(l.label || linkHost(l.url))}</span>${HH.icon("external")}</a>`).join("")}</div>` : ""}
      <div class="row" style="justify-content:center;gap:8px"><button type="button" class="btn ghost sm" data-action="pubLinksShare" data-slug="${esc(p.slug)}">${HH.icon("share")} Compartir</button></div>
      <p class="tiny muted lk-legal">Los links externos los agrega cada acompañante. SexyRose no controla ni se hace cargo del contenido de sitios de terceros.</p>
    </div>`;
  });
  HH.route("perfil.:slug", ({ slug }) => {
    const p = HH.profileBySlug(slug);
    const me = HH.me();
    if (!p)
      return `<div class="container section"><div class="empty">${HH.icon("search")}<h4>No encontramos ese perfil</h4><p class="small">Puede que haya cambiado de nombre o que ya no esté publicado.</p><button type="button" class="btn" data-go="#swipe">${HH.icon("heart")} Explorar perfiles</button></div></div>`;
    const mine = !!(me && me.id === p.userId);
    const published = HH.publishedProfiles().includes(p);
    if (!published && !mine && !(me && me.role === "admin"))
      return `<div class="container section"><div class="empty">${HH.icon("clock")}<h4>Este perfil no está disponible</h4><p class="small">Mientras tanto, mirá otras acompañantes.</p><button type="button" class="btn" data-go="#swipe">${HH.icon("heart")} Explorar perfiles</button></div></div>`;
    if (S.profileSlug !== slug) {
      S.profileSlug = slug;
      S.profileTab = "all";
      S.galTab = "all";
      S.pfTab = "gal";
    }
    if (!mine) HH.view(p.userId);
    const lvl = HH.levelOf(p.userId);
    const badges = [
      HH.isStar(p.userId) ? HH.starBadge() : "",
      p.verified === "verified"
        ? HH.verifiedBadge()
        : p.verified === "pending"
          ? `<span class="badge neutral">${HH.icon("clock")} Verificación en curso</span>`
          : "",
      lvl === "A" ? priorityBadge() : "",
      HH.tripBadge(p),
    ]
      .filter(Boolean)
      .join("");
    const items = HH.contentOf(p.userId);
    const premiumItems = items.filter((c) => c.isPremium);
    const packs = HH.packsOf(p.userId);
    const tabs = [
      ["all", "Todo"],
      ["photo", "Fotos"],
      ["video", "Videos"],
      ["short", "Shorts"],
      ["pack", "Packs"],
    ];
    const photos = galPhotos(p), vids = galVideos(p);
    const loc = HH.locByName ? HH.locByName(p.city) : null;
    const crumbs = [`<a href="#inicio" data-go="#inicio">Inicio</a>`]
      .concat((loc && HH.locPath ? HH.locPath(loc) : []).map((l) => (HH.placeKey && HH.isActiveLoc(l) ? `<a href="#${HH.placeKey(l)}" data-go="#${HH.placeKey(l)}">${esc(l.name)}</a>` : `<span>${esc(l.name)}</span>`)))
      .concat([`<span aria-current="page">${esc(p.displayName)}</span>`]);
    const liked = swipedRight(p.userId);
    const stories = HH.storiesOf(p.userId).length;
    const BUILD = HH.BUILDS || {};
    const actLabels = (p.activities || []).map((a) => HH.activity(a).label);
    const about = [
      (p.languages || []).length ? ["Idiomas", p.languages.join(", "), false] : null,
      p.heightCm ? ["Altura", (p.heightCm / 100).toFixed(2).replace(".", ",") + " m", false] : null,
      p.build && BUILD[p.build] ? ["Contextura", BUILD[p.build], true] : null,
      HH.interestsOf && HH.interestsOf(p).length ? ["Intereses", HH.interestsOf(p).map((id) => HH.interestLabel(id)).join(" · "), false] : null,
    ].filter(Boolean);
    const curTrip = HH.tripsOf(p).find((tr) => tr.from <= HH.localDay() && tr.to >= HH.localDay());
    const monthYear = (iso) => new Date(iso).toLocaleDateString(HH.loc(), { month: "long", year: "numeric" });
    const updated = p.updatedAt || p.createdAt;
    const gtab = S.galTab || "all";
    const galList = gtab === "photo" ? photos.map((_, i) => ({ i })) : gtab === "video" ? vids.map((v) => ({ v })) : photos.slice(0, GAL_ROW).map((_, i) => ({ i })).concat(vids.slice(0, Math.max(2, GAL_ROW - Math.min(photos.length, GAL_ROW))).map((v) => ({ v })));
    const shownGal = gtab === "all" ? galList : galList.slice(0, 15);
    const totalGal = photos.length + vids.length;
    const tile = (x) => x.v
      ? `<button type="button" class="pf-tile" data-action="pubLightbox" data-vid="${esc(x.v.id)}" aria-label="Ver video"><div class="media square">${HH.videoMedia(x.v)}<span class="pub-vbadge">${HH.icon("play")}${x.v.seconds ? ` ${x.v.seconds}s` : ""}</span></div></button>`
      : `<button type="button" class="pf-tile" data-action="pubLightbox" data-idx="${x.i}" aria-label="Ver foto ${x.i + 1}">${HH.photo(p, x.i, { cls: "square" })}</button>`;
    const moreN = (gtab === "all" ? totalGal : galList.length) - shownGal.length;
    const galTabs = [["all", "Todo", totalGal], ["photo", "Fotos", photos.length], ["video", "Videos", vids.length]];
    return `<div class="container section pf2" style="padding-block:14px">
      ${mine ? `<div class="notice info" style="margin-bottom:12px">${HH.icon("eye")}<span>Así ven tu perfil los clientes. <a href="#panel.perfil" data-go="#panel.perfil">Editar mi perfil</a></span></div>` : ""}
      ${!published ? `<div class="notice warn" style="margin-bottom:12px">${HH.icon("alert")}<span>Este perfil no es visible para el público: ${p.hidden ? "ocultaste tu cuenta" : p.status !== "active" ? "está suspendido o pendiente de activación" : !HH.levelOf(p.userId) ? "no tiene un plan activo" : "faltan requisitos por completar"}.</span></div>` : ""}
      <nav class="pf-crumbs" aria-label="Ubicación">${crumbs.join(HH.icon("chevronRight"))}</nav>
      <section class="pf-card" aria-label="Perfil">
        <button type="button" class="pf-thumb${stories ? " has-st" + (HH.storiesOf(p.userId).every((x) => HH.seenStories()[x.id]) ? " seen" : "") : ""}" data-action="${stories ? "openStories" : "pubLightbox"}" data-id="${p.userId}" data-idx="0" aria-label="${stories ? "Ver historias" : "Ver foto"}">${HH.photo(p, 0)}</button>
        <div class="pf-head">
          <h1>${esc(p.displayName)}${HH.isStar(p.userId) ? `<span class="pf-ic star" title="Star" aria-label="Star">${HH.icon("star")}</span>` : ""}${p.verified === "verified" ? `<span class="pf-ic ok" title="Verificada" aria-label="Verificada">${HH.icon("verified")}</span>` : ""}</h1>
          ${p.age || p.nationality ? `<div class="pf-age">${p.age ? `<span>${p.age} años</span>` : ""}${p.age && p.nationality ? " · " : ""}${p.nationality ? `<span data-noi18n>${esc(p.nationality)}</span>` : ""}${p.verified === "pending" ? ` · <span class="muted">verificación en curso</span>` : ""}</div>` : ""}
          <div class="pf-loc">${HH.icon("pin")} <span>${p.zone && !p.traveling ? `<span data-noi18n>${esc(p.zone)}</span>, ` : ""}${esc(p.city || "Ciudad a definir")}</span></div>
          ${curTrip ? `<div class="pf-loc pf-trip">${HH.icon("globe")} <span>De visita hasta el ${HH.fmtDay(curTrip.to)}${p.homeCity ? ` · vive en ${esc(p.homeCity)}` : ""}</span></div>` : ""}
          ${mine ? "" : p.rateFrom ? `<div class="pf-rate"><span>Tarifa</span> <span class="pf-rv"><strong>${HH.money(p.rateFrom)}</strong>/h</span></div>` : `<div class="pf-rate"><span>Tarifa a convenir</span></div>`}
        </div>
        ${mine ? "" : `<div class="pf-contact" id="pubContact">${contactHtml(p)}</div>`}
      </section>
      ${HH.highlightsRow ? HH.highlightsRow(p, mine) : ""}
      ${(() => {
        const ptab = S.pfTab === "about" && !about.length ? "gal" : S.pfTab || "gal";
        const ptabs = [["gal", "Galería"], ["desc", "Descripción"]].concat(about.length ? [["about", "Sobre mí"]] : []);
        return `<div class="pf-tabs" role="tablist" aria-label="Secciones del perfil">${ptabs.map(([k, l]) => `<button type="button" role="tab" id="pfTab_${k}" aria-controls="pfPanel_${k}" data-action="pubPfTab" data-tab="${k}" aria-selected="${ptab === k}" class="${ptab === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <section class="pf-gal pf-panel" id="pfPanel_gal" role="tabpanel" aria-labelledby="pfTab_gal"${ptab === "gal" ? "" : " hidden"}>
        ${totalGal ? `<div class="pf-gtabs" role="tablist">${galTabs.map(([k, l, n]) => `<button type="button" role="tab" data-action="pubGalTab" data-tab="${k}" aria-selected="${gtab === k}" class="${gtab === k ? "on" : ""}">${l} (${n})</button>`).join("")}</div>` : ""}
        ${shownGal.length ? `<div class="pf-grid">${shownGal.map(tile).join("")}${moreN > 0 ? `<button type="button" class="pf-tile pf-all" data-action="pubGalleryAll"><strong>+${moreN}</strong><span class="tiny">Ver todo</span></button>` : ""}</div>` : `<p class="small muted">Sin ${gtab === "video" ? "videos" : "fotos"} todavía.</p>`}
      </section>
      <section class="pf-desc pf-panel" id="pfPanel_desc" role="tabpanel" aria-labelledby="pfTab_desc"${ptab === "desc" ? "" : " hidden"}>
        ${p.headline ? `<p class="lead" style="font-weight:600" data-noi18n>${esc(HH.pText(p, "headline"))}</p>` : ""}
        ${p.bio ? `<p class="pf-bio${S.bioOpen === p.userId ? " open" : ""}" id="pfBio" data-noi18n>${esc(HH.pText(p, "bio"))}</p>${String(HH.pText(p, "bio")).length > 180 ? `<button type="button" class="pf-more" data-action="pubBioMore">${S.bioOpen === p.userId ? "Ver menos" : "Ver más"}</button>` : ""}` : `<p class="muted">Todavía no escribió su presentación.</p>`}
        <p class="pf-meta">En el sitio desde ${monthYear(p.createdAt || HH.now())} · Actualizado el ${HH.fmtDate(updated, { day: "numeric", month: "long", year: "numeric" })} · ${((p.stats && p.stats.views) || 0).toLocaleString(HH.loc())} visitas</p>
        <div class="notice">${HH.icon("shield")}<span>Salidas en lugares públicos. Reportá cualquier conducta inapropiada.</span></div>
      </section>
      ${about.length ? `<section class="pf-about pf-panel" id="pfPanel_about" role="tabpanel" aria-labelledby="pfTab_about"${ptab === "about" ? "" : " hidden"}><dl>${about.map(([k, v, tr]) => `<div><dt>${k}</dt><dd${tr ? "" : " data-noi18n"}>${esc(v)}</dd></div>`).join("")}</dl></section>` : ""}`;
      })()}
      ${(() => {
        const t = HH.localDay();
        const next = HH.tripsOf(p).filter((tr) => tr.to >= t);
        return next.length
          ? `<section class="card stack" style="gap:8px" aria-label="Próximos destinos"><div class="card-title">${HH.icon("globe")} Próximos destinos</div><div class="list">${next.map((tr) => `<div class="list-item">${HH.icon(tr.from <= t ? "pin" : "calendar")}<div class="grow"><div class="title">${esc(tr.city)}${tr.country ? ", " + esc(tr.country) : ""}</div><div class="sub">${tr.from <= t ? "Ahora, hasta el " + HH.fmtDay(tr.to) : "Del " + HH.fmtDay(tr.from) + " al " + HH.fmtDay(tr.to)}</div></div></div>`).join("")}</div></section>`
          : "";
      })()}
      ${premiumItems.length || packs.length ? `<section class="stack" id="pubContent" aria-label="Contenido">
        <div class="row between"><h2 class="pf-h2">Contenido exclusivo</h2><span class="small muted">${premiumItems.length} ${HH.plural(premiumItems.length, "pieza")}${packs.length ? " · " + packs.length + " " + HH.plural(packs.length, "pack") : ""}</span></div>
        <div class="chips scroll" role="tablist" aria-label="Tipo de contenido">${tabs.map(([k, l]) => `<button type="button" class="chip" role="tab" data-action="pubContentTab" data-tab="${k}" aria-pressed="${S.profileTab === k}" aria-selected="${S.profileTab === k}">${l}</button>`).join("")}</div>
        <div id="pubContentBody">${contentBody(p, S.profileTab)}</div>
      </section>` : ""}
    </div>`;
  });

  /* ============================================================
     4. SHORTS
     ============================================================ */
  const isLiked = (c) =>
    (HH.db.likes || []).some(
      (l) => l.contentId === c.id && l.userId === HH.viewerId(),
    );
  const likeCount = (c) =>
    Math.floor((c.views || 0) / 10) +
    (HH.db.likes || []).filter((l) => l.contentId === c.id).length;
  const kfmt = (n) =>
    n >= 1000
      ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".0", "") + "K"
      : String(n);
  function shortHtml(c) {
    const p = HH.profileOf(c.workerId);
    if (!p) return "";
    const locked = c.isPremium && !HH.canView(c, HH.viewerId());
    const dur = parseDur(c.duration) || 20;
    const liked = isLiked(c);
    return `<article class="short${locked ? " locked" : ""}" data-id="${c.id}" style="--dur:${dur}s" aria-label="${esc(c.title)} de ${esc(p.displayName)}">
      ${HH.contentThumb(c, { cls: "", noTag: true, noLock: true })}
      ${
        locked
          ? `<div class="short-lock"><span class="ico">${HH.icon("lock")}</span><strong>Short exclusivo</strong><button type="button" class="btn" data-action="pubShortBuy" data-id="${c.id}">Desbloquear · ${HH.money(c.priceUsd)}</button></div>`
          : `<button type="button" class="pub-play" data-action="pubShortToggle" aria-label="Reproducir o pausar">${HH.icon("play")}</button><div class="pub-prog" aria-hidden="true"><i></i></div>`
      }
      <div class="overlay">
        <a class="who" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}"><strong>${esc(p.displayName)}</strong>${p.verified === "verified" ? `<span style="color:#9CC3FF;display:inline-flex">${HH.icon("verified")}</span>` : ""}${HH.isStar(p.userId) ? HH.starBadge() : ""}</a>
        <div class="small cap"><strong><span data-noi18n>${esc(c.title)}</span></strong>${c.caption ? " · " + esc(c.caption) : ""}</div>
        <div class="tiny meta">${HH.icon("pin")} ${esc(p.city)}${c.duration ? " · " + esc(c.duration) : ""}</div>
      </div>
      <div class="side">
        <button type="button" class="av" data-action="pubShortInterest" data-id="${p.userId}" aria-label="Me interesa ${esc(p.displayName)}">${HH.avatar(p, 46)}<span class="plus">${swipedRight(p.userId) ? HH.icon("check") : HH.icon("plus")}</span></button>
        <button type="button" class="${liked ? "liked" : ""}" data-action="pubShortLike" data-id="${c.id}" aria-label="Me gusta" aria-pressed="${liked}">${HH.icon("heart")}</button><span class="lbl num" id="pubLikes_${c.id}">${kfmt(likeCount(c))}</span>
        ${HH.chatAvailable(p) ? `<button type="button" data-action="pubChat" data-id="${p.userId}" aria-label="Chat en vivo">${HH.icon("chat")}</button><span class="lbl">Chat</span>` : ""}
        <button type="button" data-action="pubShortShare" data-id="${c.id}" aria-label="Compartir">${HH.icon("send")}</button><span class="lbl">Compartir</span>
        <button type="button" data-action="pubShortMore" data-id="${c.id}" aria-label="Más opciones">${HH.icon("menu")}</button>
      </div>
    </article>`;
  }
  function mountShorts() {
    const feed = document.getElementById("pubFeed");
    if (!feed) return;
    const shorts = feed.querySelectorAll(".short:not(.locked)");
    if (!("IntersectionObserver" in window)) {
      shorts.forEach((s) => s.classList.add("playing"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          const s = e.target;
          const btn = s.querySelector(".pub-play");
          if (e.intersectionRatio >= 0.6) {
            s.classList.add("playing");
            if (btn) btn.innerHTML = PAUSE_SVG;
          } else {
            s.classList.remove("playing", "paused");
            if (btn) btn.innerHTML = HH.icon("play");
          }
        }),
      { root: feed, threshold: [0, 0.6, 1] },
    );
    shorts.forEach((s) => io.observe(s));
  }
  HH.route("shorts", () => {
    const tab = S.shortsTab;
    const pub = new Set(HH.publishedProfiles().map((p) => p.userId));
    const hidden = new Set(HH.ui.hiddenShorts || []);
    let items = HH.db.content.filter(
      (c) => c.type === "short" && pub.has(c.workerId) && !hidden.has(c.id),
    );
    if (tab === "free") items = items.filter((c) => !c.isPremium);
    const score = (c) =>
      (HH.LEVELS[HH.levelOf(c.workerId)] || { rank: 0 }).rank;
    if (tab === "new") items.sort(HH.by("createdAt"));
    else
      items.sort(
        (a, b) =>
          score(b) - score(a) ||
          (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
      );
    HH.afterRender = mountShorts;
    const tabs = [
      ["foryou", "Para vos"],
      ["free", "Gratis"],
      ["new", "Nuevos"],
    ];
    const hint = !HH.ui.shortsHintSeen && items.length > 1;
    return `<div class="shorts-page">
      <div class="shorts-tabs" role="tablist" aria-label="Filtro de shorts">${tabs.map(([k, l]) => `<button type="button" role="tab" data-action="pubShortsTab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div>
      <div class="shorts pub-feed" id="pubFeed" aria-label="Feed de shorts">${items.length ? items.map(shortHtml).join("") : `<div class="empty" style="align-content:center">${HH.icon("film")}<h4>No hay shorts con este filtro</h4><button type="button" class="btn secondary sm" data-action="pubShortsTab" data-tab="foryou">Ver todos</button></div>`}</div>
      ${hint ? `<button type="button" class="shorts-hint" data-action="pubShortsHint"><span class="hand">${HH.icon("arrowLeft")}</span>Deslizá hacia arriba para ver otro</button>` : ""}
    </div>`;
  });

  /* ============================================================
     5. STARS
     ============================================================ */
  HH.route("stars", () => {
    const me = HH.me();
    const worker = me && me.role === "worker";
    const mine = worker ? HH.myProfile() : null;
    const country =
      S.starsCountry !== undefined
        ? S.starsCountry
        : (mine && HH.starRegionOf(mine.userId)) || HH.viewerRegion() || "";
    const stars = HH.starsShownIn(country)
      .map((s) => ({ s, p: HH.profileOf(s.workerId) }))
      .filter((x) => x.p);
    const free = country ? HH.starSlotsFree(country) : null;
    const countries = HH.starRegions();
    if (country && !countries.includes(country)) countries.unshift(country);
    return `<div class="container section stack-lg">
      <div style="max-width:720px"><span class="eyebrow">Stars</span><h1>${HH.STARS.slots_per_region} lugares por provincia o estado, cada mes</h1>
        <p class="lead" style="margin-top:10px">Las Stars aparecen primero en el swipe, en el inicio y en los shorts de su provincia o estado. Cada provincia/estado tiene ${HH.STARS.slots_per_region} lugares, contados por dónde vive cada acompañante. Si una Star viaja a una provincia que ya está completa, se muestra igual mientras dure el viaje.</p></div>
      <div class="row" style="gap:10px"><label for="pubStarsCountry" class="small muted">Provincia / estado</label><select class="select" id="pubStarsCountry" data-change="pubStarsCountry" style="max-width:240px"><option value=""${!country ? " selected" : ""}>Todas</option>${countries.map((c) => `<option value="${esc(c)}"${c === country ? " selected" : ""}>${esc(c)} · ${HH.activeStarsIn(c).length}/${HH.STARS.slots_per_country}</option>`).join("")}</select>${country ? `<span class="badge ${free ? "ok" : "warn"}">${free} de ${HH.STARS.slots_per_country} ${HH.plural(free, "libre")} en ${esc(country)}</span>` : ""}</div>
      ${
        stars.length
          ? `<div class="pub-stars-big">${stars
              .map(
                ({
                  s,
                  p,
                }) => `<article class="card stack" style="gap:12px;padding:14px">
          ${HH.photo(p, 0, { children: `<div class="pub-badges">${HH.starBadge()}</div>` })}
          <div class="stack" style="gap:6px">
            <h3 class="pub-ir" style="gap:8px">${nameAge(p)}${p.verified === "verified" ? `<span class="pub-ir fg" style="color:var(--info)"><span class="sr-only">Verificada</span>${HH.icon("verified")}</span>` : ""}</h3>
            <div class="pub-ir small muted">${HH.icon("pin")} ${esc(p.city)}${p.country ? ", " + esc(p.country) : ""}</div>
            <div class="pill-row">${HH.activityChips((p.activities || []).slice(0, 4), "sm")}</div>
            <div class="pub-ir small" style="font-weight:600">${HH.icon("calendar")} Star hasta el ${HH.fmtDate(s.activeUntil)} · ${HH.daysLeft(s.activeUntil)} ${HH.plural(HH.daysLeft(s.activeUntil), "día")}</div>
          </div>
          <button type="button" class="btn secondary block" data-go="#perfil.${p.slug}">Ver perfil</button>
        </article>`,
              )
              .join("")}</div>`
          : `<div class="empty">${HH.icon("star")}<h4>Todos los lugares de ${esc(country || "esta provincia")} están libres</h4><p class="small">Es el mejor momento para reservar el tuyo.</p></div>`
      }
      <section class="card lift stack" style="gap:14px;background:linear-gradient(135deg,var(--berry-tint),var(--surface))">
        <div class="row between">
          <div><span class="eyebrow">Para acompañantes</span><h2 style="font-size:26px">Sé Star en tu provincia o estado</h2></div>
          ${free !== null ? `<span class="badge ${free ? "ok" : "warn"}">${free} ${HH.plural(free, "libre")} en ${esc(country)}</span>` : `<span class="badge neutral">${HH.STARS.slots_per_region} por provincia/estado</span>`}
        </div>
        <div class="row" style="gap:18px">
          <ul style="margin:0;padding:0;list-style:none;display:grid;gap:6px;font-size:14px;color:var(--fg-2)">
            <li class="pub-ir ok">${HH.icon("check")} Primera en el swipe de tu provincia o estado</li>
            <li class="pub-ir ok">${HH.icon("check")} Sección "Stars del mes" en el inicio</li>
            <li class="pub-ir ok">${HH.icon("check")} Tus shorts arriba del feed</li>
            <li class="pub-ir ok">${HH.icon("check")} Sello Star en tu perfil y tus cards</li>
          </ul></div>
        <div class="row"><button type="button" class="btn lg" data-go="${worker ? "#panel.suscripcion" : "#registro"}">${HH.icon("star")} ${worker ? "Reservar mi slot" : "Crear mi perfil y reservar"}</button>${!free ? `<span class="small muted">Ahora no hay slots libres. El próximo se libera el ${HH.fmtDate(stars.map((x) => x.s.activeUntil).sort()[0])}.</span>` : ""}</div>
      </section>
    </div>`;
  });

  /* ============================================================
     6. LOGIN
     ============================================================ */
  const DEMO = [
    { id: "u_vale", r: "Acompañante · plan Star" },
    { id: "u_juli", r: "Acompañante nueva · plan Oro" },
    { id: "u_cliente", r: "Cliente con compras" },
    { id: "u_admin", r: "Administración" },
  ];
  function afterLogin(u) {
    const next = HH.ui.next;
    HH.ui.next = null;
    HH.save();
    HH.go(
      next && next !== "#login" && next !== "login"
        ? next.startsWith("#")
          ? next
          : "#" + next
        : HH.homeFor(u.role),
    );
  }
  HH.route("login", () => {
    if (HH.me()) {
      HH.go(HH.homeFor(HH.role()));
      return false;
    }
    return `<div class="container"><div class="auth-wrap">
      <div class="auth-card">
        <div><span class="eyebrow">Iniciar sesión</span><h2>Entrá a tu cuenta</h2><p class="small muted" style="margin-top:4px">Para acompañantes, clientes y administración. Para mirar perfiles y escribir por WhatsApp no hace falta cuenta; para comprar contenido, sí (sin verificación de identidad).</p></div>
        <form data-submit="pubLogin" class="stack" novalidate>
          <div class="field"><label for="pubEmail">Email</label><input class="input" id="pubEmail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="vos@ejemplo.com" required></div>
          <div class="field"><label for="pubPass">Contraseña</label><input class="input" id="pubPass" name="password" type="password" autocomplete="current-password" required></div>
          <div id="pubAuthErr" aria-live="polite"></div>
          <button type="submit" class="btn lg block">Entrar</button>
        </form>
        <button type="button" class="btn secondary block" data-action="pubPasskeyLogin">${HH.icon("key")} Entrar con passkey</button>
        <p class="small center muted">¿No tenés cuenta? <a href="#registro" data-go="#registro">Creá tu perfil</a> o <a href="#" data-action="clientSignup">creá una cuenta de cliente</a></p>
      </div>
      <div class="card stack" style="gap:10px">
        <div><div class="card-title">Cuentas de demostración</div><div class="small muted">Contraseña demo1234 para todas. Entrás con un clic.</div></div>
        <div class="demo-accounts">${DEMO.map((d) => {
          const u = HH.userById(d.id);
          if (!u) return "";
          return `<button type="button" data-action="pubDemoLogin" data-id="${d.id}">${HH.userAvatar(u, 36)}<span class="grow"><span style="font-weight:700;display:block">Entrar como ${esc(u.name.split(" ")[0])}</span><span class="r">${d.r}</span></span>${HH.icon("chevronRight")}</button>`;
        }).join("")}</div>
      </div>
    </div></div>`;
  });

  /* ============================================================
     7. REGISTRO
     ============================================================ */
  // Registro en pasos: 1) tipo de cuenta · 2) datos · 3) passkey (opcional) · 4) listo
  const PHONE_CODES = [
    ["AR", "+54"],
    ["UY", "+598"],
    ["CL", "+56"],
    ["MX", "+52"],
    ["CO", "+57"],
    ["PE", "+51"],
    ["BR", "+55"],
    ["ES", "+34"],
    ["US", "+1"],
  ];
  const phoneField = (
    id,
    name,
    label,
    hint,
    required,
  ) => `<div class="field"><label for="${id}">${label}${required ? "" : ' <span class="muted" style="font-weight:500">(opcional)</span>'}</label>
    <div class="pub-phone"><select class="select" id="${id}Cc" name="${name}Cc" aria-label="Código de país">${PHONE_CODES.map(([c, n]) => `<option value="${n}">${c} ${n}</option>`).join("")}</select><input class="input num" id="${id}" name="${name}" type="tel" inputmode="tel" placeholder="9 11 2345-6789" autocomplete="tel-national"${required ? " required" : ""}></div>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  HH.route("registro", () => {
    if (HH.me()) {
      HH.go(HH.homeFor(HH.role()));
      return false;
    }
    const step = S.regStep || "tipo";
    const dots = (n) =>
      `<div class="pub-steps" aria-hidden="true">${[1, 2, 3].map((k) => `<span class="${k <= n ? "on" : ""}"></span>`).join("")}</div>`;
    if (step === "tipo")
      return `<div class="container"><div class="auth-wrap">
      <div class="auth-card">
        ${dots(1)}
        <div class="pub-reg-ico">${HH.icon("user")}</div>
        <div><h2>Crear cuenta</h2><p class="small muted" style="margin-top:4px">Elegí cómo vas a usar SexyRose.</p></div>
        <div class="stack" style="gap:10px">
          <button type="button" class="pub-choice" data-action="pubRegPick" data-kind="worker"><span class="grow"><strong>Publicar mi perfil</strong><span class="tiny muted">Acompañante</span><span class="small">Creá tu perfil, subí fotos y empezá a aparecer en el sitio.</span></span>${HH.icon("chevronRight")}</button>
          <button type="button" class="pub-choice" data-action="pubRegPick" data-kind="client"><span class="grow"><strong>Comprar contenido</strong><span class="tiny muted">Cliente · sin verificación de identidad</span><span class="small">Cuenta con alias para comprar fotos, videos, packs y chat. Para mirar perfiles y escribir por WhatsApp no necesitás cuenta.</span></span>${HH.icon("chevronRight")}</button>
        </div>
        <p class="small center muted">¿Ya tenés cuenta? <a href="#login" data-go="#login">Entrar</a></p>
      </div></div></div>`;
    const geoCity = HH.geo() && HH.geo().city;
    return `<div class="container"><div class="auth-wrap">
      <div class="auth-card">
        <div class="row between nowrap"><button type="button" class="icon-btn sm" data-action="pubRegBack" aria-label="Volver">${HH.icon("chevronLeft")}</button><span class="eyebrow">Crear cuenta</span><span style="width:34px"></span></div>
        ${dots(2)}
        <div><h2>Tus datos</h2><p class="small muted" style="margin-top:4px">Completá tus datos para crear la cuenta. Después verificás identidad, email y WhatsApp desde tu panel.</p></div>
        <form data-submit="pubRegister" class="stack" novalidate>
          <input type="hidden" name="role" value="worker">
          <div class="field"><label>Tipo de cuenta</label><input class="input" value="Acompañante" disabled></div>
          <div class="field"><label for="pubRegEmail">Email</label><input class="input" id="pubRegEmail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="vos@ejemplo.com" required></div>
          <div class="field"><label for="pubRegAct">Actividad principal</label><select class="select" id="pubRegAct" name="mainActivity">${HH.ACTIVITIES.map((a) => `<option value="${esc(a.id)}">${esc(a.label)}</option>`).join("")}</select><span class="hint">Después podés sumar más desde tu perfil.</span></div>
          <div class="field"><span class="label">Te presentás como</span><div class="chips" role="radiogroup" aria-label="Te presentás como">${HH.GENDERS.map((g, i) => `<label class="chip pub-gchip"><input type="radio" name="gender" value="${g.id}" class="sr-only"${i === 0 ? " checked" : ""}>${HH.icon(g.icon)} ${g.label}</label>`).join("")}</div></div>
          <div class="field"><label for="pubRegName">Nombre público</label><input class="input" id="pubRegName" name="name" type="text" autocomplete="nickname" placeholder="Cómo te van a ver los clientes" required maxlength="30"></div>
          <div class="field"><label for="pubRegPass">Contraseña</label><input class="input" id="pubRegPass" name="password" type="password" autocomplete="new-password" minlength="8" required><span class="hint">Mínimo 8 caracteres.</span></div>
          ${phoneField("pubRegWa", "whatsapp", "WhatsApp", "Es el número al que te escriben los clientes cuando deslizan tu perfil a la derecha.", true)}
          ${phoneField("pubRegTg", "telegram", "Telegram", "", false)}
          <div class="field pub-place" id="pubPlace"><label for="pubRegPlaceQ">Localidad</label>
            <input class="input" id="pubRegPlaceQ" type="search" autocomplete="off" placeholder="Escribí tu ciudad o localidad (ej.: Merlo)" data-input="pubPlaceSearch" value="${esc(geoCity || "")}">
            <input type="hidden" name="city" id="pubRegCity" value="${esc(geoCity || "")}"><input type="hidden" name="cityParent" id="pubRegCityParent" value="">
            <div class="pub-place-res" id="pubPlaceRes"></div>
            <span class="hint" id="pubPlaceHint">Los clientes ven tu localidad y una distancia aproximada, nunca tu dirección. Si es nueva en SexyRose, la sumamos cuando verifiquemos tu cuenta.</span>
          </div>
          <label class="pub-check"><input type="checkbox" name="terms" value="1"><span>Soy mayor de 18 años y acepto los términos: salidas en lugares públicos, sin contenido sexual.</span></label>
          <div id="pubAuthErr" aria-live="polite"></div>
          <button type="submit" class="btn lg block">Crear cuenta</button>
        </form>
      </div></div></div>`;
  });
  function regPasskeyStep(u) {
    HH.modal({
      title: "Creá una passkey",
      body: `<div class="pub-reg-ico">${HH.icon("key")}</div>
      <p>Con una passkey entrás de forma segura y rápida con tu huella, tu cara, el bloqueo de pantalla o tu gestor de contraseñas. Sin escribir la contraseña.</p>
      ${HH.passkeySupported() ? "" : `<div class="notice info">${HH.icon("info")}<span>Este navegador o esta página no permiten passkeys. Podés crearla después desde Ajustes, abriendo el sitio en https o localhost.</span></div>`}`,
      actions: [
        { label: "Omitir", cls: "ghost", onClick: () => regDone() },
        {
          label: "Crear passkey",
          id: "pubPkBtn",
          onClick: async () => {
            const b = document.getElementById("pubPkBtn");
            if (b) {
              b.disabled = true;
              b.textContent = "Esperando al dispositivo…";
            }
            const r = await HH.createPasskey(u);
            if (r.ok) HH.toast("Passkey creada", { type: "ok" });
            else if (r.reason !== "cancelled")
              HH.toast(
                "No se pudo crear la passkey. Podés hacerlo después desde Ajustes.",
                { type: "warn" },
              );
            regDone();
          },
        },
      ],
    });
  }
  function regDone() {
    HH.modal({
      title: "Listo, tu cuenta está creada",
      body: `<div class="pub-reg-ico ok">${HH.icon("checkCircle")}</div>
      <p>El próximo paso es verificar tu email. Después vas a ver los beneficios de cada categoría y sus precios para elegir tu plan.</p>`,
      actions: [
        {
          label: "Verificar mi email",
          onClick: () => {
            HH.closeModal();
            S.regStep = "tipo";
            HH.go("#panel.suscripcion");
            setTimeout(() => HH.verifyContact("email"), 50);
          },
        },
        {
          label: "Más tarde",
          cls: "ghost",
          onClick: () => {
            HH.closeModal();
            S.regStep = "tipo";
            HH.go("#panel");
          },
        },
      ],
    });
  }

  /* ============================================================
     Acciones (prefijo pub)
     ============================================================ */
  const showErr = (msg) => {
    const box = document.getElementById("pubAuthErr");
    if (box)
      box.innerHTML = `<div class="notice warn">${HH.icon("alert")}<span>${esc(msg)}</span></div>`;
  };
  const requireLogin = (nextHash, msg) => {
    HH.ui.next = nextHash;
    HH.save();
    HH.toast(msg || "Iniciá sesión para continuar", { type: "warn" });
    HH.go("#login");
  };

  Object.assign(HH.actions, {
    // Inicio
    pubGoActivity(el) {
      const id = el.dataset.id || "";
      HH.ui.homeCat = HH.ui.homeCat === id ? "" : id;
      S.gridShown = GRID_PAGE; S.tierShown = {};
      HH.save();
      const y = window.scrollY;
      HH.refresh();
      window.scrollTo(0, y);
    },
    pubSwipeMode() {
      const f = swipeFilters();
      f.activity = homeCat();
      f.city = cityCurrent();
      HH.save();
      HH.go("#swipe");
    },
    pubGridMode() {
      const f = swipeFilters();
      HH.ui.homeCat = f.activity || "";
      if (f.city !== undefined) HH.ui.city = f.city || "";
      S.gridShown = GRID_PAGE; S.tierShown = {};
      HH.save();
      HH.go("#inicio");
      setTimeout(() => {
        const g = document.querySelector(".pub-swipe-cta");
        if (g)
          window.scrollTo({
            top: g.getBoundingClientRect().top + window.scrollY - 140,
            behavior: "smooth",
          });
      }, 120);
    },
    pubCopy(el) {
      copyText(el.dataset.text || "", el.dataset.select);
    },
    pubCityModal() {
      openCityModal();
    },
    pubStarsCountry(el) {
      S.starsCountry = el.value;
      HH.refresh();
    },
    pubGridMore(el) {
      const lv = el.dataset.tier; if (!lv) return;
      const t = TIERS.find((x) => x[0] === lv); S.tierShown = S.tierShown || {};
      S.tierShown[lv] = (S.tierShown[lv] || t[2]) + t[2] * 2;
      const y = window.scrollY; HH.refresh(); window.scrollTo(0, y);
    },
    // Cerca de mí
    pubNearCity(el) {
      setCity(el.value);
      S.gridShown = GRID_PAGE; S.tierShown = {};
      nearRerender();
    },
    pubNearKm(el) {
      HH.ui.nearKm = Number(el.value !== undefined && el.value !== "" ? el.value : el.dataset.v) || 15;
      HH.save();
      HH.refresh();
      if (!HH.geo()) HH.toast("Compartí tu ubicación para filtrar por distancia", { type: "warn" });
    },
    pubNearFilters() {
      openNearFilters();
    },
    pubNearAct(el) {
      const f = nearFilters();
      const id = el.dataset.id;
      f.acts = f.acts.includes(id)
        ? f.acts.filter((x) => x !== id)
        : f.acts.concat(id);
      el.setAttribute("aria-pressed", f.acts.includes(id));
      nearRerender();
    },
    pubNearAge(el) {
      const f = nearFilters();
      f[el.dataset.k] = Number(el.value) || 0;
      nearRerender();
    },
    pubNearClear() {
      S.near = { acts: [], ageMin: 0, ageMax: 0 };
      document
        .querySelectorAll("#pubNearActs .chip")
        .forEach((b) => b.setAttribute("aria-pressed", "false"));
      ["pubAgeMin", "pubAgeMax"].forEach((id) => {
        const s = document.getElementById(id);
        if (s) s.value = "0";
      });
      nearRerender();
    },
    // Swipe
    pubSwipeCity(el) {
      const f = swipeFilters();
      f.city = el.value || "";
      HH.save();
      HH.refresh();
    },
    pubSwipeActivity(el) {
      const f = swipeFilters();
      f.activity = el.dataset.id || "";
      S.swipeFiltOpen = false;
      HH.save();
      HH.refresh();
    },
    // Mobile: las categorías se abren con el botón de filtros (la tarjeta se achica mientras están abiertas)
    pubSwipeFilters(el) {
      S.swipeFiltOpen = !S.swipeFiltOpen;
      const c = document.getElementById("pubSwipeChips"); if (c) c.classList.toggle("open", S.swipeFiltOpen);
      if (el && el.setAttribute) el.setAttribute("aria-expanded", String(S.swipeFiltOpen));
    },
    pubSwipeClearFilters() {
      HH.ui.swipeFilters = {};
      HH.save();
      HH.refresh();
    },
    pubSwipeRestart() {
      const cid = clientId();
      HH.db.swipes = HH.db.swipes.filter((s) => s.clientId !== cid);
      HH.save();
      HH.toast("Listo, arrancamos de nuevo", { type: "ok" });
      HH.refresh();
    },
    pubSwipeLeft() {
      swipeTop("left");
    },
    pubSwipeRight() {
      swipeTop("right");
    },
    pubSwipeInfo() {
      topProfile();
    },
    // Perfil
    pubGalleryAll() {
      const p = HH.profileBySlug(S.profileSlug);
      if (!p) return;
      const photos = galPhotos(p),
        vids = galVideos(p);
      HH.modal({
        title: `${p.displayName} · ${photos.length} fotos${vids.length ? " y " + vids.length + " videos" : ""}`,
        wide: true,
        body: `<div class="pub-all">${photos.map((_, i) => `<button type="button" data-action="pubLightbox" data-idx="${i}">${HH.photo(p, i, { cls: "square" })}</button>`).join("")}${vids.map((v) => `<button type="button" data-action="pubLightbox" data-vid="${esc(v.id)}"><div class="media square">${HH.videoMedia(v)}<span class="pub-vbadge">${HH.icon("play")}</span></div></button>`).join("")}</div>`,
        actions: [{ label: "Cerrar", cls: "ghost", action: "closeModal" }],
      });
    },
    // Barra Galería / Descripción / Sobre mí: muestra una sección por vez, sin volver a dibujar la página
    pubPfTab(el) {
      S.pfTab = el.dataset.tab;
      document.querySelectorAll(".pf-tabs [role=tab]").forEach((b) => { const on = b.dataset.tab === S.pfTab; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
      document.querySelectorAll(".pf-panel").forEach((x) => { x.hidden = x.id !== "pfPanel_" + S.pfTab; });
    },
    pubGalTab(el) {
      S.galTab = el.dataset.tab;
      HH.refresh();
      const g = document.querySelector(".pf-gal");
      if (g) g.scrollIntoView({ block: "start" });
    },
    pubBioMore() {
      const p = HH.profileBySlug(S.profileSlug);
      S.bioOpen = S.bioOpen === (p && p.userId) ? null : p && p.userId;
      const b = document.getElementById("pfBio");
      if (b) b.classList.toggle("open", !!S.bioOpen);
      const btn = document.querySelector(".pf-more");
      if (btn) btn.textContent = HH.t ? HH.t(S.bioOpen ? "Ver menos" : "Ver más") : S.bioOpen ? "Ver menos" : "Ver más";
    },
    // Visor de fotos y videos del perfil, con anterior / siguiente
    pubLightbox(el) {
      const p = HH.profileBySlug(S.profileSlug);
      if (!p) return;
      if (HH.track) HH.track(p.userId, "opens");
      const list = galPhotos(p).map((_, i) => ({ i })).concat(galVideos(p).map((v) => ({ v })));
      if (!list.length) list.push({ i: 0 });
      let k = el.dataset.vid ? list.findIndex((x) => x.v && x.v.id === el.dataset.vid) : list.findIndex((x) => x.i === Number(el.dataset.idx || 0));
      if (k < 0) k = 0;
      const show = () => {
        const x = list[k];
        HH.modal({
          title: `${p.displayName} · ${k + 1} / ${list.length}`,
          wide: true,
          body: `<div class="pf-lb">${x.v ? `<div class="media">${HH.videoMedia(x.v, { controls: true })}</div>` : HH.photo(p, x.i)}</div>`,
          actions: [
            { label: HH.icon("chevronLeft") + " Anterior", cls: "ghost", onClick: () => { k = (k - 1 + list.length) % list.length; show(); } },
            { label: "Siguiente " + HH.icon("chevronRight"), cls: "ghost", onClick: () => { k = (k + 1) % list.length; show(); } },
          ],
        });
      };
      show();
    },
    pubGalleryPickAll(el) {
      HH.closeModal();
      HH.actions.pubGalleryPick(el);
      const g = document.getElementById("pubGallery");
      if (g) g.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    pubGalleryPick(el) {
      const p = HH.profileBySlug(S.profileSlug);
      if (!p) return;
      const g = document.getElementById("pubGallery");
      if (!g) return;
      if (el.dataset.vid) {
        const v = HH.profileVideos(p).find((x) => x.id === el.dataset.vid);
        g.innerHTML = `<div class="media">${HH.videoMedia(v, { controls: true })}</div>`;
      } else g.innerHTML = HH.photo(p, Number(el.dataset.idx) || 0);
      document
        .querySelectorAll(".pub-thumbs button")
        .forEach((b) =>
          b.setAttribute("aria-current", b === el ? "true" : "false"),
        );
    },
    pubOpenWa(el) {
      const p = HH.profileOf(el.dataset.id);
      if (p) waSheet(p, { fromProfile: true });
    },
    pubInterest(el) {
      const p = HH.profileOf(el.dataset.id);
      if (!p) return;
      const me = HH.viewer();
      if (!swipedRight(p.userId)) HH.swipe(me.id, p.userId, "right");
      const box = document.getElementById("pubContact");
      if (box) box.innerHTML = contactHtml(p);
      document.querySelectorAll(".pf-fav").forEach((b) => { b.classList.add("on"); b.setAttribute("aria-pressed", "true"); });
      waSheet(p, { fromProfile: true });
    },
    pubChat(el) {
      const p = HH.profileOf(el.dataset.id);
      if (!p) return;
      const me = HH.viewer();
      if (HH.hasChatAccess(me.id, p.userId)) {
        HH.go("#chat." + p.userId);
        return;
      }
      HH.buyChat(p, () => HH.go("#chat." + p.userId));
    },
    pubBook(el) {
      const p = HH.profileOf(el.dataset.id);
      if (!p) return;
      const me = HH.me();
      if (!me) {
        HH.clientAuth({
          reason:
            "Para reservar una salida necesitás una cuenta de cliente. Sin verificación de identidad.",
          onDone: () => HH.actions.pubBook(el),
        });
        return;
      }
      if (me.role !== "client") {
        HH.toast("Las reservas se hacen con una cuenta de cliente", {
          type: "warn",
        });
        return;
      }
      HH.openBookingModal(p);
    },
    pubRequest(el) {
      const p = HH.profileOf(el.dataset.id);
      if (!p) return;
      if (!HH.me()) {
        HH.clientAuth({
          reason:
            "Para pedir contenido a medida necesitás una cuenta de cliente. Sin verificación de identidad.",
          onDone: () => HH.actions.pubRequest(el),
        });
        return;
      }
      HH.openRequestModal(p);
    },
    pubShare(el) {
      copyText(profileLink(el.dataset.slug));
    },
    pubLinksShare(el) {
      copyText(HH.absUrl ? HH.absUrl("#links." + el.dataset.slug) : location.href.split("#")[0] + "#links." + el.dataset.slug);
    },
    pubReport(el) {
      const p = HH.profileBySlug(el.dataset.slug);
      if (!p) return;
      const me = HH.viewer();
      HH.modal({
        title: "Reportar a " + p.displayName,
        body: `<div class="stack"><p class="small muted">Contanos qué pasó. El equipo revisa cada reporte y puede suspender el perfil.</p><div class="field"><label for="pubRepText">Motivo</label><textarea class="textarea" id="pubRepText" placeholder="Ej.: propuso algo fuera de las reglas de la plataforma."></textarea></div></div>`,
        actions: [
          { label: "Cancelar", cls: "ghost", action: "closeModal" },
          {
            label: "Enviar reporte",
            cls: "danger",
            onClick: () => {
              const t = (
                document.getElementById("pubRepText").value || ""
              ).trim();
              if (t.length < 10) {
                HH.toast("Contanos un poco más: mínimo 10 caracteres.", {
                  type: "warn",
                });
                return;
              }
              HH.db.reports.push({
                id: HH.uid("rp"),
                targetId: p.userId,
                byId: me.id,
                reason: t,
                status: "abierto",
                createdAt: HH.now(),
              });
              HH.save();
              HH.closeModal();
              HH.toast("Reporte enviado. Gracias por avisar.", { type: "ok" });
            },
          },
        ],
      });
    },
    pubContentTab(el) {
      const p = HH.profileBySlug(S.profileSlug);
      if (!p) return;
      S.profileTab = el.dataset.tab || "all";
      document
        .querySelectorAll('#pubContent [data-action="pubContentTab"]')
        .forEach((b) => {
          const on = b.dataset.tab === S.profileTab;
          b.setAttribute("aria-pressed", on);
          b.setAttribute("aria-selected", on);
        });
      const body = document.getElementById("pubContentBody");
      if (body) body.innerHTML = contentBody(p, S.profileTab);
    },
    pubOpenItem(el) {
      const c = HH.db.content.find((x) => x.id === el.dataset.id);
      if (!c) return;
      const me = HH.viewer();
      if (c.isPremium && !HH.canView(c, me.id)) {
        HH.buyContent(c, HH.refresh);
        return;
      }
      const p = HH.profileOf(c.workerId);
      HH.modal({
        title: c.title,
        body: `<div class="stack">
          ${HH.contentThumb(c, { noLock: true, cls: c.type === "short" ? "tall" : c.type === "video" ? "wide" : "", style: c.type === "short" ? "max-width:280px;margin:0 auto;width:100%" : "", children: c.type !== "photo" ? `<div class="play"><span>${HH.icon("play")}</span></div>` : "" })}
          <div><p><span data-noi18n>${esc(c.caption)}</span></p><p class="small muted" style="margin-top:4px">${typeLabel(c.type)}${c.duration ? " · " + esc(c.duration) : ""} · ${HH.fmtDate(c.createdAt)}${p ? " · " + esc(p.displayName) : ""}${c.isPremium ? " · Premium" : ""}</p></div>
        </div>`,
        actions: [{ label: "Cerrar", cls: "ghost", action: "closeModal" }],
      });
    },
    pubBuyPack(el) {
      const pk = HH.db.packs.find((x) => x.id === el.dataset.id);
      if (pk) HH.buyPack(pk, HH.refresh);
    },
    // Shorts
    pubShortsTab(el) {
      S.shortsTab = el.dataset.tab || "foryou";
      HH.refresh();
    },
    pubShortToggle(el) {
      const s = el.closest(".short");
      if (!s) return;
      if (!s.classList.contains("playing")) {
        s.classList.add("playing");
        s.classList.remove("paused");
      } else s.classList.toggle("paused");
      el.innerHTML =
        s.classList.contains("playing") && !s.classList.contains("paused")
          ? PAUSE_SVG
          : HH.icon("play");
    },
    pubShortLike(el) {
      const c = HH.db.content.find((x) => x.id === el.dataset.id);
      if (!c) return;
      if (!HH.db.likes) HH.db.likes = [];
      const uid = HH.viewerId();
      if (isLiked(c))
        HH.db.likes = HH.db.likes.filter(
          (l) => !(l.contentId === c.id && l.userId === uid),
        );
      else
        HH.db.likes.push({
          id: HH.uid("lk"),
          contentId: c.id,
          workerId: c.workerId,
          userId: uid,
          createdAt: HH.now(),
        });
      HH.save();
      const on = isLiked(c);
      el.classList.toggle("liked", on);
      el.setAttribute("aria-pressed", on);
      if (on) {
        el.classList.remove("pop");
        void el.offsetWidth;
        el.classList.add("pop");
      }
      const lbl = document.getElementById("pubLikes_" + c.id);
      if (lbl) lbl.textContent = kfmt(likeCount(c));
    },
    pubShortsHint() {
      HH.ui.shortsHintSeen = true;
      HH.save();
      const h = document.querySelector(".shorts-hint");
      if (h) h.remove();
    },
    pubWaChat(el) { HH.closeModal(); HH.actions.pubChat(el); },
    pubWaBook(el) { HH.closeModal(); HH.actions.pubBook(el); },
    pubShortInterest(el) {
      HH.actions.pubInterest(el);
    },
    pubShortShare(el) {
      const c = HH.db.content.find((x) => x.id === el.dataset.id);
      if (!c) return;
      const p = HH.profileOf(c.workerId);
      const url = profileLink(p.slug);
      const txt = encodeURIComponent(`${p.displayName} en SexyRose: ${url}`);
      const nets = [
        ["WhatsApp", "https://wa.me/?text=" + txt, "#25D366", "whatsapp"],
        [
          "Telegram",
          "https://t.me/share/url?url=" + encodeURIComponent(url),
          "#2AABEE",
          "send",
        ],
        ["X", "https://twitter.com/intent/tweet?text=" + txt, "#111", "share"],
        [
          "Facebook",
          "https://www.facebook.com/sharer/sharer.php?u=" +
            encodeURIComponent(url),
          "#1877F2",
          "share",
        ],
      ];
      HH.modal({
        title: "Compartir",
        body: `<div class="share-grid">
          ${nets.map(([n, href, col, ic]) => `<a class="share-it" href="${href}" target="_blank" rel="noopener noreferrer"><span class="ic" style="background:${col}">${HH.icon(ic)}</span><span>${n}</span></a>`).join("")}
          <button type="button" class="share-it" data-action="pubShareCopy" data-url="${esc(url)}"><span class="ic" style="background:var(--surface-2)">${HH.icon("copy")}</span><span>Copiar link</span></button>
        </div>
        <div class="share-grid" style="margin-top:6px">
          <button type="button" class="share-it" data-action="pubShortReport" data-id="${c.id}"><span class="ic soft">${HH.icon("flag")}</span><span>Reportar</span></button>
          <button type="button" class="share-it" data-action="pubShortHide" data-id="${c.id}"><span class="ic soft">${HH.icon("x")}</span><span>No me interesa</span></button>
          <a class="share-it" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}" data-action="closeModal"><span class="ic soft">${HH.icon("user")}</span><span>Ver perfil</span></a>
        </div>`,
        actions: [],
      });
    },
    pubShortMore(el) {
      HH.actions.pubShortShare(el);
    },
    pubShareCopy(el) {
      copyText(el.dataset.url);
      HH.closeModal();
    },
    pubShortHide(el) {
      HH.ui.hiddenShorts = (HH.ui.hiddenShorts || []).concat(el.dataset.id);
      HH.save();
      HH.closeModal();
      HH.toast("Listo, no te lo mostramos más");
      HH.refresh();
    },
    pubShortReport(el) {
      const c = HH.db.content.find((x) => x.id === el.dataset.id);
      if (!c) return;
      const reasons = [
        "Contenido sexual o sugerente",
        "Involucra a menores",
        "Estafa o fraude",
        "Acoso o bullying",
        "Violencia o contenido gráfico",
        "Suplantación de identidad",
        "Spam",
        "Infringe derechos de autor",
        "Otro",
      ];
      HH.modal({
        title: "Reportar",
        body: `<div class="stack" style="gap:8px"><p class="small muted">Elegí un motivo. Lo revisa el equipo de SexyRose.</p>
        <div class="report-list">${reasons.map((r, i) => `<label class="report-opt"><input type="radio" name="rpReason" value="${esc(r)}"${i === 0 ? "" : ""}><span>${esc(r)}</span></label>`).join("")}</div></div>`,
        actions: [
          { label: "Cancelar", cls: "ghost", action: "closeModal" },
          {
            label: "Enviar",
            onClick: () => {
              const v = (
                document.querySelector("input[name=rpReason]:checked") || {}
              ).value;
              if (!v) {
                HH.toast("Elegí un motivo", { type: "warn" });
                return;
              }
              HH.db.reports.push({
                id: HH.uid("rp"),
                targetId: c.workerId,
                byId: HH.viewerId(),
                reason: `Short "${c.title}": ${v}`,
                contentId: c.id,
                status: "abierto",
                createdAt: HH.now(),
              });
              HH.save();
              HH.closeModal();
              HH.toast("Reporte enviado. Gracias por avisar.", { type: "ok" });
            },
          },
        ],
      });
    },
    pubShortBuy(el) {
      const c = HH.db.content.find((x) => x.id === el.dataset.id);
      if (c) HH.buyContent(c, HH.refresh);
    },
    // Auth
    pubLogin(form, ev, v) {
      const email = String(v.email || "")
        .trim()
        .toLowerCase();
      const pass = String(v.password || "");
      if (!email || !pass) {
        showErr("Completá el email y la contraseña.");
        return;
      }
      const u = HH.db.users.find((x) => x.email.toLowerCase() === email);
      if (!u || u.password !== pass) {
        showErr(
          "Email o contraseña incorrectos. Para la demo, la contraseña es demo1234.",
        );
        return;
      }
      HH.login(u.id);
      HH.toast("Hola, " + u.name.split(" ")[0], { type: "ok" });
      afterLogin(u);
    },
    pubDemoLogin(el) {
      const u = HH.userById(el.dataset.id);
      if (!u) return;
      HH.login(u.id);
      HH.toast("Entraste como " + u.name.split(" ")[0], { type: "ok" });
      afterLogin(u);
    },
    pubRegRole(el) {
      document
        .querySelectorAll(".radio-card")
        .forEach((c) =>
          c.classList.toggle("active", c.contains(el) && el.checked),
        );
    },
    async pubPasskeyLogin() {
      const r = await HH.loginWithPasskey();
      if (r.ok) {
        HH.toast("Hola, " + r.user.name.split(" ")[0], { type: "ok" });
        afterLogin(r.user);
        return;
      }
      showErr(
        r.reason === "unsupported"
          ? "Este navegador o esta página no permiten passkeys. Entrá con email y contraseña."
          : r.reason === "unknown"
            ? "Esa passkey no corresponde a ninguna cuenta."
            : r.reason === "cancelled"
              ? "Se canceló el ingreso con passkey."
              : "No pudimos entrar con passkey.",
      );
    },
    pubPlaceSearch(el) {
      const box = document.getElementById("pubPlaceRes");
      if (!box) return;
      document.getElementById("pubRegCity").value = "";
      document.getElementById("pubRegCityParent").value = "";
      const q = el.value;
      const res = HH.searchPlaces(q);
      const regions = (HH.db.locations || []).filter(
        (l) => l.level !== "city" && HH.isActiveLoc(l),
      );
      box.innerHTML =
        q.trim().length < 2
          ? ""
          : res
              .map(
                (r) =>
                  `<button type="button" class="pub-place-opt" data-action="pubPlacePick" data-name="${esc(r.name)}" data-parent="${esc(r.parent)}">${HH.icon("pin")}<span class="grow"><strong>${esc(r.name)}</strong><span class="tiny muted">${esc(HH.locLabel(HH.locByName(r.parent), { country: true }) || r.parent)}</span></span>${r.existing && r.status === "active" ? "" : '<span class="badge warn">Nueva</span>'}</button>`,
              )
              .join("") +
            `<details class="pub-place-manual"><summary class="small">No encuentro mi localidad</summary><div class="stack" style="gap:8px;margin-top:8px"><input class="input" id="pubPlaceManName" placeholder="Nombre de tu localidad" value="${esc(q.trim())}"><select class="select" id="pubPlaceManParent"><option value="">¿Dentro de qué provincia, zona o país?</option>${regions.map((l) => `<option value="${esc(l.name)}">${"\u2003".repeat(HH.locPath(l).length - 1)}${esc(l.name)}</option>`).join("")}</select><button type="button" class="btn secondary sm" data-action="pubPlaceManual">Usar esta localidad</button></div></details>`;
    },
    pubPlacePick(el) {
      document.getElementById("pubRegCity").value = el.dataset.name;
      document.getElementById("pubRegCityParent").value = el.dataset.parent;
      document.getElementById("pubRegPlaceQ").value = el.dataset.name;
      document.getElementById("pubPlaceRes").innerHTML = "";
      const loc = HH.locByName(el.dataset.name);
      const isNew = !loc || loc.status !== "active";
      document.getElementById("pubPlaceHint").innerHTML =
        (isNew ? `<span class="badge warn">Nueva</span> ` : "") +
        esc(
          el.dataset.name +
            ", " +
            (HH.locLabel(HH.locByName(el.dataset.parent), { country: true }) ||
              el.dataset.parent),
        ) +
        (isNew ? ". La sumamos al sitio cuando verifiquemos tu cuenta." : "");
    },
    pubPlaceManual() {
      const n = (document.getElementById("pubPlaceManName").value || "").trim(),
        par = document.getElementById("pubPlaceManParent").value;
      if (n.length < 2 || !par) {
        HH.toast("Escribí el nombre y elegí dónde queda.", { type: "warn" });
        return;
      }
      HH.actions.pubPlacePick({ dataset: { name: n, parent: par } });
    },
    pubRegPick(el) {
      if (el.dataset.kind === "client") {
        HH.clientAuth({ onDone: () => HH.go(HH.ui.next || "#swipe") });
        return;
      }
      S.regStep = "datos";
      HH.refresh();
    },
    pubRegBack() {
      S.regStep = "tipo";
      HH.refresh();
    },
    pubRegister(form, ev, v) {
      const name = String(v.name || "").trim();
      const email = String(v.email || "").trim();
      const pass = String(v.password || "");
      const wa = String(v.whatsapp || "").replace(/[^\d]/g, "");
      const tg = String(v.telegram || "").replace(/[^\d]/g, "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showErr("Ingresá un email válido.");
        return;
      }
      if (name.length < 2) {
        showErr("Escribí tu nombre público.");
        return;
      }
      if (pass.length < 8) {
        showErr("La contraseña tiene que tener al menos 8 caracteres.");
        return;
      }
      if (wa.length < 8) {
        showErr("Ingresá tu número de WhatsApp completo.");
        return;
      }
      if (!v.city) {
        showErr("Buscá tu localidad y elegila de la lista.");
        return;
      }
      if (!v.terms) {
        showErr(
          "Tenés que confirmar que sos mayor de 18 y aceptar los términos.",
        );
        return;
      }
      const place = HH.resolvePlace(
        { name: v.city, parent: v.cityParent },
        null,
      );
      if (!place) {
        showErr("No pudimos ubicar esa localidad. Probá elegirla de la lista.");
        return;
      }
      const r = HH.register({
        name,
        email,
        password: pass,
        role: "worker",
        whatsapp: v.whatsappCc + " " + wa,
        telegram: tg ? v.telegramCc + " " + tg : "",
        city: place.name,
        country: HH.locCountry(place),
        mainActivity: v.mainActivity,
        gender: v.gender || "mujer",
      });
      if (r.user && place.status === "pending" && !place.createdBy) {
        place.createdBy = r.user.id;
        HH.save();
      }
      if (r.error) {
        showErr(r.error);
        return;
      }
      HH.login(r.user.id);
      HH.ui.next = null;
      HH.save();
      regPasskeyStep(r.user);
    },
  });

  /* ---------- Teclado: atajos del swipe y activación de role=button ---------- */
  document.addEventListener("keydown", (ev) => {
    const t = ev.target;
    const tag = t && t.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      (t && t.isContentEditable)
    )
      return;
    if (
      (ev.key === "Enter" || ev.key === " ") &&
      t &&
      t.matches &&
      t.matches('[role="button"][data-action]')
    ) {
      ev.preventDefault();
      t.click();
      return;
    }
    if (!HH.current || HH.current.path !== "swipe") return;
    const modal = document.getElementById("modalRoot");
    if (modal && modal.classList.contains("open")) return;
    const k = ev.key;
    const onControl = tag === "BUTTON" || tag === "A";
    if (k === "ArrowLeft" || k === "x" || k === "X") {
      ev.preventDefault();
      swipeTop("left");
    } else if (k === "ArrowRight" || (k === "Enter" && !onControl)) {
      ev.preventDefault();
      swipeTop("right");
    } else if (k === "i" || k === "I") {
      ev.preventDefault();
      topProfile();
    }
  });
})();

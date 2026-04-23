import React, { useState, useEffect, useRef, useCallback } from "react";
import { readGardens, saveGarden, touchGarden, renameGarden, deleteGarden, migrateLegacyFavourites, hasSavedGardens, createGardenObject } from './gardenStorage.js';
import { HomeScreen, HOME_SCREEN_STYLES } from './HomeScreen.jsx';
import { fetchWeatherForecast, computeUrgencySignals, readWeatherCache, writeWeatherCache } from './weatherService.js';
import { WeatherSummary, WEATHER_SUMMARY_STYLES } from './WeatherSummary.jsx';
import { buildTodayPrompt, validateTodayResponse, readTodayCache, writeTodayCache } from './todayTasks.js';
import { fetchNearbyObservations, normaliseInatObservations, readInatCache, writeInatCache, relativeDate } from './nearbyObservations.js';
import { climateToRegion, taskNeedsVideo } from './videoService.js';
import { VideoButton, VIDEO_PANEL_STYLES } from './VideoPanel.jsx';

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Crimson+Pro:ital,wght@0,300;0,400;1,300&display=swap');`;


const styles = `
  ${FONTS}
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --soil:#1E1208; --bark:#3A2210; --bark2:#4A2E1A;
    --moss:#3E5230; --sage:#7A8C6A; --fern:#5C7A4A;
    --cream:#F5EDD8; --parchment:#EDE0C4; --straw:#C8A96E;
    --bloom:#C4664A; --dew:#8AB4A0;
    --warm:#D4824A; --cool:#7AACCF; --wet:#6A9CAF; --dry:#C4A46A;
    --inspo:#B08A5E;
  }
  body { font-family:'Crimson Pro',Georgia,serif; background:var(--soil); color:var(--cream); min-height:100vh; }
  .grain { position:fixed; inset:0; pointer-events:none; z-index:9999; opacity:.45;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E"); }
  .app { max-width:980px; margin:0 auto; padding:2rem 1.5rem 6rem; }

  /* ── Bottom tab bar ── */
  .tab-bar { position:fixed; bottom:0; left:0; right:0; z-index:500; display:flex; background:rgba(20,12,4,.96); border-top:1px solid rgba(200,169,110,.18); backdrop-filter:blur(10px); padding-bottom:env(safe-area-inset-bottom); }
  .tab-btn { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.2rem; padding:.6rem .25rem .5rem; background:none; border:none; cursor:pointer; transition:all .15s; color:var(--sage); font-family:'Crimson Pro',serif; -webkit-tap-highlight-color:transparent; }
  .tab-btn:hover { color:var(--parchment); }
  .tab-btn.active { color:var(--straw); }
  .tab-icon { font-size:1.1rem; line-height:1; }
  .tab-label { font-size:.58rem; text-transform:uppercase; letter-spacing:.07em; line-height:1; }

  header { text-align:center; padding:2.5rem 0 2rem; border-bottom:1px solid rgba(200,169,110,.25); margin-bottom:2.5rem; }
  .deco { font-size:1.5rem; letter-spacing:.6rem; opacity:.6; margin-bottom:.6rem; }
  h1 { font-family:'Playfair Display',serif; font-size:clamp(1.9rem,5vw,3rem); font-weight:400; color:var(--cream); line-height:1.1; }
  h1 em { color:var(--straw); font-style:italic; }
  .subtitle { font-size:1rem; color:var(--sage); margin-top:.6rem; font-style:italic; font-weight:300; }

  .demo-banner { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:.4rem .75rem; padding:.55rem 1.5rem; background:rgba(30,18,8,.85); border-bottom:1px solid rgba(200,169,110,.18); font-size:.78rem; color:var(--sage); position:sticky; top:0; z-index:100; backdrop-filter:blur(6px); }
  .demo-name { color:var(--straw); font-weight:600; letter-spacing:.04em; font-family:'Playfair Display',serif; }
  .demo-sep { opacity:.35; }
  .demo-tag { font-style:italic; }
  .demo-about-btn { background:none; border:1px solid rgba(122,140,106,.35); border-radius:2px; color:var(--sage); padding:.15rem .55rem; font-family:'Crimson Pro',serif; font-size:.75rem; cursor:pointer; transition:all .15s; }
  .demo-about-btn:hover { border-color:var(--sage); color:var(--cream); }
  .settings-overlay { position:fixed; inset:0; background:rgba(10,6,3,.75); z-index:1000; display:flex; align-items:center; justify-content:center; padding:1rem; }
  .settings-modal { background:#2A1A0A; border:1px solid rgba(200,169,110,.25); border-radius:2px; max-width:520px; width:100%; padding:2rem 2.5rem 2.5rem; position:relative; animation:fadeUp .2s ease; }
  .settings-modal h2 { font-family:'Playfair Display',serif; font-size:1.2rem; font-weight:400; color:var(--straw); margin-bottom:1.25rem; }
  .settings-modal h3 { font-family:'Playfair Display',serif; font-size:.9rem; font-weight:600; color:var(--cream); margin:1.2rem 0 .5rem; letter-spacing:.02em; }
  .settings-modal p { font-size:.85rem; color:var(--parchment); line-height:1.6; margin-bottom:.5rem; }
  .settings-modal a { color:var(--dew); text-decoration:none; }
  .settings-modal a:hover { text-decoration:underline; }
  .settings-close { position:absolute; top:1rem; right:1.25rem; background:none; border:none; color:var(--sage); font-size:1.4rem; cursor:pointer; line-height:1; }
  .provider-tabs { display:flex; gap:.5rem; margin-bottom:1rem; }
  .provider-tab { flex:1; padding:.5rem; border:1px solid rgba(200,169,110,.2); border-radius:2px; background:none; color:var(--sage); font-size:.8rem; cursor:pointer; transition:all .15s; text-align:center; font-family:'Crimson Pro',serif; }
  .provider-tab.active { border-color:var(--straw); background:rgba(200,169,110,.1); color:var(--straw); }
  .provider-tab:hover:not(.active) { border-color:rgba(200,169,110,.4); color:var(--cream); }
  .key-field { display:flex; flex-direction:column; gap:.4rem; margin-bottom:.75rem; }
  .key-field label { font-size:.75rem; text-transform:uppercase; letter-spacing:.07em; color:var(--bloom); }
  .key-field input { background:rgba(30,18,8,.9); border:1px solid rgba(200,169,110,.25); border-radius:2px; color:var(--cream); padding:.6rem .9rem; font-family:'Crimson Pro',serif; font-size:.95rem; outline:none; transition:border-color .2s; }
  .key-field input:focus { border-color:var(--straw); }
  .key-note { font-size:.78rem; color:var(--sage); font-style:italic; }
  .usage-bar-wrap { background:rgba(30,18,8,.6); border:1px solid rgba(200,169,110,.15); border-radius:2px; padding:.75rem 1rem; margin-bottom:.75rem; }
  .usage-bar-label { display:flex; justify-content:space-between; font-size:.75rem; color:var(--sage); margin-bottom:.35rem; }
  .usage-bar-track { height:4px; background:rgba(200,169,110,.12); border-radius:2px; overflow:hidden; }
  .usage-bar-fill { height:100%; background:var(--fern); border-radius:2px; transition:width .4s ease; }
  .usage-bar-fill.warn { background:var(--bloom); }
  .usage-bar-fill.full { background:#8B3A3A; }
  .save-key-btn { width:100%; margin-top:.75rem; padding:.65rem; background:rgba(92,122,74,.25); border:1px solid rgba(92,122,74,.5); border-radius:2px; color:var(--fern); font-family:'Crimson Pro',serif; font-size:.95rem; cursor:pointer; transition:all .2s; }
  .save-key-btn:hover { background:rgba(92,122,74,.4); }
  .provider-badge { font-size:.72rem; padding:.1rem .4rem; border-radius:2px; background:rgba(200,169,110,.12); color:var(--straw); border:1px solid rgba(200,169,110,.2); margin-left:.4rem; vertical-align:middle; }

  /* ── About modal ── */
  .about-overlay { position:fixed; inset:0; background:rgba(10,6,2,.82); z-index:2000; display:flex; align-items:center; justify-content:center; padding:1.5rem; animation:fadeIn .2s ease; }
  .about-modal { background:#2A1A0A; border:1px solid rgba(200,169,110,.25); border-radius:2px; max-width:620px; width:100%; max-height:88vh; overflow-y:auto; padding:2rem 2.5rem 2.5rem; position:relative; animation:fadeUp .25s ease; }
  .about-close { position:absolute; top:1rem; right:1.25rem; background:none; border:none; color:var(--sage); font-size:1.4rem; cursor:pointer; line-height:1; padding:.2rem; }
  .about-close:hover { color:var(--cream); }
  .about-modal h2 { font-family:'Playfair Display',serif; font-size:1.35rem; font-weight:400; color:var(--straw); margin-bottom:1.5rem; }
  .about-modal h3 { font-family:'Playfair Display',serif; font-size:.95rem; font-weight:600; color:var(--cream); margin:1.4rem 0 .5rem; letter-spacing:.02em; }
  .about-modal p { font-size:.9rem; color:var(--parchment); line-height:1.7; margin-bottom:.6rem; }
  .about-modal a { color:var(--dew); text-decoration:none; }
  .about-modal a:hover { text-decoration:underline; }
  .about-sources { list-style:none; margin:.2rem 0 0; }
  .about-sources li { font-size:.85rem; color:var(--parchment); padding:.3rem 0; border-bottom:1px solid rgba(200,169,110,.08); line-height:1.55; display:flex; gap:.5rem; }
  .about-sources li:last-child { border-bottom:none; }
  .about-sources .src-dot { color:var(--straw); flex-shrink:0; margin-top:.15rem; }
  .about-note { font-size:.8rem; color:var(--sage); font-style:italic; margin-top:1.5rem; padding-top:1rem; border-top:1px solid rgba(200,169,110,.12); line-height:1.6; }
  .api-banner { background:rgba(44,26,14,.7); border:1px dashed rgba(200,169,110,.3); border-radius:2px; padding:1.1rem 1.5rem; margin-bottom:2rem; }
  .api-banner label { display:block; font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; color:var(--bloom); margin-bottom:.4rem; }
  .api-banner input { width:100%; background:rgba(30,18,8,.9); border:1px solid rgba(200,169,110,.25); border-radius:2px; color:var(--cream); padding:.65rem 1rem; font-family:'Crimson Pro',serif; font-size:1rem; outline:none; transition:border-color .2s; }
  .api-banner input:focus { border-color:var(--straw); }
  .api-note { font-size:.82rem; color:var(--sage); margin-top:.45rem; font-style:italic; }
  .rate-limit-box { background:rgba(92,122,74,.18); border:1px solid rgba(92,122,74,.35); border-radius:2px; padding:.9rem 1.4rem; color:var(--fern); font-size:.93rem; margin-bottom:1.2rem; }

  @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes popIn   { from{transform:scale(.8);opacity:0} to{transform:scale(1);opacity:1} }
  @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
  @keyframes bob     { from{transform:translateY(0) scale(1)} to{transform:translateY(-10px) scale(1.08)} }
  @keyframes pulse   { 0%,80%,100%{transform:scale(.65);opacity:.35} 40%{transform:scale(1);opacity:1} }
  @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  @keyframes popUp   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes lineIn  { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }

  /* ── Form ── */
  .form-card { background:rgba(58,34,16,.55); border:1px solid rgba(200,169,110,.18); border-radius:2px; padding:2rem 2.5rem 2.5rem; animation:fadeUp .4s ease forwards; }
  .form-title { font-family:'Playfair Display',serif; font-size:1.5rem; color:var(--straw); font-weight:400; margin-bottom:.35rem; }
  .form-hint  { font-size:.93rem; color:var(--sage); font-style:italic; margin-bottom:2rem; }
  .field-row  { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
  @media(max-width:520px){.field-row{grid-template-columns:1fr}}
  .field { margin-bottom:1rem; }
  .field label { display:block; font-size:.8rem; text-transform:uppercase; letter-spacing:.09em; color:var(--straw); margin-bottom:.4rem; }
  .field input,.field select { width:100%; background:rgba(245,237,216,.92); border:1px solid rgba(200,169,110,.5); border-radius:2px; color:#2C1A0A; padding:.75rem 1rem; font-family:'Crimson Pro',serif; font-size:16px; outline:none; transition:border-color .2s,box-shadow .2s; appearance:none; -webkit-appearance:none; }
  .field input::placeholder { color:#7A6040; }
  .field input:focus,.field select:focus { border-color:var(--straw); box-shadow:0 0 0 2px rgba(200,169,110,.2); }
  .field select option { background:#3A2210; color:var(--cream); }
  .prefetch-chip { display:inline-flex; align-items:center; gap:.35rem; font-size:.75rem; color:var(--sage); margin-top:.5rem; font-style:italic; }
  .prefetch-chip.ready  { color:var(--fern); }
  .prefetch-chip.active { color:var(--straw); }
  .prefetch-chip.error  { color:var(--bloom); }
  .spin-sm { display:inline-block; animation:spin .7s linear infinite; font-style:normal; }

  .divider { height:1px; background:rgba(200,169,110,.15); margin:1.75rem 0 1.5rem; }
  .section-label { font-size:.8rem; text-transform:uppercase; letter-spacing:.09em; color:var(--straw); margin-bottom:1.2rem; }
  .section-label em { text-transform:none; font-style:italic; color:var(--sage); letter-spacing:0; }
  .category-row { margin-bottom:1.5rem; }
  .cat-label { font-size:.78rem; text-transform:uppercase; letter-spacing:.1em; color:var(--dew); margin-bottom:.55rem; display:flex; align-items:center; gap:.5rem; }
  .cat-label::after { content:''; flex:1; height:1px; background:rgba(138,180,160,.18); }
  .tag-row { display:flex; gap:.5rem; }
  .tag-row input { flex:1; background:rgba(245,237,216,.92); border:1px solid rgba(200,169,110,.4); border-radius:2px; color:#2C1A0A; padding:.6rem .85rem; font-family:'Crimson Pro',serif; font-size:16px; outline:none; transition:border-color .2s; }
  .tag-row input::placeholder { color:#7A6040; }
  .tag-row input:focus { border-color:var(--straw); }
  .btn-add { background:var(--moss); border:none; color:var(--cream); padding:0 1rem; border-radius:2px; cursor:pointer; font-size:1.3rem; line-height:1; flex-shrink:0; transition:background .2s; min-height:44px; min-width:44px; }
  .btn-add:hover { background:var(--fern); }
  .tags { display:flex; flex-wrap:wrap; gap:.45rem; margin-top:.6rem; min-height:1.5rem; }
  .tag { background:rgba(74,94,58,.45); border:1px solid rgba(122,140,106,.35); border-radius:2px; padding:.28rem .7rem; font-size:.88rem; color:var(--cream); display:flex; align-items:center; gap:.45rem; animation:popIn .18s ease; }
  .tag-x { background:none; border:none; color:var(--sage); cursor:pointer; font-size:1rem; padding:0; }
  .tag-x:hover { color:var(--bloom); }
  .clarify-row { display:flex; flex-wrap:wrap; gap:.35rem; margin:.4rem 0 .2rem; align-items:center; animation:fadeIn .25s ease; }
  .clarify-label { font-size:.76rem; color:var(--sage); font-style:italic; margin-right:.15rem; }
  .clarify-btn { background:rgba(122,140,106,.15); border:1px solid rgba(122,140,106,.3); border-radius:2px; padding:.22rem .6rem; font-size:.76rem; color:var(--sage); cursor:pointer; transition:all .15s; font-family:'Crimson Pro',serif; }
  .clarify-btn:hover { background:rgba(122,140,106,.28); color:var(--cream); }
  .clarify-btn.selected { background:rgba(92,122,74,.35); border-color:var(--fern); color:var(--cream); }
  .gbif-badge { font-size:.68rem; color:rgba(122,140,106,.55); font-style:italic; margin-left:.3rem; }
  .spell-row { display:flex; flex-wrap:wrap; gap:.35rem; margin:.3rem 0 .2rem; align-items:center; animation:fadeIn .25s ease; font-size:.76rem; color:var(--sage); }
  .spell-btn { background:rgba(200,169,110,.15); border:1px solid rgba(200,169,110,.3); border-radius:2px; padding:.22rem .6rem; font-size:.76rem; color:var(--straw); cursor:pointer; transition:all .15s; font-family:'Crimson Pro',serif; }
  .spell-btn:hover { background:rgba(200,169,110,.28); color:var(--cream); }
  .occ-warning { font-size:.76rem; color:rgba(200,140,60,.85); background:rgba(200,140,60,.06); border:1px solid rgba(200,140,60,.2); border-radius:4px; padding:.35rem .65rem; margin-top:.3rem; line-height:1.5; }
  .gbif-occ-badge { font-size:.68rem; color:rgba(122,140,106,.55); font-style:italic; margin-left:.4rem; font-weight:normal; }
  .gbif-attribution { font-size:.68rem; color:rgba(180,180,160,.4); margin-top:.75rem; padding-top:.5rem; border-top:1px solid rgba(255,255,255,.05); line-height:1.5; }
  .btn-generate { width:100%; margin-top:1rem; background:var(--fern); border:1px solid var(--moss); color:var(--cream); padding:1rem; font-family:'Playfair Display',serif; font-size:1.15rem; font-style:italic; letter-spacing:.04em; border-radius:2px; cursor:pointer; transition:all .2s; display:flex; align-items:center; justify-content:center; gap:.6rem; }
  .btn-generate:hover:not(:disabled) { background:var(--moss); transform:translateY(-1px); box-shadow:0 6px 20px rgba(0,0,0,.35); }
  .btn-generate:disabled { opacity:.45; cursor:not-allowed; }
  .error-box { background:rgba(139,74,42,.3); border:1px solid rgba(196,102,74,.4); border-radius:2px; padding:.9rem 1.4rem; color:#E8B89A; font-size:.93rem; margin-bottom:1.2rem; }

  /* ── Stream dot bar ── */
  .stream-bar { display:flex; align-items:center; gap:.75rem; padding:.6rem 1rem; background:rgba(44,26,14,.7); border:1px solid rgba(200,169,110,.12); border-radius:2px; margin-bottom:1.25rem; font-size:.78rem; color:var(--sage); flex-wrap:wrap; animation:fadeIn .3s ease; }
  .stream-months { display:flex; gap:3px; align-items:center; }
  .sdot { width:7px; height:7px; border-radius:50%; background:var(--bark2); border:1px solid rgba(200,169,110,.18); transition:background .25s,border-color .25s; }
  .sdot.active { background:var(--straw); border-color:var(--straw); animation:pulse 1s ease-in-out infinite; }
  .sdot.done   { background:var(--fern); border-color:var(--fern); }
  .sdot.inspo  { background:var(--inspo); border-color:var(--inspo); }
  .stream-txt  { font-style:italic; }
  .stream-txt.s2 { color:var(--inspo); }

  /* ── References panel (open by default, with pending state) ── */
  .refs-panel { background:rgba(30,18,8,.7); border:1px solid rgba(200,169,110,.15); border-radius:2px; padding:1rem 1.5rem; margin-bottom:2rem; animation:fadeIn .4s ease; }
  .refs-toggle { display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none; }
  .refs-title  { font-size:.75rem; text-transform:uppercase; letter-spacing:.1em; color:var(--sage); display:flex; align-items:center; gap:.5rem; }
  .refs-chevron { font-size:.7rem; color:var(--sage); transition:transform .2s; }
  .refs-chevron.open { transform:rotate(180deg); }
  .refs-body { margin-top:.85rem; }
  .refs-pending { font-size:.82rem; color:var(--sage); font-style:italic; display:flex; align-items:center; gap:.5rem; padding:.25rem 0; }
  .refs-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:.5rem 1.5rem; }
  .ref-item { font-size:.83rem; color:var(--parchment); display:flex; gap:.4rem; align-items:baseline; line-height:1.4; animation:lineIn .25s ease; }
  .ref-dot  { color:var(--straw); flex-shrink:0; font-size:.6rem; margin-top:.3rem; }
  .ref-cat  { font-size:.68rem; color:var(--sage); text-transform:uppercase; letter-spacing:.06em; margin-right:.35em; }

  /* ── Calendar ── */
  .cal-wrap { animation:fadeUp .4s ease; }
  .cal-header { text-align:center; margin-bottom:1.75rem; }
  .cal-header h2 { font-family:'Playfair Display',serif; font-size:1.9rem; font-weight:400; color:var(--cream); }
  .cal-header p  { color:var(--sage); font-style:italic; margin-top:.35rem; font-size:.95rem; }
  .meta-pills { display:flex; flex-wrap:wrap; justify-content:center; gap:.5rem; margin:1rem 0 0; }
  .pill { background:rgba(44,26,14,.8); border:1px solid rgba(200,169,110,.2); border-radius:20px; padding:.28rem .85rem; font-size:.83rem; color:var(--sage); animation:popUp .3s ease; }
  .pill b { color:var(--straw); font-weight:400; }

  /* ── Month nav ── */
  .month-nav { display:flex; align-items:stretch; margin-bottom:1.5rem; }
  .nav-btn { background:rgba(58,34,16,.7); border:1px solid rgba(200,169,110,.18); color:var(--straw); cursor:pointer; font-size:1.6rem; padding:0 1.1rem; transition:all .2s; flex-shrink:0; display:flex; align-items:center; justify-content:center; min-width:52px; min-height:52px; }
  .nav-btn:hover:not(:disabled) { background:var(--bark2); color:var(--cream); }
  .nav-btn:disabled { opacity:.15; cursor:default; }
  .nav-btn.hidden { visibility:hidden; pointer-events:none; }
  .nav-btn.left  { border-radius:2px 0 0 2px; border-right:none; }
  .nav-btn.right { border-radius:0 2px 2px 0; border-left:none; }
  .months-window { flex:1; display:grid; grid-template-columns:repeat(3,1fr); align-items:start; }
  @media(max-width:640px){
    .months-window { grid-template-columns:1fr; }
    .month-nav { flex-direction:column; }
    .nav-btn { padding:.7rem; min-width:unset; }
    .nav-btn.left  { border-radius:2px 2px 0 0; border-right:1px solid rgba(200,169,110,.18); border-bottom:none; }
    .nav-btn.right { border-radius:0 0 2px 2px; border-left:1px solid rgba(200,169,110,.18); border-top:none; }
  }

  /* ── Month panel ── */
  .month-panel { background:rgba(54,30,12,.52); border:1px solid rgba(200,169,110,.15); padding:0 0 1.5rem; display:flex; flex-direction:column; animation:fadeIn .35s ease; }
  .month-panel+.month-panel { border-left:none; }
  .month-panel.is-current { background:rgba(74,52,18,.72); border-color:rgba(200,169,110,.35); z-index:2; }

  /* Ghost panel shown for months not yet started */
  .month-ghost { background:rgba(40,22,8,.3); border:1px solid rgba(200,169,110,.06); min-height:420px; display:flex; align-items:center; justify-content:center; }
  .month-ghost+.month-ghost { border-left:none; }

  .season-bar { height:4px; width:100%; opacity:.7; flex-shrink:0; transition:background .4s; }

  .mp-head { padding:1.1rem 1.3rem .8rem; border-bottom:1px solid rgba(200,169,110,.1); }
  .mp-title-row { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:.3rem; margin-bottom:.5rem; }
  .mp-month-name { font-family:'Playfair Display',serif; font-size:1.15rem; color:var(--cream); display:flex; align-items:baseline; gap:.45rem; }
  .mp-season-tag { font-size:.72rem; color:var(--sage); font-family:'Crimson Pro',serif; font-style:italic; font-weight:300; }
  .this-month-badge { font-size:.58rem; letter-spacing:.13em; text-transform:uppercase; color:var(--straw); opacity:.8; border:1px solid rgba(200,169,110,.35); border-radius:10px; padding:.15rem .5rem; }

  .mp-stats { display:flex; flex-wrap:wrap; gap:.4rem .8rem; font-size:.78rem; color:var(--sage); min-height:1.2rem; }
  .mp-stat  { display:flex; align-items:center; gap:.28rem; animation:lineIn .2s ease; }
  .stat-badge { font-size:.68rem; text-transform:uppercase; letter-spacing:.07em; padding:.12rem .5rem; border-radius:10px; white-space:nowrap; }
  .stat-badge.warmer { background:rgba(212,130,74,.22); color:var(--warm); border:1px solid rgba(212,130,74,.3); }
  .stat-badge.cooler { background:rgba(122,172,207,.18); color:var(--cool); border:1px solid rgba(122,172,207,.28); }
  .stat-badge.wetter { background:rgba(106,156,175,.18); color:var(--wet);  border:1px solid rgba(106,156,175,.28); }
  .stat-badge.drier  { background:rgba(196,164,106,.18); color:var(--dry);  border:1px solid rgba(196,164,106,.28); }
  .stat-badge.avg    { background:rgba(122,140,106,.15); color:var(--sage); border:1px solid rgba(122,140,106,.2); }

  .mp-body { padding:.9rem 1.3rem 0; flex:1; }
  .mp-section-label { font-size:.68rem; text-transform:uppercase; letter-spacing:.11em; margin-bottom:.5rem; display:flex; align-items:center; gap:.4rem; }
  .mp-section-label.tasks-lbl { color:var(--straw); margin-top:0; }
  .mp-section-label.enjoy-lbl { color:var(--dew);   margin-top:.9rem; }
  .mp-section-label.inspo-lbl { color:var(--inspo); margin-top:.9rem; }
  .mp-section-label::after { content:''; flex:1; height:1px; background:currentColor; opacity:.2; }
  .mp-list { list-style:none; }
  .mp-list li { font-size:.88rem; color:var(--parchment); padding:.3rem 0; border-bottom:1px solid rgba(200,169,110,.07); display:flex; gap:.45rem; line-height:1.45; animation:lineIn .25s ease; }
  .mp-list li:last-child { border-bottom:none; }
  .bullet-task  { color:var(--fern);  flex-shrink:0; margin-top:.1rem; }
  .bullet-enjoy { color:var(--dew);   flex-shrink:0; margin-top:.1rem; }

  /* Inline typing cursor shown on the actively-streaming field */
  .typing-cursor::after { content:'▌'; animation:pulse .7s ease-in-out infinite; color:var(--straw); font-size:.7em; margin-left:2px; }

  /* Shimmer for fields not yet started */
  .shimmer-line { height:.7rem; border-radius:2px; margin:.38rem 0;
    background:linear-gradient(90deg,rgba(200,169,110,.06) 25%,rgba(200,169,110,.14) 50%,rgba(200,169,110,.06) 75%);
    background-size:400px 100%; animation:shimmer 1.5s ease-in-out infinite; }
  .shimmer-line.short  { width:55%; }
  .shimmer-line.medium { width:78%; }
  .shimmer-line.full   { width:100%; }
  .shimmer-block { padding:.4rem 0; }

  .suggestions { display:flex; flex-wrap:wrap; gap:.35rem; margin-top:.5rem; }
  .chip { background:transparent; border:1px solid rgba(138,180,160,.3); color:var(--sage); border-radius:20px; padding:.18rem .65rem; font-family:'Crimson Pro',serif; font-size:.8rem; cursor:pointer; transition:all .18s; }
  .chip:hover { background:rgba(92,122,74,.3); border-color:var(--fern); color:var(--cream); }
  .chip.added { background:rgba(74,94,58,.35); border-color:rgba(122,140,106,.3); color:rgba(200,200,180,.35); cursor:default; text-decoration:line-through; }
  @keyframes bobArrow { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }
  .float-arrow { position:fixed; bottom:2rem; left:50%; transform:translateX(-50%); z-index:1000; background:rgba(44,26,14,.85); border:1px solid rgba(200,169,110,.35); border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; cursor:pointer; animation:bobArrow 1.6s ease-in-out infinite; backdrop-filter:blur(4px); transition:opacity .3s, visibility .3s; }
  .float-arrow:hover { background:rgba(92,122,74,.7); border-color:var(--fern); }
  .float-arrow svg { width:18px; height:18px; fill:none; stroke:var(--straw); stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
  .insights-panel { background:rgba(30,18,8,.7); border:1px solid rgba(200,169,110,.15); border-radius:2px; padding:1rem 1.5rem; margin-bottom:2rem; animation:fadeIn .4s ease; }
  .insights-unlock { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:.75rem; }
  .insights-title  { font-size:.75rem; text-transform:uppercase; letter-spacing:.1em; color:var(--sage); display:flex; align-items:center; gap:.5rem; }
  .btn-unlock { background:rgba(92,122,74,.25); border:1px solid rgba(92,122,74,.4); color:var(--fern); padding:.4rem 1rem; font-family:'Crimson Pro',serif; font-size:.85rem; border-radius:2px; cursor:pointer; transition:all .2s; }
  .btn-unlock:hover { background:rgba(92,122,74,.4); color:var(--cream); }
  .btn-unlock:disabled { opacity:.4; cursor:not-allowed; }
  .insights-body { margin-top:.9rem; }
  .insights-good { font-size:.9rem; color:var(--fern); font-style:italic; padding:.25rem 0; animation:fadeIn .3s ease; }
  .insight-item { padding:.7rem 0; border-bottom:1px solid rgba(200,169,110,.08); animation:lineIn .25s ease; }
  .insight-item:last-child { border-bottom:none; }
  .insight-plant { font-family:'Playfair Display',serif; font-size:.95rem; color:var(--straw); margin-bottom:.25rem; }
  .insight-q     { font-size:.88rem; color:var(--cream); font-style:italic; margin-bottom:.2rem; }
  .insight-ctx   { font-size:.83rem; color:var(--sage); margin-bottom:.15rem; }
  .insight-tip   { font-size:.83rem; color:var(--dew); }
  .insight-tip::before { content:'→ '; opacity:.6; }
  .btn-inspo { background:rgba(176,138,94,.18); border:1px solid rgba(176,138,94,.35); color:var(--inspo); padding:.5rem .9rem; font-family:'Crimson Pro',serif; font-size:.85rem; border-radius:2px; cursor:pointer; transition:all .2s; width:100%; text-align:left; }
  .btn-inspo:hover { background:rgba(176,138,94,.3); border-color:var(--inspo); color:var(--parchment); }
  .inspo-loading { font-size:.82rem; color:var(--sage); font-style:italic; display:flex; align-items:center; gap:.4rem; padding:.3rem 0; }
  .inspo-name   { font-family:'Playfair Display',serif; font-style:italic; color:var(--straw); font-size:.92rem; }
  .inspo-detail { color:var(--sage); font-size:.82rem; margin-top:.15rem; }
  .inspo-text   { margin-top:.3rem; font-size:.84rem; color:var(--parchment); line-height:1.45; }

  /* ── Lens Calendars ── */
  .lens-panel { background:rgba(30,18,8,.7); border:1px solid rgba(200,169,110,.15); border-radius:2px; padding:1rem 1.5rem; margin-bottom:2rem; animation:fadeIn .4s ease; }
  .lens-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:.75rem; }
  .lens-section-title { font-size:.75rem; text-transform:uppercase; letter-spacing:.1em; color:var(--sage); }
  .lens-list { margin-top:1rem; display:flex; flex-direction:column; gap:.5rem; }
  .lens-item { border:1px solid rgba(200,169,110,.12); border-radius:2px; overflow:hidden; }
  .lens-toggle { display:flex; align-items:center; justify-content:space-between; padding:.6rem .9rem; cursor:pointer; user-select:none; transition:background .15s; }
  .lens-toggle:hover { background:rgba(200,169,110,.05); }
  .lens-toggle-left { display:flex; align-items:center; gap:.5rem; }
  .lens-name { font-family:"Playfair Display",serif; font-size:.9rem; font-weight:400; color:var(--cream); }
  .lens-desc { font-size:.72rem; color:var(--sage); font-style:italic; margin-left:.35rem; }
  .lens-chevron { font-size:.7rem; color:var(--sage); transition:transform .2s; }
  .lens-chevron.open { transform:rotate(180deg); }
  .lens-body { padding:.75rem .9rem 1rem; border-top:1px solid rgba(200,169,110,.1); overflow-x:auto; overflow-y:visible; }
  .tl-month-labels { display:flex; gap:2px; margin-bottom:.35rem; padding-left:120px; }
  .tl-month-lbl { flex:1; text-align:center; font-size:.58rem; color:rgba(180,180,160,.35); letter-spacing:.02em; text-transform:uppercase; }
  .tl-grid { display:table; width:100%; border-collapse:collapse; }
  .tl-row  { display:table-row; }
  .tl-label { display:table-cell; vertical-align:middle; font-size:.72rem; color:var(--parchment); padding:.25rem .4rem .25rem 0; white-space:nowrap; width:80px; max-width:80px; overflow:hidden; text-overflow:ellipsis; }
  .tl-label-cat { font-size:.6rem; color:var(--sage); opacity:.55; margin-left:.3rem; font-style:italic; }
  .tl-months { display:table-cell; vertical-align:bottom; padding:.2rem 0; overflow:visible; }
  .tl-months-inner { display:flex; gap:1px; align-items:flex-end; height:28px; overflow:visible; }
  .tl-bar { flex:1; border-radius:2px 2px 0 0; transition:opacity .15s; min-height:2px; }
  .tl-bar:hover { opacity:.75; cursor:default; }
  .tl-bar.none { background:rgba(200,169,110,.07); height:3px; border-radius:2px; }
  .tl-empty { font-size:.83rem; color:var(--sage); font-style:italic; padding:.5rem 0; }
  /* Scent trait prompt */
  .scent-prompt { display:flex; align-items:center; flex-wrap:wrap; gap:.35rem; margin-top:.3rem; padding:.4rem .6rem; background:rgba(138,180,160,.07); border:1px solid rgba(138,180,160,.2); border-radius:2px; animation:fadeIn .2s ease; }
  .scent-prompt-label { font-size:.78rem; color:var(--sage); flex-shrink:0; }
  .scent-btn { background:none; border:1px solid rgba(138,180,160,.3); border-radius:20px; color:var(--sage); padding:.15rem .6rem; font-family:"Crimson Pro",serif; font-size:.75rem; cursor:pointer; transition:all .15s; }
  .scent-btn:hover { border-color:var(--dew); color:var(--cream); }
  .scent-btn.selected { background:rgba(138,180,160,.2); border-color:var(--dew); color:var(--cream); }
  .colour-prompt { display:flex; align-items:center; flex-wrap:wrap; gap:.4rem; margin-top:.3rem; padding:.45rem .6rem; background:rgba(196,102,74,.06); border:1px solid rgba(196,102,74,.2); border-radius:2px; animation:fadeIn .2s ease; }
  .colour-prompt-label { font-size:.78rem; color:var(--sage); flex-shrink:0; }
  .colour-prompt-input { background:rgba(30,18,8,.9); border:1px solid rgba(200,169,110,.25); border-radius:2px; color:var(--cream); padding:.25rem .6rem; font-family:'Crimson Pro',serif; font-size:.85rem; outline:none; width:120px; transition:border-color .2s; }
  .colour-prompt-input:focus { border-color:var(--straw); }
  .colour-prompt-confirm { background:rgba(92,122,74,.25); border:1px solid rgba(92,122,74,.4); border-radius:2px; color:var(--fern); padding:.25rem .65rem; font-family:'Crimson Pro',serif; font-size:.78rem; cursor:pointer; transition:all .15s; }
  .colour-prompt-confirm:hover { background:rgba(92,122,74,.4); color:var(--cream); }
  .colour-prompt-skip { background:none; border:none; color:var(--sage); font-size:.75rem; cursor:pointer; font-family:'Crimson Pro',serif; opacity:.6; }
  .colour-prompt-skip:hover { opacity:1; color:var(--cream); }
  .gap-section { margin-top:1.1rem; padding-top:1rem; border-top:1px solid rgba(200,169,110,.1); }
  .gap-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:.7rem; }
  .gap-title { font-size:.72rem; text-transform:uppercase; letter-spacing:.09em; color:var(--sage); }
  .gap-item { margin-bottom:.75rem; animation:lineIn .2s ease; }
  .gap-months { font-family:'Playfair Display',serif; font-size:.88rem; color:var(--straw); margin-bottom:.25rem; }
  .gap-suggestions { display:flex; flex-wrap:wrap; gap:.35rem; }
  .gap-pill { font-size:.75rem; color:var(--parchment); background:rgba(200,169,110,.1); border:1px solid rgba(200,169,110,.2); border-radius:2px; padding:.15rem .55rem; }
  .gap-none { font-size:.83rem; color:var(--fern); font-style:italic; }

  /* ── Companion planting (inside Insights panel) ── */
  .companion-section { margin-top:.9rem; padding-top:.9rem; border-top:1px solid rgba(200,169,110,.08); }
  .companion-title { font-size:.7rem; text-transform:uppercase; letter-spacing:.09em; color:var(--sage); margin-bottom:.55rem; }
  .companion-item { display:flex; align-items:baseline; gap:.5rem; padding:.3rem 0; border-bottom:1px solid rgba(200,169,110,.06); font-size:.83rem; line-height:1.45; }
  .companion-item:last-child { border-bottom:none; }
  .companion-badge { flex-shrink:0; font-size:.68rem; padding:.1rem .4rem; border-radius:2px; font-weight:600; letter-spacing:.04em; }
  .companion-badge.good { background:rgba(92,122,74,.25); color:var(--fern); border:1px solid rgba(92,122,74,.35); }
  .companion-badge.warn { background:rgba(196,102,74,.2); color:var(--bloom); border:1px solid rgba(196,102,74,.3); }
  .companion-pair { color:var(--cream); }
  .companion-reason { color:var(--sage); font-style:italic; }

  .page-dots { display:flex; justify-content:center; gap:.5rem; margin-bottom:2rem; }
  .pdot { width:8px; height:8px; border-radius:50%; background:var(--bark2); border:1px solid rgba(200,169,110,.22); cursor:pointer; transition:all .2s; }
  .pdot.active   { background:var(--straw); border-color:var(--straw); }
  .pdot.disabled { opacity:.2; cursor:default; pointer-events:none; }
  .cal-actions { display:flex; justify-content:center; gap:1rem; flex-wrap:wrap; margin-top:.5rem; }
  .btn-ghost { background:transparent; border:1px solid rgba(200,169,110,.28); color:var(--sage); padding:.7rem 1.5rem; font-family:'Crimson Pro',serif; font-size:.95rem; border-radius:2px; cursor:pointer; transition:all .2s; }
  .btn-ghost:hover { border-color:var(--straw); color:var(--straw); }
  .btn-solid { background:var(--fern); border:1px solid var(--moss); color:var(--cream); padding:.7rem 1.6rem; font-family:'Crimson Pro',serif; font-size:.95rem; border-radius:2px; cursor:pointer; transition:all .2s; }
  .btn-solid:hover:not(:disabled) { background:var(--moss); }
  .btn-solid:disabled { opacity:.45; cursor:not-allowed; }

  /* ── Favourites panel ── */
  .favs-panel { background:rgba(44,26,14,.6); border:1px solid rgba(200,169,110,.18); border-radius:2px; padding:1rem 1.5rem 1.1rem; margin-bottom:1.5rem; animation:fadeUp .35s ease; }
  .favs-title { font-size:.72rem; text-transform:uppercase; letter-spacing:.1em; color:var(--sage); margin-bottom:.75rem; }
  .favs-list { display:flex; flex-wrap:wrap; gap:.45rem; }
  .fav-chip { display:flex; align-items:center; gap:0; background:rgba(58,34,16,.7); border:1px solid rgba(200,169,110,.22); border-radius:2px; overflow:hidden; animation:popIn .18s ease; }
  .fav-chip-btn { background:none; border:none; color:var(--parchment); padding:.32rem .75rem; font-family:'Crimson Pro',serif; font-size:.88rem; cursor:pointer; transition:background .15s; }
  .fav-chip-btn:hover { background:rgba(200,169,110,.12); color:var(--cream); }
  .fav-chip-del { background:none; border:none; border-left:1px solid rgba(200,169,110,.15); color:var(--sage); padding:.32rem .5rem; cursor:pointer; font-size:.8rem; transition:all .15s; line-height:1; }
  .fav-chip-del:hover { background:rgba(196,102,74,.2); color:var(--bloom); }
  .btn-save-link { background:rgba(200,169,110,.12); border:1px solid rgba(200,169,110,.3); color:var(--straw); padding:.55rem 1.1rem; font-family:'Crimson Pro',serif; font-size:.85rem; border-radius:2px; cursor:pointer; transition:all .2s; display:flex; align-items:center; gap:.4rem; }
  .btn-save-link:hover { background:rgba(200,169,110,.22); border-color:var(--straw); }
  .btn-save-link.copied { background:rgba(92,122,74,.25); border-color:var(--fern); color:var(--fern); }
`;

// ─── Constants ────────────────────────────────────────────────────────────────
const ORIENTATIONS = [
  "North-facing (cool, shaded)","South-facing (warm, sunny)",
  "East-facing (morning sun)","West-facing (afternoon sun)","Mixed / open aspect",
];
const PLANT_CATEGORIES = [
  {key:"trees",      label:"Trees",               icon:"🌳", suggestions:[]},
  {key:"shrubs",     label:"Shrubs & Hedges",      icon:"🌿", suggestions:[]},
  {key:"flowers",    label:"Flowers & Perennials", icon:"🌸", suggestions:[]},
  {key:"vegetables", label:"Vegetables",           icon:"🥦", suggestions:[]},
  {key:"fruit",      label:"Fruit & Berries",      icon:"🍓", suggestions:[]},
  {key:"herbs",      label:"Herbs",                icon:"🌿", suggestions:[]},
];

// ─── Pre-loaded garden quotes ────────────────────────────────────────────────
// Returns a directions URL for the device's native maps app
function mapsDirectionsUrl(from, to) {
  const isIOS = typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const enc = encodeURIComponent;
  return isIOS
    ? `https://maps.apple.com/?saddr=${enc(from)}&daddr=${enc(to)}`
    : `https://www.google.com/maps/dir/${enc(from)}/${enc(to)}`;
}

const GARDEN_QUOTES = [
  {quote:"To plant a garden is to believe in tomorrow.", attribution:"Audrey Hepburn"},
  {quote:"The glory of gardening: hands in the dirt, head in the sun, heart with nature. To nurture a garden is to feed not just the body, but the soul.", attribution:"Alfred Austin"},
  {quote:"A garden is a grand teacher. It teaches patience and careful watchfulness.", attribution:"Gertrude Jekyll"},
  {quote:"A garden requires patient labour and attention. Plants do not grow merely to satisfy ambitions or to fulfil good intentions.", attribution:"Liberty Hyde Bailey"},
  {quote:"In every gardener there is a child who believes in The Seed Fairy.", attribution:"Robert Brault"},
  {quote:"The love of gardening is a seed once sown that never dies.", attribution:"Gertrude Jekyll"},
  {quote:"To forget how to dig the earth and to tend the soil is to forget ourselves.", attribution:"Mahatma Gandhi"},
  {quote:"Gardening is the art that uses flowers and plants as paint, and the soil and sky as canvas.", attribution:"Elizabeth Murray"},
  {quote:"I grow plants for many reasons: to please my eye or to please my soul, to challenge the elements or to challenge my patience.", attribution:"David Hobson"},
  {quote:"The garden is the poor man's apothecary.", attribution:"German proverb"},
  {quote:"Gardens are not made by singing 'Oh, how beautiful!' and sitting in the shade.", attribution:"Rudyard Kipling"},
  {quote:"A vegetable garden in the beginning looks so promising and then after all little by little it grows nothing but vegetables.", attribution:"Gertrude Stein"},
  {quote:"A garden is always a series of losses set against a few triumphs, like life itself.", attribution:"May Sarton"},
  {quote:"God Almighty first planted a garden. And indeed it is the purest of human pleasures.", attribution:"Francis Bacon"},
  {quote:"The garden suggests there might be a place where we can meet nature halfway.", attribution:"Michael Pollan"},
  {quote:"Show me your garden and I shall tell you what you are.", attribution:"Alfred Austin"},
  {quote:"Gardening is the work of a lifetime: you never finish.", attribution:"Oscar de la Renta"},
  {quote:"A garden is a delight to the eye and a solace for the soul.", attribution:"Saadi"},
  {quote:"Gardens always mean something else, man absolutely uses one thing to say another.", attribution:"Robert Harbison"},
  {quote:"Autumn is a second spring when every leaf is a flower.", attribution:"Albert Camus"},
  {quote:"All gardening is landscape painting.", attribution:"William Kent"},
  {quote:"The garden is the place I go for refuge and shelter, not the house.", attribution:"Vita Sackville-West"},
  {quote:"He who plants a garden, plants happiness.", attribution:"Chinese proverb"},
  {quote:"Flowers always make people better, happier, and more helpful; they are sunshine, food and medicine for the soul.", attribution:"Luther Burbank"},
  {quote:"A weed is but an unloved flower.", attribution:"Ella Wheeler Wilcox"},
  {quote:"I have a garden of my own, shining with flowers of every hue.", attribution:"Thomas Moore"},
  {quote:"The best place to seek God is in a garden. You can dig for him there.", attribution:"George Bernard Shaw"},
  {quote:"It is a golden maxim to cultivate the garden for the nose, and the eyes will take care of themselves.", attribution:"Robert Louis Stevenson"},
  {quote:"Every garden is unique with a multitude of choices of soils, plants and themes.", attribution:"Teresa Watkins"},
  {quote:"What is a weed? A plant whose virtues have not yet been discovered.", attribution:"Ralph Waldo Emerson"},
  {quote:"I cultivate my garden, and my garden cultivates me.", attribution:"Robert Brault"},
  {quote:"The most noteworthy thing about gardeners is that they are always optimistic, always enterprising, and never satisfied.", attribution:"Vita Sackville-West"},
  {quote:"Flowers are the music of the ground, from earth's lips spoken without sound.", attribution:"Edwin Curran"},
  {quote:"There is something infinitely healing in the repeated refrains of nature.", attribution:"Rachel Carson"},
  {quote:"The earth laughs in flowers.", attribution:"Ralph Waldo Emerson"},
  {quote:"In the garden, growth has its seasons. First comes spring and summer, but then we have fall and winter. And then we get spring and summer again.", attribution:"Chauncey Gardiner, Being There"},
  {quote:"The secret of improved plant breeding, apart from scientific knowledge, is love.", attribution:"Luther Burbank"},
  {quote:"I like gardening — it's a place where I find myself when I need to lose myself.", attribution:"Alice Sebold"},
  {quote:"No occupation is so delightful to me as the culture of the earth.", attribution:"Thomas Jefferson"},
  {quote:"I think this is what hooks one to gardening: it is the closest one can come to being present at the Creation.", attribution:"Phyllis Theroux"},
];

const MONTH_NAMES   = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SEASON_COLORS = { Winter:"#7AA6C2",Spring:"#8CBF72",Summer:"#D4A84B",Autumn:"#C47A45",Fall:"#C47A45" };
const SEASON_EMOJIS = {
  January:"❄️",February:"🌨️",March:"🌱",April:"🌸",May:"🌿",June:"☀️",
  July:"🌻",August:"🍅",September:"🍂",October:"🎃",November:"🍁",December:"❄️",
};

// Archive fallback: 5-year daily data — used only if climate normals API fails
async function fetchOpenMeteoArchive(lat, lng) {
  const vars = ["temperature_2m_mean","temperature_2m_min","temperature_2m_max","precipitation_sum","sunshine_duration"].join(",");
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=2019-01-01&end_date=2023-12-31&daily=${vars}&timezone=auto`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let raw;
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Archive HTTP ${res.status}`);
    raw = await res.json();
  } catch(e) { clearTimeout(timer); throw e; }

  const dates=raw.daily?.time||[], tMean=raw.daily?.temperature_2m_mean||[],
        tMin=raw.daily?.temperature_2m_min||[], tMax=raw.daily?.temperature_2m_max||[],
        precip=raw.daily?.precipitation_sum||[], sun=raw.daily?.sunshine_duration||[];
  const acc=Array.from({length:12},()=>({tMean:[],tMin:[],tMax:[],precip:0,sun:0,frostDays:0,count:0}));
  for(let i=0;i<dates.length;i++){
    const m=new Date(dates[i]).getMonth();
    if(tMean[i]!=null)acc[m].tMean.push(tMean[i]);
    if(tMin[i]!=null)acc[m].tMin.push(tMin[i]);
    if(tMax[i]!=null)acc[m].tMax.push(tMax[i]);
    if(precip[i]!=null)acc[m].precip+=precip[i];
    if(sun[i]!=null)acc[m].sun+=sun[i];
    if(tMin[i]!=null&&tMin[i]<0)acc[m].frostDays++;
    acc[m].count++;
  }
  const avg=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
  const YEARS=5;
  return {
    lat:raw.latitude, lng:raw.longitude,
    tMean:acc.map(a=>avg(a.tMean)), tMin:acc.map(a=>avg(a.tMin)),
    tMax:acc.map(a=>avg(a.tMax)),
    precip:acc.map(a=>a.precip/YEARS),
    sunHrs:acc.map(a=>(a.sun/a.count)/3600),
    frostDays:acc.map(a=>a.frostDays/YEARS),
  };
}

// ─── Internationalisation ────────────────────────────────────────────────────
const LANGUAGES = {
  en: { name:"English", flag:"🇬🇧" },
};

const UI_STRINGS = {
  en: {
    cityLabel:        "📍 City & Country",
    cityPlaceholder:  "e.g. Edinburgh, UK",
    orientationLabel: "🧭 Garden Orientation",
    selectOrientation:"Select…",
    continueBtn:      "Continue to plant selection →",
    fetchingClimate:  "Fetching climate data…",
    enterCity:        "Enter a city to continue",
    climateLoaded:    "Climate data loaded",
    furtherReading:   "📚 Further reading for your region",
    addYourPlants:    "Add your plants",
    plantsHint:       "Tap any suggestion to add it, or type your own.",
    loadingLocal:     "Loading suggestions…",
    gardenFeatures:   "🏡 Garden Features",
    optional:         "— optional",
    featuresPlaceholder:"Add features, press Enter…",
    gardenInventory:  "🌱 Garden Inventory",
    recommended:      "— optional but recommended",
    generateBtn:      "✦ Generate My Garden Calendar",
    generateReady:    "✦ Generate My Calendar — Ready!",
    thingsToDo:       "Things to do",
    whatToEnjoy:      "What to enjoy",
    forInspiration:   "For inspiration",
    whereToVisit:     "🌿 Where to visit in",
    loadingMore:      "Loading…",
    loadNextMonths:   "Load next 3 months ↓",
    loadFinalMonths:  "Load final 3 months ↓",
    monthsRemaining:  "months remaining",
    findPlaces:       "🌿 Find places to visit —",
    findingGardens:   "Finding gardens…",
    popularNearYou:   "popular near you",
    forYourClimate:   "suggestions for your climate",
    yourCalendar:     "Your Garden Calendar",
    startOver:        "Start over",
    knownFor:         "Known for:",
    verifyHighlight:  "↗ Verify seasonal highlights on the garden's website before visiting",
    noGardensNearby:  "No notable public gardens found nearby — try searching further afield",
  },
};
// Language name for use in prompts — resolved dynamically from Intl API
function getLangName(code) {
  try {
    // Use Intl.DisplayNames to get the language name in English
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(code) || "English";
  } catch { return "English"; }
}

// ─── Climate zone classification ─────────────────────────────────────────────
function getClimateZone(cd) {
  if (!cd) return "temperate";
  const meanTemp = cd.monthly_mean_temp
    ? cd.monthly_mean_temp.reduce((a,b)=>a+b,0)/12
    : (cd.annual_mean_temp ?? 12);
  const minTemp  = cd.monthly_mean_temp ? Math.min(...cd.monthly_mean_temp) : (cd.coldest_month_temp ?? 5);
  const annualPrecip = cd.annual_precipitation ?? 600;

  const maxTemp    = cd.monthly_mean_temp ? Math.max(...cd.monthly_mean_temp) : (meanTemp + 6);
  const tempRange  = maxTemp - minTemp; // low range = oceanic/maritime, high = continental

  if (meanTemp >= 20 && minTemp >= 18)                           return "tropical";
  if (meanTemp >= 16 && minTemp >= 5)                            return "subtropical";
  if (meanTemp >= 12 && annualPrecip < 400)                      return "arid";
  // Mediterranean: warm mean, mild winter, DRY — e.g. Provence, Malaga, Athens
  if (meanTemp >= 12 && minTemp >= 4 && annualPrecip < 700)      return "mediterranean";
  // Maritime: mild oceanic — small annual temp range (≤13°), wet, no hot summers
  // e.g. Jersey, Guernsey, Cornwall, Brittany coast, Dublin, western Ireland
  // Excludes Bordeaux (range 15.7°), Nantes (15.5°) which have real hot summers
  if (meanTemp >= 10 && minTemp >= 3 && annualPrecip >= 600 && tempRange <= 13) return "maritime";
  if (minTemp < -10)                                             return "subarctic";
  if (minTemp < -3)                                              return "continental";
  return "temperate";
}

// ─── iNat local suggestions ───────────────────────────────────────────────────
// Queries iNat captive=true for all plants in a category, returns top-N common names.
// Routes through proxy when available to avoid CORS issues.
// ─── Plant validation & clarification ────────────────────────────────────────

// Principle-based clarification rules. Each rule fires when the resolved genus matches.
// To add a new rule: add one entry here — no other code changes needed.
const CLARIFICATION_RULES = [
  {
    test: ({ genus }) => genus === "Magnolia",
    question: "Deciduous or evergreen?",
    options: ["Deciduous (loses leaves)", "Evergreen", "Not sure"],
    promptHint: (ans) => ans.startsWith("Deciduous")
      ? "deciduous — prune immediately after flowering in spring only"
      : ans === "Evergreen" ? "evergreen — prune lightly after flowering, avoid hard cuts" : null,
  },
  {
    test: ({ genus }) => genus === "Rosa",
    question: "What type of rose?",
    options: ["Bush / hybrid tea / floribunda", "Climbing or rambler", "Shrub rose", "Not sure"],
    promptHint: (ans) => ans.startsWith("Climbing")
      ? "climbing/rambler — prune flowered laterals after bloom, train new canes"
      : ans.startsWith("Bush") ? "bush/hybrid tea — hard prune early spring to outward-facing buds"
      : ans.startsWith("Shrub") ? "shrub rose — remove one third of oldest stems annually" : null,
  },
  {
    test: ({ genus }) => genus === "Malus",
    question: "Eating, cooking, or crab apple?",
    options: ["Eating apple", "Cooking apple", "Crab apple", "Not sure"],
    promptHint: (ans) => ans === "Crab apple"
      ? "crab apple — ornamental, prune for shape after flowering only"
      : ans.includes("apple") ? "fruiting apple — summer prune laterals Jul–Aug, structural prune Feb only" : null,
  },
  {
    test: ({ genus }) => genus === "Lavandula",
    question: "Common or French lavender?",
    options: ["Common / English lavender", "French lavender (butterfly ears)", "Not sure"],
    promptHint: (ans) => ans.startsWith("French")
      ? "French lavender (Lavandula stoechas) — less hardy, protect in hard frosts"
      : ans.startsWith("Common") ? "common lavender — fully hardy, trim after flowering in Aug" : null,
  },
  {
    test: ({ genus }) => genus === "Camellia",
    question: "When does it flower?",
    options: ["Spring (Feb–April)", "Autumn/Winter (Oct–Jan)", "Not sure"],
    promptHint: (ans) => ans.startsWith("Spring")
      ? "Camellia japonica — prune immediately after spring flowering"
      : ans.startsWith("Autumn") ? "Camellia sasanqua — prune after autumn/winter flowering" : null,
  },
];

// Plants where scent is genuinely ambiguous — some varieties scented, some not
const SCENTED_PLANT_NAMES = new Set([
  "rose","roses","sweet pea","sweet peas","jasmine","wisteria",
  "lily","lilies","honeysuckle","gardenia","freesia","phlox",
  "osmanthus","daphne"
]);

// Plants where flower colour materially varies and affects lens output
const COLOUR_PROMPT_PLANTS = new Set([
  "rose","roses","tulip","tulips","dahlia","dahlias","hydrangea","hydrangeas",
  "iris","irises","daffodil","daffodils","narcissus","chrysanthemum","chrysanthemums",
  "pansy","pansies","peony","peonies","snapdragon","snapdragons",
  "sweet pea","sweet peas","lupin","lupins","foxglove","foxgloves",
  "geranium","geraniums","allium","alliums","camellia","camellias",
  "rhododendron","rhododendrons","azalea","azaleas"
]);

// Common English name → scientific name / genus for GBIF lookup.
// GBIF species/match works well with scientific names but not vernacular English names.
// This map is the bridge — we own the translation, GBIF owns the taxonomy.
const COMMON_TO_SCIENTIFIC = {
  // Clarification-rule plants (genus only — GBIF resolves to accepted species)
  "magnolia":   "Magnolia",
  "rose":       "Rosa",
  "roses":      "Rosa",
  "apple":      "Malus",
  "apples":     "Malus",
  "lavender":   "Lavandula",
  "camellia":   "Camellia",
  // Scientific name enrichment — specific accepted names
  "rosemary":   "Salvia rosmarinus",
  "hydrangea":  "Hydrangea",
  "forsythia":  "Forsythia",
  "tomato":     "Solanum lycopersicum",
  "tomatoes":   "Solanum lycopersicum",
  "fig":        "Ficus carica",
  "figs":       "Ficus carica",
  "peony":      "Paeonia",
  "peonies":    "Paeonia",
  "wisteria":   "Wisteria",
  "clematis":   "Clematis",
  "dahlia":     "Dahlia",
  "dahlias":    "Dahlia",
  "allium":     "Allium",
  "tulip":      "Tulipa",
  "tulips":     "Tulipa",
  "daffodil":   "Narcissus",
  "daffodils":  "Narcissus",
  "snowdrop":   "Galanthus",
  "snowdrops":  "Galanthus",
  "bluebell":   "Hyacinthoides",
  "bluebells":  "Hyacinthoides",
  "buddleia":   "Buddleja",
  "buddleja":   "Buddleja",
  "viburnum":   "Viburnum",
  "photinia":   "Photinia fraseri",  // Red Robin — most common UK garden photinia
  "photinias":  "Photinia fraseri",
  // Compound and informal names users commonly type
  "rose bush":      "Rosa",
  "rose bushes":    "Rosa",
  "rose tree":      "Rosa",
  "climbing rose":  "Rosa",
  "shrub rose":     "Rosa",
  "bush rose":      "Rosa",
  "olive tree":     "Olea europaea",
  "fig tree":       "Ficus carica",
  "apple tree":     "Malus",
  "lemon tree":     "Citrus limon",
  "lemon":          "Citrus limon",
  "lemons":         "Citrus limon",
  "cherry tree":    "Prunus avium",
  "peach tree":     "Prunus persica",
  "pear tree":      "Pyrus",
  "plum tree":      "Prunus domestica",
    // Additional common names missing from GBIF name backbone
  "holly":       "Ilex aquifolium",
  "hollies":     "Ilex aquifolium",
  "olive":       "Olea europaea",
  "olives":      "Olea europaea",
  "quince":      "Cydonia oblonga",
  "quinces":     "Cydonia oblonga",
  "rhubarb":     "Rheum rhabarbarum",
  "blueberry":   "Vaccinium corymbosum",
  "blueberries": "Vaccinium corymbosum",
  "edelweiss":   "Leontopodium alpinum",
  "coconut":     "Cocos nucifera",
  "pineapple":   "Ananas comosus",
  "pineapples":  "Ananas comosus",
  "coconuts":    "Cocos nucifera",
  "melon":       "Cucumis melo",
  "melons":      "Cucumis melo",
  "hellebore":   "Helleborus",
  "hellebores":  "Helleborus",
  "oleander":    "Nerium oleander",
  "pyracantha":  "Pyracantha",
  "spruce":      "Picea",
  "crocus":      "Crocus",
  "elderflower": "Sambucus nigra",
  "elderberry": "Sambucus nigra",
  "ivy":        "Hedera",
  "fern":       "Dryopteris",
  "ferns":      "Dryopteris",
  "mint":       "Mentha",
  "thyme":      "Thymus",
  "sage":       "Salvia officinalis",
  "basil":      "Ocimum basilicum",
  "chives":     "Allium schoenoprasum",
  "parsley":    "Petroselinum crispum",
  "strawberry": "Fragaria",
  "strawberries": "Fragaria",
  "raspberry":  "Rubus idaeus",
  "raspberries": "Rubus idaeus",
  "blackberry": "Rubus fruticosus",
  "blackberries": "Rubus fruticosus",
  "gooseberry": "Ribes uva-crispa",
  "gooseberries": "Ribes uva-crispa",
  "currant":    "Ribes",
  "currants":   "Ribes",
  "redcurrant":  "Ribes rubrum",
  "redcurrants": "Ribes rubrum",
  "blackcurrant":  "Ribes nigrum",
  "blackcurrants": "Ribes nigrum",
  "peach":      "Prunus persica",
  "peaches":    "Prunus persica",
  "plum":       "Prunus domestica",
  "plums":      "Prunus domestica",
  "cherry":     "Prunus avium",
  "cherries":   "Prunus avium",
  "pear":       "Pyrus communis",
  "pears":      "Pyrus communis",
  "courgette":  "Cucurbita pepo",
  "courgettes": "Cucurbita pepo",
  "zucchini":   "Cucurbita pepo",
  "bean":       "Phaseolus",
  "beans":      "Phaseolus",
  "pea":        "Pisum sativum",
  "peas":       "Pisum sativum",
  "potato":     "Solanum tuberosum",
  "potatoes":   "Solanum tuberosum",
  "carrot":     "Daucus carota",
  "carrots":    "Daucus carota",
  "onion":      "Allium cepa",
  "onions":     "Allium cepa",
  "garlic":     "Allium sativum",
};

// Validates a plant name via GBIF species/match API.
// GBIF names backbone derives from WCVP (World Checklist of Vascular Plants, Royal Botanic Gardens, Kew)
// and Plants of the World Online (POWO) — so this lookup honours both sources.
// Source attribution: Global Biodiversity Information Facility (GBIF) · gbif.org · CC BY 4.0
async function validatePlantName(name) {
  // Translate common English name → scientific name for GBIF lookup
  const queryName = COMMON_TO_SCIENTIFIC[name.toLowerCase()] || name;
  const proxyUrl  = PROXY_BASE ? `${PROXY_BASE}/api/species?name=${encodeURIComponent(queryName)}` : null;
  const directUrl = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(queryName)}&verbose=false`;

  const tryFetch = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  try {
    let data;
    try {
      data = proxyUrl ? await tryFetch(proxyUrl) : await tryFetch(directUrl);
    } catch {
      data = await tryFetch(directUrl); // fall back to direct
    }

    // GBIF returns matchType:"NONE" when nothing found
    if (!data || data.matchType === "NONE" || !data.canonicalName) {
      return { status: "unknown", name };
    }

    const genus   = data.genus || data.canonicalName?.split(" ")[0] || "";
    const family  = data.family || "";
    const sciName = data.canonicalName || data.scientificName || "";
    const rule    = CLARIFICATION_RULES.find(r => r.test({ genus, family }));

    // Auto-populate the lookup map so occurrence checks use the correct scientific name
    // even for plants not hardcoded in COMMON_TO_SCIENTIFIC
    const key = name.toLowerCase();
    if (!COMMON_TO_SCIENTIFIC[key] && sciName) {
      COMMON_TO_SCIENTIFIC[key] = sciName;
    }

    // Spelling suggestion: if the user's input doesn't match any known common name
    // and differs meaningfully from the canonical scientific name, offer a correction.
    // Use the first common vernacular name from COMMON_TO_SCIENTIFIC that maps to the
    // same scientific name, falling back to the canonical name itself.
    let spellSuggestion = null;
    const inputKey = name.toLowerCase().trim();
    const isKnownCommon = !!COMMON_TO_SCIENTIFIC[inputKey];
    const matchesScientific = sciName.toLowerCase().startsWith(inputKey) || inputKey === sciName.toLowerCase();
    if (!isKnownCommon && !matchesScientific && sciName) {
      // Find a friendly common name that maps to this scientific name
      const commonMatch = Object.entries(COMMON_TO_SCIENTIFIC).find(([k, v]) =>
        v.toLowerCase() === sciName.toLowerCase() && k !== inputKey
      );
      spellSuggestion = commonMatch ? commonMatch[0] : sciName;
      // Capitalise first letter for display
      spellSuggestion = spellSuggestion.charAt(0).toUpperCase() + spellSuggestion.slice(1);
    }

    return {
      status: "valid", name,
      scientificName: sciName,
      family, genus,
      usageKey: data.usageKey,        // GBIF taxon key — used for occurrence lookup
      confidence: data.confidence,
      attribution: "GBIF / WCVP (Royal Botanic Gardens, Kew)",
      clarificationRule: rule || null,
      clarificationAnswer: null,
      spellSuggestion,
    };
  } catch {
    return { status: "unknown", name };
  }
}

// Checks how many times a plant has been recorded growing near a location.
// Fires once coordinates are known (after climate prefetch).
// Source: GBIF occurrence records · gbif.org · CC BY 4.0 / CC0 per dataset
async function checkRegionalOccurrence(scientificName, lat, lng) {
  if (!lat || !lng || !scientificName) return null;
  // Single species/match to resolve correct GBIF occurrence parameter.
  // genusKey aggregates all species under a genus; taxonKey is species-level.
  let gbifParam;
  let resolvedMatchType = null;
  try {
    const matchUrl = PROXY_BASE
      ? `${PROXY_BASE}/api/species?name=${encodeURIComponent(scientificName)}`
      : `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(scientificName)}&verbose=false`;
    const r = await fetch(matchUrl);
    if (r.ok) {
      const d = await r.json();
      // Only use EXACT or FUZZY matches — HIGHERRANK means species not in GBIF backbone
      // (e.g. Leontopodium alpinum → Asteraceae family, giving millions of false records)
      const matchType = d.matchType || "";
      const rank = (d.rank || "").toUpperCase();
      if (d.usageKey && (matchType === "EXACT" || matchType === "FUZZY")) {
        gbifParam = rank === "GENUS"  ? `genusKey=${d.genusKey || d.usageKey}`
                  : rank === "FAMILY" ? `familyKey=${d.familyKey || d.usageKey}`
                  : `taxonKey=${d.usageKey}`;
        // Store matchType so badge logic can require EXACT for zero-count warnings
        resolvedMatchType = matchType;
      } else {
        return null; // HIGHERRANK or NONE — not reliable enough for occurrence data
      }
    }
  } catch {}
  if (!gbifParam) return null;
  const url = `https://api.gbif.org/v1/occurrence/search?${gbifParam}&decimalLatitude=${lat-3.0},${lat+3.0}&decimalLongitude=${lng-3.0},${lng+3.0}&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.count !== "number") return null;
    return { count: data.count, recorded: data.count > 0, matchType: resolvedMatchType };
  } catch {
    return null;
  }
}
// ─── OpenFarm crop data ───────────────────────────────────────────────────────
// Fetches sowing/harvest timing for vegetables and herbs from OpenFarm (openfarm.cc).
// Routed through the proxy to avoid CORS. Client-side localStorage cache (30-day TTL)
// avoids repeat calls for the same plant — OpenFarm cultivation data is stable.
// Source: OpenFarm · openfarm.cc · CC BY licence
const OPENFARM_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

async function fetchOpenFarm(plantName) {
  const key = `gc_openfarm_${plantName.trim().toLowerCase()}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const { data, cachedAt } = JSON.parse(raw);
      if (Date.now() - cachedAt < OPENFARM_CACHE_TTL) return data;
    }
  } catch {}
  if (!PROXY_BASE) return null;
  try {
    const res = await fetch(
      `${PROXY_BASE}/api/openfarm?q=${encodeURIComponent(plantName)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      // Cache null result for 24h so repeated generates don't hit a broken endpoint
      try { localStorage.setItem(key, JSON.stringify({ data: null, cachedAt: Date.now() })); } catch {}
      return null;
    }
    const data = await res.json();
    if (data.error) return null;
    try { localStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() })); } catch {}
    return data.found ? data : null;
  } catch {
    return null;
  }
}

// ─── Phase 4: Horticultural society lookup ────────────────────────────────────
// Maps ISO 3166-1 alpha-2 country codes to the leading national horticultural
// society for that country. Used in the calendar footer attribution line.
// country_code comes from Nominatim/Photon geocoding and is stored on meta.
const HORT_SOCIETY = {
  gb: { name: "RHS",                          url: "rhs.org.uk" },
  ie: { name: "An Taisce / IHT",              url: "irishplantsociety.org" },
  us: { name: "Cooperative Extension",        url: "extension.org" },
  ca: { name: "Master Gardeners of Canada",   url: "mgc.ca" },
  au: { name: "Gardening Australia",          url: "abc.net.au/gardening" },
  nz: { name: "New Zealand Horticulture",     url: "hortnz.co.nz" },
  fr: { name: "Jardins de France",            url: "jardins-de-france.com" },
  de: { name: "Deutsche Gartenbaugesellschaft", url: "dgg.de" },
  at: { name: "Österreichische Gartenbaugesellschaft", url: "gartenbaugesellschaft.at" },
  ch: { name: "JardinSuisse",                 url: "jardinsuisse.ch" },
  be: { name: "Société Royale d'Horticulture", url: "srh.be" },
  nl: { name: "Koninklijke Maatschappij Tuinbouw", url: "kmtp.nl" },
  es: { name: "Real Sociedad de Horticultura", url: "rshorticultura.es" },
  pt: { name: "Sociedade de Ciências Horti.",  url: "soch.pt" },
  it: { name: "Società Orticola d'Italia",    url: "soih.it" },
  se: { name: "Riksförbundet Svensk Trädgård", url: "tradgard.org" },
  no: { name: "Norsk Hageselskap",            url: "hageselskapet.no" },
  dk: { name: "Haveselskabet",                url: "haveselskabet.dk" },
  fi: { name: "Puutarhaliitto",               url: "puutarhaliitto.fi" },
  pl: { name: "Polski Związek Ogrodniczy",    url: "pzo.com.pl" },
  za: { name: "Horticultural Society of SA",  url: "hssa.co.za" },
  jp: { name: "Japan Horticultural Society",  url: "horticulture.or.jp" },
  sg: { name: "NParks / National Gardens",    url: "nparks.gov.sg" },
  in: { name: "Indian Society of Horticulture", url: "ishort.in" },
};

// Plants that are commonly grown ornamentally in cooler climates but cannot fruit/flower
// as they would in their native climate. Key = scientific name fragment, value = note.
const CLIMATE_MARGINAL = {
  "Musa":           { zones:["temperate","continental","subarctic"], note:"ornamental foliage only — will not fruit outdoors in this climate" },
  "Cocos nucifera": { zones:["temperate","continental","subarctic","mediterranean"], note:"ornamental only — will not fruit in this climate" },
  "Mangifera":      { zones:["temperate","continental","subarctic","mediterranean"], note:"ornamental or conservatory only — will not fruit outdoors here" },
  "Carica papaya":  { zones:["temperate","continental","subarctic","mediterranean"], note:"ornamental or conservatory only — will not fruit outdoors here" },
  "Strelitzia":     { zones:["temperate","continental","subarctic"], note:"ornamental — grown for foliage/flower in sheltered spots, rarely flowers outdoors" },
  "Bougainvillea":  { zones:["temperate","continental","subarctic"], note:"conservatory or very sheltered wall only — will not thrive outdoors here" },
  "Heliconia":      { zones:["temperate","continental","subarctic","mediterranean"], note:"ornamental conservatory plant in this climate" },
  "Citrus":         { zones:["temperate","continental","subarctic","maritime"], note:"pot-grown and overwintered indoors — will not fruit reliably outdoors in this climate" },
  "Olea europaea":  { zones:["continental","subarctic"], note:"ornamental only — unlikely to fruit in this climate" },
  "Phoenix":        { zones:["temperate","continental","subarctic","maritime"], note:"ornamental palm — will not fruit outdoors in this climate" },
  "Eriobotrya":     { zones:["temperate","continental","subarctic","maritime"], note:"grown as ornamental wall shrub — rarely fruits outdoors in this climate" },
  "Diospyros kaki": { zones:["temperate","continental","subarctic","maritime"], note:"fruits only in warm summers — treat as ornamental in this climate" },
  "Mespilus":       { zones:["tropical","subtropical"], note:"temperate fruit — unusual in this climate" },
};

function getClimateMarginalNote(scientificName, climateZone) {
  if (!scientificName || !climateZone) return null;
  for (const [key, val] of Object.entries(CLIMATE_MARGINAL)) {
    if (scientificName.toLowerCase().startsWith(key.toLowerCase())) {
      if (val.zones.includes(climateZone)) return val.note;
    }
  }
  return null;
}

function enrichedPlantName(name, meta, climateZone) {
  let label = name;
  if (meta?.status === "valid") {
    if (meta.scientificName && meta.scientificName.toLowerCase() !== name.toLowerCase()) {
      label += ` (${meta.scientificName})`;
    }
    if (meta.clarificationAnswer && meta.clarificationRule) {
      const hint = meta.clarificationRule.promptHint(meta.clarificationAnswer);
      if (hint) label += ` — ${hint}`;
    }
  }
  // Climate-marginal flag: plant is real here but limited by climate
  const marginalNote = getClimateMarginalNote(meta?.scientificName, climateZone);
  if (marginalNote) {
    label += ` — ${marginalNote}`;
  } else if (meta?.occurrence?.count === 0 && meta?.occurrence?.matchType === 'EXACT' && meta?.scientificName) {
    label += ` — ⚠ 0 GBIF records near location, likely unsuitable for this climate`;
  } else if (meta?.occurrence?.count > 0) {
    label += ` — ${meta.occurrence.count} local GBIF records`;
  }
  return label;
}


// ─── Empty month template ─────────────────────────────────────────────────────
const emptyMonth = (name) => ({
  month:name, season:null, sunHours:null,
  tasks:[], enjoy:[],
  _taskPartial:null, _enjoyPartial:null,
  _state:"pending",
});


// ─── OpenMeteo climate data ───────────────────────────────────────────────────
// Fetches 30-year climate normals (1991-2020) from Open-Meteo Climate API.
// Pre-aggregated monthly data — ~15KB response vs ~1.5MB for daily archive.
// Free, no API key, global coverage, CC BY 4.0.
const OM_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

async function fetchOpenMeteoClimate(lat, lng) {
  // Open-Meteo climate normals API variable support varies by model.
  // MRI_AGCM3_2_S dropped support for temperature_2m_min/max in 2025.
  // Strategy: try mean+precip+sun first (universally supported), then
  // attempt min/max separately. If the whole call fails, throw so the
  // caller falls back to the archive API which has full global coverage.
  const baseVars = ["temperature_2m_mean", "precipitation_sum", "sunshine_duration"];
  const extVars  = ["temperature_2m_min", "temperature_2m_max"];

  // Try models in order of preference — first success wins
  const models = ["MRI_AGCM3_2_S", "CMCC_CM2_VHR4", "EC_Earth3P_HR"];

  async function tryFetch(vars, model) {
    const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lng}&monthly=${vars.join(",")}&models=${model}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const raw = await res.json();
      if (raw.error) return null;
      return raw;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  let raw = null;
  let usedModel = null;

  for (const model of models) {
    // Try with all vars first
    raw = await tryFetch([...baseVars, ...extVars], model);
    if (raw?.monthly?.temperature_2m_mean?.length) { usedModel = model; break; }
    // Try without min/max if that failed
    raw = await tryFetch(baseVars, model);
    if (raw?.monthly?.temperature_2m_mean?.length) { usedModel = model; break; }
    raw = null;
  }

  if (!raw) throw new Error("normals API returned no usable data");

  const monthly = raw.monthly || {};
  if (!monthly.temperature_2m_mean?.length) throw new Error("no coverage for this location");

  const times    = monthly.time || [];
  const tMeanRaw  = monthly.temperature_2m_mean || [];
  const tMinRaw   = monthly.temperature_2m_min  || []; // may be empty
  const tMaxRaw   = monthly.temperature_2m_max  || []; // may be empty
  const precipRaw = monthly.precipitation_sum   || [];
  const sunRaw    = monthly.sunshine_duration   || [];

  const acc = Array.from({length:12}, () => ({tMean:[],tMin:[],tMax:[],precip:[],sun:[]}));
  for (let i = 0; i < times.length; i++) {
    const m = new Date(times[i] + "-01").getMonth();
    if (tMeanRaw[i]  != null) acc[m].tMean.push(tMeanRaw[i]);
    if (tMinRaw[i]   != null) acc[m].tMin.push(tMinRaw[i]);
    if (tMaxRaw[i]   != null) acc[m].tMax.push(tMaxRaw[i]);
    if (precipRaw[i] != null) acc[m].precip.push(precipRaw[i]);
    if (sunRaw[i]    != null) acc[m].sun.push(sunRaw[i]);
  }
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const tMeanMonthly = acc.map(a => avg(a.tMean));
  const tMinMonthly  = acc.map((a, i) => avg(a.tMin) ?? (tMeanMonthly[i] != null ? tMeanMonthly[i] - 4 : null));
  const tMaxMonthly  = acc.map((a, i) => avg(a.tMax) ?? (tMeanMonthly[i] != null ? tMeanMonthly[i] + 4 : null));
    return {
      lat: raw.latitude, lng: raw.longitude,
      tMean:    tMeanMonthly,
      tMin:     tMinMonthly,
      tMax:     tMaxMonthly,
      precip:   acc.map(a => avg(a.precip)),
      sunHrs:   acc.map(a => { const s = avg(a.sun); return s != null ? s / 3600 : null; }),
      frostDays: tMinMonthly.map(t => t == null ? 0 : Math.max(0, (2 - t) * 3)),
    };
}

function deriveClimateFromOM(cd, hemisphere) {
  const { tMean, tMin, tMax, precip, frostDays } = cd;
  const annualFrost   = frostDays.reduce((a,b) => a+b, 0);
  const coldestMean   = Math.min(...tMean);
  const hottestMax    = Math.max(...tMax);
  const coldestMin    = Math.min(...tMin);
  const annualPrecip  = precip.reduce((a,b) => a+b, 0);
  const dryMonthCount = precip.filter(p => p < 30).length;
  const tempRange     = Math.max(...tMean) - Math.min(...tMean);

  // Hardiness zone from coldest monthly minimum
  const zone = coldestMin < -17.8 ? "Zone 6" : coldestMin < -12.2 ? "Zone 7"
    : coldestMin < -6.7 ? "Zone 8" : coldestMin < -1.1 ? "Zone 9"
    : coldestMin < 4.4  ? "Zone 10" : "Zone 11+";

  // Multi-axis climate classification
  // Mediterranean check runs FIRST regardless of frost count — dry summers are the
  // defining signal for Mediterranean climate even where Mistral causes occasional frost
  const summerIdxs = hemisphere === "S" ? [11,0,1] : [5,6,7];
  const winterIdxs = hemisphere === "S" ? [5,6,7] : [11,0,1];
  const summerPrecip = summerIdxs.reduce((a,i)=>a+precip[i],0);
  const winterPrecip = winterIdxs.reduce((a,i)=>a+precip[i],0);
  const drySummer    = summerPrecip < 120 && dryMonthCount >= 2;

  let climateType;
  if (annualFrost === 0 && coldestMean > 18) {
    climateType = "equatorial";
  } else if (annualFrost === 0 && coldestMean > 15) {
    climateType = "tropical humid";
  } else if (hottestMax >= 18 && drySummer && dryMonthCount >= 3) {
    // Mediterranean: warm summers, dry summers — check before frost-based branches
    // Catches Provence, Languedoc etc. that have occasional frost from Mistral
    climateType = hottestMax > 35 ? "hot semi-arid" : "mediterranean";
  } else if (annualFrost < 5 && dryMonthCount >= 3) {
    const wetSummer = summerPrecip > winterPrecip * 1.5;
    climateType = wetSummer ? "subtropical (wet/dry seasons)" : "mediterranean";
  } else if (annualFrost < 5 && annualPrecip > 800) {
    climateType = "subtropical oceanic";
  } else if (annualFrost < 5) {
    climateType = "subtropical";
  } else if (coldestMean < 0 || annualFrost > 60) {
    climateType = "cold temperate";
  } else if (tempRange < 16) {
    climateType = "temperate oceanic";
  } else {
    climateType = "temperate continental";
  }

  // Frost months — hemisphere-aware
  const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let lastFrost = null, firstFrost = null;
  if (hemisphere === "S") {
    for (let i = 11; i >= 6; i--) if (frostDays[i] > 0.5) { lastFrost = SHORT[i]; break; }
    for (let i = 0;  i <= 5; i++) if (frostDays[i] > 0.5) { firstFrost = SHORT[i]; break; }
  } else {
    for (let i = 5; i >= 0; i--) if (frostDays[i] > 0.5) { lastFrost = SHORT[i]; break; }
    for (let i = 6; i <= 11; i++) if (frostDays[i] > 0.5) { firstFrost = SHORT[i]; break; }
  }

  // Dry season months (named)
  const dryMonths = SHORT.filter((_,i) => precip[i] < 30);

  // Season note for prompt
  let seasonNote = "";
  if (hemisphere === "S") {
    seasonNote = "SOUTHERN HEMISPHERE — seasons are inverted vs Northern Hemisphere. Summer is Dec–Feb, winter is Jun–Aug.";
  } else if (climateType === "equatorial") {
    seasonNote = "EQUATORIAL — no seasons. Growing year-round. Tasks governed by wet/dry cycles, not temperature.";
  } else if (climateType === "tropical humid") {
    seasonNote = "TROPICAL — no frost ever. Growing year-round. Wet season governs planting timing.";
  }

  return { zone, climateType, lastFrost, firstFrost, dryMonths, seasonNote, annualFrost, annualPrecip };
}

function buildClimateContext(cd, derived) {
  const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmt1  = arr => SHORT.map((m,i) => `${m}:${arr[i]?.toFixed(1)}`).join(" ");
  const fmt0  = arr => SHORT.map((m,i) => `${m}:${arr[i]?.toFixed(0)}`).join(" ");
  return [
    `Hemisphere: ${derived.seasonNote ? (derived.seasonNote.startsWith("SOUTHERN") ? "Southern (seasons inverted)" : "Equatorial") : "Northern"}`,
    `Climate type: ${derived.climateType}`,
    `Hardiness zone: ${derived.zone}`,
    `Monthly mean temps (°C):  ${fmt1(cd.tMean)}`,
    `Monthly max temps (°C):   ${fmt1(cd.tMax)}`,
    `Monthly precip (mm):      ${fmt0(cd.precip)}`,
    `Monthly sunshine (h/day): ${fmt1(cd.sunHrs)}`,
    `Frost days/month:         ${fmt1(cd.frostDays)}`,
    `Last spring frost: ${derived.lastFrost || "none"} · First autumn frost: ${derived.firstFrost || "none"}`,
    `Annual frost days: ${derived.annualFrost.toFixed(0)}`,
    derived.dryMonths.length ? `Dry months (<30mm rain): ${derived.dryMonths.join(", ")}` : "No pronounced dry season",
    derived.seasonNote ? `IMPORTANT: ${derived.seasonNote}` : "",
  ].filter(Boolean).join("\n");
}

// Detect hemisphere from latitude (equatorial band ±10°)
function detectHemisphere(lat) {
  if (lat > 10)  return "N";
  if (lat < -10) return "S";
  return "EQ";
}

// ─── Proxy base URL ───────────────────────────────────────────────────────────
// Read directly from Vite env at build time — window.__VITE_PROXY_URL__ set by
// main.jsx is unreliable due to module evaluation order.
const PROXY_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PROXY_URL)
  ? String(import.meta.env.VITE_PROXY_URL).replace(/\/$/, "")
  : (typeof window !== "undefined" && window.__VITE_PROXY_URL__)
  ? String(window.__VITE_PROXY_URL__).replace(/\/$/, "")
  : "";

// ─── Gemini rate limiter ──────────────────────────────────────────────────────
// Gemini free tier allows 15 RPM. The app fires several AI calls close together
// (suggestions on prefetch, then stream on generate). This queue serialises all
// Gemini calls and enforces a minimum 5s gap between them to stay within limits.
const _geminiQueue = { promise: Promise.resolve(), lastCall: 0 };
const GEMINI_MIN_GAP_MS = 5000; // 5s between calls = max 12 RPM, safely under 15 RPM

async function withGeminiQueue(fn) {
  _geminiQueue.promise = _geminiQueue.promise.then(async () => {
    const elapsed = Date.now() - _geminiQueue.lastCall;
    if (_geminiQueue.lastCall > 0 && elapsed < GEMINI_MIN_GAP_MS) {
      await new Promise(r => setTimeout(r, GEMINI_MIN_GAP_MS - elapsed));
    }
    _geminiQueue.lastCall = Date.now();
    return fn();
  });
  return _geminiQueue.promise;
}

// True only in Claude artifact sandbox — no proxy, needs direct API key
function isArtifact() {
  if (typeof window === "undefined") return false;
  if (PROXY_BASE) return false;
  const host = window.location.hostname;
  return !host.includes("vercel.app") && host !== "localhost" && host !== "127.0.0.1";
}

// ─── Streaming helper ─────────────────────────────────────────────────────────
// ─── AI provider abstraction ──────────────────────────────────────────────────
// Supports three modes:
//   "proxy"  — routes through the garden-calendar proxy (default, rate-limited)
//   "claude" — calls Anthropic API directly with user's own key (no rate limits)
//   "gemini" — calls Google Gemini API directly with user's own key
//
// streamAI / callAI replace the old streamClaude / callClaude.
// The rest of the app calls these two functions and never cares which provider is active.

async function streamAI(prompt, maxTokens, onChunk, signal, provider, userKey) {
  const useOwn = provider !== "proxy" && userKey;

  if (useOwn && provider === "gemini") {
    // Gemini streaming via SSE — serialised through rate-limit queue, retry on 429
    return withGeminiQueue(async () => {
    const model = (() => { try { return localStorage.getItem("gc_gemini_model") || "gemini-2.5-flash"; } catch { return "gemini-2.5-flash"; } })();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${userKey}`;
    // Gemini needs more headroom than Claude for the same output length
    const geminiStreamTokens = Math.max(maxTokens * 2, 6000);
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: geminiStreamTokens } }),
        signal,
      });
      if (res.status === 429) {
        if (attempt === 2) {
          const err = new Error("Gemini rate limit — too many requests in quick succession. Please wait a moment and try again.");
          err.isRateLimit = true;
          throw err;
        }
        await new Promise(r => setTimeout(r, (attempt + 1) * 4000)); // 4s, 8s
        continue;
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        const rawMsg = e.error?.message || `Gemini HTTP ${res.status}`;
        const isOverloaded = res.status === 503 || rawMsg.toLowerCase().includes("high demand") || rawMsg.toLowerCase().includes("overloaded") || rawMsg.toLowerCase().includes("temporarily");
        // Retry on overload/503 — longer backoff to let Google recover
        if (isOverloaded && attempt < 2) {
          const waitMs = (attempt + 1) * 8000; // 8s, 16s
          // Send empty heartbeat chunks every 2s so the stall timer doesn't fire
          const heartbeat = setInterval(() => onChunk(""), 2000);
          await new Promise(r => setTimeout(r, waitMs));
          clearInterval(heartbeat);
          continue;
        }
        const isQuota = rawMsg.toLowerCase().includes("quota") || rawMsg.toLowerCase().includes("billing") || rawMsg.toLowerCase().includes("spend");
        const friendlyMsg = isOverloaded
          ? `Gemini is unavailable (503) after ${attempt + 1} attempt${attempt ? "s" : ""}. Try again in a moment, or switch to Claude in Settings.`
          : isQuota
            ? "Gemini quota exceeded. Enable billing in Google AI Studio (aistudio.google.com) — usage stays free within limits, but billing must be active."
            : rawMsg.length > 200 ? rawMsg.slice(0, 200) + "…" : rawMsg;
        const err = new Error(friendlyMsg);
        err.isRateLimit = isQuota;
        throw err;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const d = line.slice(6).trim();
          if (d === "[DONE]") continue;
          try {
            const evt = JSON.parse(d);
            const text = evt.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) onChunk(text);
            // Detect truncation — Gemini signals this in the stream's final event
            const finishReason = evt.candidates?.[0]?.finishReason;
            if (finishReason === "MAX_TOKENS") {
              const err = new Error("Gemini response was truncated — the calendar output was too long. Try again or switch to Claude in Settings.");
              err.isStreamError = true;
              throw err;
            }
          } catch(parseErr) {
            if (parseErr.isStreamError) throw parseErr;
          }
        }
      }
      return; // success — exit retry loop
    }
    }); // end withGeminiQueue
    return;
  }

  // Claude — direct or via proxy
  const url = (useOwn && provider === "claude")
    ? "https://api.anthropic.com/v1/messages"
    : isArtifact()
      ? "https://api.anthropic.com/v1/messages"
      : `${PROXY_BASE}/api/stream`;

  const headers = (useOwn && provider === "claude") || isArtifact()
    ? { "Content-Type": "application/json", "x-api-key": userKey || "", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
    : { "Content-Type": "application/json" };

  const res = await fetch(url, {
    method: "POST", headers,
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, stream: true, messages: [{ role: "user", content: prompt }] }),
    signal,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const err = new Error(e.message || e.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.isRateLimit = res.status === 429;
    throw err;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value, { stream: true }).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const d = line.slice(6).trim();
      if (d === "[DONE]") continue;
      try {
        const evt = JSON.parse(d);
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") onChunk(evt.delta.text);
        if (evt.type === "message_delta" && evt.delta?.stop_reason === "max_tokens") onChunk("\n");
      } catch {}
    }
  }
}

async function callAI(prompt, maxTokens, signal, provider, userKey) {
  const useOwn = provider !== "proxy" && userKey;

  if (useOwn && provider === "gemini") {
    return withGeminiQueue(async () => {
    const model = (() => { try { return localStorage.getItem("gc_gemini_model") || "gemini-2.5-flash"; } catch { return "gemini-2.5-flash"; } })();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${userKey}`;
    // Gemini is significantly more verbose than Claude for JSON — use a generous ceiling
    const geminiTokens = Math.max(maxTokens * 4, 4000);
    // Retry up to 3 times with exponential backoff for 429s
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: geminiTokens, temperature: 0.1, responseMimeType: "application/json" } }),
        signal,
      });
      if (res.status === 429) {
        if (attempt === 2) {
          const err = new Error("Gemini rate limit — too many requests in quick succession. Please wait a moment and try again.");
          err.isRateLimit = true;
          throw err;
        }
        await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      if (res.status === 503 || !res.ok) {
        const e = await res.json().catch(() => ({}));
        const rawMsg = e.error?.message || `Gemini HTTP ${res.status}`;
        const isOverloaded = res.status === 503 || rawMsg.toLowerCase().includes("high demand") || rawMsg.toLowerCase().includes("overloaded");
        if (isOverloaded && attempt < 2) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
          continue;
        }
        throw new Error(rawMsg.length > 200 ? rawMsg.slice(0, 200) + "…" : rawMsg);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      const candidate = data.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const text = candidate?.content?.parts?.[0]?.text || "";
      const cleaned = text.replace(/```json|```/g, "").trim();
      // If truncated, still try to parse — may be salvageable
      try {
        return JSON.parse(cleaned);
      } catch(e) {
        // Try to salvage truncated JSON by finding the last complete object
        const lastBrace = cleaned.lastIndexOf("}");
        if (lastBrace > 0) {
          try { return JSON.parse(cleaned.slice(0, lastBrace + 1)); } catch {}
        }
        const reason = finishReason === "MAX_TOKENS"
          ? "Gemini response was truncated. Try again or switch to Claude."
          : `Gemini returned malformed JSON. Try again or switch to Claude. (${e.message})`;
        throw new Error(reason);
      }
    }
    }); // end withGeminiQueue
  }

  // Claude — direct or via proxy
  const url = (useOwn && provider === "claude")
    ? "https://api.anthropic.com/v1/messages"
    : isArtifact()
      ? "https://api.anthropic.com/v1/messages"
      : `${PROXY_BASE}/api/call`;

  const headers = (useOwn && provider === "claude") || isArtifact()
    ? { "Content-Type": "application/json", "x-api-key": userKey || "", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
    : { "Content-Type": "application/json" };

  const res = await fetch(url, {
    method: "POST", headers,
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    signal,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || data.error);
  const rawText = data.content.map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(rawText);
  } catch(e) {
    // Try to salvage truncated JSON — find the last complete top-level closing brace/bracket
    const lastBrace   = rawText.lastIndexOf("}");
    const lastBracket = rawText.lastIndexOf("]");
    const lastClose   = Math.max(lastBrace, lastBracket);
    if (lastClose > 0) {
      try { return JSON.parse(rawText.slice(0, lastClose + 1)); } catch {}
    }
    console.error("[callAI] JSON parse failed. finish_reason:", data.stop_reason, "raw:", rawText.slice(0, 300));
    throw new Error(`JSON parse failed: ${e.message}`);
  }
}

// Legacy aliases — keep for any code that still calls the old names
async function streamClaude(prompt, maxTokens, onChunk, signal, provider, userKey) {
  return streamAI(prompt, maxTokens, onChunk, signal, provider || "proxy", userKey || "");
}
async function callClaude(prompt, maxTokens, signal, provider, userKey) {
  return callAI(prompt, maxTokens, signal, provider || "proxy", userKey || "");
}

// ─── Nominatim geocoding ──────────────────────────────────────────────────────
// Resolves a city string to { lat, lng, country_code, display_name } via
// OpenStreetMap Nominatim, proxied through /api/geocode so the server can set
// the required User-Agent header.
//
// Results are cached in localStorage keyed by the normalised city string.
// Nominatim enforces 1 req/sec — the cache means this almost never matters in
// practice, but if you do need to hit Nominatim directly, respect the rate limit
// with a ≥1 second gap between requests.
//
// Attribution: Location data © OpenStreetMap contributors, ODbL
//   https://www.openstreetmap.org/copyright
const GEO_CACHE_PREFIX = "gc_geo_v1_";

async function fetchNominatim(cityString) {
  const cacheKey = GEO_CACHE_PREFIX + cityString.trim().toLowerCase();

  // 1. Check localStorage cache — city coordinates never change
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.lat && parsed.lng) {
        console.log("[geocode] cache hit:", cityString, parsed);
        return parsed;
      }
    }
  } catch { /* localStorage unavailable — proceed to network */ }

  // 2. Must have the proxy — Nominatim requires a User-Agent we can't set from the browser
  if (!PROXY_BASE) {
    throw new Error("Nominatim geocoding requires the proxy (VITE_PROXY_URL). In artifact mode this path should not be reached.");
  }

  const url = `${PROXY_BASE}/api/geocode?q=${encodeURIComponent(cityString.trim())}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error("Geocoding service unreachable — check your connection and try again.");
  }

  if (res.status === 404) {
    throw new Error(`Location not found: "${cityString}". Try a more specific name, e.g. "York, England" or "Bordeaux, France".`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Geocoding failed (${res.status}) — check your city name and try again.`);
  }

  const data = await res.json();
  if (!data.lat || !data.lng) {
    throw new Error(`Location not found: "${cityString}".`);
  }

  const result = {
    lat: data.lat,
    lng: data.lng,
    country_code: data.country_code || null,   // lowercase ISO 3166-1 alpha-2, e.g. "gb", "fr", "sg"
    display_name: data.display_name || cityString,
  };

  console.log("[geocode] Nominatim result:", cityString, "→", result);

  // 3. Store in cache
  try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch { /* ignore */ }

  return result;
}

// ─── Line-format stream parser ────────────────────────────────────────────────
// KEY FIXES vs previous version:
// 1. All mutable parser state lives in plain JS variables (never in React state),
//    so React batching can never drop an intermediate update.
// 2. processPartial fires on EVERY chunk — not just recognised prefixes — so the
//    typing cursor always advances even on very long lines.
// 3. React state is updated via a rAF-throttled flush so the UI stays smooth
//    without setState being called hundreds of times per second.
//
// onMonthUpdate(allMonthsSnapshot) — receives the full months map each flush.
function makeLineParser(onFlush, sunByMonth = {}, onSowingMention = null) {
  const monthsMap = {};
  let lineBuffer  = "";
  let currentName = null;
  let lastPrefix  = null;
  let cancelled   = false;
  let dirty       = false; // true when monthsMap has unseen changes

  function cancel() { cancelled = true; }

  function cur() { return currentName ? monthsMap[currentName] : null; }

  function doFlush() {
    if (cancelled || !dirty) return;
    dirty = false;
    const snapshot = {};
    Object.keys(monthsMap).forEach(k => { snapshot[k] = { ...monthsMap[k], tasks:[...monthsMap[k].tasks], enjoy:[...monthsMap[k].enjoy] }; });
    onFlush(snapshot);
  }

  function scheduleFlush() { dirty = true; } // just mark dirty — interval does the rest

  function commitCurrent() {
    const m = cur();
    if (!m) return;
    m._taskPartial  = null;
    m._enjoyPartial = null;
    m._state        = "done";
    currentName     = null;
    scheduleFlush();
  }

  function processLine(line) {
    const l = line.trim();
    if (!l) return;

    if (l.startsWith("MONTH:")) {
      commitCurrent();
      const name = l.slice(6).trim();
      if (!MONTH_NAMES.includes(name)) return;
      monthsMap[name] = { ...emptyMonth(name), _state:"active" };
      // Inject real sun hours from Open-Meteo — never rely on model-generated SUN: field
      if (sunByMonth[name] != null) monthsMap[name].sunHours = sunByMonth[name];
      currentName = name;
      lastPrefix = null;
      scheduleFlush();
      return;
    }

    const m = cur();
    if (!m) return;

    if (l === "---") { lastPrefix = null; commitCurrent(); return; }

    if      (l.startsWith("SEASON:")) { m.season      = l.slice(7).trim();  lastPrefix = null; }
    else if (l.startsWith("SUN:"))    { /* ignored — sun hours come from Open-Meteo via sunByMonth */ lastPrefix = null; }
    else if (l.startsWith("TASK:"))   {
      const taskText = l.slice(5).trim();
      m.tasks.push(taskText);
      m._taskPartial = null;
      lastPrefix = "TASK:";
      // Extract sowing/planting mentions for the cross-batch reminder
      if (onSowingMention) {
        const sowMatch = taskText.match(/\b(sow|plant|start|transplant|propagate)\b.{0,60}/i);
        if (sowMatch) onSowingMention(`${currentName}: ${sowMatch[0].trim()}`);
      }
    }
    else if (l.startsWith("ENJOY:"))  { m.enjoy.push(l.slice(6).trim());  m._enjoyPartial = null; lastPrefix = "ENJOY:"; }
    else if (l.startsWith("INAME:"))  { m.inspiration = { ...(m.inspiration||{}), name:     l.slice(6).trim() }; lastPrefix = null; }
    else if (l.startsWith("ILOC:"))   { m.inspiration = { ...(m.inspiration||{}), location: l.slice(5).trim() }; lastPrefix = null; }
    else if (l.startsWith("IDIST:"))  { m.inspiration = { ...(m.inspiration||{}), distance: l.slice(6).trim() }; lastPrefix = null; }
    else if (l.startsWith("IHIGH:"))  { m.inspiration = { ...(m.inspiration||{}), highlight:l.slice(6).trim() }; lastPrefix = "IHIGH:"; }
    else if (lastPrefix && l.length > 0) {
      // Continuation of a force-split line — re-apply last prefix
      processLine(lastPrefix + l);
      return; // already called scheduleFlush inside recursive call
    }

    scheduleFlush();
  }

  // FIX: update partial on EVERY chunk, not just recognised prefixes.
  // Strip the known prefix if present, otherwise show raw tail so cursor always moves.
  function processPartial(tail) {
    const m = cur();
    if (!m || !tail) return;
    if (tail.startsWith("TASK:"))        { m._taskPartial  = tail.slice(5);  m._enjoyPartial = null; }
    else if (tail.startsWith("ENJOY:"))  { m._enjoyPartial = tail.slice(6);  m._taskPartial  = null; }
    else if (tail.startsWith("MONTH:") ||
             tail.startsWith("SEASON:")||
             tail.startsWith("SUN:")   ||
             tail.startsWith("INAME:")||
             tail.startsWith("ILOC:")  ||
             tail.startsWith("IDIST:")||
             tail.startsWith("IHIGH:")) {
      // Recognised prefix mid-line — clear partials, don't show noise
      m._taskPartial = null; m._enjoyPartial = null;
    } else if (tail.length > 0) {
      // Unknown tail — keep showing whatever was last set so cursor stays visible
      // (don't clear — avoids flicker when prefix hasn't arrived yet)
    }
    scheduleFlush();
  }

  const onChunk = function(chunk) {
    if (cancelled) return;
    lineBuffer += chunk;
    const lines = lineBuffer.split("\n");
    for (let i = 0; i < lines.length - 1; i++) processLine(lines[i]);
    lineBuffer = lines[lines.length - 1];
    // Only force-split truly runaway lines (200+ chars with no \n)
    while (lineBuffer.length > 200) {
      const slice = lineBuffer.slice(0, 200);
      const splitAt = Math.max(slice.lastIndexOf(" "), 50);
      processLine(lineBuffer.slice(0, splitAt).trim());
      lineBuffer = lineBuffer.slice(splitAt).trimStart();
    }
    processPartial(lineBuffer);
  };

  function flush() {
    if (lineBuffer.trim()) {
      processLine(lineBuffer.trim());
      lineBuffer = "";
    }
    if (currentName && monthsMap[currentName]?._state === "active") {
      commitCurrent();
    }
    dirty = true;
    doFlush(); // synchronous — commits final content before post-stream cleanup
  }

  return { onChunk, cancel, flush, doFlush };
}

// ─── Export helpers ───────────────────────────────────────────────────────────

// ─── Garden link & favourites ─────────────────────────────────────────────────
// Encodes garden state (city, orientation, features, plants) into a base64 URL
// fragment. The fragment is never sent to the server and supports non-ASCII
// characters (Greek, French accents, etc.) via the encodeURIComponent wrapper.

const FAVS_KEY   = "gc_favourites_v1";
const MAX_FAVS   = 10;

function encodeGardenState(city, orientation, features, plants) {
  const payload = JSON.stringify({ city, orientation, features, plants });
  // encodeURIComponent handles non-ASCII; btoa handles the resulting ASCII string
  return btoa(unescape(encodeURIComponent(payload)));
}

function decodeGardenState(hash) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(hash))));
  } catch { return null; }
}

function buildGardenUrl(city, orientation, features, plants) {
  const encoded = encodeGardenState(city, orientation, features, plants);
  const base = window.location.href.split("#")[0];
  return `${base}#${encoded}`;
}

function loadFavourites() {
  try { return JSON.parse(localStorage.getItem(FAVS_KEY)) || []; } catch { return []; }
}

function saveFavourites(favs) {
  try { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); } catch {}
}

function addFavourite(city, orientation, features, plants) {
  const favs = loadFavourites();
  const encoded = encodeGardenState(city, orientation, features, plants);
  // Replace existing entry for same city, or prepend new one
  const filtered = favs.filter(f => f.city !== city);
  const updated = [{ city, encoded, savedAt: Date.now() }, ...filtered].slice(0, MAX_FAVS);
  saveFavourites(updated);
  return updated;
}

function removeFavourite(city) {
  const updated = loadFavourites().filter(f => f.city !== city);
  saveFavourites(updated);
  return updated;
}

function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportICS(months, city, gardenUrl) {
  const now = new Date();
  const year = now.getFullYear();
  const thisMonth = now.getMonth();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Garden Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (let i = 1; i <= 12; i++) {
    const mIdx = (thisMonth + i) % 12;
    const mYear = year + Math.floor((thisMonth + i) / 12);
    const mName = MONTH_NAMES[mIdx];
    const m = months[mName];
    if (!m || !m.tasks.length) continue;
    const dateStr = `${mYear}${String(mIdx + 1).padStart(2,"0")}01`;
    const stamp = now.toISOString().replace(/[-:]/g,"").slice(0,15)+"Z";
    const uid = `garden-${mName}-${mYear}@gardenCalendar`;
    const description = m.tasks.map(t => `• ${t}`).join("\\n")
      + (gardenUrl ? `\\n\\nReturn to your garden:\\n${gardenUrl}` : "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${dateStr}`,
      `SUMMARY:🌿 Garden tasks — ${mName}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${city}`,
      ...(gardenUrl ? [`URL:${gardenUrl}`] : []),
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  triggerDownload(lines.join("\r\n"), "garden-calendar.ics", "text/calendar");
}

function exportInsightsHTML(garden, meta, insights, lensData, plants) {
  const city = garden?.city || "Your garden";
  const name = garden?.name || city;
  const allPlants = Object.values(plants).flat();
  const MONTH_ABBR_FULL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Build lens interest table rows
  const lensRows = LENSES.map(lens => {
    const data = lensData[lens.id];
    if (!data) return "";
    const plantRows = allPlants.map(p => {
      const d = data[p];
      if (!d || !d.months) return "";
      const peak = Math.max(...d.months);
      if (peak === 0) return "";
      const bars = d.months.map((v,i) => {
        const shade = ["#eee","#c8a96e88","#c8a96e","#c4664a"][Math.min(v,3)];
        return `<td style="background:${shade};width:24px;height:16px;border-radius:2px;"></td>`;
      }).join("");
      return `<tr><td style="padding:.2rem .4rem;font-size:.8rem;white-space:nowrap">${p}</td>${bars}<td style="padding:.2rem .4rem;font-size:.75rem;color:#666;font-style:italic">${d.descriptor||""}</td></tr>`;
    }).filter(Boolean).join("");
    if (!plantRows) return "";
    return `<h3 style="margin:1.2rem 0 .4rem;font-size:.95rem;color:#3A2210">${lens.emoji} ${lens.name}</h3>
<table style="border-collapse:collapse;width:100%;margin-bottom:.5rem">
<tr><th style="text-align:left;font-size:.7rem;padding:.2rem .4rem;color:#888">Plant</th>
${MONTH_ABBR_FULL.map(m=>`<th style="font-size:.6rem;color:#888;width:24px;text-align:center">${m}</th>`).join("")}
<th style="text-align:left;font-size:.7rem;padding:.2rem .4rem;color:#888">Notes</th></tr>
${plantRows}</table>`;
  }).join("");

  const insightItems = (insights.items||[]).map(item => `
    <div style="margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid #eee">
      <div style="font-weight:600;margin-bottom:.25rem">${item.plant}</div>
      <div style="font-style:italic;margin-bottom:.2rem;color:#3A2210">${item.question}</div>
      <div style="font-size:.88rem;color:#555;margin-bottom:.15rem">${item.context}</div>
      <div style="font-size:.88rem;color:#4a7c59">→ ${item.suggestion}</div>
    </div>`).join("");

  const companions = (insights.companions||[]).length ? `
    <h2 style="font-size:1rem;margin:1.5rem 0 .75rem">Companion Planting Notes</h2>
    ${(insights.companions||[]).map(c=>`
    <div style="display:flex;gap:.5rem;margin-bottom:.5rem;font-size:.88rem">
      <span style="padding:.1rem .4rem;border-radius:2px;font-size:.72rem;font-weight:600;background:${c.type==="good"?"#d4edda":"#f8d7da"};color:${c.type==="good"?"#155724":"#721c24"}">${c.type==="good"?"✓ Good":"✗ Avoid"}</span>
      <span><strong>${c.pair}</strong>${c.reason?` — ${c.reason}`:""}</span>
    </div>`).join("")}` : "";

  const metaLine = meta ? `${meta.climate} · Zone ${meta.zone} · Last frost ${meta.lastFrost}` : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Garden Insights — ${name}</title>
<style>body{font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:2rem;color:#2C1A0A}h1{font-size:1.4rem;margin-bottom:.2rem}@media print{body{padding:1rem}}</style>
</head><body>
<h1>${name}</h1>
${metaLine ? `<p style="color:#7A8C6A;font-style:italic;margin:.2rem 0 1.5rem;font-size:.9rem">${metaLine}</p>` : ""}
${insightItems ? `<h2 style="font-size:1rem;margin:0 0 .75rem">Garden Insights</h2>${insightItems}` : ""}
${companions}
${lensRows ? `<h2 style="font-size:1rem;margin:1.5rem 0 .5rem">Year-Round Interest</h2>${lensRows}` : ""}
<p style="font-size:.7rem;color:#aaa;margin-top:2rem;border-top:1px solid #eee;padding-top:.75rem">Generated by The Garden Calendar · ${new Date().toLocaleDateString()}</p>
</body></html>`;

  const blob = new Blob([html], { type:"text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `garden-insights-${city.toLowerCase().replace(/\s+/g,"-")}.html`;
  a.click(); URL.revokeObjectURL(url);
}

function exportPDF(months, city, meta, gardenUrl) {
  const year = new Date().getFullYear();
  const thisMonth = new Date().getMonth();
  const ordered = Array.from({length:12}, (_,i) => MONTH_NAMES[(thisMonth + 1 + i) % 12]);
  const SEASON_COLORS = {Winter:"#7BA7BC",Spring:"#7BAF7B",Summer:"#C9A84C",Autumn:"#C4703A"};

  const monthHTML = ordered.map(name => {
    const m = months[name];
    if (!m || m._state === "pending") return "";
    const mIdx = MONTH_NAMES.indexOf(name);
    const mYear = year + (mIdx <= thisMonth ? 1 : 0);
    const color = SEASON_COLORS[m.season] || "#7BAF7B";
    const tasks = m.tasks.map(t => `<li>${t}</li>`).join("");
    const enjoy = m.enjoy.map(e => `<li>${e}</li>`).join("");
    return `
      <div class="month-block">
        <div class="month-header" style="border-left:4px solid ${color}">
          <span class="month-name">${name} ${mYear}</span>
          <span class="month-season" style="color:${color}">${m.season || ""}</span>
        </div>
        ${tasks ? `<div class="section-label">Things to do</div><ul>${tasks}</ul>` : ""}
        ${enjoy ? `<div class="section-label">What to enjoy</div><ul>${enjoy}</ul>` : ""}
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Garden Calendar — ${city}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 680px; margin: 0 auto; padding: 2rem; color: #2C1A0A; }
    h1 { font-size: 1.6rem; margin-bottom: .25rem; }
    .subtitle { color: #7a6040; font-size: .9rem; margin-bottom: 2rem; }
    .month-block { margin-bottom: 2rem; page-break-inside: avoid; }
    .month-header { padding: .4rem .8rem; background: #faf6ef; margin-bottom: .6rem; display:flex; justify-content:space-between; align-items:baseline; }
    .month-name { font-size: 1.15rem; font-weight: bold; }
    .month-season { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; }
    .section-label { font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; color: #9a7a50; margin: .5rem 0 .2rem; }
    ul { margin: 0; padding-left: 1.2rem; }
    li { margin-bottom: .25rem; font-size: .9rem; line-height: 1.5; }
    .return-link { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #e0d4b8; font-size: .8rem; color: #9a7a50; }
    .return-link a { color: #5c7a4a; word-break: break-all; }
    @media print { body { padding: 1rem; } }
  </style></head><body>
  <h1>🌿 Garden Calendar</h1>
  <div class="subtitle">${city}${meta?.zone ? ` · ${meta.zone}` : ""}${meta?.climate ? ` · ${meta.climate}` : ""}</div>
  ${monthHTML}
  ${gardenUrl ? `<div class="return-link">Return to your garden: <a href="${gardenUrl}">${gardenUrl}</a></div>` : ""}
  </body></html>`;

  triggerDownload(html, "garden-calendar.html", "text/html");
}

// ─── Plant → Botanical Illustration lookup ────────────────────────────────────
// Curated Wikimedia Commons filenames — public domain, print-resolution plates
// Primarily from Köhler's Medizinal-Pflanzen (1887) and Curtis's Botanical Magazine
const PLANT_ILLUSTRATIONS = {
  // Flowers
  'rose':         'Rosa_centifolia_-_Köhler–s_Medizinal-Pflanzen-257.jpg',
  'wisteria':     'Wisteria_sinensis_-_Köhler–s_Medizinal-Pflanzen-285.jpg',
  'lavender':     'Lavandula_angustifolia_-_Köhler–s_Medizinal-Pflanzen-088.jpg',
  'peony':        'Paeonia_officinalis_-_Köhler–s_Medizinal-Pflanzen-164.jpg',
  'iris':         'Iris_germanica_-_Köhler–s_Medizinal-Pflanzen-187.jpg',
  'tulip':        'Tulipa_gesneriana_-_Köhler–s_Medizinal-Pflanzen-272.jpg',
  'sunflower':    'Helianthus_annuus_-_Köhler–s_Medizinal-Pflanzen-078.jpg',
  'dahlia':       'Dahlia_pinnata_Cav._(1802).jpg',
  'bougainvillea':'Bougainvillea_spectabilis_Willd.jpg',
  'pelargonium':  'Pelargonium_zonale_-_Köhler–s_Medizinal-Pflanzen-233.jpg',
  'marigold':     'Tagetes_erecta_-_Köhler–s_Medizinal-Pflanzen-268.jpg',
  'camellia':     'Camellia_japonica_-_Köhler–s_Medizinal-Pflanzen-025.jpg',
  'magnolia':     'Magnolia_grandiflora_-_Köhler–s_Medizinal-Pflanzen-097.jpg',
  'oleander':     'Nerium_oleander_-_Köhler–s_Medizinal-Pflanzen-124.jpg',
  'foxglove':     'Digitalis_purpurea_-_Köhler–s_Medizinal-Pflanzen-052.jpg',
  'hydrangea':    'Hydrangea_macrophylla_SZ85.png',
  'allium':       'Allium_cepa_-_Köhler–s_Medizinal-Pflanzen-009.jpg',
  'lupin':        'Lupinus_polyphyllus_-_Köhler–s_Medizinal-Pflanzen-096.jpg',
  // Herbs
  'rosemary':     'Rosmarinus_officinalis_-_Köhler–s_Medizinal-Pflanzen-244.jpg',
  'thyme':        'Thymus_vulgaris_-_Köhler–s_Medizinal-Pflanzen-271.jpg',
  'basil':        'Ocimum_basilicum_-_Köhler–s_Medizinal-Pflanzen-126.jpg',
  'mint':         'Mentha_piperita_-_Köhler–s_Medizinal-Pflanzen-112.jpg',
  'sage':         'Salvia_officinalis_-_Köhler–s_Medizinal-Pflanzen-246.jpg',
  'parsley':      'Petroselinum_crispum_-_Köhler–s_Medizinal-Pflanzen-168.jpg',
  'chives':       'Allium_schoenoprasum_-_Köhler–s_Medizinal-Pflanzen-008.jpg',
  'tarragon':     'Artemisia_dracunculus_-_Köhler–s_Medizinal-Pflanzen-018.jpg',
  'fennel':       'Foeniculum_vulgare_-_Köhler–s_Medizinal-Pflanzen-063.jpg',
  'oregano':      'Origanum_vulgare_-_Köhler–s_Medizinal-Pflanzen-156.jpg',
  // Fruit (USDA Pomological where available — exceptional quality)
  'apple':        'Malus_domestica_-_Köhler–s_Medizinal-Pflanzen-101.jpg',
  'fig':          'Ficus_carica_-_Köhler–s_Medizinal-Pflanzen-057.jpg',
  'grape':        'Vitis_vinifera_-_Köhler–s_Medizinal-Pflanzen-280.jpg',
  'peach':        'Prunus_persica_-_Köhler–s_Medizinal-Pflanzen-183.jpg',
  'cherry':       'Prunus_cerasus_-_Köhler–s_Medizinal-Pflanzen-180.jpg',
  'apricot':      'Prunus_armeniaca_-_Köhler–s_Medizinal-Pflanzen-179.jpg',
  'strawberry':   'Fragaria_vesca_-_Köhler–s_Medizinal-Pflanzen-065.jpg',
  'almond':       'Prunus_dulcis_-_Köhler–s_Medizinal-Pflanzen-177.jpg',
  'quince':       'Cydonia_oblonga_-_Köhler–s_Medizinal-Pflanzen-047.jpg',
  'mulberry':     'Morus_nigra_-_Köhler–s_Medizinal-Pflanzen-119.jpg',
  'lemon':        'Citrus_limon_-_Köhler–s_Medizinal-Pflanzen-036.jpg',
  'orange':       'Citrus_sinensis_-_Köhler–s_Medizinal-Pflanzen-037.jpg',
  // Veg
  'tomato':       'Solanum_lycopersicum_-_Köhler–s_Medizinal-Pflanzen-254.jpg',
  'courgette':    'Cucurbita_pepo_-_Köhler–s_Medizinal-Pflanzen-045.jpg',
  'aubergine':    'Solanum_melongena_-_Köhler–s_Medizinal-Pflanzen-253.jpg',
  'pepper':       'Capsicum_annuum_-_Köhler–s_Medizinal-Pflanzen-027.jpg',
  'carrot':       'Daucus_carota_-_Köhler–s_Medizinal-Pflanzen-049.jpg',
  'lettuce':      'Lactuca_sativa_-_Köhler–s_Medizinal-Pflanzen-087.jpg',
  // Trees / Shrubs
  'olive':        'Olea_europaea_-_Köhler–s_Medizinal-Pflanzen-130.jpg',
  'box':          'Buxus_sempervirens_-_Köhler–s_Medizinal-Pflanzen-024.jpg',
  'boxwood':      'Buxus_sempervirens_-_Köhler–s_Medizinal-Pflanzen-024.jpg',
  'cypress':      'Cupressus_sempervirens_-_Köhler–s_Medizinal-Pflanzen-046.jpg',
  'linden':       'Tilia_cordata_-_Köhler–s_Medizinal-Pflanzen-270.jpg',
};

function getIllustrationUrl(plantName) {
  const key = plantName.toLowerCase().trim();
  const filename = PLANT_ILLUSTRATIONS[key];
  if (!filename) return null;
  const encoded = encodeURIComponent(filename);
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=400`;
}

// ─── Simple inline QR code generator (pure SVG, no library needed) ───────────
// Generates a basic 21×21 QR code visual placeholder
// In production, replace with actual qrcode library call
function makeQRSvg(size = 48) {
  // Placeholder pattern — production would use qrcode-svg npm package
  return `<svg width="${size}" height="${size}" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
    <rect width="21" height="21" fill="white"/>
    <rect x="0" y="0" width="7" height="7" fill="none" stroke="#2C1A0A" stroke-width="1"/>
    <rect x="2" y="2" width="3" height="3" fill="#2C1A0A"/>
    <rect x="14" y="0" width="7" height="7" fill="none" stroke="#2C1A0A" stroke-width="1"/>
    <rect x="16" y="2" width="3" height="3" fill="#2C1A0A"/>
    <rect x="0" y="14" width="7" height="7" fill="none" stroke="#2C1A0A" stroke-width="1"/>
    <rect x="2" y="16" width="3" height="3" fill="#2C1A0A"/>
    <rect x="9" y="0" width="1" height="2" fill="#2C1A0A"/>
    <rect x="11" y="1" width="2" height="1" fill="#2C1A0A"/>
    <rect x="9" y="9" width="2" height="2" fill="#2C1A0A"/>
    <rect x="12" y="9" width="1" height="2" fill="#2C1A0A"/>
    <rect x="14" y="9" width="3" height="1" fill="#2C1A0A"/>
    <rect x="9" y="12" width="2" height="1" fill="#2C1A0A"/>
    <rect x="12" y="12" width="2" height="2" fill="#2C1A0A"/>
    <rect x="16" y="11" width="2" height="2" fill="#2C1A0A"/>
    <rect x="19" y="9" width="2" height="2" fill="#2C1A0A"/>
    <rect x="9" y="15" width="1" height="2" fill="#2C1A0A"/>
    <rect x="11" y="14" width="2" height="2" fill="#2C1A0A"/>
    <rect x="14" y="16" width="2" height="2" fill="#2C1A0A"/>
    <rect x="17" y="14" width="2" height="1" fill="#2C1A0A"/>
    <rect x="19" y="16" width="2" height="2" fill="#2C1A0A"/>
  </svg>`;
}

// ─── Calendar Page HTML Generator ────────────────────────────────────────────
async function generateCalendarPageHTML({ monthName, monthIndex, year, gardenName, city, meta, monthData, inspoData, lensData, allPlants, insights }) {
  const cd = meta?._cd;

  // Weather stats for this month
  const tempMin  = cd?.tMin?.[monthIndex]  != null ? Math.round(cd.tMin[monthIndex])  : null;
  const tempMax  = cd?.tMax?.[monthIndex]  != null ? Math.round(cd.tMax[monthIndex])  : null;
  const precip   = cd?.precip?.[monthIndex]!= null ? Math.round(cd.precip[monthIndex]): null;
  const sunHrs   = cd?.sunHrs?.[monthIndex]!= null ? (cd.sunHrs[monthIndex]).toFixed(1): null;
  const tempAvg  = (tempMin != null && tempMax != null) ? Math.round((tempMin + tempMax) / 2) : null;

  // Compare to previous month
  const prevIdx  = (monthIndex + 11) % 12;
  const prevAvg  = cd?.tMean?.[prevIdx] != null ? Math.round(cd.tMean[prevIdx]) : null;
  const prevName = MONTH_NAMES[prevIdx].slice(0, 3);
  const tempDiff = tempAvg != null && prevAvg != null ? tempAvg - prevAvg : null;
  const tempDiffStr = tempDiff != null
    ? (tempDiff >= 0 ? `+${tempDiff}°` : `${tempDiff}°`) + ` vs ${prevName}`
    : '';

  const prevSun  = cd?.sunHrs?.[prevIdx];
  const sunDiff  = (sunHrs != null && prevSun != null)
    ? ((parseFloat(sunHrs) - prevSun) >= 0 ? '+' : '') + (parseFloat(sunHrs) - prevSun).toFixed(1) + `hrs vs ${prevName}`
    : '';

  const prevPrecip = cd?.precip?.[prevIdx] != null ? Math.round(cd.precip[prevIdx]) : null;
  const precipDiff = precip != null && prevPrecip != null ? precip - prevPrecip : null;
  const precipDiffStr = precipDiff != null
    ? (precipDiff >= 0 ? `+${precipDiff}mm` : `${precipDiff}mm`) + ` vs ${prevName}`
    : (precip != null ? (precip < 30 ? 'dry month' : precip < 70 ? 'moderate' : 'wet month') : '');

  // Season
  const season = monthData?.season || ['Winter','Winter','Spring','Spring','Spring','Summer','Summer','Summer','Autumn','Autumn','Autumn','Winter'][monthIndex];

  // Fetch illustration URLs via Wikipedia REST API (CORS-friendly)
  const fetchWikiThumb = async (scientificName) => {
    try {
      const slug = encodeURIComponent(scientificName.replace(/ /g, '_'));
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
        headers: { Accept: 'application/json' }
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d?.thumbnail?.source || null;
    } catch { return null; }
  };

  // Scientific names for illustration lookup (same mapping as PLANT_ILLUSTRATIONS keys)
  const PLANT_SCI_NAMES = {
    'rose':'Rosa centifolia','wisteria':'Wisteria sinensis','lavender':'Lavandula angustifolia',
    'peony':'Paeonia officinalis','iris':'Iris germanica','tulip':'Tulipa gesneriana',
    'sunflower':'Helianthus annuus','dahlia':'Dahlia pinnata','camellia':'Camellia japonica',
    'magnolia':'Magnolia grandiflora','oleander':'Nerium oleander','foxglove':'Digitalis purpurea',
    'rosemary':'Rosmarinus officinalis','thyme':'Thymus vulgaris','basil':'Ocimum basilicum',
    'mint':'Mentha piperita','sage':'Salvia officinalis','parsley':'Petroselinum crispum',
    'chives':'Allium schoenoprasum','tarragon':'Artemisia dracunculus','fennel':'Foeniculum vulgare',
    'oregano':'Origanum vulgare','apple':'Malus domestica','fig':'Ficus carica',
    'grape':'Vitis vinifera','peach':'Prunus persica','cherry':'Prunus cerasus',
    'apricot':'Prunus armeniaca','strawberry':'Fragaria vesca','almond':'Prunus dulcis',
    'olive':'Olea europaea','tomato':'Solanum lycopersicum','courgette':'Cucurbita pepo',
    'aubergine':'Solanum melongena','pepper':'Capsicum annuum','carrot':'Daucus carota',
    'lettuce':'Lactuca sativa','lemon':'Citrus limon','orange':'Citrus sinensis',
    'mulberry':'Morus nigra','hydrangea':'Hydrangea macrophylla','allium':'Allium cepa',
    'lupin':'Lupinus polyphyllus','marigold':'Tagetes erecta','pelargonium':'Pelargonium zonale',
  };

  // Tasks and enjoy
  const tasks  = monthData?.tasks  || [];
  const enjoy  = monthData?.enjoy  || [];

  // Peak plants for this month — find plants with high lens score
  const peakPlants = [];
  if (lensData?.colour) {
    const allP = Object.values(allPlants).flat();
    allP.forEach(p => {
      const d = lensData.colour[p];
      if (d?.months?.[monthIndex] >= 2) peakPlants.push(p);
    });
  }

  // Extract plant names mentioned in enjoy lines — filters out wildlife (birds, insects etc.)
  // by only matching names that are in the garden inventory
  const allPlantsList = Object.values(allPlants).flat();
  const enjoyText = (monthData?.enjoy || []).join(' ').toLowerCase();
  const enjoyPlants = allPlantsList.filter(p => enjoyText.includes(p.toLowerCase()));

  // Candidate order: plants in enjoy text first (most visually relevant this month),
  // then peak lens plants, then rest of inventory — all filtered to plants only (no wildlife)
  const illustrationCandidates = [
    ...enjoyPlants,
    ...peakPlants.filter(p => !enjoyPlants.includes(p)),
    ...allPlantsList.filter(p => !enjoyPlants.includes(p) && !peakPlants.includes(p)),
  ];

  // Fetch illustration URLs via Wikipedia REST API — try each candidate until we get 2 images
  const fetchWikiThumbForPlant = async (plantName) => {
    const sci = PLANT_SCI_NAMES[plantName.toLowerCase()];
    if (!sci) return null;
    // Try full scientific name, then genus only, then common name directly
    return await fetchWikiThumb(sci)
        || await fetchWikiThumb(sci.split(' ')[0])
        || await fetchWikiThumb(plantName);
  };

  const illus = [];
  for (const p of illustrationCandidates) {
    if (illus.length >= 2) break;
    const url = await fetchWikiThumbForPlant(p);
    if (url) illus.push({ plant: p, url });
  }

  // Inspo garden + fetch its Wikipedia photo
  const inspo = inspoData?.state === 'done' ? inspoData.data : null;
  const mapsUrl = inspo?.location
    ? `https://www.google.com/maps/dir/${encodeURIComponent(city)}/${encodeURIComponent((inspo.name || '') + ', ' + inspo.location)}`
    : null;
  const inspoPhotoUrl = inspo?.wikipedia
    ? await fetchWikiThumb(inspo.wikipedia) || await fetchWikiThumb(inspo.name)
    : inspo?.name
      ? await fetchWikiThumb(inspo.name)
      : null;

  // Lens values for this month (0–3 scale → percentage)
  const LENSES_PRINT = [
    { id: 'colour',   label: 'Colour',   color: 'linear-gradient(90deg,#C4664A,#E08040)' },
    { id: 'scent',    label: 'Scent',    color: 'linear-gradient(90deg,#5A7A32,#7AAA42)' },
    { id: 'form',     label: 'Form',     color: 'linear-gradient(90deg,#8B6914,#BBA030)' },
    { id: 'texture',  label: 'Texture',  color: 'linear-gradient(90deg,#8B6914,#BBA030)' },
    { id: 'cropping', label: 'Cropping', color: 'linear-gradient(90deg,#2C6B3A,#4A8A52)' },
  ];

  const lensRows = LENSES_PRINT.map(lens => {
    const data = lensData?.[lens.id];
    if (!data) return null;
    const allP = Object.values(allPlants).flat();
    const scores = allP.map(p => data[p]?.months?.[monthIndex] || 0);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const pct = Math.round((avg / 3) * 100);
    const label = pct >= 60 ? 'High' : pct >= 35 ? 'Med' : 'Low';
    return { ...lens, pct, label };
  }).filter(Boolean);

  // Insights — pick up to 3 most relevant items for this month's plants
  const insightItems = insights?.state === 'done' ? (insights.items || []).slice(0, 3) : [];
  const companions   = insights?.state === 'done' ? (insights.companions || []).slice(0, 2) : [];

  const gardenUrl = `https://garden-calendar.vercel.app`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" integrity="sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSe2HkjoPqABNAT1XHaUPauUpKoZwKqk9Whw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { width:1240px; height:874px; background:#FDFAF4; font-family:'Crimson Pro',Georgia,serif; color:#2C1A0A; overflow:hidden; }
  .page { display:grid; grid-template-columns:360px 1fr 220px; grid-template-rows:56px 1fr 44px; height:100%; }
  .header { grid-column:1/-1; display:flex; align-items:center; justify-content:space-between; padding:0 24px; background:#2C1A0A; color:#F5EDD8; border-bottom:2px solid #8B6914; }
  .hdr-left { display:flex; align-items:baseline; gap:12px; }
  .hdr-month { font-family:'Playfair Display',serif; font-size:28px; font-style:italic; letter-spacing:.03em; }
  .hdr-season { font-size:13px; color:#C4A55A; letter-spacing:.09em; text-transform:uppercase; }
  .hdr-garden { font-size:12px; color:#A09070; letter-spacing:.1em; text-transform:uppercase; }
  .col-illus { grid-column:1; grid-row:2; display:flex; flex-direction:column; border-right:1.5px solid rgba(139,105,20,.2); background:#F7F2E8; overflow:hidden; }
  .col-content { grid-column:2; grid-row:2; padding:14px 18px 12px; display:flex; flex-direction:column; gap:0; border-right:1.5px solid rgba(139,105,20,.2); overflow:hidden; justify-content:space-between; }
  .col-inspo { grid-column:3; grid-row:2; padding:13px 16px 12px 13px; display:flex; flex-direction:column; gap:9px; overflow:hidden; }
  .illus-primary { flex:1; overflow:hidden; }
  .illus-primary img { width:100%; height:100%; object-fit:contain; mix-blend-mode:multiply; filter:sepia(12%) contrast(1.05); display:block; }
  .illus-divider { height:1px; background:rgba(139,105,20,.2); margin:0 16px; }
  .illus-secondary { height:175px; overflow:hidden; }
  .illus-secondary img { width:100%; height:100%; object-fit:contain; mix-blend-mode:multiply; filter:sepia(12%) contrast(1.05); display:block; }
  .illus-caption { font-style:italic; font-size:10px; color:#7A5C2A; text-align:center; letter-spacing:.03em; padding:5px 8px; background:#F0EBE0; display:flex; justify-content:space-between; align-items:center; }
  .illus-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#F0EAD8; }
  .illus-placeholder-text { font-style:italic; font-size:11px; color:#A08050; text-align:center; padding:8px; }
  .weather-box { background:linear-gradient(135deg,#1E3A2A,#2C4A1A,#1A2C1A); border-radius:3px; padding:10px 12px; color:#D4EAC4; display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px 10px; border:1px solid rgba(90,140,60,.3); flex-shrink:0; }
  .weather-box-title { grid-column:1/-1; font-family:'Playfair Display',serif; font-size:9.5px; text-transform:uppercase; letter-spacing:.12em; color:#90C070; opacity:.8; margin-bottom:2px; }
  .wx-item { display:flex; flex-direction:column; gap:1px; }
  .wx-val { font-size:16px; font-weight:600; line-height:1; }
  .wx-val.temp { color:#F0C060; }
  .wx-val.rain { color:#90C8F0; }
  .wx-val.sun  { color:#F0D890; }
  .wx-label { font-size:9.5px; color:#90AA80; letter-spacing:.04em; }
  .wx-sub { font-size:9px; color:#70906A; font-style:italic; }
  .sec-label { font-family:'Playfair Display',serif; font-size:10px; text-transform:uppercase; letter-spacing:.14em; color:#7A5C2A; border-bottom:1px solid rgba(139,105,20,.22); padding-bottom:3px; margin-bottom:5px; }
  .task-list, .enjoy-list { list-style:none; display:flex; flex-direction:column; gap:7px; }
  .task-list li { font-size:13.5px; line-height:1.5; padding-left:20px; position:relative; color:#1A0E06; }
  .task-list li::before { content:""; position:absolute; left:0; top:3px; width:11px; height:11px; border:1.5px solid #8B6914; border-radius:2px; background:white; }
  .enjoy-list li { font-size:13.5px; line-height:1.5; padding-left:18px; position:relative; color:#1A0E06; }
  .enjoy-list li::before { content:"✦"; position:absolute; left:1px; color:#5A7A32; font-size:9px; top:4px; }
  .lens-strip { flex-shrink:0; padding-top:8px; }
  .lens-row { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
  .lens-name { font-size:9.5px; color:#7A5C2A; width:52px; text-align:right; font-style:italic; flex-shrink:0; }
  .lens-track { flex:1; height:8px; background:rgba(139,105,20,.1); border-radius:4px; overflow:hidden; }
  .lens-fill { height:100%; border-radius:4px; }
  .lens-val { font-size:9px; color:#9A7A3A; width:24px; text-align:right; flex-shrink:0; }
  .notes-box { border:1.5px solid rgba(139,105,20,.3); border-radius:3px; padding:10px 12px; flex-shrink:0; margin-top:8px; }
  .notes-label { font-family:'Playfair Display',serif; font-size:9px; text-transform:uppercase; letter-spacing:.14em; color:#8B6914; margin-bottom:8px; display:block; }
  .notes-line { height:1px; background:rgba(139,105,20,.2); margin-bottom:10px; border-radius:1px; }
  .inspo-img { width:100%; flex:1; border-radius:2px; overflow:hidden; background:#E8E0D0; min-height:0; position:relative; }
  .inspo-img img { width:100%; height:100%; object-fit:cover; filter:sepia(10%) contrast(1.05) saturate(.9); display:block; }
  .inspo-img-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#C8DEB8,#A8C898); }
  .inspo-name { font-family:'Playfair Display',serif; font-size:12px; font-style:italic; color:#2C1A0A; line-height:1.3; }
  .inspo-detail { font-size:10px; color:#7A5C2A; line-height:1.4; }
  .inspo-highlight { font-size:10px; color:#4A3520; font-style:italic; line-height:1.4; }
  .qr-row { display:flex; align-items:center; gap:8px; flex-shrink:0; }
  .qr-box { width:36px; height:36px; border:1.5px solid #8B6914; border-radius:2px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:white; }
  .qr-label { font-size:9.5px; color:#7A5C2A; font-style:italic; line-height:1.45; }
  .quote { padding-top:8px; border-top:1px solid rgba(139,105,20,.2); font-style:italic; font-size:10.5px; line-height:1.55; color:#4A3520; flex-shrink:0; }
  .quote-attr { font-style:normal; font-size:9.5px; color:#8B6914; margin-top:3px; }
  .footer { grid-column:1/-1; display:flex; align-items:center; justify-content:space-between; padding:0 24px; border-top:1px solid rgba(139,105,20,.25); background:rgba(139,105,20,.05); }
  .footer-climate { font-size:9px; color:#7A5C2A; font-style:italic; }
  .footer-centre { font-family:'Playfair Display',serif; font-size:10px; font-style:italic; color:#8B6914; }
  .footer-app { display:flex; align-items:center; gap:7px; }
  .footer-qr-box { width:28px; height:28px; border:1px solid rgba(139,105,20,.4); border-radius:2px; display:flex; align-items:center; justify-content:center; background:white; }
  .footer-qr-label { font-size:9px; color:#8B6914; font-style:italic; line-height:1.4; }
  .insights-section { margin-top:8px; padding:8px 10px; background:rgba(139,105,20,.05); border-radius:3px; border:1px solid rgba(139,105,20,.18); flex-shrink:0; }
  .insight-item-print { margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid rgba(139,105,20,.12); }
  .insight-item-print:last-child { margin-bottom:0; padding-bottom:0; border-bottom:none; }
  .insight-plant-print { font-family:'Playfair Display',serif; font-size:10.5px; font-style:italic; color:#2C1A0A; margin-bottom:1px; }
  .insight-tip-print { font-size:10px; color:#4A3520; line-height:1.4; }
  .companion-print { font-size:10px; line-height:1.4; }
  .companion-good { color:#3A6A20; }
  .companion-warn { color:#8A3A10; }
</style>
</head>
<body>
<div class="page">

<header class="header">
  <div class="hdr-left">
    <span class="hdr-month">${monthName} ${year}</span>
    <span class="hdr-season">${season}</span>
  </div>
  <div class="hdr-garden">${gardenName || city || 'Your Garden'}</div>
</header>

<!-- LEFT: ILLUSTRATIONS -->
<div class="col-illus">
  <div class="illus-primary">
    ${illus[0]?.url
      ? `<img src="${illus[0]?.url}" alt="${illus[0]?.plant} botanical illustration" style="width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply;filter:sepia(12%) contrast(1.05);display:block"/>`
      : `<div class="illus-placeholder"><div class="illus-placeholder-text">${monthName}<br>garden illustration</div></div>`
    }
  </div>
  ${illus[0] || illus[1] ? '<div class="illus-divider"></div>' : ''}
  ${illus[1]
    ? `<div class="illus-secondary"><img src="${illus[1]?.url}" alt="${illus[1]?.plant}" style="width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply;filter:sepia(12%) contrast(1.05);display:block"/></div>`
    : illus[0] ? `<div class="illus-secondary"><div class="illus-placeholder"><div class="illus-placeholder-text">${season}</div></div></div>` : ''
  }
  <div class="illus-caption">
    <span>${illus[0]?.plant || monthName}</span>
    <span>${illus[1]?.plant || season}</span>
  </div>
</div>

<!-- CENTRE: WEATHER + TASKS + ENJOY + LENS + NOTES -->
<div class="col-content">

  <div style="flex-shrink:0">
    <div class="weather-box">
      <div class="weather-box-title">${monthName} averages · ${city}</div>
      <div class="wx-item">
        <span class="wx-val temp">${tempMin != null ? `${tempMin}–${tempMax}°C` : '—'}</span>
        <span class="wx-label">Temperature</span>
        <span class="wx-sub">${tempAvg != null ? `avg ${tempAvg}°C` : ''}${tempDiffStr ? ` · ${tempDiffStr}` : ''}</span>
      </div>
      <div class="wx-item">
        <span class="wx-val rain">${precip != null ? `${precip} mm` : '—'}</span>
        <span class="wx-label">Rainfall</span>
        <span class="wx-sub">${precipDiffStr}</span>
      </div>
      <div class="wx-item">
        <span class="wx-val sun">${sunHrs != null ? `${sunHrs} hrs` : '—'}</span>
        <span class="wx-label">Sunshine / day</span>
        <span class="wx-sub">${sunDiff || ''}</span>
      </div>
    </div>
  </div>

  <div style="flex:1;min-height:0;padding-top:10px">
    <div class="sec-label">Things to do</div>
    <ul class="task-list">
      ${tasks.map(t => `<li>${t}</li>`).join('\n      ')}
    </ul>
  </div>

  <div style="flex:1;min-height:0;padding-top:10px">
    <div class="sec-label">Things to enjoy</div>
    <ul class="enjoy-list">
      ${enjoy.map(e => `<li>${e}</li>`).join('\n      ')}
    </ul>
  </div>

  ${lensRows.length > 0 ? `
  <div class="lens-strip">
    <div class="sec-label" style="margin-bottom:7px">Garden interest · ${monthName}</div>
    ${lensRows.map(l => `
    <div class="lens-row">
      <span class="lens-name">${l.label}</span>
      <div class="lens-track"><div class="lens-fill" style="width:${l.pct}%;background:${l.color}"></div></div>
      <span class="lens-val">${l.label2 || l.label.slice(0,3)}</span>
    </div>`).join('')}
  </div>` : ''}

  <div class="notes-box">
    <span class="notes-label">Notes</span>
    <div class="notes-line"></div>
    <div class="notes-line"></div>
    <div class="notes-line"></div>
    <div class="notes-line"></div>
    <div class="notes-line"></div>
  </div>
</div>

<!-- RIGHT: INSPO + QR + QUOTE -->
<div class="col-inspo">
  <div class="sec-label">Garden to visit</div>
  <div class="inspo-img">
    ${inspoPhotoUrl
      ? `<img src="${inspoPhotoUrl}" alt="${inspo?.name || 'garden'}" style="width:100%;height:100%;object-fit:cover;filter:sepia(10%) contrast(1.05) saturate(.9);display:block"/>`
      : inspo
      ? `<div class="inspo-img-placeholder">
           <svg viewBox="0 0 210 200" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
             <defs><linearGradient id="sky${monthIndex}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7BB8D8"/><stop offset="100%" stop-color="#B8D8E8"/></linearGradient></defs>
             <rect width="210" height="200" fill="url(#sky${monthIndex})"/>
             <ellipse cx="50" cy="28" rx="28" ry="14" fill="white" opacity=".7"/>
             <ellipse cx="160" cy="20" rx="22" ry="11" fill="white" opacity=".65"/>
             <ellipse cx="105" cy="165" rx="140" ry="55" fill="#6AAA42"/>
             <rect y="152" width="210" height="48" fill="#4A8A28"/>
             <rect x="80" y="85" width="60" height="67" fill="rgba(200,225,240,.75)" stroke="#8A9890" stroke-width="1.5"/>
             <polygon points="80,85 110,62 140,85" fill="rgba(210,230,245,.8)" stroke="#8A9890" stroke-width="1.5"/>
             <line x1="110" y1="62" x2="110" y2="152" stroke="#8A9890" stroke-width=".8"/>
             <line x1="80" y1="110" x2="140" y2="110" stroke="#8A9890" stroke-width=".8"/>
             <rect x="40" y="78" width="5" height="58" fill="#5A3A18"/>
             <ellipse cx="42" cy="70" rx="20" ry="24" fill="#2A6A18"/>
             <rect y="170" width="210" height="30" fill="rgba(44,26,10,.5)"/>
             <text x="105" y="189" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="11" fill="#F5EDD8">${inspo.name || 'Garden'}</text>
           </svg>
         </div>`
      : `<div class="inspo-img-placeholder">
           <svg viewBox="0 0 210 200" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
             <rect width="210" height="200" fill="#D8E8C8"/>
             <text x="105" y="95" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="11" fill="#5A7A3A">Visit a garden</text>
             <text x="105" y="112" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="10" fill="#7A9A5A">this ${monthName}</text>
           </svg>
         </div>`
    }
  </div>

  ${inspo ? `
  <div class="inspo-name">${inspo.name}</div>
  <div class="inspo-detail">${inspo.location || ''}${inspo.distance ? ` · ${inspo.distance}` : ''}</div>
  ${inspo.highlight ? `<div class="inspo-highlight">${inspo.highlight}</div>` : ''}

  ${mapsUrl ? `
  <div class="qr-row">
    <div class="qr-box"><div id="qr-directions" style="width:34px;height:34px"></div></div>
    <div class="qr-label">Directions<br>to ${(inspo.name?.split(' ')[0] || 'garden')} ↗</div>
  </div>` : ''}` : `
  <div class="inspo-detail" style="font-style:italic;opacity:.6">Generate inspo gardens<br>in the app to populate<br>this section</div>`}

  ${insightItems.length > 0 ? `
  <div class="insights-section">
    <div class="sec-label" style="margin-bottom:6px">Garden insights</div>
    ${insightItems.map(item => `
    <div class="insight-item-print">
      <div class="insight-plant-print">${item.plant}</div>
      <div class="insight-tip-print">${item.suggestion}</div>
    </div>`).join('')}
    ${companions.length > 0 ? companions.map(c => `
    <div class="companion-print ${c.type === 'good' ? 'companion-good' : 'companion-warn'}">
      ${c.type === 'good' ? '✓' : '✗'} ${c.pair}${c.reason ? ` — ${c.reason}` : ''}
    </div>`).join('') : ''}
  </div>` : ''}

  <div class="quote">
    "The glory of gardening: hands in the dirt, head in the sun, heart with nature."
    <div class="quote-attr">— Alfred Austin</div>
  </div>
</div>

<footer class="footer">
  <div class="footer-climate">${meta?.zone ? `Zone ${meta.zone} · ` : ''}${meta?.lastFrost ? `Last frost ${meta.lastFrost} · ` : ''}Climate data: Open-Meteo / ERA5</div>
  <div class="footer-centre">✦ The Garden Calendar · ${gardenUrl} ✦</div>
  <div class="footer-app">
    <div class="footer-qr-box"><div id="qr-app" style="width:26px;height:26px"></div></div>
    <div class="footer-qr-label">Your digital<br>calendar ↗</div>
  </div>
</footer>

</div>
<script>
  (function() {
    function makeQR(id, url, size) {
      var el = document.getElementById(id);
      if (!el) return;
      if (typeof QRCode === 'undefined') {
        // Fallback: show URL as tiny text if library failed to load
        el.innerHTML = '<div style="font-size:6px;word-break:break-all;color:#2C1A0A;padding:2px">' + url.slice(0,30) + '</div>';
        return;
      }
      try {
        new QRCode(el, {
          text: url,
          width: size, height: size,
          colorDark: '#2C1A0A', colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch(e) { console.warn('QR failed:', e); }
    }
    window.addEventListener('load', function() {
      ${mapsUrl ? `makeQR('qr-directions', '${mapsUrl.replace(/'/g, "\'")}', 34);` : ''}
      makeQR('qr-app', '${gardenUrl}', 26);
    });
  })();
</script>
</body>
</html>`;
}

function TagInput({value,onChange,placeholder,onAdd}) {
  const [inp,setInp]=useState("");
  const add=()=>{
    const v=inp.trim();
    if(v&&!value.includes(v)){ onChange([...value,v]); if(onAdd) onAdd(v); }
    setInp("");
  };
  return (
    <div>
      <div className="tag-row">
        <input type="text" value={inp} placeholder={placeholder}
          onChange={e=>setInp(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),add())}/>
        <button className="btn-add" onClick={add} type="button">+</button>
      </div>
      <div className="tags">
        {value.map(item=>(
          <span key={item} className="tag">{item}
            <button className="tag-x" onClick={()=>onChange(value.filter(x=>x!==item))}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}


// Error boundary — catches render errors in inspo cards and WikimediaPhoto
// without crashing the whole app to a white screen
class InspoErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { crashed: false }; }
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(e) { console.warn('[InspoErrorBoundary]', e.message); }
  render() {
    if (this.state.crashed) return null; // silently hide rather than white screen
    return this.props.children;
  }
}

// Fetches a garden photo from Wikimedia — tries multiple strategies in sequence:
// 1. English Wikipedia REST summary (exact title)
// 2. Wikimedia search API on English (handles minor title mismatches)
// 3. French Wikipedia REST summary (covers French/Belgian/Swiss gardens)
// 4. Wikimedia search API on French
// Gracefully returns nothing if all fail.
function WikimediaPhoto({ title, style }) {
  const [src, setSrc] = useState(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!title || tried) return;
    setTried(true);

    const slug = encodeURIComponent(title.trim().replace(/ /g, '_'));
    const titleEnc = encodeURIComponent(title.trim());

    const trySummary = (lang) =>
      fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`, { headers: { Accept: 'application/json' } })
        .then(r => r.ok ? r.json() : null)
        .then(d => d?.thumbnail?.source || null)
        .catch(() => null);

    const trySearch = (lang) =>
      fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${titleEnc}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=400&format=json&origin=*`, { headers: { Accept: 'application/json' } })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const pages = d?.query?.pages;
          if (!pages) return null;
          return Object.values(pages)[0]?.thumbnail?.source || null;
        })
        .catch(() => null);

    (async () => {
      const result =
        await trySummary('en') ||
        await trySearch('en')  ||
        await trySummary('fr') ||
        await trySearch('fr');
      if (result) setSrc(result);
    })();
  }, [title, tried]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt={title}
      style={{ width:'100%', maxHeight:160, objectFit:'cover', borderRadius:'2px', marginTop:'.6rem', display:'block', ...style }}
      onError={() => setSrc(null)}
    />
  );
}

function Shimmer({lines=3}) {
  const w=["full","medium","short","medium","full"];
  return <div className="shimmer-block">{Array.from({length:lines}).map((_,i)=><div key={i} className={`shimmer-line ${w[i%w.length]}`} style={{animationDelay:`${i*.15}s`}}/>)}</div>;
}

// References panel — collapsible, starts closed in location step, open in calendar
function RefsPanel({refs, pending, title, startOpen=false}) {
  const [open,setOpen] = useState(startOpen);
  const catIcon = { Climate:"🌦", "Plant care":"🌿", Phenology:"🗓", Wildlife:"🐦", Gardens:"🌳", Broadcasters:"📺" };
  const label = title || "📚 Further reading";
  return (
    <div className="refs-panel">
      <div className="refs-toggle" onClick={()=>setOpen(o=>!o)}>
        <span className="refs-title">{label}</span>
        <span className={`refs-chevron${open?" open":""}`}>▼</span>
      </div>
      {open && (
        <div className="refs-body">
          {pending ? (
            <div className="refs-pending">
              <span className="spin-sm">◌</span>
              Consulting climate records, horticultural guides & wildlife databases…
            </div>
          ) : (
            <div className="refs-list">
              {(refs||[])
                .filter(r => r.category !== "Climate") // hide Climate source — we use Open-Meteo directly
                .map((r,i)=>(
                <div key={i} className="ref-item">
                  <span className="ref-dot">◆</span>
                  <span>
                    <span className="ref-cat">{catIcon[r.category]||"◆"} {r.category}</span>
                    <span>{(r.sources || (r.name ? [r.name] : [])).join(" · ")}</span>
                  </span>
                </div>
              ))}
              <div style={{fontSize:".72rem",color:"var(--muted)",marginTop:".5rem",fontStyle:"italic",opacity:.7}}>
                Plant suggestions powered by iNaturalist local observations · Climate data via Open-Meteo / ERA5
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StreamBar({months, stream1Done, activeMonth, chunkCount}) {
  if (stream1Done) return null;
  return (
    <div className="stream-bar">
      <div className="stream-months">
        {MONTH_NAMES.map(name => {
          const m = months[name];
          const state = !m ? "" : m._state==="active" ? "active" : m._state==="done" && m.inspiration ? "inspo" : m._state==="done" ? "done" : "";
          return <div key={name} className={`sdot ${state}`} title={name}/>;
        })}
      </div>
      {!stream1Done && activeMonth && (
        <span className="stream-txt"><span className="spin-sm">◌</span> {activeMonth}…</span>
      )}
      <span style={{marginLeft:"auto",opacity:.5,fontFamily:"monospace",fontSize:".72rem"}}>{chunkCount} chunks</span>
    </div>
  );
}

function orientationShort(o) { return o?o.split(" (")[0]:""; }

// ─── MonthPanel ───────────────────────────────────────────────────────────────
const MonthPanel = React.memo(function MonthPanel({m, isCurrent, showInspoButton, inspo, onFetchInspo, t, videoRegion, city}) {
  if (!m || m._state==="pending") {
    return <div className="month-ghost"><Shimmer lines={2}/></div>;
  }
  const sColor = SEASON_COLORS[m.season]||"var(--bark2)";
  const isActive = m._state==="active";

  return (
    <div className={`month-panel${isCurrent?" is-current":""}`}>
      <div className="season-bar" style={{background: m.season ? sColor : "var(--bark2)", opacity:.7}}/>

      <div className="mp-head">
        <div className="mp-title-row">
          <div className="mp-month-name">
            {SEASON_EMOJIS[m.month]} {m.month}
            {m.season && <span className="mp-season-tag">{m.season}</span>}
          </div>
          {isCurrent && <span className="this-month-badge">Now</span>}
        </div>
        <div className="mp-stats">
          {m.sunHours!=null && <div className="mp-stat">☀️ {m.sunHours}h / day</div>}
          {isActive && !m.sunHours && <Shimmer lines={1}/>}
        </div>
      </div>

      <div className="mp-body">
        {/* 1. Things to do */}
        <div className="mp-section-label tasks-lbl">Things to do</div>
        {m.tasks.length > 0 || m._taskPartial ? (
          <ul className="mp-list">
            {m.tasks.map((task,j) => (
              <li key={j}>
                <span className="bullet-task">›</span>
                <span style={{flex:1}}>{task}</span>
                {!isActive && taskNeedsVideo(task) && (
                  <VideoButton taskText={task} region={videoRegion || 'uk'}/>
                )}
              </li>
            ))}
            {m._taskPartial && isActive && (
              <li key="tp"><span className="bullet-task">›</span><span className="typing-cursor">{m._taskPartial}</span></li>
            )}
          </ul>
        ) : <Shimmer lines={3}/>}

        {/* 2. What to enjoy */}
        <div className="mp-section-label enjoy-lbl">What to enjoy</div>
        {m.enjoy.length > 0 || m._enjoyPartial ? (
          <ul className="mp-list">
            {m.enjoy.map((e,j)=><li key={j}><span className="bullet-enjoy">✿</span>{e}</li>)}
            {m._enjoyPartial && isActive && (
              <li key="ep"><span className="bullet-enjoy">✿</span><span className="typing-cursor">{m._enjoyPartial}</span></li>
            )}
          </ul>
        ) : <Shimmer lines={2}/>}

        {/* 3. For inspiration — on-demand, only on current + next 2 months */}
        {showInspoButton && (
          <div style={{marginTop:"1rem"}}>
            <div className="mp-section-label inspo-lbl">For inspiration</div>
            {!inspo || inspo.state === "idle" ? (
              <button className="btn-inspo" onClick={onFetchInspo}>
                {t("whereToVisit")} {m.month}
              </button>
            ) : inspo.state === "loading" ? (
              <div className="inspo-loading">
                <span className="spin-sm">◌</span> Finding the best garden for {m.month}…
              </div>
            ) : inspo.state === "error" ? (
              <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                <div style={{fontSize:".8rem",color:"var(--bloom)",fontStyle:"italic"}}>Couldn't find a suggestion — try again</div>
                <button className="btn-inspo" onClick={onFetchInspo}>↺ Retry</button>
              </div>
            ) : inspo.state === "none" ? (
              <div>
                <div style={{fontSize:".82rem",color:"var(--muted)",fontStyle:"italic",padding:".3rem 0"}}>
                  {t("noGardensNearby")}
                </div>
                <button className="btn-inspo" style={{marginTop:".4rem"}} onClick={onFetchInspo}>↺ Try again</button>
              </div>
            ) : inspo.data ? (
              <InspoErrorBoundary>
              <div className="inspo-block">
                <div className="inspo-name">{inspo.data.name}</div>
                <WikimediaPhoto title={inspo.data.wikipedia || inspo.data.name} style={{marginBottom:".4rem"}}/>
                {inspo.data.organisation && (
                  <div style={{fontSize:".75rem",color:"var(--clay)",opacity:.8,marginBottom:".15rem"}}>{inspo.data.organisation}</div>
                )}
                {inspo.data.location && (
                  <div className="inspo-detail">
                    {inspo.data.location}{inspo.data.distance ? ` · ${inspo.data.distance}` : ""}
                  </div>
                )}
                {inspo.data.known_for && (
                  <div style={{fontSize:".78rem",color:"var(--inspo)",fontStyle:"italic",marginTop:".2rem",opacity:.85}}>
                    {t("knownFor")} {inspo.data.known_for}
                  </div>
                )}
                {inspo.data.highlight && <div className="inspo-text">{inspo.data.highlight}</div>}
                {inspo.data.website ? (
                  <a href={inspo.data.website.startsWith('http') ? inspo.data.website : `https://${inspo.data.website}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{display:"inline-block",marginTop:".45rem",fontSize:".78rem",color:"var(--dew)",textDecoration:"none",borderBottom:"1px solid rgba(138,180,160,.3)"}}>
                    ↗ {inspo.data.website.replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(inspo.data.name + ' ' + (inspo.data.location||'') + ' official website')}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{display:"inline-block",marginTop:".45rem",fontSize:".78rem",color:"var(--sage)",textDecoration:"none",borderBottom:"1px solid rgba(122,140,106,.25)",fontStyle:"italic"}}>
                    Look it up ↗
                  </a>
                )}
                {inspo.data.location && (
                  <a href={mapsDirectionsUrl(city, inspo.data.name + ', ' + inspo.data.location)}
                    target="_blank" rel="noopener noreferrer"
                    style={{display:"inline-block",marginTop:".45rem",marginLeft: inspo.data.website ? ".75rem" : "0",fontSize:".78rem",color:"var(--dew)",textDecoration:"none",borderBottom:"1px solid rgba(138,180,160,.3)"}}>
                    🗺 Directions
                  </a>
                )}
                {inspo.data.confidence === "medium" && (
                  <div style={{fontSize:".72rem",color:"var(--muted)",marginTop:".4rem",fontStyle:"italic",opacity:.7}}>
                    {t("verifyHighlight")}
                  </div>
                )}
                <button className="btn-inspo" style={{marginTop:".7rem"}} onClick={onFetchInspo}>↺ Try somewhere else</button>
              </div>
              </InspoErrorBoundary>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}); // React.memo — only re-renders when props change

// ─── InsightsPanel ───────────────────────────────────────────────────────────
function InsightsPanel({insights, plantMeta, onFetch, hasPlants, stream1Done, loadedBatches, totalPlantCount}) {
  const [open, setOpen] = useState(false);
  const canUnlock = stream1Done && loadedBatches >= 4 && hasPlants;
  const handleUnlock = () => { setOpen(true); onFetch(); };

  // Count how many plants have GBIF occurrence data loaded
  const gbifCount = Object.values(plantMeta||{}).filter(m => m?.occurrence != null).length;

  return (
    <div className="insights-panel">
      <div className="insights-unlock">
        <span className="insights-title">🔍 Insights about your garden</span>
        {!open ? (
          <button className="btn-unlock" onClick={handleUnlock} disabled={!canUnlock}
            title={!canUnlock ? "Available once calendar is generated" : ""}>
            {canUnlock ? "Unlock insights" : "Available after full year generated"}
          </button>
        ) : (
          <button className="btn-unlock" onClick={onFetch}
            disabled={insights.state==="loading"} style={{fontSize:".78rem"}}>
            {insights.state==="loading" ? "Thinking…" : "↺ Refresh"}
          </button>
        )}
      </div>

      {open && (
        <div className="insights-body">
          {insights.state === "loading" && (
            <div style={{padding:".5rem 0"}}><Shimmer lines={4}/></div>
          )}
          {insights.state === "error" && (
            <div style={{fontSize:".85rem",color:"var(--bloom)",fontStyle:"italic",padding:".4rem 0"}}>
              Couldn't load insights — try refreshing.
            </div>
          )}
          {insights.state === "done" && insights.allLookingGood && (
            <div className="insights-good">✓ {insights.goodNewsLine || "Your plant selection looks well-suited to this location — happy growing!"}</div>
          )}
          {insights.state === "done" && (insights.items||[]).map((item,i) => (
            <div key={i} className="insight-item">
              <div className="insight-plant">{item.plant}
                {plantMeta?.[item.plant]?.occurrence?.count != null && (
                  <span className="gbif-occ-badge">
                    {plantMeta[item.plant].occurrence.count === 0
                      ? "· no local GBIF records"
                      : `· ${plantMeta[item.plant].occurrence.count} local records`}
                  </span>
                )}
              </div>
              <div className="insight-q">{item.question}</div>
              <div className="insight-ctx">{item.context}</div>
              <div className="insight-tip">{item.suggestion}</div>
            </div>
          ))}
          {insights.state === "done" && gbifCount > 0 && (
            <div className="gbif-attribution">
              Regional occurrence data: <a href="https://gbif.org" target="_blank" rel="noopener" style={{color:"inherit"}}>GBIF</a>
              {" · "}names: <a href="https://powo.science.kew.org" target="_blank" rel="noopener" style={{color:"inherit"}}>Plants of the World Online</a> / WCVP (Royal Botanic Gardens, Kew)
              {" · "}{gbifCount} of {totalPlantCount} plants checked
            </div>
          )}
          {insights.state === "done" && (insights.companions||[]).length > 0 && (
            <div className="companion-section">
              <div className="companion-title">🤝 Companion planting notes</div>
              {(insights.companions||[]).map((c,i) => (
                <div key={i} className="companion-item">
                  <span className={`companion-badge ${c.type === "good" ? "good" : "warn"}`}>
                    {c.type === "good" ? "✓ Good" : "✗ Avoid"}
                  </span>
                  <span>
                    <span className="companion-pair">{c.pair}</span>
                    {c.reason && <span className="companion-reason"> — {c.reason}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {insights.state === "done" && (
            <div style={{fontSize:".68rem",color:"rgba(180,180,160,.35)",marginTop:".6rem",fontStyle:"italic",lineHeight:"1.5"}}>
              Based on GBIF occurrence data and general horticultural knowledge. Verify suitability with your local nursery or national horticultural society.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LensCalendars ────────────────────────────────────────────────────────────
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CAT_LABELS = { trees:"Tree", shrubs:"Shrub", flowers:"Flower", vegetables:"Veg", fruit:"Fruit", herbs:"Herb" };
const CAT_ORDER  = ["flowers","trees","shrubs","fruit","vegetables","herbs"];

const LENSES = [
  { id:"colour",   emoji:"🎨", name:"Colour",   desc:"flower, foliage & fruit colour",  color:"var(--bloom)" },
  { id:"texture",  emoji:"🍃", name:"Texture",  desc:"leaf, bark & seedhead texture",    color:"var(--sage)"  },
  { id:"form",     emoji:"🌳", name:"Form",     desc:"structure, habit & silhouette",    color:"var(--straw)" },
  { id:"scent",    emoji:"🌸", name:"Scent",    desc:"fragrance presence & intensity",   color:"var(--dew)"   },
  { id:"cropping", emoji:"🍓", name:"Cropping", desc:"harvest windows",                  color:"var(--warm)"  },
];

const BAR_HEIGHTS = [0, 8, 17, 28]; // px heights for intensity 0–3
const BAR_OPACITIES = [0, 0.35, 0.65, 1.0]; // shade by intensity — low is washed, high is full

const EDIBLE_CATS = new Set(["fruit","vegetables"]);
const NOTEWORTHY_LENSES = new Set(["texture","form","scent"]);
const INTENSITY_LABELS = ["none","low","medium","high"];

// Tap-to-reveal tooltip for mobile; hover title on desktop
function BarWithTooltip({ intensity, monthName, descriptor, barColor, barHeight }) {
  const [tipVisible, setTipVisible] = useState(false);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef(null);
  const tipText = descriptor || monthName;
  const opacity = BAR_OPACITIES[Math.min(intensity, 3)];

  const showTip = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    setTipVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setTipVisible(false), 3000);
  };

  const hideTip = () => {
    setTipVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (intensity === 0) return (
    <div style={{flex:1, height:28, display:"flex", alignItems:"flex-end"}}>
      <div style={{width:"100%", height:3, background:"rgba(200,169,110,.07)", borderRadius:2}}/>
    </div>
  );

  return (
    <div style={{flex:1, height:28, display:"flex", alignItems:"flex-end", position:"relative"}}>
      {/* Fixed-position tooltip — escapes all parent clipping */}
      {tipVisible && (
        <div style={{
          position:"fixed",
          left: tipPos.x,
          top: tipPos.y,
          transform:"translateX(-50%) translateY(-100%)",
          background:"rgba(20,12,4,.97)",
          border:"1px solid rgba(200,169,110,.4)",
          borderRadius:"4px",
          padding:".3rem .6rem",
          fontSize:".72rem",
          color:"var(--cream)",
          zIndex:9999,
          pointerEvents:"none",
          lineHeight:1.5,
          maxWidth:200,
          textAlign:"center",
          boxShadow:"0 3px 12px rgba(0,0,0,.5)",
          wordBreak:"break-word",
        }}>
          {tipText}
        </div>
      )}
      <div
        style={{
          width:"100%",
          height: barHeight,
          background: barColor,
          opacity,
          borderRadius:"2px 2px 0 0",
          flexShrink: 0,
          cursor:"default",
          transition:"opacity .15s",
        }}
        title={tipText}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onTouchStart={(e) => { e.preventDefault(); if (tipVisible) hideTip(); else showTip(e); }}
        onClick={showTip}
      />
    </div>
  );
}


const QUARTERS = [
  { label:"Dec–Feb", months:[11,0,1]  },
  { label:"Mar–May", months:[2,3,4]   },
  { label:"Jun–Aug", months:[5,6,7]   },
  { label:"Sep–Nov", months:[8,9,10]  },
];

function currentQuarterIdx() {
  const m = new Date().getMonth(); // 0=Jan
  if (m === 11 || m <= 1) return 0;
  if (m <= 4) return 1;
  if (m <= 7) return 2;
  return 3;
}

function LensGrid({ lensId, lensData, plants, lensColor }) {
  const [qIdx, setQIdx] = useState(() => currentQuarterIdx());
  const [filters, setFilters] = useState(new Set(["high"])); // default to high impact

  if (!lensData) return <div className="tl-empty">No data available.</div>;

  // Build rows
  const allRows = [];
  CAT_ORDER.forEach(cat => {
    if (lensId === "cropping" && !EDIBLE_CATS.has(cat)) return;
    (plants[cat] || []).forEach(p => {
      const d = lensData[p];
      if (!d) return;
      const months = d.months || Array(12).fill(0);
      if (NOTEWORTHY_LENSES.has(lensId) && Math.max(...months) < 2) return;
      allRows.push({ name: p, cat, months, descriptor: d.descriptor || "", colour: d.colour || null });
    });
  });

  if (!allRows.length) return <div className="tl-empty">No notable interest for your plants in this lens.</div>;

  const quarter = QUARTERS[qIdx];
  const qMonths = quarter.months; // 3 month indices

  // Apply intensity filter — keep plants that have ≥1 month in the visible block matching filter
  const intensityMatch = (row) => {
    if (filters.size === 0) return true;
    return qMonths.some(mi => {
      const v = row.months[mi];
      if (filters.has("high")   && v === 3) return true;
      if (filters.has("medium") && v === 2) return true;
      if (filters.has("low")    && v === 1) return true;
      return false;
    });
  };
  const rows = allRows.filter(intensityMatch);

  const toggleFilter = (f) => setFilters(prev => {
    const next = new Set(prev);
    if (next.has(f)) next.delete(f); else next.add(f);
    return next;
  });

  return (
    <>
      {/* Quarter nav + intensity filters */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".6rem",flexWrap:"wrap",gap:".4rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:".4rem"}}>
          <button className="nav-btn left" style={{position:"static",width:28,height:28,fontSize:".9rem"}}
            onClick={() => setQIdx(i => (i+3)%4)}>‹</button>
          <span style={{fontSize:".8rem",color:"var(--straw)",fontFamily:"'Playfair Display',serif",minWidth:60,textAlign:"center"}}>{quarter.label}</span>
          <button className="nav-btn right" style={{position:"static",width:28,height:28,fontSize:".9rem"}}
            onClick={() => setQIdx(i => (i+1)%4)}>›</button>
        </div>
        <div style={{display:"flex",gap:".3rem"}}>
          {[
            { f:"high",   h:14, op:1.0  },
            { f:"medium", h:9,  op:0.65 },
            { f:"low",    h:5,  op:0.35 },
          ].map(({ f, h, op }) => (
            <button key={f} onClick={() => toggleFilter(f)}
              style={{
                display:"flex", alignItems:"center", gap:".3rem",
                background: filters.has(f) ? "rgba(200,169,110,.2)" : "none",
                border: `1px solid ${filters.has(f) ? "rgba(200,169,110,.5)" : "rgba(200,169,110,.2)"}`,
                borderRadius:"20px", color: filters.has(f) ? "var(--straw)" : "var(--sage)",
                padding:".15rem .55rem", fontSize:".7rem", cursor:"pointer",
                fontFamily:"'Crimson Pro',serif", textTransform:"capitalize", transition:"all .15s"
              }}>
              <span style={{display:"inline-block",width:4,height:h,background:"currentColor",opacity:op,borderRadius:"1px",flexShrink:0}}/>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Month column headers */}
      <div style={{display:"flex",marginBottom:".3rem",paddingLeft:80}}>
        {qMonths.map(mi => (
          <div key={mi} style={{flex:1,textAlign:"center",fontSize:".65rem",color:"rgba(180,180,160,.45)",textTransform:"uppercase",letterSpacing:".04em"}}>
            {MONTH_ABBR[mi]}
          </div>
        ))}
      </div>

      {/* Plant rows */}
      {rows.length === 0 ? (
        <div className="tl-empty">No plants match the selected filter for {quarter.label}.</div>
      ) : (
        <div className="tl-grid">
          {rows.map((row, i) => {
            const barColor = (lensId === "colour" && row.colour && row.colour !== "var(--bloom)") ? row.colour : lensColor;
            return (
              <div key={i} className="tl-row">
                <div className="tl-label" title={`${row.name}${row.descriptor ? " · " + row.descriptor : ""}`}>
                  {row.name}
                  <span className="tl-label-cat">{CAT_LABELS[row.cat]}</span>
                </div>
                <div className="tl-months">
                  <div className="tl-months-inner">
                    {qMonths.map(mi => {
                      const intensity = row.months[mi];
                      return (
                        <BarWithTooltip
                          key={mi}
                          intensity={intensity}
                          monthName={MONTH_ABBR[mi]}
                          descriptor={row.descriptor}
                          barColor={barColor}
                          barHeight={BAR_HEIGHTS[Math.min(intensity,3)]}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{fontSize:".62rem",color:"rgba(180,180,160,.28)",marginTop:".75rem",fontStyle:"italic"}}>
        Approximate — varies by variety and season.
      </div>
    </>
  );
}
function GapSection({ plants, lensData, selectedGardenId, meta, city, provider, userKey }) {
  const [gapState, setGapState] = useState("idle");
  const [gapData, setGapData]   = useState(null);

  const gapMonths = (() => {
    if (!lensData) return [];
    const allPlantList = Object.values(plants).flat();
    return Array.from({length:12}, (_,i) => {
      const hasInterest = allPlantList.some(p => {
        const d = lensData[p];
        return d && (d.months||[])[i] >= 2;
      });
      return hasInterest ? null : i;
    }).filter(i => i !== null);
  })();

  const gapClusters = (() => {
    if (!gapMonths.length) return [];
    const sorted = [...gapMonths].sort((a,b)=>a-b);
    const runs = []; let run = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i-1]+1) { run.push(sorted[i]); }
      else { runs.push(run); run = [sorted[i]]; }
    }
    runs.push(run);
    return runs.map(r => ({
      indices: r,
      label: r.length===1 ? MONTH_ABBR[r[0]] : `${MONTH_ABBR[r[0]]}–${MONTH_ABBR[r[r.length-1]]}`
    }));
  })();

  const cacheKey = `gc_gap_${selectedGardenId||"anon"}_${(() => { try { return btoa(Object.values(plants).flat().slice().sort().join(",")).slice(0,20); } catch { return "x"; } })()}`;

  const fetchGap = async () => {
    const cached = (() => { try { const r = localStorage.getItem(cacheKey); return r ? JSON.parse(r) : null; } catch { return null; } })();
    if (cached) { setGapData(cached); setGapState("done"); return; }
    setGapState("loading");
    const existingList = Object.values(plants).flat().join(", ");
    const metaCtx = meta ? `Climate: ${meta.climate}. Zone: ${meta.zone}.` : "";
    const gapDesc = gapClusters.map(c => c.label).join(", ");
    try {
      const result = await callClaude(
        `You are a helpful gardening advisor. A garden in ${city} has gaps in colour during: ${gapDesc}.
${metaCtx} Existing plants: ${existingList}.
Suggest plants to fill each gap period. Return ONLY valid JSON, no markdown:
[{ "months": "<e.g. Nov–Jan>", "suggestions": ["<plant 1>", "<plant 2>", "<plant 3>"] }]
Rules: 2–3 suggestions per gap, climate-appropriate, not already in the existing plant list, common nursery-available plants only.`,
        500, undefined, provider, userKey
      );
      if (Array.isArray(result)) {
        try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch {}
        setGapData(result); setGapState("done");
      } else { setGapState("error"); }
    } catch { setGapState("error"); }
  };

  return (
    <div className="gap-section">
      <div className="gap-header">
        <span className="gap-title">🌱 Gap analysis</span>
        {gapState === "idle" && gapClusters.length > 0 && (
          <button className="btn-unlock" style={{fontSize:".75rem"}} onClick={fetchGap}>Suggest plants</button>
        )}
        {gapState === "done" && (
          <button className="btn-unlock" style={{fontSize:".72rem"}} onClick={() => { try { localStorage.removeItem(cacheKey); } catch {} setGapData(null); setGapState("idle"); }}>↺ Refresh</button>
        )}
      </div>
      {gapClusters.length === 0 && <div className="gap-none">✓ Good colour coverage all year.</div>}
      {gapClusters.length > 0 && gapState === "idle" && (
        <div style={{fontSize:".8rem",color:"var(--sage)",fontStyle:"italic"}}>
          Gaps: {gapClusters.map(c=>c.label).join(", ")}. Click "Suggest plants" for recommendations.
        </div>
      )}
      {gapState === "loading" && <div style={{padding:".3rem 0"}}><Shimmer lines={2}/></div>}
      {gapState === "error" && <div style={{fontSize:".83rem",color:"var(--bloom)",fontStyle:"italic"}}>Couldn't load suggestions.</div>}
      {gapState === "done" && gapData && gapData.map((cluster,i) => (
        <div key={i} className="gap-item">
          <div className="gap-months">{cluster.months}</div>
          <div className="gap-suggestions">
            {(cluster.suggestions||[]).map((s,j) => <span key={j} className="gap-pill">{s}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function LensCalendars({ plants, plantTraits, lensData, lensStates, onFetchLens, stream1Done, loadedBatches, meta, city, selectedGardenId, provider, userKey }) {
  const [open, setOpen] = useState(false);
  const [expandedLens, setExpandedLens] = useState({});
  const canUnlock = stream1Done && loadedBatches >= 4 && Object.values(plants).flat().length > 0;

  const handleUnlock = () => {
    setOpen(true);
    // Don't pre-fetch — colour fetches when user opens it via toggleLens
  };

  const toggleLens = (id) => {
    const willOpen = !expandedLens[id];
    setExpandedLens(prev => ({ ...prev, [id]: willOpen }));
    if (willOpen && (!lensStates[id] || lensStates[id] === "idle" || lensStates[id] === "error")) {
      onFetchLens(id, lensStates[id] === "error");
    }
  };

  return (
    <div className="lens-panel">
      <div className="lens-header">
        <span className="lens-section-title">✦ Year-round interest</span>
        {!open ? (
          <button className="btn-unlock" onClick={handleUnlock} disabled={!canUnlock}
            title={!canUnlock ? "Available once full year is generated" : ""}>
            {canUnlock ? "Show lenses" : "Available after full year generated"}
          </button>
        ) : (
          <button className="btn-unlock" onClick={() => {
              // Bust cache and refetch all expanded lenses via onFetchLens(id, true)
              LENSES.forEach(l => { if (expandedLens[l.id]) onFetchLens(l.id, true); });
            }}
            style={{fontSize:".75rem"}}>
            ↺ Refresh all
          </button>
        )}
      </div>

      {open && (
        <div className="lens-list">
          {LENSES.map(lens => {
            const isOpen = !!expandedLens[lens.id];
            const state  = lensStates[lens.id] || "idle";
            return (
              <div key={lens.id} className="lens-item">
                <div className="lens-toggle" onClick={() => toggleLens(lens.id)}>
                  <div className="lens-toggle-left">
                    <span style={{fontSize:"1rem"}}>{lens.emoji}</span>
                    <span className="lens-name">{lens.name}</span>
                    <span className="lens-desc">{lens.desc}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                    {state === "loading" && <span style={{fontSize:".72rem",color:"var(--sage)",fontStyle:"italic"}}>loading…</span>}
                    {state === "error"   && <span style={{fontSize:".72rem",color:"var(--bloom)"}}>⚠</span>}
                    <span className={`lens-chevron${isOpen ? " open" : ""}`}>▼</span>
                  </div>
                </div>
                {isOpen && (
                  <div className="lens-body">
                    {state === "loading" && <Shimmer lines={3}/>}
                    {state === "error"   && (
                      <div style={{display:"flex",alignItems:"center",gap:".75rem",padding:".25rem 0"}}>
                        <div className="tl-empty" style={{color:"var(--bloom)",margin:0}}>Couldn't load.</div>
                        <button className="btn-unlock" style={{fontSize:".72rem"}} onClick={(e) => { e.stopPropagation(); onFetchLens(lens.id, true); }}>↺ Retry</button>
                      </div>
                    )}
                    {state === "done"    && (
                      <>
                        <LensGrid lensId={lens.id} lensData={lensData[lens.id]} plants={plants} lensColor={lens.color}/>
                        {lens.id === "colour" && (
                          <GapSection plants={plants} lensData={lensData.colour} selectedGardenId={selectedGardenId} meta={meta} city={city} provider={provider} userKey={userKey}/>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AboutView ────────────────────────────────────────────────────────────────
function AboutView({ garden, meta, prefetchState, insights, fetchInsights, lensData, lensStates, fetchLens, plants, plantTraits, city, selectedGardenId, provider, userKey, onGoCalendar, onGoEdit, months }) {
  const hasMeta = !!meta;
  const hasPlants = Object.values(plants).flat().length > 0;

  // Export helpers — reuse existing functions passed as props
  const gardenUrl = garden ? buildGardenUrl(garden.city, garden.orientation, garden.features, garden.plants) : "";

  return (
    <div style={{maxWidth:680, margin:"0 auto"}}>
      {/* Garden summary */}
      <div className="cal-header" style={{marginBottom:"1.5rem"}}>
        <div className="deco" style={{fontSize:"1.1rem"}}>✦ ✿ ✦</div>
        <h2 style={{fontSize:"1.5rem"}}>{garden?.name || garden?.city || "Your garden"}</h2>
        {garden?.city && <p style={{color:"var(--sage)",fontStyle:"italic",fontSize:".9rem",marginTop:".2rem"}}>{garden.city}</p>}
        <div className="meta-pills" style={{justifyContent:"center",marginTop:".75rem"}}>
          {hasPlants && <div className="pill">🌱 <b>{Object.values(plants).flat().length}</b> plants</div>}
          {meta?.zone  && <div className="pill">🌡 Zone <b>{meta.zone}</b></div>}
          {meta?.climate && <div className="pill">🌤 {meta.climate}</div>}
          {!hasMeta && prefetchState === "fetching" && <div className="pill" style={{color:"var(--sage)",fontStyle:"italic"}}>⟳ Loading climate…</div>}
        </div>
      </div>

      {/* Climate fallback — if still no meta after prefetch attempt */}
      {!hasMeta && prefetchState === "error" && (
        <div style={{background:"rgba(58,34,16,.45)",border:"1px solid rgba(200,169,110,.2)",borderRadius:"2px",padding:"1rem 1.25rem",marginBottom:"1.5rem",fontSize:".88rem",color:"var(--parchment)",lineHeight:1.6}}>
          <strong style={{color:"var(--straw)"}}>Couldn't load climate data.</strong> Check your connection and try switching to the Calendar tab to regenerate.
          <div style={{marginTop:".6rem"}}>
            <button className="btn-solid" style={{fontSize:".85rem",padding:".5rem 1rem"}} onClick={onGoCalendar}>Go to Calendar →</button>
          </div>
        </div>
      )}

      {/* Insights — auto-load, no unlock button */}
      <div className="insights-panel">
        <div className="insights-unlock">
          <span className="insights-title">🔍 Insights about your garden</span>
          {insights.state === "done" && (
            <button className="btn-unlock" onClick={fetchInsights} style={{fontSize:".78rem"}}>↺ Refresh</button>
          )}
        </div>
        <div className="insights-body">
          {(insights.state === "idle" || insights.state === "loading") && <Shimmer lines={4}/>}
          {insights.state === "error" && (
            <div style={{fontSize:".85rem",color:"var(--bloom)",fontStyle:"italic",padding:".4rem 0"}}>
              Couldn't load insights — <button className="btn-unlock" style={{fontSize:".78rem"}} onClick={fetchInsights}>try again</button>
            </div>
          )}
          {insights.state === "done" && insights.allLookingGood && (
            <div className="insights-good">✓ {insights.goodNewsLine || "Your plant selection looks well-suited to this location — happy growing!"}</div>
          )}
          {insights.state === "done" && (insights.items||[]).map((item,i) => (
            <div key={i} className="insight-item">
              <div className="insight-plant">{item.plant}</div>
              <div className="insight-q">{item.question}</div>
              <div className="insight-ctx">{item.context}</div>
              <div className="insight-tip">{item.suggestion}</div>
            </div>
          ))}
          {insights.state === "done" && (insights.companions||[]).length > 0 && (
            <div className="companion-section">
              <div className="companion-title">🤝 Companion planting notes</div>
              {(insights.companions||[]).map((c,i) => (
                <div key={i} className="companion-item">
                  <span className={`companion-badge ${c.type==="good"?"good":"warn"}`}>{c.type==="good"?"✓ Good":"✗ Avoid"}</span>
                  <span><span className="companion-pair">{c.pair}</span>{c.reason&&<span className="companion-reason"> — {c.reason}</span>}</span>
                </div>
              ))}
            </div>
          )}
          {insights.state === "done" && (
            <div style={{fontSize:".68rem",color:"rgba(180,180,160,.35)",marginTop:".6rem",fontStyle:"italic",lineHeight:1.5}}>
              Based on general horticultural knowledge. Verify with your local nursery.
            </div>
          )}
        </div>
      </div>

      {/* Year-round interest lens calendars */}
      <LensCalendars
        plants={plants}
        plantTraits={plantTraits}
        lensData={lensData}
        lensStates={lensStates}
        onFetchLens={fetchLens}
        stream1Done={true}
        loadedBatches={4}
        meta={meta}
        city={city}
        selectedGardenId={selectedGardenId}
        provider={provider}
        userKey={userKey}
      />

      {/* Download insights */}
      {garden && insights.state === "done" && (
        <div style={{display:"flex",justifyContent:"center",margin:"1rem 0 .5rem"}}>
          <button
            onClick={() => exportInsightsHTML(garden, meta, insights, lensData, plants)}
            style={{background:"#2C1A0A",color:"#F5EDD8",border:"none",borderRadius:"6px",padding:".55rem 1.4rem",fontSize:".85rem",cursor:"pointer",display:"flex",alignItems:"center",gap:".4rem"}}>
            📄 Download
          </button>
        </div>
      )}
    </div>
  );
}

// ─── TabBar ───────────────────────────────────────────────────────────────────
const TABS = [
  { id:"garden",   icon:"🏡", label:"Home"     },
  { id:"week",     icon:"📅", label:"This Week" },
  { id:"calendar", icon:"🗓", label:"Calendar"  },
  { id:"about",    icon:"🌿", label:"Insights"  },
  { id:"edit",     icon:"✏️", label:"Edit"      },
];

function TabBar({ activeTab, onTabChange, hasGarden }) {
  if (!hasGarden) return null;
  return (
    <nav className="tab-bar">
      {TABS.map(tab => (
        <button key={tab.id} className={`tab-btn${activeTab===tab.id?" active":""}`}
          onClick={() => onTabChange(tab.id)}>
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function GardenCalendar() {
  const [apiKey,setApiKey]   = useState("");
  const [city,setCity]       = useState("");
  const [rateLimitMsg,setRateLimitMsg] = useState("");
  const [favourites, setFavourites] = useState(() => loadFavourites());
  const [gardens, setGardens] = useState(() => migrateLegacyFavourites());
const [selectedGardenId, setSelectedGardenId] = useState(() => {
  const gs = migrateLegacyFavourites();
  return gs[0]?.id ?? null;
});
const [showHome, setShowHome] = useState(() => {
  const hasHash = typeof window !== 'undefined' && !!window.location.hash.slice(1);
  return hasSavedGardens() && !hasHash;
});
  const [todayGarden, setTodayGarden]       = useState(null);
  const [weatherData, setWeatherData]       = useState(null);
  const [weatherSignals, setWeatherSignals] = useState([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError]     = useState(null);
  const [todayTasks, setTodayTasks]               = useState(null);
  const [todayTasksLoading, setTodayTasksLoading] = useState(false);
  const [todayTasksError, setTodayTasksError]     = useState(null);
  const [todayRefreshUsed, setTodayRefreshUsed]       = useState(false);
  const [todayRefreshLoading, setTodayRefreshLoading] = useState(false);
  const [inatData, setInatData]                       = useState(null);
  const [inatLoading, setInatLoading]                 = useState(false);
  const [inatError, setInatError]                     = useState(null);
  const [linkCopied, setLinkCopied]   = useState(false);
  const [showAbout, setShowAbout]     = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // AI provider — "proxy" (default, rate-limited) | "claude" | "gemini"
  const [provider, setProvider] = useState(() => {
    try { return localStorage.getItem("gc_provider") || "proxy"; } catch { return "proxy"; }
  });
  const [userKey, setUserKey] = useState(() => {
    try { return localStorage.getItem("gc_user_key") || ""; } catch { return ""; }
  });
  const [keyDraft, setKeyDraft] = useState("");
  const [usage, setUsage] = useState(null); // { count, cap }
  const [geminiModel, setGeminiModel] = useState(() => {
    try { return localStorage.getItem("gc_gemini_model") || "gemini-2.5-flash"; } catch { return "gemini-2.5-flash"; }
  });
  const [keyVerifying, setKeyVerifying] = useState(false);
  const [keyError, setKeyError] = useState("");

  // Restore garden state from URL hash on first load
useEffect(() => {
  const gs = migrateLegacyFavourites();
  if (gs.length) {
    setGardens(gs);
    setSelectedGardenId(gs[0].id);
  }

  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const state = decodeGardenState(hash);
  if (!state) return;
  if (state.city)        setCity(state.city);
  if (state.orientation) setOri(state.orientation);
  if (state.features)    setFeatures(state.features);
  if (state.plants)      setPlants(state.plants);
  setShowHome(false);
}, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // iNat localised suggestions: { trees: ["Rose","Lavender",...], ... }
  const [localSuggestions, setLocalSuggestions] = useState({});
  // Per-category loading state: { trees: "loading"|"ready"|"fallback"|null }
  const [suggestionState, setSuggestionState] = useState({});
  const [orientation,setOri] = useState("");
  const [plants,setPlants]   = useState({trees:[],shrubs:[],flowers:[],vegetables:[],fruit:[],herbs:[]});
  const [features,setFeatures] = useState([]);
  // plantMeta: { [plantName]: { status, scientificName, genus, clarificationRule, clarificationAnswer, occurrence } }
  const [plantMeta,setPlantMeta] = useState({});
  const plantMetaRef = useRef({});
  const [meta,setMeta]               = useState(null);
  const metaRef = useRef(null);
  // Keep refs in sync so async callbacks read current state
  useEffect(() => { plantMetaRef.current = plantMeta; }, [plantMeta]);
  useEffect(() => { metaRef.current = meta; }, [meta]);

  const onPlantAdded = useCallback(async (name) => {
    // Use ref-style check via functional updater to avoid stale closure
    setPlantMeta(prev => {
      if (prev[name]) return prev; // already validated or loading
      validatePlantName(name).then(result =>
        setPlantMeta(p => ({ ...p, [name]: result }))
      );
      return { ...prev, [name]: { status: "loading", name } };
    });
    // Trigger colour sub-prompt for plants with meaningful colour variation
    if (COLOUR_PROMPT_PLANTS.has(name.toLowerCase())) {
      setColourPending({ plantName: name });
    }
  }, []);

  const onClarify = useCallback((name, answer) => {
    setPlantMeta(prev => ({
      ...prev,
      [name]: { ...prev[name], clarificationAnswer: answer }
    }));
  }, []);
  const [prefetchState,setPfState]   = useState("idle");
  const [stage,setStage]             = useState("form");
  const [activeTab,setActiveTab]     = useState("garden"); // "garden"|"week"|"calendar"|"about"|"edit"
  // Language: browser default, persisted to localStorage, user can override
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem("gc_lang");
    if (stored) return stored;
    // Detect browser language — use it for Claude prompts even if UI stays English
    return (navigator.language || "en").split("-")[0].toLowerCase();
  });
  // UI always uses English strings; browser language only affects Claude prompt language
  const t = (key) => UI_STRINGS.en[key] || key;
  const langName = () => getLangName(lang);
  // Toggle between English and browser language
  const browserLang = (navigator.language || "en").split("-")[0].toLowerCase();
  const changeLang = (code) => { setLang(code); localStorage.setItem("gc_lang", code); };
  const [loadedBatches,setLoadedBatches] = useState(1); // how many 3-month batches generated
  const [loadingMore,setLoadingMore]     = useState(false);
  const [formStep,setFormStep]       = useState("location"); // "location" | "plants"
  const [locationQuote,setLocationQuote] = useState({text:"",done:false});
  const [months,setMonths]           = useState({});
  const [stream1Done,setS1Done]      = useState(false);
  const [activeMonth,setActiveMonth] = useState(null);
  const [pageIdx,setPageIdx]         = useState(0);
  const [error,setError]             = useState("");
  // Per-month inspiration: { "January": { state:"idle"|"loading"|"done"|"error", data:{...}|null } }
  const [inspos,setInspos]           = useState({});
  const [insights,setInsights]       = useState({state:"idle", items:[]});
  const [lensData,setLensData]       = useState({});   // { colour:{}, texture:{}, ... }
  const [lensStates,setLensStates]   = useState({});   // { colour:"idle"|"loading"|"done"|"error", ... }
  const [plantTraits,setPlantTraits] = useState({});   // { "Rose": { scented: "yes"|"no"|"unsure", colour: "red" } }
  const [colourPending,setColourPending] = useState(null); // { plantName, catKey } — awaiting colour input
  const [showArrow,setShowArrow]     = useState(false);
  const [chunkCount,setChunkCount]   = useState(0);  // live chunk counter for stall diagnosis
  const chunkCountRef                = useRef(0);

  const prefetchIdRef = useRef(0);
  const submitIdRef   = useRef(0);
  const abortRef      = useRef(null);
  const parserRef     = useRef(null);
  const skipNextPrefetchRef = useRef(false); // set when restoring climate from storage
  const pendingCalendarGardenRef = useRef(null); // garden to use in next handleSubmit call
  const uiIntervalRef = useRef(null);
  const openFarmCtxRef = useRef(""); // stores OpenFarm context for reuse in loadMoreMonths
  const sowingLogRef   = useRef([]); // accumulates sown/planted crops across batches for reminder
  const sunByMonthRef  = useRef({}); // { "January": 1.8, ... } from Open-Meteo, replaces SUN: field
  const calTopRef     = useRef(null);
  const monthRefs     = useRef({});  // name -> DOM node
  const scrollArrowRef = useRef(null);

  const nowIdx  = new Date().getMonth();
  const nowName = MONTH_NAMES[nowIdx];
  const totalPlants = Object.values(plants).flat().length;

  // Resolve video library region from stored climate data
  const videoRegion = meta?._derived?.climateType
    ? climateToRegion(meta._derived.climateType)
    : 'uk';


  // ── Prefetch meta ──────────────────────────────────────────────────────────
  const prefetchMeta = useCallback(async (c,o) => {
    if (!c||!o) return;
    const rid = ++prefetchIdRef.current;
    setPfState("fetching"); setMeta(null);
    // Quote fires immediately — visible during the climate data wait
    const q = GARDEN_QUOTES[Math.floor(Math.random() * GARDEN_QUOTES.length)];
    setLocationQuote({text: q.attribution ? `"${q.quote}" — ${q.attribution}` : q.quote, done:true});
    try {
      // Step 1: Geocode via Nominatim (OpenStreetMap) — deterministic, free, no tokens used.
      // Results are cached in localStorage so repeat lookups for the same city skip the network.
      const geoResult = await fetchNominatim(c);
      if (rid!==prefetchIdRef.current) return;

      // Step 2: Fetch real climate data from OpenMeteo
      const hemisphere = detectHemisphere(geoResult.lat);
      // Fetch climate data from Open-Meteo ERA5 archive (global coverage, reliable).
      // The climate normals API has been unreliable so we go straight to the archive.
      let cd;
      try {
        cd = await fetchOpenMeteoArchive(geoResult.lat, geoResult.lng);
        if (!cd.tMean || cd.tMean.every(v => v == null)) throw new Error("archive empty response");
      } catch(e) {
        console.error("[climate] archive failed:", e.message);
        throw new Error("Climate data unavailable for this location — Open-Meteo returned no data. Try a nearby larger city.");
      }
      if (rid!==prefetchIdRef.current) return;
      const derived = deriveClimateFromOM(cd, hemisphere);

      setMeta({
        lat: geoResult.lat, lng: geoResult.lng,
        zone: derived.zone,
        lastFrost: derived.lastFrost || "none",
        firstFrost: derived.firstFrost || "none",
        climate: derived.climateType,
        hemisphere,
        country_code: geoResult.country_code,
        // Store full climate data for prompt building
        _cd: cd, _derived: derived,
      });
      setPfState("ready");



      // Step 3: Claude-generated suggestions using real climate data
      // Fires after OpenMeteo data is available so real numbers ground the prompt
      setLocalSuggestions({});
      setSuggestionState({});
      (async () => {
        try {
          const mm = cd.monthly_mean_temp || [];
          const meanTemp    = mm.length ? (mm.reduce((a,b)=>a+b,0)/12).toFixed(1) : "unknown";
          const minTemp     = mm.length ? Math.min(...mm).toFixed(1) : "unknown";
          const maxTemp     = mm.length ? Math.max(...mm).toFixed(1) : "unknown";
          const tempRange   = mm.length ? (Math.max(...mm)-Math.min(...mm)).toFixed(1) : "unknown";
          const precip      = derived.annualPrecip ? Math.round(derived.annualPrecip) : "unknown";

          const suggestions = await callClaude(
            `You are an expert horticulturist advising on domestic garden plants.

Location: ${c}
${geoResult.country_code ? `Country: ${geoResult.country_code.toUpperCase()} — use plant names appropriate for this region (e.g. courgette not zucchini for UK, aubergine not eggplant for France, coriander not cilantro for UK/EU)\n` : ""}Measured climate (OpenMeteo ERA5 10-year averages):
  Mean annual temperature: ${meanTemp}°C
  Coldest month mean: ${minTemp}°C
  Warmest month mean: ${maxTemp}°C
  Annual temperature range: ${tempRange}°C${Number(tempRange) <= 13 ? " (oceanic/maritime — mild year-round)" : Number(tempRange) >= 16 ? " (continental influence — hot summers, cold winters)" : ""}
  Annual precipitation: ${precip}mm
  Last spring frost: ${derived.lastFrost || "none"}
  First autumn frost: ${derived.firstFrost || "none"}
  Climate character: ${derived.climateType}
  Hardiness: ${derived.zone}

List the 8 most commonly grown and popular plants for each category below.
Base your answer on what home gardeners in this specific region actually grow —
plants widely sold in local nurseries, culturally familiar, climate-appropriate.
Use the measured climate data above to reason about what will thrive, fruit and
overwinter here.

Important guidance:
- Vegetables: include regional kitchen garden staples, not just internationally common crops. E.g. Greek gardens grow okra, chilli, aubergine; French gardens grow haricot vert, courgette, potiron; British gardens grow runner bean, broad bean, potato.
- Herbs: include regionally characteristic herbs. E.g. tarragon and chervil for France, oregano and basil for Mediterranean regions, mint and chives for UK.
- Fruit: include common soft fruit and tree fruit actually grown in domestic gardens. Apple is almost always relevant for temperate/maritime climates.
- Flowers: Rose is almost always one of the most popular flowers in European domestic gardens — include it unless the climate is genuinely tropical. Use the most specific useful common name: "Pelargonium" not "Geranium" (Pelargonium is the popular bedding/container plant; true Geranium is a hardy perennial — distinguish these).
- Trees: include both ornamental and fruiting trees common in domestic gardens here.
- Shrubs: include characteristic hedging and boundary shrubs for this region, not just ornamentals.
- Regional specialities: if the location is known for specific plants (e.g. Agapanthus and Nerine in Channel Islands, lavender in Provence, bougainvillea on Greek islands), include them — these are genuinely iconic and commonly grown locally.
- A plant may appear in ONE category only — place it in the most appropriate one.
Order each list most→least popular.

Return ONLY valid JSON, no markdown:
{"vegetables":["name1","name2","name3","name4","name5","name6","name7","name8"],"herbs":["name1","name2","name3","name4","name5","name6","name7","name8"],"fruit":["name1","name2","name3","name4","name5","name6","name7","name8"],"flowers":["name1","name2","name3","name4","name5","name6","name7","name8"],"trees":["name1","name2","name3","name4","name5","name6","name7","name8"],"shrubs":["name1","name2","name3","name4","name5","name6","name7","name8"]}
Rules: 8 items per category, common names only, ordered most→least popular.
Respond entirely in ${langName()}. Use ${langName()} for all plant names and descriptions.`,
            500, undefined, provider, userKey
          );
          if (rid !== prefetchIdRef.current) return;
          // Map category names to our internal keys
          const keyMap = {vegetables:"vegetables",herbs:"herbs",fruit:"fruit",flowers:"flowers",trees:"trees",shrubs:"shrubs"};
          const mapped = {};
          const stateMap = {};
          Object.entries(keyMap).forEach(([src, dst]) => {
            if (suggestions[src]) {
              mapped[dst]   = suggestions[src];
              stateMap[dst] = "ready";
            }
          });
          setLocalSuggestions(mapped);
          setSuggestionState(stateMap);
        } catch(e) {
          console.warn("[suggestions] Claude call failed:", e?.message);
          // Leave suggestions empty — user can still type their own plants
          setSuggestionState({});
        }
      })();

    } catch(e) {
      if (rid===prefetchIdRef.current) setPfState("error");
    }
  },[]);

  // ── Wake-up ping — fires once on mount + first interaction to pre-warm Render free tier ──
  useEffect(() => {
    if (!PROXY_BASE || isArtifact()) return;
    const ping = () => fetch(`${PROXY_BASE}/api/health`, { method:"GET" })
      .then(r => r.json())
      .then(d => { if (d.ok) setUsage({ count: d.globalGenToday, cap: d.cap, ipCount: d.ipGenToday, ipCap: d.ipCap }); })
      .catch(() => {});
    ping(); // immediate on mount
    // Also ping on first user interaction in case Render spun down since mount
    const onFirstInteraction = () => { ping(); window.removeEventListener("pointerdown", onFirstInteraction); };
    window.addEventListener("pointerdown", onFirstInteraction, { once: true });
    return () => window.removeEventListener("pointerdown", onFirstInteraction);
  }, []);

  // Refresh usage when settings modal opens
  useEffect(() => {
    if (!showSettings || !PROXY_BASE || isArtifact()) return;
    fetch(`${PROXY_BASE}/api/health`)
      .then(r => r.json())
      .then(d => { if (d.ok) setUsage({ count: d.globalGenToday, cap: d.cap, ipCount: d.ipGenToday, ipCap: d.ipCap }); })
      .catch(() => {});
  }, [showSettings]);

  // Preferred Gemini models in priority order — first available wins
  const GEMINI_MODEL_PREFERENCE = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash-lite",
    "gemini-flash-latest",
    "gemini-pro-latest",
  ];

  const discoverGeminiModel = async (key) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const available = new Set(
      (data.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => m.name.replace("models/", ""))
    );
    const chosen = GEMINI_MODEL_PREFERENCE.find(m => available.has(m));
    if (!chosen) throw new Error(
      `No supported Gemini model found on your account. Available: ${[...available].filter(m=>m.startsWith("gemini")).slice(0,5).join(", ")}`
    );
    return chosen;
  };

  const saveProviderSettings = async (newProvider, newKey) => {
    setKeyError("");
    if (newProvider === "gemini" && newKey) {
      setKeyVerifying(true);
      try {
        const model = await discoverGeminiModel(newKey);
        try {
          localStorage.setItem("gc_gemini_model", model);
        } catch {}
        setGeminiModel(model);
      } catch (e) {
        setKeyVerifying(false);
        setKeyError(e.message);
        return; // don't save if discovery failed
      }
      setKeyVerifying(false);
    }
    try {
      localStorage.setItem("gc_provider", newProvider);
      if (newKey) localStorage.setItem("gc_user_key", newKey);
      else localStorage.removeItem("gc_user_key");
    } catch {}
    setProvider(newProvider);
    setUserKey(newKey);
    setKeyDraft("");
    setShowSettings(false);
  };

  useEffect(()=>{
    if (city&&orientation&&(!isArtifact()||apiKey)) {
      // Skip re-fetch if metaRef already has valid climate for this city
      if (metaRef.current?._cd && prefetchState === "ready") return;
      const timer = setTimeout(() => prefetchMeta(city,orientation), 600);
      return () => clearTimeout(timer);
    } else {
      setPfState("idle"); setMeta(null);
    }
  },[city,orientation,apiKey,prefetchMeta,prefetchState]);

  // ── About tab — auto-fetch climate + insights ───────────────────────────────
  useEffect(() => {
    if (activeTab !== "about") return;
    if (!meta && city && orientation && prefetchState === "idle") {
      prefetchMeta(city, orientation);
    }
    if (meta && insights.state === "idle") {
      fetchInsights();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, meta, insights.state, prefetchState]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!city||!orientation) { setError("Please fill in city and orientation."); return; }
    setRateLimitMsg("");
    // Abort previous stream
    if (abortRef.current) { abortRef.current.abort(); }
    if (parserRef.current) { parserRef.current.cancel(); parserRef.current = null; }
    if (uiIntervalRef.current) { clearInterval(uiIntervalRef.current); uiIntervalRef.current = null; }
    await new Promise(r => setTimeout(r, 50));
    const abort = new AbortController();
    abortRef.current = abort;
    const rid = ++submitIdRef.current;

    // ── Start calendar generation ────────────────────────────────────────────
    setStage("calendar");
    setError("");
    setS1Done(false); setActiveMonth(null);
    unlockedPages.current = new Set();
    userNavigatedRef.current = false;
    setInspos({}); setInsights({state:"idle", items:[]}); setLensData({}); setLensStates({}); setPlantTraits(p => p); // preserve plantTraits across regenerations
    setShowArrow(true);
    sowingLogRef.current = []; // reset sowing log for fresh generation
    setPlantMeta(prev => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => { next[k] = { ...v, occurrence: undefined }; });
      return next;
    });
    const init = {};
    MONTH_NAMES.forEach(n=>{ init[n]=emptyMonth(n); });
    setMonths(init);

    setPageIdx(0);

    const featuresCtx = features.length ? ` Garden features: ${features.join(", ")}.` : "";
    const now = `${MONTH_NAMES[nowIdx]} ${new Date().getFullYear()}`;

    // Build the 12-month sequence starting one month before current, wrapping around
    const startIdx = (nowIdx + 11) % 12;
    const orderedMonths = Array.from({length:12}, (_,i) => MONTH_NAMES[(startIdx + i) % 12]);
    // First pass: only generate prev + current + next 3 months
    const firstBatch = orderedMonths.slice(0, 3);

    // Ensure meta — wait for prefetch if in progress, reuse if ready, fetch fresh only if idle
    let m = null;
    let occurrenceByName = {}; // populated after GBIF checks, used to build allPlants
    try {
        // If prefetch already has real climate data, reuse it immediately
        if (metaRef.current?._cd && metaRef.current?.lat && metaRef.current?.lng) {
          m = metaRef.current;
        } else if (prefetchState === "fetching") {
          // Prefetch is in flight — poll for up to 15s rather than making a duplicate call
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (metaRef.current?._cd) { m = metaRef.current; break; }
            if (rid !== submitIdRef.current) return;
          }
          if (!m) { setError("Climate data timed out. Please try again."); return; }
        } else {
          // Fallback: geocode via Nominatim + fetch OpenMeteo
          // (Reaches here only if prefetch never fired — e.g. orientation was blank when city was typed)
          const geoResult = await fetchNominatim(city);
          if (rid!==submitIdRef.current) return;
          const hemisphere = detectHemisphere(geoResult.lat);
          // Fetch climate data from Open-Meteo ERA5 archive (global coverage, reliable).
      let cd;
      try {
        cd = await fetchOpenMeteoArchive(geoResult.lat, geoResult.lng);
        if (!cd.tMean || cd.tMean.every(v => v == null)) throw new Error("archive empty response");
      } catch(e) {
        console.error("[climate] archive failed:", e.message);
        throw new Error("Climate data unavailable for this location — try a nearby larger city.");
      }
          if (rid!==submitIdRef.current) return;
          const derived = deriveClimateFromOM(cd, hemisphere);
          m = {
            lat: geoResult.lat, lng: geoResult.lng,
            zone: derived.zone,
            lastFrost: derived.lastFrost || "none",
            firstFrost: derived.firstFrost || "none",
            climate: derived.climateType,
            hemisphere,
            country_code: geoResult.country_code,
            _cd: cd, _derived: derived,
          };
        }
        if (rid===submitIdRef.current) {
          setMeta(m);
          // Fire GBIF occurrence checks for ALL plants and AWAIT them before building prompt
          // Uses scientific name if validated, raw name otherwise (catches plants like coconut)
          if (m?.lat && m?.lng) {
            try {
              const allPlantNames = Object.values(plants).flat();
              // Concurrent in batches of 5 — fast enough, avoids GBIF rate limiting
              const BATCH = 5;
              const occResults = [];
              for (let i = 0; i < allPlantNames.length; i += BATCH) {
                const batch = allPlantNames.slice(i, i + BATCH);
                const batchResults = await Promise.all(batch.map(async plantName => {
                  try {
                    const meta = plantMetaRef.current[plantName];
                    const queryName = meta?.scientificName || COMMON_TO_SCIENTIFIC[plantName.toLowerCase()] || plantName;
                    const occ = await checkRegionalOccurrence(queryName, m.lat, m.lng);
                    return { plantName, occ };
                  } catch {
                    return { plantName, occ: null };
                  }
                }));
                occResults.push(...batchResults);
                if (i + BATCH < allPlantNames.length) await new Promise(r => setTimeout(r, 200));
              }
              // Batch update plantMeta with all occurrence results
              setPlantMeta(prev => {
                const next = { ...prev };
                occResults.forEach(({ plantName, occ }) => {
                  if (occ !== null) {
                    next[plantName] = { ...(next[plantName]||{}), occurrence: occ };
                  }
                });
                return next;
              });
              // Build occurrenceByName for immediate use in prompt (before React re-renders)
              occurrenceByName = {};
              occResults.forEach(({ plantName, occ }) => {
                if (occ !== null) occurrenceByName[plantName] = occ;
              });
            } catch {
              // GBIF batch failed entirely — continue without occurrence data
            }
          }
        }
    } catch(e) {
      if (e.name==="AbortError") return;
      if (e.isRateLimit) { setRateLimitMsg(e.message); return; }
      setError("Failed to fetch climate data."); return;
    }

    // ── OpenFarm: batch-fetch sowing/harvest data for vegetables and herbs ──────
    // OpenFarm disabled — endpoint currently unavailable
    let openFarmData = {};
    const openFarmLines = Object.entries(openFarmData)
      .map(([, attrs]) => {
        const parts = [];
        if (attrs.name)          parts.push(attrs.name);
        if (attrs.sowing_method) parts.push(attrs.sowing_method.replace(/\n+/g, " ").trim());
        else if (attrs.description) parts.push(attrs.description.replace(/\n+/g, " ").trim().slice(0, 200));
        return parts.length >= 2 ? parts.join(": ") : null;
      })
      .filter(Boolean);
    const openFarmCtx = openFarmLines.length > 0
      ? `\nOPENFARM GROWING DATA (use for sowing and harvest task timing — CC BY openfarm.cc):\n${openFarmLines.join("\n")}`
      : "";
    openFarmCtxRef.current = openFarmCtx;

    // ── Knowledge-limited plant detection ────────────────────────────────────
    // Flag vegetables and herbs where cultivation data is sparse:
    // signal 1 — OpenFarm returned nothing for this plant
    // signal 2 — GBIF occurrence count < 10, or plant couldn't be validated
    // If both signals fire, mark the plant as knowledge-limited so the UI can
    // show an inline advisory to check with the local horticultural society.
    //
    // Whitelist: well-known cultivated plants that are absent from OpenFarm/GBIF
    // for structural reasons (OpenFarm skews North American; GBIF records wild
    // botanical sightings not garden cultivation). These plants are widely grown
    // and well-documented — Claude's knowledge of them is reliable.
    const KNOWLEDGE_WHITELIST = new Set([
      // Common European/global herbs
      "mint","thyme","oregano","rosemary","basil","parsley","chives","sage",
      "dill","fennel","tarragon","marjoram","chervil","bay","lavender","lemon thyme",
      "lemon balm","sorrel","lovage","savory","winter savory","summer savory",
      // Common vegetables
      "tomato","courgette","cucumber","pepper","aubergine","carrot","potato",
      "onion","garlic","leek","spinach","lettuce","kale","chard","peas",
      "runner bean","french bean","broad bean","beetroot","radish","turnip",
      "broccoli","cauliflower","cabbage","brussels sprouts","celery","sweetcorn",
      "squash","pumpkin","sweet potato","parsnip","swede","spring onion",
      // Common fruit
      "strawberry","raspberry","blackcurrant","redcurrant","gooseberry",
      "apple","pear","plum","cherry","peach","apricot","fig","grape",
      "blueberry","blackberry","rhubarb",
    ]);

    const knowledgeLimitedPlants = new Set();
    const vegHerbEntries = [
      ...plants.vegetables.map(p => ({ p, cat: "vegetables" })),
      ...plants.herbs.map(p => ({ p, cat: "herbs" })),
    ];
    vegHerbEntries.forEach(({ p }) => {
      // Skip whitelisted plants — absence from OpenFarm/GBIF is a database gap,
      // not a knowledge gap
      if (KNOWLEDGE_WHITELIST.has(p.toLowerCase())) return;
      const noOpenFarm = !openFarmData[p.toLowerCase()];
      const occ = occurrenceByName[p] ?? plantMetaRef.current[p]?.occurrence ?? null;
      const lowOccurrence = occ === null || occ.count < 10;
      if (noOpenFarm && lowOccurrence) knowledgeLimitedPlants.add(p);
    });
    if (knowledgeLimitedPlants.size > 0) {
      setPlantMeta(prev => {
        const next = { ...prev };
        knowledgeLimitedPlants.forEach(p => {
          next[p] = { ...(next[p] || {}), knowledgeLimited: true };
        });
        return next;
      });
    }

    // Build rich climate context from real OpenMeteo data
    const metaCtx = m?._cd && m?._derived
      ? `\nREAL CLIMATE DATA for ${city} (10-year averages, Open-Meteo/ERA5):\n${buildClimateContext(m._cd, m._derived)}`
      : m ? `Zone:${m.zone}. Last frost:${m.lastFrost}. First frost:${m.firstFrost}. Climate:${m.climate}.` : "";

    // ── Sun hours from Open-Meteo — replaces SUN: model generation ───────────
    // cd.sunHrs is a 12-element array indexed Jan=0…Dec=11 from Open-Meteo.
    // We map it to a month-name lookup and store in a ref for loadMoreMonths.
    // The line parser will pre-populate sunHours from this map when a MONTH: header
    // is encountered, so the model never needs to generate SUN: values.
    if (m?._cd?.sunHrs) {
      const lookup = {};
      MONTH_NAMES.forEach((name, i) => {
        const raw = m._cd.sunHrs[i];
        lookup[name] = raw != null ? Math.round(raw * 10) / 10 : null;
      });
      sunByMonthRef.current = lookup;
    } else {
      sunByMonthRef.current = {};
    }

    // Build allPlants NOW — after occurrence data is available in occurrenceByName
    // enrichedPlantName reads from plantMeta but React hasn't re-rendered yet,
    // so we pass occurrence data directly via a local lookup
    const allPlants = Object.entries(plants).map(([k,v])=>v.length
      ? `${k}: ${v.map(p => {
          const meta = plantMetaRef.current[p] || {};
          const occ = occurrenceByName[p] ?? meta.occurrence ?? null;
          const metaWithOcc = { ...meta, occurrence: occ };
          return enrichedPlantName(p, metaWithOcc, getClimateZone(m?._cd));
        }).join(", ")}`
      : null).filter(Boolean).join(" | ")||"general/unspecified mix";

    // ── STREAM 1: line-format tasks + enjoy ──────────────────────────────────
    const s1prompt = `You are an expert horticulturist and naturalist.
Location: ${city}. Orientation: ${orientation}. Plants: ${allPlants}.${featuresCtx} Date: ${now}. ${metaCtx}${openFarmCtx}

Output EXACTLY ${firstBatch.length} blocks in this order: ${firstBatch.join(", ")}.
Use ONLY this exact line format. No extra text, no markdown, no explanation.

MONTH:February
SEASON:Winter
TASK:Cut ALL autumn-fruiting raspberry canes to ground level, clearing old growth
TASK:Sow sweet peas singly in 7cm root trainers on a bright frost-free windowsill
ENJOY:Forsythia — tight yellow buds swelling on bare stems, days from opening
ENJOY:Blackbird — males singing territorial song from the apple tree at first light
---
MONTH:June
SEASON:Summer
TASK:Trim rosemary and thyme lightly after flowering, cutting only green leafy growth
TASK:Pot up strawberry runners into 9cm pots, pinning into compost while still attached
TASK:Pinch fig shoot tips to 5 leaves to concentrate energy into swelling fruitlets
TASK:Harvest courgettes when 15–20cm, checking every 2 days to prevent marrow formation
ENJOY:Swift — screaming low over the raised beds in tight formation, hawking insects
ENJOY:Lavender — first purple spikes opening at the tips, bees working methodically upward
---

CLIMATE-AWARE PLANT RULE — apply before writing any task or enjoy for a plant:
Some plants in the inventory carry a note like "ornamental only", "will not fruit in this climate", or "conservatory". For these plants: tasks must reflect what the plant actually DOES in this climate (overwintering, foliage care, pot management) — never suggest fruiting, harvesting fruit, or flowering behaviour that requires a warmer climate. A banana in a temperate garden gets tasks about protecting the crown in winter and cutting back frost-damaged stems — not about fruiting. A bougainvillea on a sheltered wall gets watering and frost-fleece tasks — not about vigorous outdoor climbing.

CLIMATE HAZARD RULE — read the season note in the climate data above and act on it:
If the season note mentions wind (e.g. Mistral, Tramontane, coastal exposure): include at least one wind-aware task per month in the growing season — staking tall plants, sheltering tender transplants, securing climbers, windbreak advice for the vegetable patch.
If the season note mentions drought or summer heat: include water conservation tasks in peak summer months — mulching, irrigation timing, shade cloth for vulnerable crops.
If the season note mentions high humidity or disease pressure: include preventive disease tasks — leaf hygiene, airflow pruning, fungicide timing.
Apply these throughout the year, not just when the hazard is at its worst — preparation in April prevents losses in July.

ENJOY RULE — apply before writing every ENJOY line:
Each observation must capture something actively happening or transitioning THIS specific month — an emergence, arrival, behaviour, or sensory shift. Push for geographic and sensory specificity: name the sound, the scent, the time of day, the exact behaviour. A line that could describe any garden anywhere is not good enough — aim for something that could only be written for this location, this month, this garden.
SCALE RULE — this is a residential town garden, NOT a stately home or nature reserve. Every wildlife observation must be plausible in a small urban garden. Ask: could a person realistically see this from their kitchen window in a city?
PASS: Robin singing from a fence post. Blackbird foraging under shrubs. Swift passing overhead. Bumblebee on lavender. Wall lizard basking on warm paving. Cicada chorus from the cypress tops.
FAIL: Murmuration of starlings (landscape-scale). Barn owl hunting (farmland). Deer grazing. Red kite circling (rural).
GOOD: "Forsythia — tight yellow buds swelling on bare stems, days from opening"
GOOD: "Cicada — the rhythmic metallic buzzing reaching a crescendo from the cypress tops in the afternoon heat"
GOOD: "Mimosa — thousands of yellow pompom flowers bursting open, scenting the air with honey" (January–February only in Mediterranean climates)
GOOD: "Wall lizard — emerging to bask on sun-warmed paving stones during the midday heat"
BAD: "Lavender — purple flowers in the garden" / "Roses — beautiful blooms"

COVERAGE MANDATE — plan this before writing any months.
Use 3 task slots in winter months (Nov–Mar) and up to 4 in peak months (Apr–Oct). Every plant in the inventory must appear by name in at least one TASK with an appropriate task type. Required task types per plant type:
- Fruit trees (apple, pear, fig): prune + harvest
- Spring-flowering shrubs (forsythia, camellia, lilac): prune after flowering
- Summer-flowering shrubs (hydrangea, buddleja): prune in spring before growth
- Mediterranean shrubs (lavender, rosemary, sage, thyme): light trim after flowering only
- Bulbs (tulip, allium, daffodil): plant in autumn + lift/store after foliage dies
- Perennials (peony, salvia, geranium): mulch or divide at least once
- Fruiting vegetables (tomatoes, courgettes, peppers): sow + harvest + pest monitor
- Climbing/podding veg (runner beans, peas): sow + harvest
- Soft fruit (strawberries, raspberries, currants): prune + harvest
- Herbs: light trim after flowering

LIFECYCLE RULES — apply before every pruning task:
- Forsythia, Camellia and other spring-bloomers: flower Feb–Apr on last year's wood. Prune ONLY May–Jun after flowering. NEVER suggest pruning Jan–Apr.
- Hydrangea (mophead/lacecap): leave flowerheads ALL winter for frost protection. Prune in April only, after last frost risk passes, cutting to first pair of fat buds.
- Lavender: trim in August after flowering to base of spike. Spring: remove frost-damaged tips 2–3cm max only. NO hard prune ever.
- Rosemary, Thyme, Sage: FULLY HARDY in most UK and temperate climates — do NOT suggest lifting or bringing indoors for winter. Light trim after flowering only. Never cut into old leafless wood.
- Apple: summer prune new laterals to 3 leaves above basal cluster (Jul–Aug). Structural prune late Feb only — not January.
- Raspberries: autumn-fruiting → cut ALL canes to ground level in Feb. Summer-fruiting → cut only fruited canes IMMEDIATELY after harvest in Aug — not October, not later.
- Peony: herbaceous perennial — cut back to ground level ONCE only in autumn (Oct–Nov) after foliage yellows and dies. NEVER cut back in spring or summer — removing green foliage in March, July, or September starves the tuber. One cut per year, in autumn only.
- Agapanthus: evergreen varieties (most common in gardens) — NEVER cut foliage to ground level. Remove only spent flower stems and dead outer leaves. Only deciduous agapanthus can be cut back fully in winter.
- Broad beans (southern hemisphere): winter crop — sow Mar–Jun, harvest Sep–Oct when pods are plump. NEVER place broad bean harvest in summer months (Dec–Feb) — pods will be tough, starchy and diseased by then.
- Oleander: evergreen and frost-tender — NEVER hard prune in winter. Prune in late summer after flowering (Aug–Sep) or in spring once frost risk has passed. Hard pruning in winter exposes new growth to cold damage.
- Mediterranean stone fruit harvest windows: Peach and Apricot ripen Jun–Sep in Zone 9–10 (never November). Cherry ripens May–Jun in Zone 9–10 (not July — birds finish them by then). Fig has two crops — Breba figs Jun–Jul, main crop Aug–Oct. Do NOT reference peach, apricot or cherry after their harvest window ends — no "final leaves", no "last fruits" in October/November.
- Mediterranean bloom timing: Almond blooms January–February in Zone 9–10 (not March — by March it has green leaves). Peach blooms February–March in Zone 9–10 (not April/May — by May the tree has small green fruits). Never place almond or peach blossom enjoyment after March.
- Mimosa (Acacia dealbata): blooms January–February in Mediterranean climates. By March flowers are fading. Do NOT place mimosa bloom enjoyment in spring or summer months.
- Iris: Mediterranean iris (Iris germanica) grows from rhizomes NOT bulbs. Rhizomes must sit ON the soil surface, half-exposed to bake in the sun — never buried deep. NEVER say "plant iris bulbs 10cm deep" — this causes rot. Say "plant iris rhizomes with the top half exposed at soil surface".

TIMING RULES — use the real climate data above, not assumptions:
- Last spring frost ${m?._derived?.lastFrost || m?.lastFrost || "mid-March"}: no tender crops outdoors before this. NEVER direct-sow or plant out frost-sensitive crops (runner beans, French beans, courgettes, tomatoes, peppers, aubergines, basil, dahlias) before this date. Indoor sowing for later transplanting is fine before this date.
- Soil temperature matters as much as frost date: do not plant out tomatoes or basil until night temperatures are consistently above 10°C — even if frost risk has passed, cold soil causes phosphorus deficiency and stunted growth.
- First autumn frost ${m?._derived?.firstFrost || m?.firstFrost || "mid-November"}: harvest or protect tender crops before this.
- If frost-free year-round: no cold protection tasks needed. Focus on wet/dry season and heat management.
- Lawn feed: spring/summer blend only. NEVER apply during coldest 3 months.
- ${m?._derived?.seasonNote ? `HEMISPHERE/SEASON: ${m._derived.seasonNote}` : ""}

INVENTORY RULE: ONLY suggest tasks for plants explicitly listed in this garden's inventory above. Before writing every single TASK line, ask: "Is this plant in the inventory list?" If no — do not write the task. Delete it and replace it with a task for a plant that IS in the list. Common garden plants that are NOT in this inventory (e.g. rhubarb, leeks, broad beans, garlic, onions, sweet peas, asparagus, potatoes, sweet corn, parsnips) must never appear in tasks even if they would typically grow in this climate. Always refer to plants by their common name as listed — never use scientific names in task or enjoy text.

SPECIFICITY RULE: Every TASK must include a measurement, plant part, method, or timing cue.
FAIL: "Prune apple" / "Feed lawn" / "Check for pests" / "Water plants"
PASS: "Summer prune apple laterals to 3 leaves above basal cluster" / "Apply 35g/m² balanced granular feed" / "Inspect tomato leaves weekly for early blight — remove affected leaves immediately"

BREVITY RULE: Every TASK line must be under 20 words. Write in terse imperative style — no subordinate clauses, no "in order to", no "to ensure that". Start with a verb. Include the key measurement or method, then stop.
BAD: "Prune established Rose bushes, cutting dead, damaged, or crossing stems, and reducing healthy stems by one-third above an outward-facing bud."
GOOD: "Prune roses, cutting stems back to an outward-facing bud 15cm above ground."

ENJOY FORMAT: Start every ENJOY line with the subject (plant, bird, insect or phenomenon) followed by an em-dash, then a short concrete observation.

Other rules:
- TASK: 3 lines in winter months (Nov–Mar); up to 4 lines in peak months (Apr–Oct). Include at least one task referencing a garden feature (${features.length ? features.join(", ") : "any features present"}) where seasonally relevant.
- ENJOY: exactly 2 lines. At least one wildlife or seasonal visitor.
- SEASON: Winter/Spring/Summer/Autumn for temperate and subtropical climates. For tropical or frost-free climates use Wet season/Dry season/Hot season/Cool season as appropriate.
- End each block with ---
- Output all 12 months in order. NO other text.
- Respond entirely in ${langName()}. All task and enjoy text must be in ${langName()}.`;

    const parser1 = makeLineParser((snapshot) => {
      if (rid!==submitIdRef.current) return;
      const active = Object.values(snapshot).find(m=>m._state==="active");
      setActiveMonth(active ? active.month : null);
      setMonths(prev => ({ ...prev, ...snapshot }));
    }, sunByMonthRef.current, (entry) => { sowingLogRef.current.push(entry); });
    parserRef.current = parser1;

    chunkCountRef.current = 0;
    setChunkCount(0);

    // Drive UI updates at 1000ms — balance between live feel and mobile performance
    uiIntervalRef.current = setInterval(() => {
      parser1.doFlush();
      setChunkCount(chunkCountRef.current);
    }, 1000);

    // Stall detector — if no chunks for 22s (Claude/proxy) or 60s (Gemini, allows retry backoff), abort and show error
    let lastChunkAt = Date.now();
    const stallLimit = (provider === "gemini" && userKey) ? 65000 : 22000;
    const stallTimer = setInterval(() => {
      if (Date.now() - lastChunkAt > stallLimit) {
        clearInterval(stallTimer);
        abort.abort();
        clearInterval(uiIntervalRef.current); uiIntervalRef.current = null;
        setError("Stream stalled — no data received. Please try again.");
      }
    }, 2000);

    try {
      console.log('[stream] firing', { city, firstBatch, metaCd: !!m?._cd, provider });
      await streamClaude(s1prompt, 3500, (chunk) => {
        chunkCountRef.current++;
        lastChunkAt = Date.now();
        parser1.onChunk(chunk);
      }, abort.signal, provider, userKey);
      parser1.flush();
    } catch(e) {
      clearInterval(stallTimer);
      clearInterval(uiIntervalRef.current); uiIntervalRef.current = null;
      if (e.name==="AbortError"||rid!==submitIdRef.current) return;
      if (e.isRateLimit) { setRateLimitMsg(e.message); return; }
      setError((e.isStreamError ? "Stream failed: " : "Generation failed: ")+e.message); return;
    }
    clearInterval(stallTimer);
    clearInterval(uiIntervalRef.current); uiIntervalRef.current = null;
    if (rid!==submitIdRef.current) return;
    // Mark all remaining active months as done
    setMonths(prev => {
      const next={...prev};
      Object.keys(next).forEach(k=>{ if(next[k]._state==="active") next[k]={...next[k],_state:"done",_taskPartial:null,_enjoyPartial:null}; });
      return next;
    });
    setS1Done(true); setActiveMonth(null);
    setShowArrow(false);
    saveCurrentGarden();
  };

  const loadMoreMonths = async () => {
    if (loadingMore || loadedBatches >= 4) return;
    setLoadingMore(true);
    const abort = new AbortController();
    abortRef.current = abort;
    const rid = submitIdRef.current; // reuse existing rid — same session

    const startIdx = (nowIdx + 11) % 12;
    const orderedMonths = Array.from({length:12}, (_,i) => MONTH_NAMES[(startIdx + i) % 12]);
    const batchStart = loadedBatches * 3;
    const nextBatch  = orderedMonths.slice(batchStart, batchStart + 3);
    if (!nextBatch.length) { setLoadingMore(false); return; }

    // Build same context as handleSubmit
    const featuresCtx = features.length ? ` Garden features: ${features.join(", ")}.` : "";
    const now = `${MONTH_NAMES[nowIdx]} ${new Date().getFullYear()}`;
    const m = meta;
    const metaCtx = m ? [
      `Climate type: ${m.climate}`,
      `Hardiness zone: ${m.zone}`,
      `Last frost: ${m.lastFrost}`, `First frost: ${m.firstFrost}`,
      `Hemisphere: ${m.hemisphere}`,
      m._derived?.seasonNote ? `IMPORTANT: ${m._derived.seasonNote}` : "",
    ].filter(Boolean).join(". ") : "";
    const allPlants = Object.entries(plants).map(([k,v])=>v.length
      ? `${k}: ${v.map(p => {
          const pm = plantMetaRef.current[p] || {};
          return enrichedPlantName(p, pm, getClimateZone(m?._cd));
        }).join(", ")}`
      : null).filter(Boolean).join(" | ")||"general/unspecified mix";

    // Garden rules reminder — re-stated every batch so rules don't drift across 4 API calls.
    // Includes: full inventory list, frost date + sensitive crop list, sowing log from prior batches.
    const allPlantsList = Object.values(plants).flat().join(", ");
    const lastFrost = m?._derived?.lastFrost || m?.lastFrost || "none";
    const frostFree = lastFrost === "none";
    const sowingLogSummary = sowingLogRef.current.length > 0
      ? `Already sown/planted in earlier months (do not duplicate):\n${sowingLogRef.current.slice(-12).join("\n")}`
      : "No crops sown or planted in earlier batches yet.";

    const gardenRulesReminder = `
GARDEN RULES REMINDER — apply these for every task in this batch:
INVENTORY: The complete plant list for this garden is: ${allPlantsList}. Before writing every TASK line ask: is this plant in the list above? If not — delete and replace. Never introduce unlisted plants. Common culprits that must NOT appear unless listed: rhubarb, leeks, broad beans, garlic, onions, sweet peas, asparagus, potatoes, sweet corn, parsnips — these are typical garden plants but are NOT in this inventory unless explicitly named above.
FROST TIMING: Last spring frost: ${lastFrost}.${frostFree ? " Frost-free year-round — no cold protection tasks." : ` NEVER direct-sow or plant out frost-sensitive crops (tomatoes, courgettes, runner beans, French beans, peppers, aubergines, basil, dahlias) before this date. Indoor sowing is fine before this date.`}
${sowingLogSummary}`;

    const batchPrompt = `You are an expert horticulturist and naturalist.
THIS GARDEN'S COMPLETE PLANT LIST — the ONLY plants you may write tasks for: ${allPlantsList}.
Location: ${city}. Orientation: ${orientation}. Plants: ${allPlants}.${featuresCtx} Date: ${now}. ${metaCtx}${openFarmCtxRef.current}
${gardenRulesReminder}

Output EXACTLY ${nextBatch.length} blocks in this order: ${nextBatch.join(", ")}.
Use ONLY this exact line format. No extra text, no markdown, no explanation.

MONTH:February
SEASON:Winter
TASK:Cut ALL autumn-fruiting raspberry canes to ground level, clearing old growth
ENJOY:Forsythia — tight yellow buds swelling on bare stems, days from opening
ENJOY:Blackbird — males singing territorial song from the apple tree at first light
---

CLIMATE-AWARE PLANT RULE: For any plant noted as "ornamental only" or "will not fruit in this climate", tasks must reflect what it actually does here — never suggest fruiting or warm-climate behaviour.
CLIMATE HAZARD RULE: If the climate data mentions wind (Mistral, Tramontane, coastal exposure): include at least one wind-aware task per growing-season month — staking, sheltering transplants, securing climbers. If drought or summer heat: include water conservation tasks. If humidity or disease pressure: include preventive disease tasks.
FROST TIMING RULE: NEVER direct-sow or plant out frost-sensitive crops (runner beans, French beans, courgettes, tomatoes, peppers, aubergines, basil, dahlias) before the stated last spring frost date. Indoor sowing for later transplanting is fine before this date.
INVENTORY RULE: Before writing every TASK line, ask: "Is this plant in the inventory list?" If no — do not write the task. Replace it with a task for a listed plant. Never introduce unlisted plants even if typical for this climate. Common culprits: rhubarb, leeks, broad beans, garlic, onions, sweet peas, asparagus, potatoes, sweet corn, parsnips.
SEASON RULE: Use Winter/Spring/Summer/Autumn for temperate and subtropical climates. For tropical or frost-free climates use Wet season/Dry season/Hot season/Cool season as appropriate. SOUTHERN HEMISPHERE: Summer=Dec–Feb, Autumn=Mar–May, Winter=Jun–Aug, Spring=Sep–Nov — never label February as Winter or June as Summer in a southern hemisphere garden.
ENJOY RULE: Each observation must capture something actively happening THIS specific month with sensory and geographic specificity — name the sound, scent, time of day, or exact behaviour. A line that could describe any garden anywhere is not good enough. Residential garden scale only.
ENJOY COUNT: Always write EXACTLY 2 ENJOY lines per month block — no more, no fewer.
BREVITY: Every TASK line must be under 20 words. Terse imperative style — start with a verb, include the key measurement or method, then stop. No subordinate clauses.
COVERAGE: Every plant should appear in at least one task across all generated months. Use 3 tasks in winter, up to 4 in peak months.
LIFECYCLE: Key rules — Peony: cut back ONCE in autumn (Oct–Nov) only, never in spring or summer. Raspberries: summer-fruiting cut immediately after harvest in Aug, not October. Agapanthus: evergreen varieties — remove only spent flower stems and dead leaves, NEVER cut foliage to ground. Broad beans (S hemisphere): harvest Sep–Oct, not summer. Oleander: prune Aug–Sep only, never winter. Stone fruit: peach/apricot harvest Jun–Sep, cherry May–Jun. Almond/peach bloom Feb–Mar only. Mimosa Jan–Feb only. Iris: rhizomes at soil surface, top half exposed — never buried. Spring-bloomers: prune after flowering May–Jun only. Lavender: trim August only. Tomatoes/basil: plant out only when nights consistently above 10°C.
Respond entirely in ${langName()}. All task and enjoy text must be in ${langName()}.`;

    // Init the new months as pending
    setMonths(prev => {
      const next = {...prev};
      nextBatch.forEach(n => { if (!next[n] || next[n]._state === "pending") next[n] = emptyMonth(n); });
      return next;
    });

    const parser = makeLineParser((snapshot) => {
      setMonths(prev => ({...prev, ...snapshot}));
      setChunkCount(c => c+1);
    }, sunByMonthRef.current, (entry) => { sowingLogRef.current.push(entry); });
    parserRef.current = parser;

    try {
      await streamClaude(batchPrompt, 3500, (chunk) => {
        chunkCountRef.current++;
        parser.onChunk(chunk);
      }, abort.signal, provider, userKey);
      parser.flush();
      setLoadedBatches(b => b + 1);
    } catch(e) {
      if (e.name !== "AbortError") console.warn("loadMore failed:", e.message);
    }
    setLoadingMore(false);
  };

  const resetAll = () => {
    if (abortRef.current) abortRef.current.abort();
    if (parserRef.current) { parserRef.current.cancel(); parserRef.current = null; }
    if (uiIntervalRef.current) { clearInterval(uiIntervalRef.current); uiIntervalRef.current = null; }
    ++prefetchIdRef.current; ++submitIdRef.current;
    unlockedPages.current = new Set();
    setStage("form"); setFormStep("location"); setShowHome(hasSavedGardens() && gardens.length > 0); setLocationQuote({text:"",done:false}); setLoadedBatches(1); setLoadingMore(false); setMeta(null); setMonths({}); setInspos({}); setInsights({state:"idle",items:[]}); setLensData({}); setLensStates({}); setPlantTraits({});
    setPfState("idle"); setS1Done(false); setError(""); setRateLimitMsg(""); setShowArrow(false); setFeatures([]); setPlantMeta({});
    setTodayGarden(null); setWeatherData(null); setWeatherSignals([]); setWeatherLoading(false); setWeatherError(null);
    setTodayTasks(null); setTodayTasksLoading(false); setTodayTasksError(null);
    setTodayRefreshUsed(false); setTodayRefreshLoading(false);
    setInatData(null); setInatLoading(false); setInatError(null);
  };
  
// Save garden link to clipboard + add to favourites
  const fetchTodayWeather = useCallback(async (garden) => {
    if (!garden?.lat || !garden?.lng) {
      setWeatherError('No location data for this garden — please regenerate your calendar first.');
      return;
    }
    const cached = readWeatherCache(garden.id);
    if (cached) {
      setWeatherData(cached);
      setWeatherSignals(computeUrgencySignals(cached));
      setWeatherLoading(false);
      return;
    }
    setWeatherLoading(true);
    setWeatherError(null);
    setWeatherData(null);
    setWeatherSignals([]);
    try {
      const data = await fetchWeatherForecast(garden.lat, garden.lng);
      writeWeatherCache(garden.id, data);
      setWeatherData(data);
      setWeatherSignals(computeUrgencySignals(data));
    } catch (e) {
      setWeatherError(e.message || 'Could not fetch weather data');
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  // ── Silent calendar refresh for Today view ───────────────────────────────
  // Called when a garden has no calendarTasks (generated before Sprint 3, or never generated).
  // Uses callAI (non-streaming JSON) — faster than full streaming, no ENJOY lines needed.
  // Returns the calendar tasks object { monthName: string[] } or null on failure.
  const generateCalendarForToday = useCallback(async (garden) => {
    const cd  = garden.climateData?._cd;
    const der = garden.climateData?._derived;
    if (!cd || !der) return null;

    const nowMonthIdx = new Date().getMonth();
    const startIdx = (nowMonthIdx + 11) % 12;
    const batch = Array.from({length:3}, (_,i) => MONTH_NAMES[(startIdx + i) % 12]);
    const now = `${MONTH_NAMES[nowMonthIdx]} ${new Date().getFullYear()}`;

    const allPlants = Object.entries(garden.plants || {})
      .map(([k,v]) => v.length ? `${k}: ${v.join(', ')}` : null)
      .filter(Boolean).join(' | ') || 'general/unspecified';

    const featuresCtx = garden.features?.length
      ? ` Garden features: ${garden.features.join(', ')}.` : '';

    const metaCtx = [
      `Climate type: ${der.climateType}`,
      `Hardiness zone: ${der.zone}`,
      `Last frost: ${der.lastFrost || 'none'}`,
      `First frost: ${der.firstFrost || 'none'}`,
      der.seasonNote ? `IMPORTANT: ${der.seasonNote}` : '',
    ].filter(Boolean).join('. ');

    const prompt = `You are an expert horticulturist. Generate garden tasks for ${batch.join(', ')}.
Location: ${garden.city}. Orientation: ${garden.orientation || 'unspecified'}. Plants: ${allPlants}.${featuresCtx} Date: ${now}. ${metaCtx}

Return ONLY valid JSON — an object with month names as keys and arrays of task strings as values.
Each task: terse imperative, under 20 words, specific plant/measurement/method.
3 tasks in winter months, up to 4 in peak months.
Only include tasks for plants listed above. Apply frost timing rules — no tender crop outdoor tasks before last frost.

Example format:
{"April":["Summer prune apple laterals to 3 leaves above basal cluster","Check roses for aphids, squash colonies by hand"],"May":["Plant out tomato seedlings once nights are above 10°C","Tie in climbing rose new shoots horizontally"]}

Return tasks for: ${batch.join(', ')}`;

    try {
      const raw = await callAI(prompt, 1200, undefined, provider, userKey);
      // raw should be { "April": [...], "May": [...], ... }
      if (!raw || typeof raw !== 'object') return null;
      const calendarTasks = {};
      batch.forEach(month => {
        if (Array.isArray(raw[month]) && raw[month].length) {
          calendarTasks[month] = raw[month];
        }
      });
      if (!Object.keys(calendarTasks).length) return null;

      // Update months state so calendar view shows fresh content
      setMonths(prev => {
        const next = { ...prev };
        Object.entries(calendarTasks).forEach(([month, tasks]) => {
          next[month] = {
            ...(next[month] || emptyMonth(month)),
            tasks,
            _state: 'done',
            _taskPartial: null,
            _enjoyPartial: null,
          };
        });
        return next;
      });

      return calendarTasks;
    } catch {
      return null;
    }
  }, [provider, userKey]);

  const fetchNearbyObs = useCallback(async (garden) => {
    if (!garden?.lat || !garden?.lng) return;
    const cached = readInatCache(garden.id);
    if (cached) { setInatData(cached); return; }
    setInatLoading(true);
    setInatError(null);
    try {
      const inventoryPlants = Object.values(garden.plants || {}).flat();
      const data = await fetchNearbyObservations(garden.lat, garden.lng, inventoryPlants);
      writeInatCache(garden.id, data);
      setInatData(data);
    } catch (e) {
      // Silently fail — iNat is supplementary, not critical
      setInatError(e.message);
    } finally {
      setInatLoading(false);
    }
  }, []);

  const fetchTodayTasks = useCallback(async (garden, weatherData, signals, isRefresh = false) => {
    if (!garden?.climateData?._cd) {
      setTodayTasksError('no_climate');
      return;
    }
    const refreshKey = `gc_today_refresh_${garden.id}_${new Date().toISOString().slice(0,10)}`;

    // Check cache — skip for refresh (always generates fresh)
    if (!isRefresh) {
      const cached = readTodayCache(garden.id);
      if (cached) {
        setTodayTasks(cached);
        setTodayTasksLoading(false);
        try { if (localStorage.getItem(refreshKey)) setTodayRefreshUsed(true); } catch {}
        return;
      }
    }

    if (isRefresh) {
      setTodayRefreshLoading(true);
    } else {
      setTodayTasksLoading(true);
      setTodayTasksError(null);
      setTodayTasks(null);
    }

    try {
      const monthName = MONTH_NAMES[new Date().getMonth()];

      // If no calendar tasks stored, generate them silently first
      let calendarTasks = garden.calendarTasks || {};
      if (!Object.keys(calendarTasks).length && !isRefresh) {
        setTodayTasksLoading(true); // keep spinner while we generate calendar
        const freshCalendar = await generateCalendarForToday(garden);
        if (freshCalendar) {
          calendarTasks = freshCalendar;
          // Save the updated garden with fresh calendarTasks
          const updatedGarden = { ...garden, calendarTasks: freshCalendar };
          const saved = saveGarden(updatedGarden);
          setGardens(saved);
          // Update todayGarden ref so refresh button has latest data
          setTodayGarden(updatedGarden);
        }
      }

      const existingTasks = isRefresh
        ? (readTodayCache(garden.id)?.tasks || [])
        : [];

      const prompt = buildTodayPrompt(
        garden, weatherData, signals, monthName, calendarTasks, existingTasks, isRefresh
      );
      const raw = await callAI(prompt, 1400, undefined, provider, userKey);
      const payload = validateTodayResponse(raw);

      if (isRefresh) {
        const existing = readTodayCache(garden.id);
        const merged = {
          ...existing,
          tasks: [...(existing?.tasks || []), ...payload.tasks],
          generatedAt: Date.now(),
        };
        writeTodayCache(garden.id, merged);
        setTodayTasks(merged);
        try { localStorage.setItem(refreshKey, '1'); } catch {}
        setTodayRefreshUsed(true);
      } else {
        writeTodayCache(garden.id, payload);
        setTodayTasks(payload);
      }
    } catch (e) {
      if (!isRefresh) setTodayTasksError(e.message || 'Could not generate tasks');
    } finally {
      if (isRefresh) setTodayRefreshLoading(false);
      else setTodayTasksLoading(false);
    }
  }, [provider, userKey, generateCalendarForToday]);

    const saveCurrentGarden = useCallback((monthsSnapshot) => {
  const existing = selectedGardenId ? readGardens().find(g => g.id === selectedGardenId) : null;
  // Store current + adjacent month tasks so Today view can use them without months state
  const snap = monthsSnapshot || months;
  const calendarTasksForToday = {};
  [-1, 0, 1].forEach(offset => {
    const mIdx = (nowIdx + 12 + offset) % 12;
    const mName = MONTH_NAMES[mIdx];
    const m = snap[mName];
    if (m?.tasks?.length) calendarTasksForToday[mName] = m.tasks;
  });
  const garden = createGardenObject({
    ...(existing || {}),
    id:          existing?.id,
    city,
    orientation,
    features,
    plants,
    lat:         meta?.lat         ?? existing?.lat         ?? null,
    lng:         meta?.lng         ?? existing?.lng         ?? null,
    climateData: meta?._cd ? { _cd: meta._cd, _derived: meta._derived } : (existing?.climateData ?? null),
    calendarTasks: Object.keys(calendarTasksForToday).length ? calendarTasksForToday : (existing?.calendarTasks ?? null),
    plantTraits: Object.keys(plantTraits).length ? plantTraits : (existing?.plantTraits ?? null),
  });
  const updated = saveGarden(garden);
  setGardens(updated);
  setSelectedGardenId(garden.id);
  return garden.id;
}, [city, orientation, features, plants, plantTraits, meta, selectedGardenId, months, nowIdx]);

  // ── Tab navigation ──────────────────────────────────────────────────────────
  const handleTabChange = useCallback((tab) => {
    // Save garden when leaving edit tab
    if (activeTab === "edit" && tab !== "edit" && city) {
      saveCurrentGarden();
    }

    // Home — always show home screen
    if (tab === "garden") {
      setActiveTab("garden");
      setStage("form");
      setShowHome(true);
      return;
    }

    // This Week
    if (tab === "week") {
      setActiveTab("week");
      setStage("today");
      const g = selectedGardenId ? gardens.find(g => g.id === selectedGardenId) : gardens[0];
      if (g) {
        setTodayGarden(g);
        if (g.city) setCity(g.city);
        setTodayTasks(null); setTodayTasksError(null);
        setInatData(null); setInatError(null);
        const weatherPromise = fetchTodayWeather(g);
        fetchNearbyObs(g);
        weatherPromise.then(() => {
          fetchTodayTasks(g, readWeatherCache(g.id), computeUrgencySignals(readWeatherCache(g.id)));
        });
      }
      return;
    }

    // Edit
    if (tab === "edit") {
      setActiveTab("edit");
      const g = selectedGardenId ? gardens.find(g => g.id === selectedGardenId) : gardens[0];
      if (g) {
        if (g.city)        setCity(g.city);
        if (g.orientation) setOri(g.orientation);
        if (g.features)    setFeatures(g.features);
        if (g.plants)      setPlants(g.plants);
        if (g.plantTraits) setPlantTraits(g.plantTraits);
      }
      setStage("form");
      setShowHome(false);
      setFormStep("location");
      return;
    }

    // Calendar — redirect to Edit if no prior generate
    if (tab === "calendar") {
      const freshGardens = readGardens();
      const g = selectedGardenId
        ? freshGardens.find(g => g.id === selectedGardenId)
        : freshGardens[0];

      const hasClimate = !!(g?.climateData?._cd);

      if (!g?.city || !g?.orientation || !hasClimate) {
        // No usable garden or never generated — route to Edit first
        if (g) {
          if (g.city)        setCity(g.city);
          if (g.orientation) setOri(g.orientation);
          if (g.features)    setFeatures(g.features);
          if (g.plants)      setPlants(g.plants);
          if (g.plantTraits) setPlantTraits(g.plantTraits);
        }
        setActiveTab("edit");
        setStage("form");
        setShowHome(false);
        setFormStep("location");
        return;
      }

      // Has prior generate — restore state and climate
      if (g.city)        setCity(g.city);
      if (g.orientation) setOri(g.orientation);
      if (g.features)    setFeatures(g.features);
      if (g.plants)      setPlants(g.plants);
      if (g.plantTraits) setPlantTraits(g.plantTraits);
      const restoredMeta = {
        ...g.climateData._derived,
        _cd: g.climateData._cd,
        _derived: g.climateData._derived,
        lat: g.lat,
        lng: g.lng,
      };
      setMeta(restoredMeta);
      metaRef.current = restoredMeta;
      setPfState("ready");
      setS1Done(false);
      setMonths({});
      setActiveMonth(null);
      setActiveTab("calendar");
      setStage("calendar");
      return;
    }

    // About / any other tab
    setActiveTab(tab);
  }, [activeTab, city, saveCurrentGarden, selectedGardenId, gardens, fetchTodayWeather, fetchNearbyObs, fetchTodayTasks, prefetchMeta]);

  const handleSaveLink = () => {
    const url = buildGardenUrl(city, orientation, features, plants);
    // Update the browser URL bar so the current page IS the saved link
    window.history.replaceState(null, "", url);
    navigator.clipboard.writeText(url).catch(() => {});
    const updated = addFavourite(city, orientation, features, plants);
    setFavourites(updated);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  // ── On-demand inspiration fetch for a single month ────────────────────────
  // Fetch inspiration for 1 or 3 months (batch). monthNames = array of month name strings.
  const fetchInspo = async (monthNames) => {
    const names = Array.isArray(monthNames) ? monthNames : [monthNames];
    const now = `${MONTH_NAMES[nowIdx]} ${new Date().getFullYear()}`;

    // Mark all as loading
    setInspos(prev => {
      const next = {...prev};
      names.forEach(n => { next[n] = { state:"loading", data:null }; });
      return next;
    });

    const alreadyChosen = Object.entries(inspos)
      .filter(([k, v]) => v?.data?.name && !names.includes(k))
      .map(([_, v]) => v.data.name);

    // Track gardens chosen within this batch to avoid duplicates across parallel calls
    const chosenThisBatch = [];

    // Fetch sequentially within a batch to allow proper deduplication
    for (const monthName of names) {
      try {
        const result = await callClaude(`You are a garden visiting expert. Recommend ONE public garden to visit within a reasonable journey of ${city} in ${monthName}.

Priority rules — apply in this order:
1. First look for public gardens within 1 hour of ${city} that you know exist. A nearby garden you know with medium confidence is better than a distant garden you know very well. Do not go abroad or to another country when local options exist.
2. For cities like Singapore, Kuala Lumpur, Tokyo, or other major Asian/global cities: there are always multiple botanical gardens, park gardens, and horticultural attractions within the city or region — look for these before ranging to other countries. Examples for Singapore: Jurong Lake Gardens, HortPark, Fort Canning Park, Chinese Garden, Sungei Buloh, Gardens by the Bay.
3. Only extend the search radius significantly (2-4 hours, different country) if the location is genuinely remote or rural with very few public gardens nearby — e.g. a small island, a rural village, a remote coastal town.
4. Never recommend a garden in a different continent. UK gardens are not appropriate suggestions for Singapore, Japan, or Australia.
5. If you genuinely cannot find any suitable garden within the region, return {"name":"none"} rather than inventing one.
6. Use medium confidence freely for nearby gardens — the UI will show a caveat. Medium confidence + nearby is always preferable to high confidence + far away.

Return ONLY valid JSON, no markdown:
{"name":"<Garden name or 'none'>","organisation":"<operator e.g. National Trust / RHS / local authority / independent>","location":"<Town, Region>","distance":"<approx journey time from ${city}, including ferry/flight if applicable>","highlight":"<What this garden is genuinely known for in ${monthName} — specific plant, collection or feature — 10-20 words>","known_for":"<The garden primary specialism or what it is most famous for — 8-15 words>","website":"<official website URL — only include if you are certain it is correct, e.g. rhs.org.uk/gardens/wisley — omit the field entirely if uncertain>","wikipedia":"<exact Wikipedia article title if one exists, e.g. 'RHS Garden Wisley' or 'Sissinghurst Castle Garden' — omit if uncertain>","confidence":"high or medium"}

confidence high = you have clear specific knowledge of this garden collections and seasonal highlights from published sources.
confidence medium = you know the garden exists and broadly what it contains but are less certain of specific highlights.
known_for: the garden defining characteristic regardless of season.
${[...alreadyChosen, ...chosenThisBatch].length > 0 ? "\nDo NOT suggest any of these (already recommended): " + [...alreadyChosen, ...chosenThisBatch].join(", ") + ". Choose a genuinely different garden." : ""}
Respond entirely in ${langName()}.`,
          500, undefined, provider, userKey);
        // Handle "none" response — no suitable garden found
        if (!result.name || result.name === "none") {
          setInspos(prev => ({ ...prev, [monthName]: { state:"none", data:null } }));
          return;
        }
        const wordCount = (result.highlight || "").trim().split(/\s+/).length;
        if (wordCount < 8) result.highlight = result.highlight + " — visit for the seasonal highlights";
        if (result.name && result.name !== "none") chosenThisBatch.push(result.name);
        setInspos(prev => ({ ...prev, [monthName]: { state:"done", data:result } }));
      } catch(e) {
        setInspos(prev => ({ ...prev, [monthName]: { state:"error", data:null } }));
      }
    }
  };
  // ── Garden insights — climate suitability analysis + companion planting ─────
  const fetchInsights = async () => {
    if (totalPlants === 0) return;
    setInsights({state:"loading", items:[]});
    const allPlants = Object.entries(plants).map(([k,v])=>v.length?`${k}: ${v.join(", ")}`:null).filter(Boolean).join(" | ");
    const featuresCtx = features.length ? ` Garden features: ${features.join(", ")}.` : "";
    const metaCtx = meta ? `Zone: ${meta.zone}. Climate: ${meta.climate}. Last frost: ${meta.lastFrost}. First frost: ${meta.firstFrost}.` : "";
    const hasVegOrHerbs = [...(plants.vegetables||[]), ...(plants.herbs||[])].length > 0;
    const occurrenceCtx = Object.entries(plantMeta)
      .filter(([,m]) => m?.occurrence != null && m?.scientificName && m.occurrence.count < 1000000)
      .map(([name, m]) => {
        const c = m.occurrence.count;
        const level = c === 0 ? "no GBIF records near location — likely unsuitable"
          : c < 10  ? `${c} GBIF records near location — rarely recorded`
          : c < 50  ? `${c} GBIF records near location — occasionally recorded`
          : c < 200 ? `${c} GBIF records near location — well established`
          : `${c} GBIF records near location — very common`;
        return `${name} (${m.scientificName}): ${level}`;
      }).join("\n");

    const companionsSchema = hasVegOrHerbs ? `,
  "companions": [
    {
      "type": "good",
      "pair": "<Plant A + Plant B>",
      "reason": "<one short phrase, e.g. basil repels aphids from tomatoes>"
    }
  ]` : "";
    const companionsRule = hasVegOrHerbs ? `\n- companions: 2–4 entries covering only plants actually in this garden's vegetables/herbs lists. Mix good (beneficial) and warn (antagonistic) pairings. type must be "good" or "warn". reason under 10 words.` : "";

    try {
      const prompt = `You are a knowledgeable, curious gardening friend — warm and non-alarmist in tone.
Location: ${city}. Orientation: ${orientation}. ${metaCtx}
Plants in this garden: ${allPlants}${featuresCtx}
${occurrenceCtx ? `\nRegional occurrence data from GBIF (citizen science records within ~50km):\n${occurrenceCtx}\n` : ""}
IMPORTANT: GBIF records wild botanical sightings, NOT cultivated garden plants. Low GBIF counts are completely normal for roses, olives, photinia, lavender, hydrangea, fruit trees — these are garden cultivars, not wild species. Do NOT flag plants as rare or unsuitable based on low GBIF counts alone. Only flag genuine climate suitability concerns: cold hardiness for tender plants, drought tolerance, heat requirements.

Return ONLY valid JSON, no markdown:
{
  "allLookingGood": true,
  "goodNewsLine": "<warm 1-sentence sign-off if all fine, else null>",
  "items": [
    {
      "plant": "<n>",
      "question": "<curious non-alarming question e.g. How is your fig coping in colder winters?>",
      "context": "<1 sentence: the specific climate challenge for this location>",
      "suggestion": "<1 concrete tip: hardier variety, microclimate advice, or protection>"
    }
  ]${companionsSchema}
}
Rules:
- Max 4 items. Only flag genuine climate concerns — skip anything broadly suitable or commonly grown here.
- Never flag roses, olive, photinia, lavender, hydrangea, or standard European garden plants as rare or unsuitable for a temperate European garden.
- If everything suits the location, allLookingGood:true and empty items array.
- Tone: curious and encouraging. Never alarming.
- context + suggestion together under 35 words per item.${companionsRule}
Respond entirely in ${langName()}.`;
      const result = await callClaude(prompt, 900, undefined, provider, userKey);
      setInsights({state:"done", items:result.items||[], allLookingGood:result.allLookingGood, goodNewsLine:result.goodNewsLine, companions:result.companions||[]});
    } catch(e) {
      setInsights({state:"error", items:[]});
    }
  };

  // ── Lens calendars ────────────────────────────────────────────────────────
  const fetchLens = async (lensId, bustCache = false) => {
    if (Object.values(plants).flat().length === 0) return;
    const allPlantsSorted = Object.values(plants).flat().slice().sort().join(",");
    const plantHash = (() => { try { return btoa(allPlantsSorted).slice(0,20); } catch { return "x"; } })();
    const cacheKey = `gc_lens_${lensId}_${selectedGardenId || "anon"}_${plantHash}`;

    if (bustCache) {
      try { localStorage.removeItem(cacheKey); } catch {}
    } else {
      const cached = (() => { try { const r = localStorage.getItem(cacheKey); return r ? JSON.parse(r) : null; } catch { return null; } })();
      if (cached) {
        setLensData(prev => ({ ...prev, [lensId]: cached }));
        setLensStates(prev => ({ ...prev, [lensId]: "done" }));
        return;
      }
    }

    setLensStates(prev => ({ ...prev, [lensId]: "loading" }));

    const metaCtx = meta ? `Climate: ${meta.climate}. Zone: ${meta.zone}. Last frost: ${meta.lastFrost}. First frost: ${meta.firstFrost}.` : "";
    const hemCtx = meta?._derived?.hemisphere === "S" ? "Southern hemisphere — seasons are inverted." : "";
    const traitCtx = Object.entries(plantTraits).filter(([,t]) => t.scented).map(([p,t]) => `${p}: ${t.scented === "yes" ? "scented" : t.scented === "no" ? "unscented" : "scent unknown"}`).join(", ");

    const LENS_PROMPTS = {
      colour:   `Return months of colour interest (flowers, berries, autumn foliage, ornamental fruit). Intensity: 0=none, 1=subtle, 2=moderate, 3=peak. Descriptor: brief colour description (e.g. "deep crimson"). Colour: a single CSS-compatible colour value representing the plant's primary colour of interest (e.g. "#c0392b", "hotpink", "#f39c12"). Use a specific named or hex colour — not "red" or "green" but actual shades.`,
      texture:  `Return months of texture interest (leaf surface, bark, seedheads). Intensity: 0=none, 1=subtle, 2=moderate, 3=peak. Descriptor: brief texture description (e.g. "peeling bark").`,
      form:     `Return months of structural/form interest (silhouette, habit, winter skeleton). Intensity: 0=none, 1=subtle, 2=moderate, 3=peak. Descriptor: brief form description (e.g. "weeping habit").`,
      scent:    `Return months of scent/fragrance. Intensity: 0=none, 1=faint, 2=noticeable, 3=strong.${traitCtx ? ` Known traits: ${traitCtx}.` : ""} Descriptor: brief scent description (e.g. "honey and vanilla").`,
      cropping: `Return months of harvest/cropping for edible plants only. Intensity: 0=none, 1=start/end of season, 2=good harvest, 3=peak. Descriptor: what is harvested (e.g. "ripe tomatoes").`,
    };

    // Chunk plants into batches of 8 to avoid token truncation
    const allPlantList = Object.values(plants).flat();
    // For cropping lens, only send edible plants
    const lensPlants = lensId === "cropping"
      ? [...(plants.fruit||[]), ...(plants.vegetables||[])]
      : allPlantList;
    const CHUNK_SIZE = 8;
    const chunks = [];
    for (let i = 0; i < lensPlants.length; i += CHUNK_SIZE) {
      chunks.push(lensPlants.slice(i, i + CHUNK_SIZE));
    }
    if (chunks.length === 0) {
      setLensStates(prev => ({ ...prev, [lensId]: "done" }));
      setLensData(prev => ({ ...prev, [lensId]: {} }));
      return;
    }

    const colourSchema = lensId === "colour"
      ? `  "PlantName": { "months": [0,0,1,2,3,3,2,1,0,0,0,0], "descriptor": "deep crimson", "colour": "#c0392b" }`
      : `  "PlantName": { "months": [0,0,1,2,3,3,2,1,0,0,0,0], "descriptor": "brief description" }`;

    const buildPrompt = (plantNames) =>
      `You are a horticultural expert. Location: ${city}. ${metaCtx} ${hemCtx}
Lens: ${(LENSES.find(l=>l.id===lensId)||{}).name} — ${LENS_PROMPTS[lensId]}
Plants: ${plantNames.join(", ")}

Return ONLY valid JSON, no markdown, no extra text:
{
${colourSchema}
}
Rules: months must have exactly 12 integers (0-3), 0=Jan to 11=Dec. Include ALL plants listed. Plant names must match exactly.`;

    try {
      const chunkResults = await Promise.all(
        chunks.map(chunk => callClaude(buildPrompt(chunk), 800, undefined, provider, userKey))
      );
      const merged = Object.assign({}, ...chunkResults.filter(r => r && typeof r === "object" && !Array.isArray(r)));
      if (Object.keys(merged).length > 0) {
        try { localStorage.setItem(cacheKey, JSON.stringify(merged)); } catch {}
        setLensData(prev => ({ ...prev, [lensId]: merged }));
        setLensStates(prev => ({ ...prev, [lensId]: "done" }));
      } else {
        console.error("[fetchLens] all chunks empty for", lensId);
        setLensStates(prev => ({ ...prev, [lensId]: "error" }));
      }
    } catch(e) {
      console.error("[fetchLens] error for", lensId, e.message);
      setLensStates(prev => ({ ...prev, [lensId]: "error" }));
    }
  };

  // offset 0 = months[0,1,2], offset 1 = months[1,2,3] … offset 9 = months[9,10,11]
  // orderedMonths is built in handleSubmit; mirror it here for nav use
  const startIdx = (nowIdx + 11) % 12;
  const orderedForNav = Array.from({length:12}, (_,i) => MONTH_NAMES[(startIdx + i) % 12]);
  const MAX_OFFSET = 9; // 12 - 3

  // Track permanently unlocked offsets — once all 3 months at that offset are done, stays unlocked
  const unlockedPages = useRef(new Set());
  const isOffsetDone = (oi) => orderedForNav.slice(oi, oi+3).every(n => months[n] && months[n]._state === "done");
  for (let i = 0; i <= MAX_OFFSET; i++) { if (isOffsetDone(i)) unlockedPages.current.add(i); }
  const offsetReady = (oi) => unlockedPages.current.has(oi);

  // Track whether user has manually navigated — suppress auto-advance if so
  const userNavigatedRef = useRef(false);

  // Auto-advance the visible window to follow the active streaming month
  // Only fires if user hasn't manually navigated back
  useEffect(() => {
    if (!activeMonth || stream1Done) return;
    if (userNavigatedRef.current) return; // user took control — don't override
    const monthOrderIdx = orderedForNav.indexOf(activeMonth);
    if (monthOrderIdx < 0) return;
    const lastVisibleIdx = pageIdx + 2;
    if (monthOrderIdx > lastVisibleIdx) {
      const newOffset = Math.min(monthOrderIdx - 2, MAX_OFFSET);
      setPageIdx(newOffset);
    }
  }, [activeMonth]);
  const canLeft  = pageIdx > 0; // always allow going back
  const activeOffset = activeMonth ? orderedForNav.indexOf(activeMonth) : -1;
  // canRight: allow if next offset is fully ready, OR if streaming and active month is exactly in the next offset window
  const nextOffsetIsActive = !stream1Done && activeOffset >= 0 && activeOffset >= pageIdx+1 && activeOffset <= pageIdx+3;
  const canRight = pageIdx < MAX_OFFSET && (offsetReady(pageIdx + 1) || nextOffsetIsActive);

  const visibleNames = orderedForNav.slice(pageIdx, pageIdx + 3);
  // Stable callbacks per month name — prevents MonthPanel memo from busting on every render
  // Actually streaming = stream has started (activeMonth set) but not finished
  // stream1Done=false alone doesn't mean streaming — it's the initial state too
  const stillStreaming = !stream1Done && !!activeMonth;

  const pfLabel = {
    idle:null,
    fetching:<span className="prefetch-chip active"><span className="spin-sm">◌</span> Fetching climate data…</span>,
    ready:<span className="prefetch-chip ready">✓ Climate data ready · Open-Meteo/ERA5</span>,
    error:<span className="prefetch-chip error">⚠ Will retry on generate</span>,
  }[prefetchState];

  const slowScroll = () => {
    // Don't hide the arrow — keep it showing throughout streaming
    const targetEl = (activeMonth && monthRefs.current[activeMonth])
      ? monthRefs.current[activeMonth]
      : calTopRef.current;
    if (!targetEl) return;
    const targetY = targetEl.getBoundingClientRect().top + window.scrollY - 20;
    const startY = window.scrollY;
    const dist = targetY - startY;
    if (Math.abs(dist) < 10) return; // already there
    const duration = Math.min(Math.max(Math.abs(dist) * 2.5, 800), 4000);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      window.scrollTo(0, startY + dist * ease);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  return (
    <>
      <style>{styles + HOME_SCREEN_STYLES + WEATHER_SUMMARY_STYLES + VIDEO_PANEL_STYLES}</style>
      <div className="grain"/>
      <div className="demo-banner">
        <span className="demo-name">NatJulien_Demo</span>
        <span className="demo-sep">·</span>
        <span className="demo-tag">AI-powered garden calendar</span>
        <span className="demo-sep">·</span>
        <span className="demo-tag">
          Powered by{" "}
          {provider === "gemini" ? `Gemini (${geminiModel})` : "Claude"}
          {provider !== "proxy" && userKey && <span className="provider-badge">own key</span>}
        </span>
        <span className="demo-sep">·</span>
        <button className="demo-about-btn" onClick={() => setShowSettings(true)}>⚙ Settings</button>
        <span className="demo-sep">·</span>
        <button className="demo-about-btn" onClick={() => setShowAbout(true)}>About</button>
      </div>

      {/* ── About modal ── */}
      {showAbout && (
        <div className="about-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAbout(false); }}>
          <div className="about-modal">
            <button className="about-close" onClick={() => setShowAbout(false)}>×</button>
            <h2>🌿 About this Garden Calendar</h2>

            <p>This is a personal learning project — a tool built to explore what's possible when AI works from real data rather than guesswork. It's shared informally with friends and family, not offered as a commercial service.</p>

            <h3>How it works</h3>
            <p>When you enter your location, the app fetches measured climate data for your exact coordinates — monthly temperatures, rainfall, frost dates, and sunshine hours — from Open-Meteo's ERA5 reanalysis archive. This grounds everything that follows: frost date advice, hardiness warnings, and sowing windows come from real measurements, not assumptions.</p>
            <p>Your plant names are validated against the Global Biodiversity Information Facility (GBIF), which draws on the World Checklist of Vascular Plants maintained by the Royal Botanic Gardens, Kew. The app also checks how many times each plant has been recorded growing near your location, flagging anything that looks climatically marginal.</p>
            <p>For vegetables and herbs, sowing and harvest timing is grounded in <a href="https://openfarm.cc" target="_blank" rel="noopener">OpenFarm</a> — an open, community-maintained database of growing guides. Where OpenFarm has data for a plant, those sowing windows are passed directly to Claude alongside your local frost dates, so the calendar reflects real cultivation knowledge rather than a general guess.</p>
            <p>Claude (Anthropic's AI) then acts as a synthesiser — applying horticultural knowledge to that grounded data to write your calendar tasks, enjoyment observations, and garden visit suggestions. The growing advice reflects general horticultural practice; for timing specific to your region, the RHS, Cooperative Extension, or your national horticultural society will always be the better authority.</p>

            <h3>Sources &amp; licences</h3>
            <ul className="about-sources">
              <li><span className="src-dot">◆</span><span><strong>Climate data:</strong> Open-Meteo / ERA5 (ECMWF) · CC BY 4.0 · <a href="https://open-meteo.com" target="_blank" rel="noopener">open-meteo.com</a></span></li>
              <li><span className="src-dot">◆</span><span><strong>Plant names &amp; taxonomy:</strong> GBIF · CC BY 4.0 / CC0 · <a href="https://gbif.org" target="_blank" rel="noopener">gbif.org</a> · underpinned by WCVP (Royal Botanic Gardens, Kew) via <a href="https://powo.science.kew.org" target="_blank" rel="noopener">Plants of the World Online</a></span></li>
              <li><span className="src-dot">◆</span><span><strong>Sowing &amp; harvest data:</strong> OpenFarm · CC BY · <a href="https://openfarm.cc" target="_blank" rel="noopener">openfarm.cc</a> · community growing guides for vegetables and herbs</span></li>
              <li><span className="src-dot">◆</span><span><strong>Location data:</strong> OpenStreetMap contributors · ODbL · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">openstreetmap.org</a> · geocoding via Photon (komoot)</span></li>
              <li><span className="src-dot">◆</span><span><strong>AI:</strong> Claude by Anthropic · <a href="https://anthropic.com" target="_blank" rel="noopener">anthropic.com</a></span></li>
            </ul>

            <h3>A note on accuracy</h3>
            <p>Claude is knowledgeable but not infallible. Garden visit suggestions are based on training knowledge and should be verified on the garden's own website before you travel. Sowing windows are approximate — your microclimate, soil, and variety will always matter more than any generalisation. If something looks wrong, trust your experience and your local nursery.</p>

            <p className="about-note">This project is not affiliated with any of the organisations listed above. All data sources are used in accordance with their respective open licences.</p>
          </div>
        </div>
      )}

      {/* ── Settings modal ── */}
      {showSettings && (() => {
        const isOwn = provider !== "proxy";
        const pct = usage ? Math.round((usage.count / usage.cap) * 100) : 0;
        const fillCls = pct >= 90 ? "full" : pct >= 70 ? "warn" : "";
        const providerLabel = provider === "gemini" ? "Gemini" : provider === "claude" ? "Claude" : "Shared";
        const keyPlaceholder = provider === "gemini" ? "AIza…" : "sk-ant-…";
        const keyLink = provider === "gemini"
          ? "https://aistudio.google.com/app/apikey"
          : "https://console.anthropic.com/";

        return (
          <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
            <div className="settings-modal">
              <button className="settings-close" onClick={() => setShowSettings(false)}>×</button>
              <h2>⚙ Settings</h2>

              <h3>AI provider</h3>
              <p>Use the shared demo (rate-limited) or connect your own API key for unlimited access.</p>
              <div className="provider-tabs">
                {[["proxy","🌿 Shared demo"],["claude","Claude (Anthropic)"],["gemini","Gemini (Google)"]].map(([p, label]) => (
                  <button key={p} className={`provider-tab${provider === p ? " active" : ""}`}
                    onClick={() => { setProvider(p); setKeyDraft(""); }}>
                    {label}
                  </button>
                ))}
              </div>

              {provider === "proxy" && (
                <>
                  <h3>Daily usage</h3>
                  {usage ? (
                    <div className="usage-bar-wrap">
                      <div className="usage-bar-label">
                        <span>Shared pool today</span>
                        <span>{usage.count} / {usage.cap}</span>
                      </div>
                      <div className="usage-bar-track">
                        <div className={`usage-bar-fill ${fillCls}`} style={{width: `${Math.min(pct,100)}%`}}/>
                      </div>
                      {usage.ipCap != null && (
                        <>
                          <div className="usage-bar-label" style={{marginTop:".5rem"}}>
                            <span>Your generations today</span>
                            <span>{usage.ipCount ?? 0} / {usage.ipCap}</span>
                          </div>
                          <div className="usage-bar-track">
                            <div className={`usage-bar-fill ${(usage.ipCount ?? 0) >= usage.ipCap ? "full" : (usage.ipCount ?? 0) >= usage.ipCap * 0.7 ? "warn" : ""}`}
                              style={{width: `${Math.min(((usage.ipCount ?? 0)/usage.ipCap)*100, 100)}%`}}/>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p style={{opacity:.6,fontStyle:"italic",fontSize:".85rem"}}>Loading usage data…</p>
                  )}
                  <p style={{fontSize:".8rem",color:"var(--sage)"}}>
                    The shared demo has a daily generation cap to keep it free for everyone.
                    Connect your own API key above for unlimited use.
                  </p>
                </>
              )}

              {provider !== "proxy" && (
                <>
                  <h3>Your {providerLabel} API key</h3>
                  <div className="key-field">
                    <label>{providerLabel} API key</label>
                    <input
                      type="password"
                      value={keyDraft || (userKey && provider === provider ? "••••••••••••••" : "")}
                      onChange={e => setKeyDraft(e.target.value)}
                      placeholder={keyPlaceholder}
                      onFocus={e => { if (!keyDraft) setKeyDraft(""); }}
                    />
                  </div>
                  <p className="key-note">
                    Your key is stored only in your browser and never sent to our servers.{" "}
                    <a href={keyLink} target="_blank" rel="noopener">Get a key →</a>
                  </p>
                  {provider === "gemini" && (
                    <p className="key-note" style={{marginTop:".35rem"}}>
                      We'll automatically detect the best available model on your account.
                      Free tier availability varies by region —{" "}
                      <a href="https://aistudio.google.com/spend" target="_blank" rel="noopener">check spend limits</a>{" "}
                      if you hit quota errors.
                    </p>
                  )}
                  {keyError && (
                    <p style={{fontSize:".82rem",color:"var(--bloom)",marginTop:".5rem",lineHeight:"1.5"}}>
                      ⚠ {keyError}
                    </p>
                  )}
                  {provider === "gemini" && userKey && !keyDraft && geminiModel && (
                    <p className="key-note" style={{marginTop:".35rem",color:"var(--fern)"}}>
                      ✓ Using <strong>{geminiModel}</strong>
                    </p>
                  )}
                  <button
                    className="save-key-btn"
                    disabled={keyVerifying}
                    onClick={() => {
                      const k = keyDraft.trim() || userKey;
                      saveProviderSettings(provider, k);
                    }}>
                    {keyVerifying ? "Checking your account…" : `Save & use ${providerLabel}`}
                  </button>
                </>
              )}

              {provider === "proxy" && (
                <button className="save-key-btn" onClick={() => saveProviderSettings("proxy", "")}>
                  Continue with shared demo
                </button>
              )}
            </div>
          </div>
        );
      })()}
      {showArrow && (
        <button className="float-arrow" onClick={slowScroll} title="Scroll to calendar">
          <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      )}
      <div className="app">
        <header>
          <div className="deco">✦ ✿ ✦</div>
          <h1>The Garden <em>Calendar</em></h1>
          <p className="subtitle">A personalised year of growing, tending & harvesting</p>
        </header>

        {isArtifact() && stage === "form" && (
          <div className="api-banner">
            <label>🔑 Anthropic API Key</label>
            <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-ant-…"/>
            <p className="api-note">Used only in your browser · Get a key at console.anthropic.com</p>
          </div>
        )}
        {error && <div className="error-box">⚠ {error}</div>}
        {rateLimitMsg && <div className="rate-limit-box">🌿 {rateLimitMsg}</div>}

        {/* ── SAVED GARDENS (favourites) — shown above form when any exist ── */}
        {activeTab !== "about" && stage === "form" && !showHome && favourites.length > 0 && gardens.length === 0 && (
          <div className="favs-panel">
            <div className="favs-title">⭐ Your saved gardens</div>
            <div className="favs-list">
              {favourites.map(fav => (
                <div key={fav.city} className="fav-chip">
                  <button className="fav-chip-btn" onClick={() => {
                    const state = decodeGardenState(fav.encoded);
                    if (!state) return;
                    if (state.city)        setCity(state.city);
                    if (state.orientation) setOri(state.orientation);
                    if (state.features)    setFeatures(state.features);
                    if (state.plants)      setPlants(state.plants);
                    setFormStep("location");
                  }}>
                    {fav.city}
                  </button>
                  <button className="fav-chip-del" title="Remove" onClick={() => {
                    setFavourites(removeFavourite(fav.city));
                  }}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── HOME SCREEN ── */}
        {activeTab !== "about" && showHome && stage === "form" && (
  <div style={{maxWidth:560, margin:"0 auto"}}>
    {/* Saved gardens */}
    {gardens.length > 0 && (
      <div style={{marginBottom:"1.5rem"}}>
        {gardens.map(g => (
          <div key={g.id} style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            background:"rgba(58,34,16,.55)", border:"1px solid rgba(200,169,110,.2)",
            borderRadius:"2px", padding:".75rem 1rem", marginBottom:".5rem",
            cursor:"pointer", transition:"background .15s"
          }}
            onClick={() => {
              touchGarden(g.id); setSelectedGardenId(g.id); setGardens(readGardens());
              if (g.city)        setCity(g.city);
              if (g.orientation) setOri(g.orientation);
              if (g.features)    setFeatures(g.features);
              if (g.plants)      setPlants(g.plants);
              if (g.plantTraits) setPlantTraits(g.plantTraits);
            }}>
            <div>
              <div style={{fontFamily:"'Playfair Display',serif",color:"var(--cream)",fontSize:"1rem"}}>{g.name||g.city}</div>
              <div style={{fontSize:".78rem",color:"var(--sage)",marginTop:".15rem"}}>
                {g.city}{g.plants ? ` · ${Object.values(g.plants).flat().length} plants` : ""}
              </div>
            </div>
            <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
              <button style={{background:"rgba(200,169,110,.12)",border:"1px solid rgba(200,169,110,.2)",borderRadius:"2px",color:"var(--straw)",padding:".3rem .6rem",fontSize:".78rem",cursor:"pointer",fontFamily:"'Crimson Pro',serif"}}
                onClick={e => {
                  e.stopPropagation();
                  if (g.city)        setCity(g.city);
                  if (g.orientation) setOri(g.orientation);
                  if (g.features)    setFeatures(g.features);
                  if (g.plants)      setPlants(g.plants);
                  if (g.plantTraits) setPlantTraits(g.plantTraits);
                  setSelectedGardenId(g.id);
                  setShowHome(false); setFormStep("location"); setActiveTab("edit");
                }}>✎ Edit</button>
              <button style={{background:"none",border:"1px solid rgba(196,102,74,.25)",borderRadius:"2px",color:"var(--bloom)",padding:".3rem .5rem",fontSize:".78rem",cursor:"pointer"}}
                onClick={e => {
                  e.stopPropagation();
                  const updated = deleteGarden(g.id); setGardens(updated);
                  if (!updated.length) { setShowHome(false); setSelectedGardenId(null); }
                  else setSelectedGardenId(updated[0].id);
                }}>×</button>
            </div>
          </div>
        ))}
      </div>
    )}

    {/* Create new */}
    <button className="btn-ghost" style={{width:"100%",marginBottom:"2rem",textAlign:"center",padding:".65rem"}}
      onClick={() => {
        setCity(""); setOri(""); setFeatures([]);
        setPlants({trees:[],shrubs:[],flowers:[],vegetables:[],fruit:[],herbs:[]});
        setSelectedGardenId(null); setShowHome(false); setFormStep("location"); setActiveTab("edit");
      }}>
      + Create new garden
    </button>

    {/* Feature cards */}
    <div style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
      {[
        { icon:"📅", label:"This Week", desc:"Weather-aware tasks, what to enjoy, and local wildlife sightings for your garden today", tab:"week" },
        { icon:"🗓", label:"My Garden Calendar", desc:"A full year of personalised growing, tending and harvesting tasks — start by editing your garden details", tab:"calendar" },
        { icon:"🌿", label:"Insights", desc:"Climate suitability, companion planting, and year-round interest across colour, scent, form and more", tab:"about" },
      ].map(card => (
        <div key={card.tab}
          onClick={() => handleTabChange(card.tab)}
          style={{
            display:"flex", alignItems:"center", gap:"1rem",
            background:"rgba(30,18,8,.6)", border:"1px solid rgba(200,169,110,.15)",
            borderRadius:"2px", padding:".9rem 1.1rem", cursor:"pointer", transition:"background .15s"
          }}>
          <span style={{fontSize:"1.6rem",flexShrink:0}}>{card.icon}</span>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",color:"var(--straw)",fontSize:".95rem",marginBottom:".2rem"}}>{card.label}</div>
            <div style={{fontSize:".8rem",color:"var(--sage)",lineHeight:1.45}}>{card.desc}</div>
          </div>
          <span style={{marginLeft:"auto",color:"var(--sage)",fontSize:".9rem",flexShrink:0}}>›</span>
        </div>
      ))}
    </div>
  </div>
)}
        {activeTab !== "about" && !showHome && stage==="form" && formStep==="location" && (
          <div className="form-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:".5rem",marginBottom:".25rem"}}>
              <div className="form-title" style={{margin:0}}>Tell us about your garden</div>
              {browserLang !== "en" && (
                <div style={{display:"flex",alignItems:"center",gap:".35rem",flexShrink:0}}>
                  <span style={{fontSize:".72rem",color:"var(--muted)"}}>Calendar language:</span>
                  {["en", browserLang].map(code => (
                    <button key={code} type="button"
                      onClick={() => changeLang(code)}
                      style={{
                        background: lang===code ? "var(--fern)" : "none",
                        border: lang===code ? "1px solid var(--moss)" : "1px solid var(--sage)",
                        borderRadius:"3px",
                        padding:"1px 7px",
                        cursor:"pointer",
                        fontSize:".75rem",
                        color: lang===code ? "var(--cream)" : "var(--sage)",
                        transition:"all .15s",
                      }}>
                      {code === "en" ? "EN" : getLangName(code).slice(0,2).toUpperCase() + getLangName(code).slice(2,5)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="form-hint">Enter your location and orientation — we'll fetch live climate data to personalise your calendar.</p>
            <div className="field-row">
              <div className="field">
                <label>{t("cityLabel")}</label>
                <input type="text" value={city} onChange={e=>setCity(e.target.value)} placeholder={t("cityPlaceholder")}/>
              </div>
              <div className="field">
                <label>{t("orientationLabel")}</label>
                <select value={orientation} onChange={e=>setOri(e.target.value)}>
                  <option value="">{t("selectOrientation")}</option>
                  {ORIENTATIONS.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Climate status + pills — appear as prefetch runs */}
            <div style={{minHeight:"2.5rem",margin:".75rem 0 0"}}>
              {prefetchState==="fetching" && (
                <div style={{display:"flex",alignItems:"center",gap:".5rem",fontSize:".82rem",color:"var(--muted)",fontStyle:"italic"}}>
                  <span className="spin-sm">◌</span> Fetching climate data for {city}…
                </div>
              )}
              {prefetchState==="ready" && meta && (
                <div>
                  <div style={{fontSize:".78rem",color:"var(--sage)",marginBottom:".4rem",fontStyle:"italic"}}>
                    {t("climateLoaded")} · <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" style={{color:"var(--sage)"}}>Open-Meteo / ERA5</a>
                    {" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{color:"var(--sage)"}}>© OpenStreetMap contributors</a>
                  </div>
                  <div className="meta-pills" style={{justifyContent:"flex-start",margin:0}}>
                    <div className="pill">🌡 Zone <b>{meta.zone}</b></div>
                    <div className="pill">🌸 Last frost <b>{meta.lastFrost}</b></div>
                    <div className="pill">🍂 First frost <b>{meta.firstFrost}</b></div>
                    <div className="pill">🌤 {meta.climate}</div>
                  </div>
                </div>
              )}
            </div>



            {prefetchState==="error" && (
              <div style={{fontSize:".8rem",color:"var(--rust)",margin:".5rem 0"}}>⚠ Climate data unavailable — check your city name and try again</div>
            )}

            {/* Quote strip — appears as quote fetches, persists across all phases */}
            {locationQuote.text && (
              <div style={{
                borderLeft:"2px solid var(--sage)",
                paddingLeft:"1rem",
                margin:"1rem 0 .5rem",
                fontFamily:"'Playfair Display',serif",
                fontSize:"1rem",
                lineHeight:"1.65",
                color:"var(--ink)",
                fontStyle:"italic",
                opacity: locationQuote.done ? 1 : 0.6,
                transition:"opacity .4s",
              }}>
                {locationQuote.text}
              </div>
            )}
            {prefetchState==="ready" && !locationQuote.text && (
              <div style={{fontSize:".75rem",color:"var(--muted)",fontStyle:"italic",margin:".5rem 0",opacity:.5}}>
                <span className="spin-sm">◌</span> Finding a local quote…
              </div>
            )}

            <div style={{marginTop:"1.25rem"}}>
              <button
                className="btn-generate"
                disabled={prefetchState !== "ready" || !city || !orientation}
                onClick={() => setFormStep("plants")}
                type="button">
                {prefetchState==="ready" ? t("continueBtn") : prefetchState==="fetching" ? t("fetchingClimate") : t("enterCity")}
              </button>
            </div>
          </div>
        )}

        {/* ── FORM: PLANTS STEP ── */}
        {activeTab !== "about" && !showHome && stage==="form" && formStep==="plants" && (
          <div className="form-card">
            <div style={{display:"flex",alignItems:"center",gap:".75rem",marginBottom:"1rem"}}>
              <button onClick={()=>setFormStep("location")} type="button"
                style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:".85rem",padding:"0",textDecoration:"underline"}}>
                ← {city}
              </button>
              {meta && (
                <div className="meta-pills" style={{justifyContent:"flex-start",margin:0,flex:1}}>
                  <div className="pill">🌡 Zone <b>{meta.zone}</b></div>
                  <div className="pill">🌸 Last frost <b>{meta.lastFrost}</b></div>
                  <div className="pill">🍂 First frost <b>{meta.firstFrost}</b></div>
                  <div className="pill">🌤 {meta.climate}</div>
                </div>
              )}
            </div>
            {locationQuote.text && (
              <div style={{
                borderLeft:"2px solid var(--sage)",
                paddingLeft:".85rem",
                margin:".25rem 0 .75rem",
                fontFamily:"'Playfair Display',serif",
                fontSize:".88rem",
                lineHeight:"1.55",
                color:"var(--ink)",
                fontStyle:"italic",
                opacity:.75,
              }}>
                {locationQuote.text}
              </div>
            )}

            <div className="form-title">{t("addYourPlants")}</div>
            <p className="form-hint">
              Suggestions below are ranked by local observation data near {city} — tap any to add it, or type your own.
              {Object.values(suggestionState).some(s=>s==="loading") && (
                <span style={{fontStyle:"italic",color:"var(--muted)"}}> {t("loadingLocal")}</span>
              )}
            </p>

            <div className="divider"/>
            <p className="section-label">{t("gardenFeatures")} <em>{t("optional")}</em></p>
            <div className="category-row">
              <div className="cat-label">🏡 Features</div>
              <TagInput value={features} onChange={setFeatures} placeholder={t("featuresPlaceholder")}/>
              <div className="suggestions">
                {["Lawn","Paving","Pond","Gravel","Raised beds","Greenhouse","Compost"].map(f => {
                  const active = features.map(x=>x.toLowerCase()).includes(f.toLowerCase());
                  return (
                    <button key={f} className={`chip${active?" added":""}`}
                      onClick={()=>{ if(!active) setFeatures(prev=>[...prev,f]); }}
                      type="button">
                      {active ? "✓ " : "+ "}{f}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="divider"/>
            <p className="section-label">{t("gardenInventory")} <em>{t("recommended")}</em></p>
            {PLANT_CATEGORIES.map(cat=>(
              <div key={cat.key} className="category-row">
                <div className="cat-label">{cat.icon} {cat.label}</div>
                <TagInput
                  value={plants[cat.key]}
                  onChange={v=>setPlants({...plants,[cat.key]:v})}
                  placeholder={`Add ${cat.label.toLowerCase()}, press Enter…`}
                  onAdd={onPlantAdded}
                />
                {/* Clarification prompts — one per plant that needs it */}
                {plants[cat.key].map(plantName => {
                  const m = plantMeta[plantName];
                  if (!m || m.status !== "valid" || !m.clarificationRule) return null;
                  return (
                    <div key={plantName} className="clarify-row">
                      <span className="clarify-label">{plantName}: {m.clarificationRule.question}</span>
                      {m.clarificationRule.options.map(opt => (
                        <button key={opt}
                          className={`clarify-btn${m.clarificationAnswer===opt?" selected":""}`}
                          onClick={()=>onClarify(plantName, opt)}
                          type="button">
                          {opt}
                        </button>
                      ))}
                      {m.scientificName && (
                        <span className="gbif-badge">· {m.scientificName} · GBIF/WCVP</span>
                      )}
                    </div>
                  );
                })}
                {/* Colour sub-prompt — for plants where colour variation affects lens output */}
                {colourPending && plants[cat.key].includes(colourPending.plantName) && (() => {
                  const baseName = colourPending.plantName;
                  let colourDraft = "";
                  const confirm = () => {
                    const colour = colourDraft.trim();
                    if (colour) {
                      // Rename the plant tag to "Name (colour)"
                      const newName = `${baseName} (${colour})`;
                      setPlants(prev => ({
                        ...prev,
                        [cat.key]: prev[cat.key].map(p => p === baseName ? newName : p)
                      }));
                      setPlantMeta(prev => {
                        const next = { ...prev };
                        if (next[baseName]) { next[newName] = next[baseName]; delete next[baseName]; }
                        return next;
                      });
                    }
                    setColourPending(null);
                  };
                  return (
                    <div className="colour-prompt" key={`colour-${baseName}`}>
                      <span className="colour-prompt-label">🎨 What colour is your {baseName}?</span>
                      <input
                        className="colour-prompt-input"
                        placeholder="e.g. deep red"
                        autoFocus
                        onChange={e => { colourDraft = e.target.value; }}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirm(); } if (e.key === "Escape") setColourPending(null); }}
                      />
                      <button className="colour-prompt-confirm" type="button" onClick={confirm}>Add</button>
                      <button className="colour-prompt-skip" type="button" onClick={() => setColourPending(null)}>skip</button>
                    </div>
                  );
                })()}
                {/* Scent trait prompts — for plants where scent materially affects lens output */}
                {plants[cat.key].map(plantName => {
                  if (!SCENTED_PLANT_NAMES.has(plantName.toLowerCase())) return null;
                  const trait = plantTraits[plantName];
                  return (
                    <div key={`scent-${plantName}`} className="scent-prompt">
                      <span className="scent-prompt-label">🌸 Is your {plantName} scented?</span>
                      {["Yes","No","Not sure"].map(opt => (
                        <button key={opt}
                          className={`scent-btn${trait?.scented === opt.toLowerCase().replace(" ","") ? " selected" : ""}`}
                          onClick={() => setPlantTraits(prev => ({ ...prev, [plantName]: { ...prev[plantName], scented: opt === "Not sure" ? "unsure" : opt.toLowerCase() } }))}
                          type="button">
                          {opt}
                        </button>
                      ))}
                    </div>
                  );
                })}
                {/* Spelling suggestions */}
                {plants[cat.key].map(plantName => {
                  const m = plantMeta[plantName];
                  if (!m?.spellSuggestion) return null;
                  return (
                    <div key={`spell-${plantName}`} className="spell-row">
                      <span>Did you mean</span>
                      <button className="spell-btn" type="button"
                        onClick={() => {
                          const corrected = m.spellSuggestion;
                          setPlants(prev => ({
                            ...prev,
                            [cat.key]: prev[cat.key].map(p => p === plantName ? corrected : p)
                          }));
                          setPlantMeta(prev => {
                            const next = { ...prev };
                            next[corrected] = { ...next[plantName], spellSuggestion: null };
                            delete next[plantName];
                            return next;
                          });
                          onPlantAdded(corrected);
                        }}>
                        {m.spellSuggestion}
                      </button>
                      <span style={{fontSize:".75rem",color:"var(--muted)"}}>· GBIF name match</span>
                    </div>
                  );
                })}
                {/* Occurrence warnings */}
                {plants[cat.key].map(plantName => {
                  const m = plantMeta[plantName];
                  if (m?.isRateLimit) return (
                    <div key={`rl-${plantName}`} className="occ-warning" style={{color:"var(--amber)"}}>
                      ⏳ <strong>{plantName}</strong> — validation paused · rate limit · will retry
                    </div>
                  );
                  if (m?.status==="error") return (
                    <div key={`err-${plantName}`} className="occ-warning" style={{opacity:.6}}>
                      ⚠ <strong>{plantName}</strong> — couldn't validate · will include anyway
                    </div>
                  );
                  if (m?.spellSuggestion) return null;
                  if (m?.status==="loading") return (
                    <div key={`ld-${plantName}`} style={{fontSize:".75rem",color:"var(--muted)",padding:".2rem 0",fontStyle:"italic"}}>
                      <span className="spin-sm">◌</span> Checking {plantName}…
                    </div>
                  );
                  if (m?.status==="valid" && m?.clarificationRule && !m?.clarificationAnswer) return null;
                  if (m?.occurrence?.count === 0 && m?.occurrence?.matchType === 'EXACT' && m?.scientificName) return (
                    <div key={`occ-${plantName}`} className="occ-warning">
                      ⚠ <strong>{plantName}</strong> — no GBIF records within 300km · likely unsuitable for this location
                      {m.scientificName && <span className="gbif-badge"> · {m.scientificName}</span>}
                      <span className="gbif-badge"> · GBIF</span>
                    </div>
                  );
                  return null;
                })}
                <div className="suggestions">
                  {(() => {
                    const state = suggestionState[cat.key];
                    const suggestions = localSuggestions[cat.key];
                    if (state === "loading") {
                      return (
                        <span style={{fontSize:".75rem",color:"var(--muted)",fontStyle:"italic",opacity:.7}}>
                          🌍 Finding local suggestions…
                        </span>
                      );
                    }
                    if (!suggestions || suggestions.length === 0) return null;
                    return (
                      <>
                        {state === "fallback" && (
                          <span style={{fontSize:".7rem",color:"var(--muted)",fontStyle:"italic",display:"block",marginBottom:".25rem",opacity:.6}}>
                            suggestions for your climate
                          </span>
                        )}
                        {state === "ready" && (
                          <span style={{fontSize:".7rem",color:"var(--muted)",fontStyle:"italic",display:"block",marginBottom:".25rem",opacity:.6}}>
                            popular near you
                          </span>
                        )}
                        {suggestions.map(s => {
                          const added = plants[cat.key].map(p=>p.toLowerCase()).includes(s.toLowerCase());
                          return (
                            <button key={s} className={`chip${added?" added":""}`}
                              onClick={()=>{
                                if(!added){
                                  setPlants(p=>({...p,[cat.key]:[...p[cat.key],s]}));
                                  onPlantAdded(s);
                                }
                              }}
                              type="button">
                              {added ? "✓ " : "+ "}{s}
                            </button>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
            <button className="btn-generate" onClick={handleSubmit} disabled={!city||!orientation||(isArtifact()&&!apiKey)}>
              {prefetchState==="ready"?t("generateReady"):t("generateBtn")}
            </button>
          </div>
        )}


        {/* ── TODAY VIEW ── */}
        {activeTab !== "about" && stage === "today" && todayGarden && (
          <div className="cal-wrap" style={{ maxWidth: 640, margin: '0 auto' }}>
            <div className="cal-header" style={{ marginBottom: '1.25rem' }}>
              <div className="deco" style={{ fontSize: '1.1rem' }}>✦ ✿ ✦</div>
              <h2 style={{ fontSize: '1.6rem' }}>
                {todayGarden.name || todayGarden.city || 'Your garden'} today
              </h2>
              <p style={{ color: 'var(--sage)', fontStyle: 'italic', marginTop: '.3rem', fontSize: '.9rem' }}>
                {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}
                {todayGarden.city && todayGarden.name !== todayGarden.city ? ` · ${todayGarden.city}` : ''}
              </p>
              {Object.values(todayGarden.plants||{}).flat().length > 0 && (
                <div className="meta-pills" style={{ justifyContent: 'center', marginTop: '.75rem' }}>
                  <div className="pill">🌱 <b>{Object.values(todayGarden.plants||{}).flat().length}</b> plants</div>
                  {todayGarden.climateData?._derived?.zone && (
                    <div className="pill">🌡 {todayGarden.climateData._derived.zone}</div>
                  )}
                </div>
              )}
            </div>

            {/* Weather summary — resolves first */}
            <WeatherSummary
              weatherData={weatherData}
              signals={weatherSignals}
              loading={weatherLoading}
              error={weatherError}
            />

            {/* Tasks section */}
            {todayTasksError === 'no_climate' ? (
              // Sprint 3 decision: prompt user to regenerate rather than degrade
              <div style={{
                background: 'rgba(58,34,16,.45)',
                border: '1px solid rgba(200,169,110,.25)',
                borderRadius: '2px',
                padding: '1.25rem 1.5rem',
                marginBottom: '1.5rem',
              }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '1rem', color: 'var(--straw)', marginBottom: '.5rem' }}>
                  Climate data needed for daily tasks
                </div>
                <p style={{ fontSize: '.88rem', color: 'var(--parchment)', lineHeight: '1.6', marginBottom: '.9rem' }}>
                  To generate weather-aware tasks, we need your garden's climate data. This is created when you generate your calendar.
                </p>
                <button className="btn-solid" style={{ fontSize: '.88rem', padding: '.6rem 1.2rem' }}
                  onClick={() => {
                    if (todayGarden.city)        setCity(todayGarden.city);
                    if (todayGarden.orientation) setOri(todayGarden.orientation);
                    if (todayGarden.features)    setFeatures(todayGarden.features);
                    if (todayGarden.plants)      setPlants(todayGarden.plants);
                    setStage('form');
                    setShowHome(false);
                    setFormStep('location');
                  }}>
                  Generate calendar for {todayGarden.name || todayGarden.city} →
                </button>
              </div>
            ) : todayTasksLoading ? (
              <div style={{ background: 'rgba(30,18,8,.7)', border: '1px solid rgba(200,169,110,.15)', borderRadius: '2px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.88rem', color: 'var(--sage)', fontStyle: 'italic' }}>
                  <span style={{ display:'inline-block', animation:'spin .7s linear infinite' }}>◌</span>
                  {todayGarden?.calendarTasks && Object.keys(todayGarden.calendarTasks).length
                    ? 'Preparing your tasks for today…'
                    : 'Checking what\'s due in your garden this month…'}
                </div>
                <Shimmer lines={3}/>
              </div>
            ) : todayTasksError ? (
              <div style={{ background: 'rgba(30,18,8,.7)', border: '1px solid rgba(200,169,110,.15)', borderRadius: '2px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '.82rem', color: 'var(--bloom)', fontStyle: 'italic', marginBottom: '.6rem' }}>⚠ Couldn't load tasks — {todayTasksError}</div>
                <button className="btn-ghost" style={{ fontSize: '.82rem', padding: '.4rem .9rem' }}
                  onClick={() => fetchTodayTasks(todayGarden, weatherData, weatherSignals)}>
                  ↺ Try again
                </button>
              </div>
            ) : todayTasks ? (
              <div style={{ background: 'rgba(30,18,8,.7)', border: '1px solid rgba(200,169,110,.18)', borderRadius: '2px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                {todayTasks.allCalm && todayTasks.calmMessage && (
                  <div style={{ fontSize: '.88rem', color: 'var(--fern)', fontStyle: 'italic', marginBottom: '.85rem', paddingBottom: '.75rem', borderBottom: '1px solid rgba(200,169,110,.1)' }}>
                    ✓ {todayTasks.calmMessage}
                  </div>
                )}
                {todayTasks.weekendNote && (
                  <div style={{ fontSize: '.82rem', color: 'var(--dew)', fontStyle: 'italic', marginBottom: '.75rem', paddingBottom: '.65rem', borderBottom: '1px solid rgba(200,169,110,.08)', display:'flex', gap:'.4rem', alignItems:'flex-start' }}>
                    <span style={{flexShrink:0}}>🌤</span>
                    {todayTasks.weekendNote}
                  </div>
                )}
                <div style={{ fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--straw)', marginBottom: '.65rem' }}>
                  Today's tasks
                </div>
                <ul style={{ listStyle: 'none' }}>
                  {todayTasks.tasks.map((task, i) => (
                    <li key={i} style={{ padding: '.6rem 0', borderBottom: '1px solid rgba(200,169,110,.07)', display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
                      <span style={{ color: task.urgency === 'high' ? 'var(--bloom)' : task.urgency === 'medium' ? 'var(--straw)' : 'var(--fern)', flexShrink: 0, marginTop: '.15rem', fontSize: '.8rem' }}>
                        {task.urgency === 'high' ? '●' : task.urgency === 'medium' ? '●' : '○'}
                      </span>
                      <div style={{flex:1}}>
                        <div style={{ fontSize: '.95rem', color: 'var(--cream)', marginBottom: '.2rem', fontFamily: "'Playfair Display',serif", fontWeight: 400 }}>
                          {task.question}
                        </div>
                        {task.context && (
                          <div style={{ fontSize: '.82rem', color: 'var(--sage)', lineHeight: '1.5' }}>
                            {task.context}
                          </div>
                        )}
                        {(() => {
                          const todayRegion = todayGarden?.climateData?._derived?.climateType
                            ? climateToRegion(todayGarden.climateData._derived.climateType)
                            : 'uk';
                          return taskNeedsVideo(task.question) ? (
                            <div style={{marginTop:'.4rem'}}>
                              <VideoButton taskText={task.question} region={todayRegion}/>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </li>
                  ))}
                </ul>
                <div style={{ fontSize: '.65rem', color: 'rgba(180,180,160,.35)', marginTop: '.75rem', fontStyle: 'italic' }}>
                  Tasks refresh daily · based on your garden and today's weather
                </div>
                {/* Refresh button — append 2-3 more ideas, once per day */}
                {!todayRefreshUsed && !todayRefreshLoading && (
                  <button
                    className="btn-ghost"
                    style={{ marginTop: '.9rem', fontSize: '.85rem', padding: '.5rem 1rem', width: '100%' }}
                    onClick={() => fetchTodayTasks(todayGarden, weatherData, weatherSignals, true)}
                  >
                    Done? Some more ideas →
                  </button>
                )}
                {todayRefreshLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.82rem', color: 'var(--sage)', fontStyle: 'italic', marginTop: '.75rem' }}>
                    <span style={{ display:'inline-block', animation:'spin .7s linear infinite' }}>◌</span>
                    Finding more ideas…
                  </div>
                )}
              </div>
            ) : null}

            <div className="cal-actions">
              <button className="btn-ghost" onClick={() => { setStage("form"); setShowHome(true); }}>← Back</button>
            </div>

            {/* ── Nearby this week — iNaturalist ── */}
            {(inatLoading || inatData || inatError) && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--dew)', marginBottom: '.65rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                  🔭 Spotted nearby this week
                  <span style={{ opacity: .5, fontStyle: 'italic', textTransform: 'none', letterSpacing: 0, fontSize: '.72rem' }}>— via iNaturalist</span>
                </div>

                {inatLoading && (
                  <div style={{ fontSize: '.82rem', color: 'var(--sage)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                    <span style={{ display:'inline-block', animation:'spin .7s linear infinite' }}>◌</span>
                    Loading nearby sightings…
                  </div>
                )}

                {inatError && !inatLoading && (
                  <div style={{ fontSize: '.78rem', color: 'var(--sage)', fontStyle: 'italic', opacity: .6 }}>
                    Nearby sightings unavailable right now
                  </div>
                )}

                {inatData && !inatLoading && inatData.observations.length === 0 && (
                  <div style={{ fontSize: '.82rem', color: 'var(--sage)', fontStyle: 'italic' }}>
                    No recent observations found within 30km
                  </div>
                )}

                {inatData && !inatLoading && inatData.observations.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    {inatData.observations.map((obs, i) => (
                      <a
                        key={i}
                        href={obs.inatUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.5rem .75rem', background: 'rgba(30,18,8,.55)', border: '1px solid rgba(138,180,160,.15)', borderRadius: '2px', textDecoration: 'none', transition: 'border-color .15s' }}
                      >
                        {obs.photoUrl ? (
                          <img
                            src={obs.photoUrl}
                            alt={obs.commonName}
                            style={{ width: 40, height: 40, borderRadius: '2px', objectFit: 'cover', flexShrink: 0 }}
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <span style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>{obs.emoji}</span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '.9rem', color: 'var(--cream)', fontFamily: "'Playfair Display',serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {obs.commonName || obs.scientificName}
                          </div>
                          <div style={{ fontSize: '.72rem', color: 'var(--sage)', fontStyle: 'italic' }}>
                            {obs.scientificName !== obs.commonName && obs.commonName ? obs.scientificName + ' · ' : ''}
                            {obs.count} {obs.count === 1 ? 'sighting' : 'sightings'}{obs.mostRecentDate ? ` · last seen ${relativeDate(obs.mostRecentDate)}` : ''}
                          </div>
                        </div>
                        <span style={{ fontSize: '.72rem', color: 'var(--dew)', opacity: .6, flexShrink: 0 }}>↗</span>
                      </a>
                    ))}
                    <div style={{ fontSize: '.65rem', color: 'rgba(180,180,160,.35)', marginTop: '.35rem', fontStyle: 'italic' }}>
                      Research-grade observations within 30km · this month ·{' '}
                      <a href="https://www.inaturalist.org" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', opacity: .8 }}>
                        iNaturalist
                      </a>
                      {' '}· CC BY
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Inspo tip — on demand ── */}
            {(() => {
              const monthName = MONTH_NAMES[nowIdx];
              const inspo = inspos[monthName];
              return (
                <div style={{marginTop:"1rem"}}>
                  {(!inspo || inspo.state === "idle") && (
                    <button className="btn-inspo" onClick={() => fetchInspo([monthName])}>
                      🌿 Find a garden to visit this week
                    </button>
                  )}
                  {inspo?.state === "loading" && (
                    <div className="inspo-loading">
                      <span className="spin-sm">◌</span> Finding a garden near {todayGarden?.city || city}…
                    </div>
                  )}
                  {inspo?.state === "error" && (
                    <button className="btn-inspo" onClick={() => fetchInspo([monthName])}>↺ Try again</button>
                  )}
                  {inspo?.state === "none" && (
                    <div style={{fontSize:".82rem",color:"var(--sage)",fontStyle:"italic",padding:".4rem 0"}}>No notable public gardens found nearby.</div>
                  )}
                  {inspo?.state === "done" && inspo.data && (
                    <InspoErrorBoundary>
                    <div style={{background:"rgba(176,138,94,.08)",border:"1px solid rgba(176,138,94,.25)",borderRadius:"2px",padding:".75rem 1rem",animation:"fadeIn .3s ease"}}>
                      <div className="inspo-name">{inspo.data.name}</div>
                      <WikimediaPhoto title={inspo.data.wikipedia || inspo.data.name} style={{marginBottom:".4rem"}}/>
                      {inspo.data.location && <div className="inspo-detail">{inspo.data.location}{inspo.data.distance ? ` · ${inspo.data.distance}` : ""}</div>}
                      {inspo.data.highlight && <div className="inspo-text">{inspo.data.highlight}</div>}
                      {inspo.data.website ? (
                        <a href={inspo.data.website.startsWith('http') ? inspo.data.website : `https://${inspo.data.website}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{display:"inline-block",marginTop:".45rem",fontSize:".78rem",color:"var(--dew)",textDecoration:"none",borderBottom:"1px solid rgba(138,180,160,.3)"}}>
                          ↗ {inspo.data.website.replace(/^https?:\/\//, '')}
                        </a>
                      ) : (
                        <a href={`https://www.google.com/search?q=${encodeURIComponent(inspo.data.name + ' ' + (inspo.data.location||'') + ' official website')}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{display:"inline-block",marginTop:".45rem",fontSize:".78rem",color:"var(--sage)",textDecoration:"none",borderBottom:"1px solid rgba(122,140,106,.25)",fontStyle:"italic"}}>
                          Look it up ↗
                        </a>
                      )}
                      {inspo.data.location && (
                        <a href={mapsDirectionsUrl(todayGarden?.city || city, inspo.data.name + ', ' + inspo.data.location)}
                          target="_blank" rel="noopener noreferrer"
                          style={{display:"inline-block",marginTop:".45rem",marginLeft: inspo.data.website ? ".75rem" : "0",fontSize:".78rem",color:"var(--dew)",textDecoration:"none",borderBottom:"1px solid rgba(138,180,160,.3)"}}>
                          🗺 Directions
                        </a>
                      )}
                      {inspo.data.confidence === "medium" && (
                        <div style={{fontSize:".72rem",color:"var(--sage)",fontStyle:"italic",marginTop:".4rem",opacity:.7}}>Verify seasonal highlights on the garden's website before visiting</div>
                      )}
                      <button style={{marginTop:".6rem",background:"none",border:"none",color:"var(--sage)",fontSize:".75rem",cursor:"pointer",fontFamily:"'Crimson Pro',serif",padding:0,opacity:.7}}
                        onClick={() => fetchInspo([monthName])}>↺ Find another</button>
                    </div>
                    </InspoErrorBoundary>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── CALENDAR ── */}
        {activeTab !== "about" && stage==="calendar" && (
          <div className="cal-wrap">
            <StreamBar months={months} stream1Done={stream1Done} activeMonth={activeMonth} chunkCount={chunkCount}/>

            <div className="cal-header">
              <div className="deco" style={{fontSize:"1.3rem"}}>✦ ✿ ✦</div>
              <h2>{t("yourCalendar")}</h2>
              <p>{city}{orientation?` · ${orientationShort(orientation)}`:""}</p>
              {meta ? (
                <div className="meta-pills">
                  <div className="pill">🌡 Zone <b>{meta.zone}</b></div>
                  <div className="pill">🌸 Last frost <b>{meta.lastFrost}</b></div>
                  <div className="pill">🍂 First frost <b>{meta.firstFrost}</b></div>
                  <div className="pill">🌤 {meta.climate}</div>
                  {totalPlants>0&&<div className="pill">🌱 <b>{totalPlants}</b> plants tracked</div>}
                </div>
              ) : (
                <div style={{maxWidth:340,margin:"1rem auto 0"}}><Shimmer lines={1}/></div>
              )}
            </div>

            {locationQuote.text && (
              <div style={{
                maxWidth:"620px",
                margin:".5rem auto 0",
                borderLeft:"2px solid var(--sage)",
                paddingLeft:"1rem",
                fontFamily:"'Playfair Display',serif",
                fontSize:".9rem",
                lineHeight:"1.6",
                color:"var(--ink)",
                fontStyle:"italic",
                opacity:.7,
                textAlign:"left",
              }}>
                {locationQuote.text}
              </div>
            )}

            {/* ── Regenerate button — top of calendar ── */}
            <div style={{textAlign:"center",margin:"1.25rem 0 .5rem"}}>
              <button className="btn-solid" onClick={handleSubmit} disabled={stillStreaming}
                style={{minWidth:200}}>
                {stillStreaming ? "Generating…" : "✦ Generate Calendar"}
              </button>
            </div>

            {/* Occurrence warnings — only shown when plant was GBIF-validated (has scientificName)
                 AND returned count=0. Unvalidated plants or proxy failures are silently skipped. */}
            {Object.entries(plantMeta).filter(([,m]) => m?.occurrence?.count === 0 && m?.occurrence?.matchType === 'EXACT' && m?.scientificName).length > 0 && (
              <div style={{maxWidth:"860px",margin:"0 auto .75rem",padding:"0 1rem"}}>
                {Object.entries(plantMeta)
                  .filter(([,m]) => m?.occurrence?.count === 0 && m?.occurrence?.matchType === 'EXACT' && m?.scientificName)
                  .map(([plantName, m]) => (
                    <div key={plantName} className="occ-warning">
                      ⚠ <strong>{plantName}</strong> — no GBIF records within 300km · likely unsuitable for {city}
                      {m.scientificName && <span className="gbif-badge"> · {m.scientificName}</span>}
                      <span className="gbif-badge"> · GBIF</span>
                    </div>
                  ))}
              </div>
            )}

            {/* Knowledge-limited plant advisory — shown for veg/herbs where both
                OpenFarm and GBIF occurrence data are absent. Soft advisory only,
                never blocks generation. */}
            {Object.entries(plantMeta).filter(([,m]) => m?.knowledgeLimited).length > 0 && (() => {
              const society = meta?.country_code ? HORT_SOCIETY[meta.country_code.toLowerCase()] : null;
              const limited = Object.entries(plantMeta).filter(([,m]) => m?.knowledgeLimited).map(([name]) => name);
              return (
                <div style={{maxWidth:"860px",margin:"0 auto .75rem",padding:"0 1rem"}}>
                  <div style={{
                    fontSize:".76rem",
                    color:"rgba(122,172,207,.9)",
                    background:"rgba(122,172,207,.07)",
                    border:"1px solid rgba(122,172,207,.22)",
                    borderRadius:"4px",
                    padding:".35rem .65rem",
                    lineHeight:"1.55",
                  }}>
                    📚 <strong>{limited.join(", ")}</strong> — limited open cultivation data available.
                    Growing advice is based on Claude's general knowledge.
                    {society
                      ? <> Verify timing with the <a href={`https://${society.url}`} target="_blank" rel="noopener" style={{color:"inherit"}}>{society.name}</a>.</>
                      : <> Verify timing with your national horticultural society.</>
                    }
                  </div>
                </div>
              );
            })()}

            {/* References panel — open with pending message until meta arrives */}


            {/* Insights & Year-round interest — see About tab */}
            {stream1Done && (
              <div style={{textAlign:"center",margin:"1rem 0",fontSize:".82rem",color:"var(--sage)",fontStyle:"italic"}}>
                💡 Insights and year-round interest are in the <button onClick={() => handleTabChange("about")} style={{background:"none",border:"none",color:"var(--straw)",cursor:"pointer",fontFamily:"'Crimson Pro',serif",fontSize:".82rem",fontStyle:"italic",padding:0,textDecoration:"underline"}}>About tab</button>
              </div>
            )}

            {/* Batch inspiration button — fetch 3 at once */}
            {stream1Done && (() => {
              const startIdx2 = (nowIdx + 11) % 12;
              const loaded = Array.from({length: loadedBatches * 3}, (_,i) => MONTH_NAMES[(startIdx2 + i) % 12]);
              const needInspo = loaded.filter(n => !inspos[n] || inspos[n].state === "idle");
              const loadingInspo = loaded.some(n => inspos[n]?.state === "loading");
              if (needInspo.length === 0) return null;
              const nextBatch = needInspo.slice(0, 3);
              return (
                <div style={{textAlign:"center",margin:"1.25rem 0 0"}}>
                  <button
                    onClick={() => fetchInspo(nextBatch)}
                    disabled={loadingInspo}
                    style={{
                      background:"rgba(176,138,94,.15)",
                      border:"1px solid rgba(176,138,94,.4)",
                      color:"var(--inspo)",
                      padding:".55rem 1.2rem",
                      fontFamily:"'Crimson Pro',serif",
                      fontSize:".88rem",
                      borderRadius:"2px",
                      cursor: loadingInspo ? "wait" : "pointer",
                      opacity: loadingInspo ? .6 : 1,
                    }}
                  >
                    {loadingInspo ? "Finding gardens…" : `🌿 Find places to visit — ${nextBatch.join(", ")}`}
                  </button>
                </div>
              );
            })()}



            <div ref={calTopRef}/>
            <div className="month-nav">
              <button className={`nav-btn left${!canLeft?" hidden":""}`} onClick={()=>{userNavigatedRef.current=true; setPageIdx(p=>p-1);}} disabled={!canLeft}>‹</button>
              <div className="months-window">
                {visibleNames.map((name) => {
                  return (
                    <div key={name} ref={el => { if(el) monthRefs.current[name]=el; }}>
                      <MonthPanel
                        m={months[name]}
                        isCurrent={name===nowName}
                        showInspoButton={months[name]?._state==="done"}
                        inspo={inspos[name] || {state:"idle",data:null}}
                        onFetchInspo={()=>fetchInspo([name])}
                        t={t}
                        videoRegion={videoRegion}
                        city={city}
                      />
                    </div>
                  );
                })}
              </div>
              <button className={`nav-btn right${!canRight?" hidden":""}`} onClick={()=>{userNavigatedRef.current=true; setPageIdx(p=>p+1);}} disabled={!canRight}>›</button>
            </div>

            <div className="page-dots">
              {Array.from({length: MAX_OFFSET + 1}).map((_,i)=>{
                const rdy = offsetReady(i);
                const label = `${orderedForNav[i]} – ${orderedForNav[i+2]}`;
                return <div key={i} className={`pdot${i===pageIdx?" active":""}${!rdy?" disabled":""}`}
                  onClick={()=>rdy&&setPageIdx(i)} title={rdy ? label : "Generating…"}/>;
              })}
            </div>

            {/* Load more months button */}
            {stream1Done && loadedBatches < 4 && (
              <div style={{textAlign:"center",margin:"1.5rem 0 .5rem"}}>
                <button
                  onClick={loadMoreMonths}
                  disabled={loadingMore}
                  style={{
                    background:"none",
                    border:"1px solid var(--sage)",
                    color:"var(--sage)",
                    padding:".6rem 1.4rem",
                    fontFamily:"'Playfair Display',serif",
                    fontSize:".9rem",
                    fontStyle:"italic",
                    borderRadius:"2px",
                    cursor: loadingMore ? "wait" : "pointer",
                    opacity: loadingMore ? .6 : 1,
                    transition:"all .2s",
                  }}
                >
                  {loadingMore
                    ? t("loadingMore")
                    : `Load ${loadedBatches === 3 ? "final" : "next"} 3 months ↓`}
                </button>
                <p style={{fontSize:".72rem",color:"var(--muted)",margin:".35rem 0 0",fontStyle:"italic"}}>
                  {12 - loadedBatches * 3} months remaining
                </p>
              </div>
            )}

            {/* ── Print page preview — available once first batch done ── */}
            {stream1Done && (() => {
              const startIdx2 = (nowIdx + 11) % 12;
              const availableMonths = Array.from({length: loadedBatches * 3}, (_,i) => MONTH_NAMES[(startIdx2 + i) % 12])
                .filter(n => months[n]?._state === 'done');
              if (!availableMonths.length) return null;
              const handlePreview = async (monthName) => {
                const mIdx = MONTH_NAMES.indexOf(monthName);
                const year = new Date().getFullYear() + (mIdx < nowIdx ? 1 : 0);
                const g = selectedGardenId ? readGardens().find(g => g.id === selectedGardenId) : null;
                const html = await generateCalendarPageHTML({
                  monthName,
                  monthIndex: mIdx,
                  year,
                  gardenName: g?.name || city,
                  city,
                  meta,
                  monthData: months[monthName],
                  inspoData: inspos[monthName],
                  lensData,
                  allPlants: plants,
                  insights,
                });
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 5000);
              };
              return (
                <div style={{textAlign:'center', margin:'1.5rem 0 .5rem'}}>
                  <div style={{fontSize:'.72rem', textTransform:'uppercase', letterSpacing:'.1em', color:'var(--sage)', marginBottom:'.6rem', opacity:.7}}>
                    🖨 Preview print page
                  </div>
                  <div style={{display:'flex', flexWrap:'wrap', gap:'.4rem', justifyContent:'center'}}>
                    {availableMonths.map(name => (
                      <button key={name}
                        onClick={() => handlePreview(name)}
                        style={{
                          background:'none',
                          border:'1px solid rgba(200,169,110,.3)',
                          color:'var(--straw)',
                          padding:'.3rem .7rem',
                          fontFamily:"'Crimson Pro',serif",
                          fontSize:'.8rem',
                          borderRadius:'2px',
                          cursor:'pointer',
                          transition:'all .15s',
                        }}
                        onMouseEnter={e => e.target.style.background='rgba(200,169,110,.12)'}
                        onMouseLeave={e => e.target.style.background='none'}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:'.65rem', color:'var(--muted)', marginTop:'.4rem', fontStyle:'italic', opacity:.6}}>
                    Opens a print-ready preview in a new tab
                  </div>
                </div>
              );
            })()}

            {/* Export + share — only visible once all 12 months generated */}
            {stream1Done && loadedBatches >= 4 && (
              <div style={{display:"flex",gap:".75rem",justifyContent:"center",margin:"1.25rem 0 .5rem",flexWrap:"wrap"}}>
                <button
                  onClick={() => exportPDF(months, city, meta, buildGardenUrl(city, orientation, features, plants))}
                  style={{background:"#2C1A0A",color:"#F5EDD8",border:"none",borderRadius:"6px",padding:".55rem 1.2rem",fontSize:".85rem",cursor:"pointer",display:"flex",alignItems:"center",gap:".4rem"}}>
                  📄 Download
                </button>
                <button
                  onClick={() => exportICS(months, city, buildGardenUrl(city, orientation, features, plants))}
                  style={{background:"#4a7c59",color:"#fff",border:"none",borderRadius:"6px",padding:".55rem 1.2rem",fontSize:".85rem",cursor:"pointer",display:"flex",alignItems:"center",gap:".4rem"}}>
                  📅 Export to Calendar (.ics)
                </button>
                <button
                  className={`btn-save-link${linkCopied?" copied":""}`}
                  onClick={handleSaveLink}>
                  {linkCopied ? "✓ Now share!" : "🔗 Share garden link"}
                </button>
              </div>
            )}

                        {/* Calendar footer attribution — shown once first batch is done */}
            {stream1Done && (() => {
              const society = meta?.country_code ? HORT_SOCIETY[meta.country_code.toLowerCase()] : null;
              return (
                <div style={{
                  textAlign:"center",
                  fontSize:".7rem",
                  color:"rgba(180,180,160,.4)",
                  margin:"-.75rem 0 1.5rem",
                  fontStyle:"italic",
                  lineHeight:"1.8",
                }}>
                  <div>
                    Sowing windows for vegetables and herbs informed by{" "}
                    <a href="https://openfarm.cc" target="_blank" rel="noopener"
                       style={{color:"inherit",textDecoration:"underline",opacity:.8}}>OpenFarm (CC BY)</a>
                    {" "}and your local frost dates from{" "}
                    <a href="https://open-meteo.com" target="_blank" rel="noopener"
                       style={{color:"inherit",textDecoration:"underline",opacity:.8}}>Open-Meteo/ERA5</a>
                  </div>
                  <div>
                    Growing advice reflects general horticultural practice.
                    {society ? (
                      <> Verify timing with the{" "}
                        <a href={`https://${society.url}`} target="_blank" rel="noopener"
                           style={{color:"inherit",textDecoration:"underline",opacity:.8}}>{society.name}</a>
                        {" "}for your region.</>
                    ) : (
                      <> Verify timing with your national horticultural society.</>
                    )}
                  </div>
                </div>
              );
            })()}


          </div>
        )}

        {/* ── ABOUT VIEW ── */}
        {activeTab === "about" && (() => {
          const g = selectedGardenId ? gardens.find(g => g.id === selectedGardenId) : gardens[0];
          return (
            <AboutView
              garden={g}
              meta={meta}
              prefetchState={prefetchState}
              insights={insights}
              fetchInsights={fetchInsights}
              lensData={lensData}
              lensStates={lensStates}
              fetchLens={fetchLens}
              plants={plants}
              plantTraits={plantTraits}
              city={city}
              selectedGardenId={selectedGardenId}
              provider={provider}
              userKey={userKey}
              onGoCalendar={() => handleTabChange("calendar")}
              onGoEdit={() => handleTabChange("edit")}
              months={months}
            />
          );
        })()}

      </div>

      {/* ── BOTTOM TAB BAR ── */}
      <TabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        hasGarden={gardens.length > 0 || !!city}
      />
    </>
  );
}

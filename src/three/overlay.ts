import * as THREE from 'three';

const CSS = `
.b3d { position: fixed; inset: 0; overflow: hidden; background: #0a1317; font-family: "Segoe UI", system-ui, Arial, sans-serif; color: #edf0de; }
.b3d canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; outline: none; }
.b3d-hud { position: absolute; inset: 0; pointer-events: none; }
.b3d-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 72% 68% at 50% 48%, transparent 58%, #040a0d66 100%); }
.b3d.dreaming .b3d-vignette { display: none; }
.b3d-lunch-alert { position: absolute; left: 50%; top: 36%; transform: translate(-50%, -50%); width: min(640px, 85%); box-sizing: border-box; padding: 28px 24px; border: 2px solid #e8b765; border-radius: 14px; background: #14262df2; color: #f3e6c6; text-align: center; font: 900 clamp(24px, 4vw, 40px)/1.15 "Segoe UI", sans-serif; box-shadow: 0 12px 50px #0006; pointer-events: none; }
.b3d-top { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 28px; padding: 12px 22px;
  background: linear-gradient(#0b171ce8, #0b171c00); }
.b3d-brand { display: flex; flex-direction: column; border-left: 4px solid #e8b765; padding-left: 10px; }
.b3d-brand b { font: 800 26px/1 "Segoe UI", Arial, sans-serif; letter-spacing: 1px; }
.b3d-brand small { font-size: 10px; letter-spacing: 2.4px; color: #9fb4b4; margin-top: 4px; }
.b3d-stat { display: flex; flex-direction: column; min-width: 92px; }
.b3d-stat small { font-size: 10px; letter-spacing: 2px; color: #8eaaae; }
.b3d-stat b { font: 700 24px/1.1 "Segoe UI", Arial, sans-serif; font-variant-numeric: tabular-nums; }
.b3d-stat.time b { color: #edb765; }
.b3d-progress { height: 3px; background: #26444c; margin-top: 4px; }
.b3d-progress i { display: block; height: 100%; width: 0; background: #76cbd1; transition: width .3s; }
.b3d-pips { display: flex; gap: 5px; margin-top: 6px; }
.b3d-pips i { width: 18px; height: 8px; border-radius: 2px; background: #26444c; }
.b3d-pips i.on { background: #ef7d68; box-shadow: 0 0 8px #ef7d68; }
.b3d-phase { margin-left: auto; text-align: right; font-size: 12px; letter-spacing: 1.5px; color: #76cbd1; }
.b3d-phase em { display: block; font-style: normal; color: #edb765; margin-top: 4px; }
.b3d-goal-chips { display: flex; gap: 5px; justify-content: flex-end; margin-top: 6px; }
.b3d-goal-chips span { font-size: 10px; letter-spacing: 1px; padding: 2px 6px; border-radius: 4px; border: 1px solid #76cbd155; color: #a9c7ca; background: #0b171c99; white-space: nowrap; }
.b3d-goal-chips span.met { background: #2f6b46; border-color: #63c58a; color: #e6ffef; }
.b3d-goal-chips span.met::before { content: '✓ '; }
.b3d-goal-chips span.lost { opacity: .45; text-decoration: line-through; }
.b3d-goal-chips span.perk { border-color: #edb76588; color: #edb765; }
/* HUD feedback: the score rolls up and jumps on a gain, shakes on a loss; a streak warms up and catches fire; the last half minute ticks red. */
.b3d-stat b { transition: color .25s; transform-origin: left center; }
.b3d-pace { margin-top: 1px; font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #8fdca5; }
.b3d-pace.behind { color: #f19a8a; }
.b3d-stat b.gain { color: #ffd98a; animation: b3d-bump .35s ease-out; }
.b3d-stat b.loss { color: #ff7a5c; animation: b3d-shake .3s ease-out; }
@keyframes b3d-bump { 0% { transform: scale(1.18); } 100% { transform: scale(1); } }
@keyframes b3d-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
.b3d-phase em.hot { color: #ffb347; text-shadow: 0 0 8px #ff9a3c88; }
.b3d-phase em.blazing { color: #ffd36b; text-shadow: 0 0 10px #ff7a2c, 0 0 18px #ff5a1c99; animation: b3d-flicker 1.2s ease-in-out infinite; }
.b3d-phase em.lost { color: #ff7a5c; }
@keyframes b3d-flicker { 0%, 100% { opacity: 1; } 50% { opacity: .8; } }
.b3d-stat.time.urgent b { color: #ff7a5c; animation: b3d-tick 1s ease-out infinite; }
@keyframes b3d-tick { 0% { transform: scale(1.1); } 40%, 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .b3d-stat b.gain, .b3d-stat b.loss, .b3d-phase em.blazing, .b3d-stat.time.urgent b { animation: none; } }
.b3d-bottom { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 24px; padding: 12px 22px;
  background: linear-gradient(#0b171c00, #0b171ce8); font-size: 13px; }
.b3d-worker { font-weight: 800; letter-spacing: 1px; min-width: 120px; }
.b3d-worker.termite { color: #76cbd1; } .b3d-worker.skanky { color: #a6cc9a; }
.b3d-hint { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.b3d-guide { position: absolute; left: 50%; bottom: 68px; transform: translateX(-50%); width: min(620px, calc(100% - 28px)); box-sizing: border-box;
  padding: 10px 16px; border: 1px solid #e8b765; border-radius: 10px; background: #10232af0; text-align: center; }
.b3d-guide[hidden] { display: none; }
.b3d-guide b { display: block; font-size: 22px; color: #ffe1a4; }
.b3d-guide span { display: block; margin-top: 4px; font-size: 14px; line-height: 1.35; }
.b3d-backlog { font-size: 12px; color: #b7cecb; margin-top: 3px; white-space: nowrap; }
.b3d-backlog.urgent { color: #ffb09c; }
.b3d-steps { padding-left: 23px; color: #edf0de; line-height: 1.5; font-size: 15px; }
.b3d-steps li { margin: 7px 0; }
.b3d.touch .b3d-guide { top: 142px; bottom: auto; }
.b3d.touch.scanner-pending .b3d-guide { top: 218px; }
.b3d.touch .b3d-toast { top: 244px; max-width: calc(100% - 28px); box-sizing: border-box; }
.b3d.touch.scanner-pending .b3d-toast { top: 320px; }
@media (max-width: 720px) { .b3d-guide b { font-size: 19px; } .b3d-guide span { font-size: 12px; } .b3d-guide { padding: 8px 10px; } }
@media (max-height: 520px) { .b3d.touch .b3d-guide { top: 92px; left: auto; right: 10px; transform: none; width: min(340px, 48%); } .b3d.touch.scanner-pending .b3d-guide { display: none; } .b3d-guide b { font-size: 16px; } }
.b3d-scanner { position: absolute; z-index: 2; top: 82px; left: 50%; transform: translateX(-50%); width: max-content;
  max-width: calc(100% - 32px); box-sizing: border-box; padding: 9px 14px; border: 2px solid #edb765;
  border-radius: 8px; background: #17282ef2; color: #ffe1a4; text-align: center; font-weight: 800; font-size: 14px; }
.b3d-scanner[hidden] { display: none; }
.b3d.scanner-pending .b3d-toast { top: 140px; }
.b3d.touch .b3d-scanner { top: 142px; font-size: 12px; }
.b3d-brake { white-space: nowrap; }
@media (max-width: 1180px) { .b3d-keys { display: none; } }
.b3d-keys { color: #8eaaae; font-size: 11px; letter-spacing: 1px; }
.b3d-brake { font-weight: 700; letter-spacing: 1px; }
.b3d-bubbles, .b3d-pops { position: absolute; inset: 0; pointer-events: none; }
.b3d-bubble { position: absolute; transform: translate(-50%, calc(-100% - 14px)); background: #f3e6c6; color: #18252b;
  border: 2px solid #c9a868; border-radius: 10px; padding: 7px 12px 8px; font: 800 14px/1.2 "Segoe UI", Arial, sans-serif;
  white-space: pre-line; text-align: center; box-shadow: 0 6px 18px #0008; width: max-content; max-width: 260px; transition: opacity .18s; }
.b3d-bubble small { display: block; white-space: nowrap; font-size: 10px; letter-spacing: 1.4px; color: #8a5a2a; margin-bottom: 2px; }
.b3d-bubble::after { content: ""; position: absolute; left: 50%; bottom: -10px; margin-left: -8px; border: 8px solid transparent; border-top-color: #c9a868; border-bottom: 0; }
.b3d-bubble.edge { border-style: dashed; }
.b3d-bubble.thought { border-radius: 40px; padding: 12px 22px; font-size: 18px; }
.b3d-bubble.thought::after { width: 12px; height: 12px; border: 2px solid #c9a868; border-radius: 50%; background: #f3e6c6; bottom: -20px; margin-left: -14px; }
.b3d-bubble.held { display: none; }
.b3d.dreaming .b3d-hud, .b3d.dreaming .b3d-bubbles, .b3d.dreaming .b3d-pops, .b3d.dreaming .b3d-toast { display: none; }
.b3d-notice { position: absolute; top: 120px; left: 50%; transform: translateX(-50%); background: #10232a; color: #edba6d; padding: 8px 16px; border-radius: 4px; font: 800 15px 'Segoe UI', Arial, sans-serif; letter-spacing: 1px; }
.b3d-choices { display: flex; gap: 14px; margin-top: 18px; }
.b3d-choices button { margin-top: 0; }
.b3d-choices button.leave { background: #edba6d; }
.b3d-choices button.steal { background: #a6cc9a; }
.b3d-panel .caught { color: #f3987c; }
.b3d-bubble.edge::after { display: none; }
.b3d-pop { position: absolute; transform: translate(-50%, -50%); font: 900 18px "Segoe UI", Arial, sans-serif; text-shadow: 0 2px 6px #000c; white-space: nowrap; }
.b3d-center { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.b3d-panel.docked { align-self: end; margin-bottom: 64px; padding: 16px 22px; width: min(560px, calc(100vw - 32px)); max-height: 46dvh; }
.b3d-panel.docked h1 { font-size: 24px; margin: 4px 0 6px; }
.b3d-panel.docked p { margin: 3px 0; font-size: 13px; }
.b3d-panel.docked .b3d-choices button { margin-top: 10px; padding: 11px; }
.b3d-panel { pointer-events: auto; width: min(620px, calc(100vw - 32px)); background: #142a31f2; border: 1px solid #3b5a62; border-radius: 12px;
  max-height: calc(100dvh - 24px); overflow: auto; box-sizing: border-box; padding: 28px 34px; box-shadow: 0 30px 80px #000a; }
.b3d-panel h1 { font: 800 34px/1.1 "Segoe UI", Arial, sans-serif; margin: 6px 0 16px; }
.b3d-panel .kicker { font-size: 12px; letter-spacing: 2px; color: #edb765; }
.b3d-panel p { margin: 6px 0; color: #cfd8cc; font-size: 15px; }
.b3d-panel .grade { font: 900 64px/1 "Segoe UI", Arial, sans-serif; color: #edb765; float: right; margin-left: 16px; }
/* The results: the grade stamps down, then the lines rise in one after another (opacity and movement only, so every line is there to read at once). */
.b3d-panel .grade { animation: b3d-stamp .55s cubic-bezier(.2, 1.5, .4, 1) .15s both; }
.b3d-panel .grade ~ * { animation: b3d-rise .4s ease-out both; }
.b3d-panel .grade ~ :nth-child(2) { animation-delay: 0.35s; }
.b3d-panel .grade ~ :nth-child(3) { animation-delay: 0.42s; }
.b3d-panel .grade ~ :nth-child(4) { animation-delay: 0.49s; }
.b3d-panel .grade ~ :nth-child(5) { animation-delay: 0.56s; }
.b3d-panel .grade ~ :nth-child(6) { animation-delay: 0.63s; }
.b3d-panel .grade ~ :nth-child(7) { animation-delay: 0.70s; }
.b3d-panel .grade ~ :nth-child(8) { animation-delay: 0.77s; }
.b3d-panel .grade ~ :nth-child(9) { animation-delay: 0.84s; }
.b3d-panel .grade ~ :nth-child(10) { animation-delay: 0.91s; }
.b3d-panel .grade ~ :nth-child(11) { animation-delay: 0.98s; }
.b3d-panel .grade ~ :nth-child(12) { animation-delay: 1.05s; }
.b3d-panel .grade ~ :nth-child(13) { animation-delay: 1.12s; }
.b3d-panel .grade ~ :nth-child(14) { animation-delay: 1.19s; }
.b3d-panel .grade ~ :nth-child(15) { animation-delay: 1.26s; }
/* A long night's later lines (the mall run, the road, the sum and the total) rise together last rather than first. */
.b3d-panel .grade ~ :nth-child(n+16) { animation-delay: 1.33s; }
@keyframes b3d-stamp { 0% { transform: scale(2.6) rotate(-14deg); opacity: 0; } 60% { transform: scale(.92) rotate(2deg); opacity: 1; } 100% { transform: none; opacity: 1; } }
@keyframes b3d-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .b3d-panel .grade, .b3d-panel .grade ~ * { animation: none; } }
.b3d-panel button { display: block; width: 100%; margin-top: 18px; padding: 14px; border: 0; border-radius: 6px; background: #edb765;
  color: #1a2226; font: 800 16px "Segoe UI", Arial, sans-serif; letter-spacing: 1px; cursor: pointer; }
.b3d-panel button.b3d-medals-link { margin-top: 10px; padding: 10px; background: transparent; border: 1px solid #edb76588; color: #edb765; font-size: 13px; }
.b3d-perks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 6px 0 4px; }
.b3d-panel button.b3d-perk { margin: 0; padding: 8px 10px; text-align: left; background: #0b171c; border: 1px solid #3b5a62; color: #c9dcdc; font-size: 12px; letter-spacing: 0; display: flex; flex-direction: column; gap: 4px; }
.b3d-panel button.b3d-perk b { font-size: 12px; letter-spacing: 1px; color: #edb765; }
.b3d-panel button.b3d-perk span { font-weight: 500; font-size: 11px; color: #9fb4b4; }
.b3d-panel button.b3d-perk.picked { border-color: #edb765; background: #edb76526; }
.b3d-panel button.b3d-perk.picked b::before { content: '✓ '; }
@media (max-width: 560px) { .b3d-perks { grid-template-columns: 1fr; } }
.b3d-medal-list { list-style: none; margin: 8px 0 4px; padding: 0; display: grid; gap: 6px; }
.b3d-medal-list li { display: flex; flex-direction: column; padding: 6px 10px; border-radius: 6px; border: 1px solid #3b5a62; }
.b3d-medal-list li b { font-size: 13px; letter-spacing: 1px; }
.b3d-medal-list li span { font-size: 12px; color: #9fb4b4; }
.b3d-medal-list li.earned { border-color: #edb765; background: #edb7651a; }
.b3d-medal-list li.earned b { color: #edb765; }
.b3d-medal-list li.earned b::before { content: '✓ '; }
.b3d-medal-list li.locked { opacity: .55; }
.b3d-howto summary { cursor: pointer; margin: 6px 0; color: #cfd8cc; font-size: 15px; list-style: none; }
.b3d-howto summary::-webkit-details-marker { display: none; }
.b3d-howto summary::before { content: '▸ '; color: #edb765; }
.b3d-howto[open] summary::before { content: '▾ '; }
.b3d-panel p.b3d-sum { margin-top: 10px; padding-top: 8px; border-top: 1px solid #3b5a62; color: #9fb4b4; font-size: 13px; letter-spacing: .5px; }
.b3d-trend { display: flex; align-items: flex-end; gap: 4px; height: 48px; margin: 4px 0 8px; border-bottom: 1px solid #3b5a62; }
.b3d-trend span { flex: 1; min-width: 6px; border-radius: 2px 2px 0 0; background: #edb765; }
.b3d-trend span.failed { background: #5d7173; }
.b3d-recent { list-style: none; margin: 0 0 6px; padding: 0; display: grid; gap: 4px; }
.b3d-recent li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; padding: 4px 8px; border-left: 3px solid #edb765; background: #0b171c; font-size: 12px; }
.b3d-recent li.failed { border-left-color: #5d7173; }
.b3d-recent li b { letter-spacing: 1px; color: #f3e6c6; }
.b3d-recent li.failed b { color: #9fb4b4; }
.b3d-recent li span { color: #9fb4b4; }
.b3d-panel p.b3d-medal { color: #f3e6c6; border-left: 3px solid #edb765; padding-left: 10px; }
.b3d-panel p.b3d-medal b { color: #edb765; letter-spacing: 1px; }
/* A long briefing scrolls, but the start buttons stay in view at the bottom of the panel: START THE NIGHT, and JUST PLAY beside it. */
.b3d-panel .b3d-start { position: sticky; bottom: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; background: #142a31; box-shadow: 0 -10px 18px #142a31; }
.b3d-panel .b3d-start button { margin-top: 0; flex: 2 1 220px; }
.b3d-panel .b3d-start button[data-action="play"] { flex: 1 1 160px; background: transparent; border: 1px solid #edb765; color: #edb765; }
.b3d-panel .b3d-start button[data-action="play"] small { display: block; margin-top: 3px; font-size: 10px; letter-spacing: 1.5px; opacity: 0.8; }
.b3d-setting { display: grid; grid-template-columns: 90px 1fr 48px; align-items: center; gap: 12px; margin: 12px 0; font-size: 13px; letter-spacing: 1.5px; color: #c9dcdc; }
.b3d-setting input[type=range] { width: 100%; accent-color: #edb765; }
.b3d-setting output { text-align: right; font-variant-numeric: tabular-nums; color: #edb765; }
.b3d-setting.check { display: flex; gap: 10px; }
.b3d-setting.check input { width: 18px; height: 18px; accent-color: #edb765; }
.b3d-panel .pad-focus, .b3d-panel :is(button, a, input, summary):focus-visible { outline: 3px solid #fff3c4; outline-offset: 3px; }
.b3d-panel button.b3d-secondary { margin-top: 10px; padding: 10px; background: transparent; border: 1px solid #3b5a62; color: #c9dcdc; font-size: 13px; }
.b3d-help { display: grid; grid-template-columns: 130px 1fr; gap: 6px 14px; margin: 4px 0 8px; font-size: 13px; }
.b3d-help dt { font-weight: 800; letter-spacing: 1.5px; color: #edb765; font-size: 12px; padding-top: 2px; }
.b3d-help dd { margin: 0; color: #d9e6e6; line-height: 1.35; }
@media (max-width: 560px) { .b3d-help { grid-template-columns: 1fr; } .b3d-help dd { margin-bottom: 6px; } }
.b3d-panel a { display: block; margin-top: 12px; text-align: center; color: #9fb4b4; font-size: 12px; letter-spacing: 1.5px; }
.b3d-count { font: 900 120px "Segoe UI", Arial, sans-serif; color: #f0dfb3; text-shadow: 0 8px 30px #000; }
.b3d-toast { position: absolute; top: 92px; left: 50%; transform: translateX(-50%); background: #10232ae6; border: 1px solid #3b5a62;
  padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 14px; transition: opacity .3s; }
/* Story chapters: subtitles, scene title, controls; the shift HUD steps aside. */
.b3d.story .b3d-hud, .b3d.chapter .b3d-hud { display: none; }
.b3d-subtitle { position: absolute; left: 50%; bottom: 74px; transform: translateX(-50%); width: min(760px, calc(100vw - 32px));
  text-align: center; pointer-events: none; display: none; }
.b3d.story .b3d-subtitle { display: block; }
.b3d-subtitle .line { display: inline-block; background: #0b171ce6; border: 1px solid #3b5a62; border-radius: 8px; padding: 8px 14px;
  font: 700 17px/1.35 'Segoe UI', Arial, sans-serif; color: #f3e6c6; }
.b3d-subtitle .line b { color: #edb765; letter-spacing: 1px; margin-right: 8px; }
.b3d-subtitle .direction { display: block; margin-top: 6px; font: italic 600 14px/1.35 'Segoe UI', Arial, sans-serif; color: #c9d8d8;
  text-shadow: 0 2px 6px #000; }
.b3d-subtitle .caption { color: #a6cc9a; font-style: normal; letter-spacing: 1px; }
.b3d-storybar { position: absolute; top: 14px; left: 18px; right: 18px; display: none; justify-content: space-between; align-items: flex-start;
  pointer-events: none; gap: 12px; }
.b3d.story .b3d-storybar, .b3d.chapter .b3d-storybar { display: flex; }
.b3d-storybar .title { border-left: 4px solid #e8b765; padding-left: 10px; font: 800 20px/1.1 'Segoe UI', Arial, sans-serif; text-shadow: 0 2px 8px #000; }
.b3d-storybar .title small { display: block; font-size: 11px; letter-spacing: 2px; color: #9fb4b4; margin-top: 4px; }
.b3d-storybar .clock { font: 800 18px 'Segoe UI', Arial, sans-serif; color: #edb765; text-align: right; background: #0b171cc8; padding: 6px 10px; border-radius: 6px; }
.b3d-storykeys { position: absolute; right: 18px; bottom: 18px; display: none; gap: 8px; z-index: 5; }
.b3d.story .b3d-storykeys { display: flex; }
.b3d-storykeys button { pointer-events: auto; border: 1px solid #ffffff3a; color: #edf0de; background: #14262dd9; border-radius: 10px;
  font: 800 13px 'Segoe UI', Arial, sans-serif; letter-spacing: 1px; padding: 10px 14px; cursor: pointer; min-height: 44px; }
.b3d-storykeys button small { opacity: .7; font-size: 10px; }
.b3d-storykeys button.skip { background: #edb765; color: #1a2226; }
.b3d.interlude .b3d-storykeys { display: flex; }
.b3d.interlude .b3d-storykeys button:not(.skip) { display: none; }
.b3d-chapterhud { position: absolute; left: 0; bottom: 0; right: 0; display: none; gap: 18px; align-items: center;
  background: linear-gradient(#0b171c00, #0b171ce8); padding: 12px 22px; pointer-events: none; flex-wrap: wrap; }
.b3d.chapter .b3d-chapterhud { display: flex; }
.b3d-chapterhud .stat { display: flex; flex-direction: column; }
.b3d-chapterhud .stat small { font-size: 10px; letter-spacing: 2px; color: #8eaaae; }
.b3d-chapterhud .stat b { font: 800 20px 'Segoe UI', Arial, sans-serif; }
.b3d-chapterhud .objective { flex: 1; min-width: 200px; font-weight: 700; font-size: 14px; color: #f3e6c6; }
.b3d-chapterhud .keys { color: #8eaaae; font-size: 11px; letter-spacing: 1px; }
.b3d-drive-nav { position: absolute; z-index: 3; top: 118px; left: 50%; transform: translateX(-50%); width: 210px; text-align: center; pointer-events: none; text-shadow: 0 2px 6px #000; }
.b3d-drive-nav[hidden] { display: none; }
.b3d-drive-nav b, .b3d-drive-nav small { display: block; width: max-content; max-width: 100%; margin: 2px auto 0; background: #0b171cdd; border-radius: 4px; padding: 3px 7px; }
.b3d-drive-nav b { color: #adf176; font-size: 12px; letter-spacing: 1px; }
.b3d-drive-nav small { color: #f0eddb; font-size: 10px; }
.b3d.driving .b3d-toast { top: 178px; }
@media (max-width: 600px) { .b3d.touch.driving .b3d-drive-nav { top: 240px; left: auto; right: 10px; transform: none; width: 164px; } .b3d.touch.driving .b3d-toast { top: 310px; } }
@media (max-width: 600px) { .b3d.touch.driving .b3d-drive-nav b { font-size: 11px; letter-spacing: .5px; } }
@media (max-height: 520px) { .b3d-drive-nav { top: 66px; width: 180px; } .b3d-drive-nav b { font-size: 10px; } .b3d-drive-nav small { font-size: 8px; padding: 1px 4px; } }
.b3d-routes { color: #8eaaae; font-size: 11px; letter-spacing: 1px; white-space: nowrap; }
.b3d-routes i { font-style: normal; font-weight: 800; padding: 0 3px; border-radius: 3px; color: #12232a; }
@media (max-width: 1180px) { .b3d-routes { display: none; } }
.b3d.touch .b3d-chapterhud .keys { display: none; }
.b3d.touch.chapter .b3d-chapterhud { bottom: auto; top: 54px; background: #0b171cc8; }
/* Phones: one compact row of stats; the brand gives way to the numbers. */
@media (max-width: 720px), (max-height: 520px) {
  .b3d-top { gap: 14px; padding: 8px 12px; flex-wrap: nowrap; }
  .b3d-brand small, .b3d-phase, .b3d-keys { display: none; }
  .b3d-brand b { font-size: 17px; }
  .b3d-stat { min-width: 0; }
  .b3d-stat small { font-size: 9px; letter-spacing: 1.2px; }
  .b3d-stat b { font-size: 17px; }
  .b3d-pips i { width: 12px; height: 7px; }
  .b3d-toast { top: 96px; font-size: 12px; }
}
@media (max-width: 480px) {
  .b3d-brand { display: none; }
}
@media (max-width: 720px) {
  .b3d-bubble { font-size: 12px; max-width: 190px; padding: 6px 10px 7px; }
  .b3d-panel { padding: 20px 22px; }
  .b3d-panel h1 { font-size: 26px; }
  .b3d-panel p { font-size: 14px; }
}
`;

export interface HudState {
  sorted: number; goal: number; score: number; timeLeftMs: number; backlog: number; capacity: number;
  phase: string; combo: number; worker: 'termite' | 'skanky'; hint: string; brake: string; overview: boolean; routes?: string; scanner?: string;
  /** The clock's label when it shows something other than the time left (the endless shift's time survived). */
  clockLabel?: string;
  /** Tonight's score against the best night's at the same moment (`pace.ts`); null or absent hides it. */
  pace?: number | null;
  /** Tonight's goals as HUD chips, and tonight's perk after them. */
  goals?: { text: string; state: 'met' | 'open' | 'lost' | 'perk' }[];
}

interface Bubble {
  element: HTMLDivElement;
  anchor: () => THREE.Vector3;
  remainingMs: number;
}

export class Overlay {
  public readonly root: HTMLDivElement;
  private readonly style = document.createElement('style');
  private readonly hud: HTMLDivElement;
  private readonly bubbles: HTMLDivElement;
  private readonly pops: HTMLDivElement;
  private readonly center: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly fields: Record<string, HTMLElement> = {};
  private readonly speech = new Map<string, Bubble>();
  private readonly popups: { element: HTMLDivElement; world: THREE.Vector3; age: number }[] = [];
  private toastMs = 0;
  /** The score as the HUD shows it, rolling up to the real one; how long its gain or loss flash lasts. */
  private shownScore = 0;
  private targetScore = 0;
  private scoreFlashMs = 0;
  /** The streak at the last update, and how long a lost streak stays on show. */
  private lastCombo = 0;
  private lostStreak = 0;
  private lostStreakMs = 0;
  private serial = 0;
  /** While set, only matching bubbles are shown and count down (story holds). */
  public hold: ((key: string) => boolean) | null = null;
  /** Every centre notice shown, for the reference checks. */
  public readonly notices: string[] = [];
  /** Every displayed line, for the reference checks. */
  public readonly history: string[] = [];

  constructor(host: HTMLElement) {
    const style = this.style;
    style.textContent = CSS;
    document.head.append(style);
    this.root = document.createElement('div');
    this.root.className = 'b3d';
    host.append(this.root);
    // A soft vignette over the picture, under every control and label.
    this.div('b3d-vignette', this.root);
    this.hud = this.div('b3d-hud', this.root);
    this.hud.innerHTML = `
      <div class="b3d-top">
        <div class="b3d-brand"><b>THE BELT</b><small>NIGHT SORT SIMULATOR</small></div>
        <div class="b3d-stat"><small>DISPATCHED</small><b data-f="sorted">00</b><div class="b3d-progress"><i data-f="bar"></i></div></div>
        <div class="b3d-stat"><small>YOUR SCORE</small><b data-f="score">00000</b><span class="b3d-pace" data-f="pace" hidden></span></div>
        <div class="b3d-stat time"><small data-f="timelabel">TIME LEFT</small><b data-f="time">03:00</b></div>
        <div class="b3d-stat"><small>RECOVERY</small><div class="b3d-pips" data-f="pips"></div><span class="b3d-backlog" data-f="backlog"></span></div>
        <div class="b3d-phase"><span data-f="phase"></span><em data-f="combo"></em><div class="b3d-goal-chips" data-f="goals" aria-label="Tonight's goals and perk"></div></div>
      </div>
      <div class="b3d-scanner" data-f="scanner" role="status" aria-live="polite" hidden></div>
      <div class="b3d-guide" data-f="guide" hidden><b data-f="guide-title"></b><span data-f="guide-detail"></span></div>
      <div class="b3d-bottom">
        <div class="b3d-worker" data-f="worker"></div>
        <div class="b3d-hint" data-f="hint"></div>
        <div class="b3d-brake" data-f="brake"></div>
        <div class="b3d-routes" data-f="routes"></div>
        <div class="b3d-keys"><span data-f="keyhints">WASD MOVE · TAB SWITCH · SPACE GRAB/DELIVER · F THROW · E STOP THE BELT · V <span data-f="view"></span> · ESC PAUSE · M SOUND</span><span data-f="padhints" hidden>STICK MOVE · Y SWITCH · A GRAB/DELIVER · B THROW · X STOP THE BELT · BACK <span data-f="padview"></span> · START PAUSE</span></div>
      </div>`;
    this.hud.querySelectorAll<HTMLElement>('[data-f]').forEach((element) => { this.fields[element.dataset.f!] = element; });
    this.bubbles = this.div('b3d-bubbles', this.root);
    this.pops = this.div('b3d-pops', this.root);
    this.toast = this.div('b3d-toast', this.root);
    // Toasts carry news (a goal met, ON FIRE, a controller ready): read them out politely.
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');
    this.toast.style.opacity = '0';
    this.center = this.div('b3d-center', this.root);
    this.storybar = this.div('b3d-storybar', this.root);
    this.subtitleBox = this.div('b3d-subtitle', this.root);
    this.storykeys = this.div('b3d-storykeys', this.root);
    // PAUSE is here too: touch players have no keyboard Escape during story scenes.
    this.storykeys.innerHTML = '<button type="button" data-story="pause" aria-label="Pause">PAUSE <small>ESC</small></button>'
      + '<button type="button" data-story="next">NEXT ▸ <small>SPACE</small></button>'
      + '<button type="button" class="skip" data-story="skip">SKIP SCENE ⏭ <small>ENTER</small></button>';
    this.chapterhud = this.div('b3d-chapterhud', this.root);
    this.driveNav = this.div('b3d-drive-nav', this.root);
    this.driveNav.hidden = true;
    this.driveNav.innerHTML = '<b></b><small></small>';
    this.lunchAlert = this.div('b3d-lunch-alert', this.root);
    this.lunchAlert.textContent = '15 MINUTE LUNCH BREAK!';
    this.lunchAlert.setAttribute('role', 'status');
    this.lunchAlert.hidden = true;
  }

  private readonly storybar: HTMLDivElement;
  private readonly subtitleBox: HTMLDivElement;
  private readonly storykeys: HTMLDivElement;
  private readonly chapterhud: HTMLDivElement;
  private readonly driveNav: HTMLDivElement;
  private readonly lunchAlert: HTMLDivElement;
  public setLunchAlert(visible: boolean): void { this.lunchAlert.hidden = !visible; }
  /** Every subtitle direction or caption shown, for the checks. */
  public readonly subtitles: string[] = [];

  public dispose(): void {
    this.clearSpeech();
    this.popups.length = 0;
    this.root.remove();
    this.style.remove();
  }

  /** 'shift' shows the sorting HUD; 'story' a cutscene; 'chapter' the mall or lot HUD. */
  public setMode(mode: 'shift' | 'story' | 'chapter'): void {
    this.root.classList.toggle('story', mode === 'story');
    this.root.classList.toggle('chapter', mode === 'chapter');
    if (mode !== 'story') {
      this.subtitle(null);
      // A story button keeps keyboard focus after its scene; let it go, so Enter
      // and Space reach the briefing, the shift and the results again.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && this.storykeys.contains(focused)) focused.blur();
    }
    // A shift toast must not hang over a cutscene or carry into the next chapter.
    if (mode !== 'shift') {
      this.toastMs = 0;
      this.toast.style.opacity = '0';
    }
  }

  /** Ben's scene plays over the shift HUD with only the SKIP SCENE button. */
  public setInterlude(on: boolean): void {
    this.root.classList.toggle('interlude', on);
    const focused = document.activeElement;
    if (!on && focused instanceof HTMLElement && this.storykeys.contains(focused)) focused.blur();
  }

  public onStoryButton(handler: (action: 'next' | 'skip' | 'pause') => void): void {
    for (const button of this.storykeys.querySelectorAll<HTMLButtonElement>('button')) {
      const action = button.dataset.story as 'next' | 'skip' | 'pause';
      // A press acts at once; a click with no press (assistive tech) acts too.
      let pressed = false;
      button.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); pressed = true; handler(action); });
      button.addEventListener('click', (event) => { event.stopPropagation(); if (!pressed) handler(action); pressed = false; });
      // Enter or Space on a focused button does that button's action only: the game's
      // own Enter (skip) and Space (next) keys must not also see the press.
      button.addEventListener('keydown', (event) => {
        if (event.code !== 'Enter' && event.code !== 'NumpadEnter' && event.code !== 'Space') return;
        // Outside a story scene the buttons are hidden: the game's own keys apply.
        if (!this.root.classList.contains('story') && !this.root.classList.contains('interlude')) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        pressed = true;
        handler(action);
      });
    }
  }

  public storyTitle(title: string, kicker: string, clock = ''): void {
    this.storybar.innerHTML = '';
    const left = document.createElement('div');
    left.className = 'title';
    left.textContent = title;
    const small = document.createElement('small');
    small.textContent = kicker;
    left.append(small);
    this.storybar.append(left);
    if (clock) {
      const right = document.createElement('div');
      right.className = 'clock';
      right.textContent = clock;
      this.storybar.append(right);
    }
  }

  /** The current spoken line with its speaker, plus any stage direction and sound caption. */
  public subtitle(beat: { speaker?: string; line?: string; direction?: string; caption?: string } | null): void {
    this.subtitleBox.innerHTML = '';
    if (!beat) return;
    if (beat.line) {
      const line = document.createElement('span');
      line.className = 'line';
      const who = document.createElement('b');
      who.textContent = beat.speaker ?? '';
      line.append(who, document.createTextNode(beat.line));
      this.subtitleBox.append(line);
    }
    if (beat.caption || beat.direction) {
      const direction = document.createElement('span');
      direction.className = 'direction';
      if (beat.caption) {
        const caption = document.createElement('span');
        caption.className = 'caption';
        caption.textContent = beat.caption + ' ';
        direction.append(caption);
      }
      if (beat.direction) direction.append(document.createTextNode(beat.direction));
      this.subtitleBox.append(direction);
      this.subtitles.push([beat.caption, beat.direction].filter(Boolean).join(' '));
    }
  }

  public chapterHud(stats: [string, string][], objective: string, keys: string): void {
    const html = stats.map(([label, value]) => '<div class="stat"><small>' + label + '</small><b>' + value + '</b></div>').join('')
      + '<div class="objective"></div><div class="keys"></div>';
    if (this.chapterhud.dataset.html !== html) {
      this.chapterhud.innerHTML = html;
      this.chapterhud.dataset.html = html;
    }
    (this.chapterhud.querySelector('.objective') as HTMLElement).textContent = objective;
    (this.chapterhud.querySelector('.keys') as HTMLElement).textContent = keys;
  }

  public drivingNavigation(nav: { destination: string; distance: number; instruction: string } | null): void {
    this.driveNav.hidden = nav === null;
    if (!nav) return;
    this.driveNav.querySelector('b')!.textContent = `${nav.destination} · ${Math.ceil(nav.distance)} m`;
    this.driveNav.querySelector('small')!.textContent = nav.instruction;
    this.driveNav.setAttribute('aria-label', `${nav.destination}, ${Math.ceil(nav.distance)} metres, ${nav.instruction.toLowerCase()}`);
  }

  private div(className: string, parent: HTMLElement): HTMLDivElement {
    const element = document.createElement('div');
    element.className = className;
    parent.append(element);
    return element;
  }

  public updateHud(state: HudState): void {
    const f = this.fields;
    // A goal of 0 is the endless shift's: no target, so no fraction and no progress bar.
    f.sorted.textContent = state.goal > 0 ? `${String(state.sorted).padStart(2, '0')} / ${state.goal}` : String(state.sorted).padStart(2, '0');
    f.bar.style.width = state.goal > 0 ? `${Math.min(100, state.sorted / state.goal * 100)}%` : '0%';
    const label = state.clockLabel ?? 'TIME LEFT';
    if (f.timelabel.textContent !== label) f.timelabel.textContent = label;
    this.scoreTo(state.score);
    const pace = state.pace ?? null;
    f.pace.hidden = pace === null;
    if (pace !== null) {
      const text = `${pace >= 0 ? '+' : '−'}${Math.abs(pace)} VS BEST`;
      if (f.pace.textContent !== text) f.pace.textContent = text;
      f.pace.classList.toggle('behind', pace < 0);
    }
    const seconds = Math.ceil(state.timeLeftMs / 1000);
    f.time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (f.pips.childElementCount !== state.capacity) f.pips.innerHTML = '<i></i>'.repeat(state.capacity);
    [...f.pips.children].forEach((pip, index) => pip.classList.toggle('on', index < state.backlog));
    f.backlog.textContent = `${state.backlog} / ${state.capacity}`;
    f.backlog.setAttribute('aria-label', `${state.backlog} in recovery; ${state.capacity} ends the shift`);
    f.backlog.title = `${state.capacity} packages in recovery ends the shift`;
    f.backlog.classList.toggle('urgent', state.backlog >= state.capacity - 2);
    f.phase.textContent = state.phase;
    // A streak of three or more that breaks mid-shift says so for a moment.
    if (state.combo === 0 && this.lastCombo >= 3 && state.sorted > 0) { this.lostStreak = this.lastCombo; this.lostStreakMs = 1600; }
    if (state.combo > 0 || state.sorted === 0) this.lostStreakMs = 0;
    this.lastCombo = state.combo;
    const heat = state.combo >= 10 ? 'blazing' : state.combo >= 5 ? 'hot' : '';
    f.combo.className = this.lostStreakMs > 0 ? 'lost' : heat;
    f.combo.textContent = this.lostStreakMs > 0 ? `STREAK LOST  /  ${this.lostStreak} IN A ROW`
      : state.combo > 1 ? `${heat === 'blazing' ? 'ON FIRE · ' : heat === 'hot' ? 'ON A ROLL · ' : ''}${state.combo} IN A ROW  /  +${Math.min(state.combo, 10) * 15} NEXT`
        : state.goal > 0 ? `TARGET  /  ${state.goal} CLEAN DISPATCHES` : 'NO TARGET  /  LAST AS LONG AS YOU CAN';
    // Only a clock counting down can run out; the endless shift's counts up.
    f.time.parentElement?.classList.toggle('urgent', !state.clockLabel && state.timeLeftMs > 0 && state.timeLeftMs <= 30_000);
    f.worker.textContent = `● ${state.worker.toUpperCase()}`;
    f.worker.className = `b3d-worker ${state.worker}`;
    f.hint.textContent = state.hint;
    f.brake.textContent = state.brake;
    f.view.textContent = f.padview.textContent = state.overview ? 'CLOSE VIEW' : 'OVERVIEW';
    const scanner = state.scanner ?? '';
    if (f.scanner.textContent !== scanner) f.scanner.textContent = scanner;
    f.scanner.hidden = !scanner;
    this.root.classList.toggle('scanner-pending', !!scanner);
    if (state.routes !== undefined && f.routes.innerHTML !== state.routes) f.routes.innerHTML = state.routes;
    const goals = (state.goals ?? []).map((goal) => `<span class="${goal.state}">${goal.text}</span>`).join('');
    if (f.goals.innerHTML !== goals) f.goals.innerHTML = goals;
  }

  /** Sets the score the HUD rolls towards: a gain rolls up with a jump, a loss or a new night shows at once. */
  private scoreTo(score: number): void {
    if (score === this.targetScore) return;
    const element = this.fields.score;
    const flash = score > this.targetScore ? 'gain' : score > 0 || this.targetScore - score <= 500 ? 'loss' : '';
    this.targetScore = score;
    if (score < this.shownScore) {
      this.shownScore = score;
      element.textContent = String(score).padStart(5, '0');
    }
    element.classList.remove('gain', 'loss');
    if (!flash) return;
    void element.offsetWidth;
    element.classList.add(flash);
    this.scoreFlashMs = 400;
  }

  /** Shows the controller's buttons in the HUD's key line instead of the keyboard's. */
  public setPadHints(pad: boolean): void {
    this.fields.keyhints.hidden = pad;
    this.fields.padhints.hidden = !pad;
  }

  public sortingGuide(guide: { title: string; detail: string } | null): void {
    this.fields.guide.hidden = guide === null;
    if (!guide) return;
    if (this.fields['guide-title'].textContent !== guide.title) this.fields['guide-title'].textContent = guide.title;
    if (this.fields['guide-detail'].textContent !== guide.detail) this.fields['guide-detail'].textContent = guide.detail;
  }

  /** A speech bubble anchored to a point in the world, above its speaker. */
  public say(key: string, name: string, copy: string, durationMs: number, anchor: () => THREE.Vector3, thought = false): void {
    // A speaker's unfinished line is kept (stacked above) rather than cut off.
    const existing = this.speech.get(key);
    if (existing && existing.remainingMs > 800) {
      this.serial += 1;
      this.speech.set(`${key}:${this.serial}`, existing);
    } else {
      existing?.element.remove();
    }
    const element = this.div(thought ? 'b3d-bubble thought' : 'b3d-bubble', this.bubbles);
    element.dataset.speaker = name;
    const label = document.createElement('small');
    label.textContent = name;
    element.append(label, document.createTextNode(copy));
    this.speech.set(key, { element, anchor, remainingMs: durationMs });
    this.history.push(`${name}: ${copy.replace(/\n/g, ' ')}`);
  }

  public showToast(text: string, ms = 2200): void {
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
    this.toastMs = ms;
  }

  /** A short floating score note; `scale` enlarges it for a long streak. */
  public pop(text: string, color: string, world: THREE.Vector3, scale = 1): void {
    const element = this.div('b3d-pop', this.pops);
    element.textContent = text;
    element.style.color = color;
    if (scale !== 1) element.style.fontSize = `${Math.round(18 * scale)}px`;
    this.popups.push({ element, world: world.clone(), age: 0 });
  }

  /** Projects anchored UI. Off-screen speakers keep a bubble at the nearest edge. */
  public update(dtMs: number, clockRunning: boolean, camera: THREE.Camera, width: number, height: number): void {
    if (this.shownScore < this.targetScore) {
      // About a third of a second to catch up, whatever the size of the gain, and never in a single
      // frame, so even a slow renderer shows the count passing through on its way.
      const gap = this.targetScore - this.shownScore;
      this.shownScore += Math.min(gap, Math.max(1, Math.ceil(gap * Math.min(0.7, dtMs / 120))));
      this.fields.score.textContent = String(this.shownScore).padStart(5, '0');
    }
    if (this.scoreFlashMs > 0 && (this.scoreFlashMs -= dtMs) <= 0) this.fields.score.classList.remove('gain', 'loss');
    if (this.lostStreakMs > 0) this.lostStreakMs -= dtMs;
    const v = new THREE.Vector3();
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const entries = [...this.speech.entries()].sort((a, b) => a[1].anchor().z - b[1].anchor().z);
    for (const [key, bubble] of entries) {
      const held = this.hold !== null && !this.hold(key.split(':')[0]);
      bubble.element.classList.toggle('held', held);
      if (held) continue;
      if (clockRunning) bubble.remainingMs -= dtMs;
      if (bubble.remainingMs <= 0) {
        bubble.element.remove();
        this.speech.delete(key);
        continue;
      }
      v.copy(bubble.anchor()).project(camera);
      let x = (v.x + 1) / 2 * width;
      let y = (1 - v.y) / 2 * height;
      const behind = v.z > 1;
      const w = bubble.element.offsetWidth;
      const h = bubble.element.offsetHeight;
      const margin = 12;
      const minY = 96 + h + 14;
      const maxY = height - 64;
      const inside = !behind && x > w / 2 + margin && x < width - w / 2 - margin && y > minY && y < maxY;
      bubble.element.classList.toggle('edge', !inside);
      if (behind) { x = width - x; y = maxY; }
      const rawX = x;
      const rawY = y;
      x = Math.min(width - w / 2 - margin, Math.max(w / 2 + margin, x));
      const label = bubble.element.firstElementChild as HTMLElement;
      const name = bubble.element.dataset.speaker ?? '';
      const arrow = inside ? '' : rawX > x + 1 ? ' ▶' : rawX < x - 1 ? '◀ ' : rawY < minY ? '▲ ' : '▼ ';
      const text = arrow === ' ▶' ? `${name}${arrow}` : `${arrow}${name}`;
      if (label.textContent !== text) label.textContent = text;
      y = Math.min(maxY, Math.max(minY, y));
      // Nudge bubbles upward until they no longer cover one another.
      // Bubbles are bottom-anchored; go up first, then below if the top is full.
      let direction = -1;
      for (let guard = 0; guard < 10; guard += 1) {
        const hit = placed.find((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 6 && Math.abs(p.y - y) < Math.max(p.h, h) + 6);
        if (!hit) break;
        y = direction < 0 ? hit.y - hit.h - 8 : hit.y + h + 8;
        if (y < minY) { direction = 1; y = hit.y + h + 8; }
      }
      placed.push({ x, y, w, h });
      bubble.element.style.left = `${x}px`;
      bubble.element.style.top = `${y}px`;
    }
    for (let i = this.popups.length - 1; i >= 0; i -= 1) {
      const pop = this.popups[i];
      pop.age += dtMs;
      if (pop.age > 1100) { pop.element.remove(); this.popups.splice(i, 1); continue; }
      v.copy(pop.world).project(camera);
      pop.element.style.left = `${(v.x + 1) / 2 * width}px`;
      pop.element.style.top = `${(1 - v.y) / 2 * height - pop.age * 0.05}px`;
      pop.element.style.opacity = String(1 - Math.max(0, pop.age - 600) / 500);
    }
    if (this.toastMs > 0) {
      this.toastMs -= dtMs;
      if (this.toastMs <= 0) this.toast.style.opacity = '0';
    }
  }

  public dropSpeech(predicate: (key: string) => boolean): void {
    for (const [key, bubble] of this.speech) {
      if (predicate(key.split(':')[0])) { bubble.element.remove(); this.speech.delete(key); }
    }
  }

  public clearSpeech(): void {
    for (const bubble of this.speech.values()) bubble.element.remove();
    this.speech.clear();
  }

  public activeSpeech(): { speaker: string; text: string; x: number; y: number; edge: boolean }[] {
    return [...this.speech.values()].filter(({ element }) => !element.classList.contains('held')).map(({ element }) => ({
      speaker: element.dataset.speaker ?? '', text: element.lastChild?.textContent ?? '',
      x: parseFloat(element.style.left), y: parseFloat(element.style.top), edge: element.classList.contains('edge'),
    }));
  }

  /** A centred panel; one handler for its button, or handlers by data-action. */
  public showPanel(html: string, onButton?: (() => void) | Record<string, () => void>, options: { docked?: boolean } = {}): void {
    // A dialog named by its heading, so assistive technology announces what the panel is. A docked panel sits at
    // the foot of the screen, leaving the scene it is about in view.
    this.center.innerHTML = `<div class="b3d-panel${options.docked ? ' docked' : ''}" role="dialog" aria-labelledby="b3d-panel-title">${html}</div>`;
    const heading = this.center.querySelector('.b3d-panel h1');
    if (heading) heading.id = 'b3d-panel-title';
    else this.center.querySelector('.b3d-panel')?.removeAttribute('aria-labelledby');
    for (const button of this.center.querySelectorAll<HTMLButtonElement>('button')) {
      const handler = typeof onButton === 'function' ? onButton : onButton?.[button.dataset.action ?? ''];
      button.addEventListener('pointerdown', (event) => event.stopPropagation());
      button.addEventListener('click', (event) => { event.stopPropagation(); handler?.(); });
    }
  }

  public showNotice(text: string | null, color = '#edba6d'): void {
    this.root.querySelector('.b3d-notice')?.remove();
    if (!text) return;
    this.notices.push(text);
    const notice = this.div('b3d-notice', this.root);
    notice.style.color = color;
    notice.textContent = text;
  }

  public showCount(text: string): void {
    this.center.innerHTML = `<div class="b3d-count">${text}</div>`;
  }

  public clearCenter(): void {
    this.center.innerHTML = '';
  }
}
